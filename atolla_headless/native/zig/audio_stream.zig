const std = @import("std");
const audio_wire = @import("audio_wire.zig");
const Clock = @import("clock.zig").Clock;
const dscp = @import("dscp.zig");
const gst = @import("gst.zig");
const gst_net = @import("gst_net.zig");
const log = @import("log.zig");
const max_host_bytes = @import("command.zig").max_host_bytes;
const socket_reader = @import("socket_reader.zig");

const net = std.Io.net;
const posix = std.posix;

const Format = audio_wire.Format;

const decoded_caps = "audio/x-raw,layout=interleaved,format={S16LE,S24LE,S32LE,F32LE}";

pub const max_chunk_bytes = 192_000;

const poll_interval_ms = 100;

const no_lead = std.math.maxInt(u64);

const tally_interval_ms = 60 * std.time.ms_per_s;

pub const key_timeout_ms = 5_000;

const member_head = "appsrc name=source format=time ! audioconvert ! audioresample name=resample";

const not_pushed = std.math.maxInt(u64);

pub const Error = gst.PipelineError || std.mem.Allocator.Error || error{OutputNotFound};

pub const Output = union(enum) {
    described: [:0]const u8,
    named: []const u8,
};

pub const OutputState = enum(u8) { idle, playing, stalled };

const Measure = struct {
    state: OutputState,
    lag_ns: u64,
};

const Progress = struct {
    pushed_from_ns: std.atomic.Value(u64) = .init(not_pushed),
    pushed_until_ns: std.atomic.Value(u64) = .init(0),
    reached_until_ns: std.atomic.Value(u64) = .init(0),

    fn measure(self: *const Progress, now_ns: u64, tolerance_ns: u64) Measure {
        const from = self.pushed_from_ns.load(.acquire);
        if (from == not_pushed or now_ns < from) return .{ .state = .idle, .lag_ns = 0 };

        const until = self.pushed_until_ns.load(.acquire);
        const lag = @min(now_ns, until) -| @max(self.reached_until_ns.load(.acquire), from);

        if (lag > tolerance_ns) return .{ .state = .stalled, .lag_ns = lag };
        if (now_ns >= until) return .{ .state = .idle, .lag_ns = lag };

        return .{ .state = .playing, .lag_ns = lag };
    }

    fn pendingUntil(self: *const Progress, now_ns: u64) ?u64 {
        if (self.pushed_from_ns.load(.acquire) == not_pushed) return null;

        const until = self.pushed_until_ns.load(.acquire);

        return if (until > now_ns) until else null;
    }

    fn pushed(self: *Progress, from_ns: u64, until_ns: u64) bool {
        const first = self.pushed_from_ns.cmpxchgStrong(not_pushed, from_ns, .acq_rel, .acquire) == null;
        self.pushed_until_ns.store(until_ns, .release);

        return first;
    }

    fn reset(self: *Progress) void {
        self.pushed_from_ns.store(not_pushed, .release);
        self.pushed_until_ns.store(0, .release);
        self.reached_until_ns.store(0, .release);
    }
};

fn onReached(_: *gst.Object, info: *gst.PadProbeInfo, user_data: ?*anyopaque) callconv(.c) c_int {
    const progress: *Progress = @ptrCast(@alignCast(user_data orelse return gst.pad_probe_ok));
    const buffer: *gst.Buffer = @ptrCast(@alignCast(info.data orelse return gst.pad_probe_ok));

    if (buffer.pts != gst.clock_time_none and buffer.duration != gst.clock_time_none) {
        progress.reached_until_ns.store(buffer.pts + buffer.duration, .release);
    }

    return gst.pad_probe_ok;
}

const Held = struct {
    play_at_ns: u64,
    format: Format,
    bytes: []u8,
};

const Hold = struct {
    mutex: std.Io.Mutex = .init,
    condition: std.Io.Condition = .init,
    chunks: std.ArrayList(Held) = .empty,
    holding: bool = false,
    boundary_ns: u64 = 0,
    generation: u32 = 0,
    id: ?*gst.ClockId = null,
    waiter: ?std.Thread = null,
    stopping: bool = false,
};

pub const Member = struct {
    pipeline: gst.Pipeline,
    source: *gst.Object,
    progress: *Progress,
    format: ?Format = null,
    refused: u32 = 0,
    state: OutputState = .idle,
    hold: Hold = .{},

    pub fn init(runtime: *const gst.Gst, output: Output, clock: *gst.Object) Error!Member {
        var description: [512]u8 = undefined;
        const text = switch (output) {
            .described => |sink| std.fmt.bufPrintZ(&description, member_head ++ " ! {s}", .{sink}) catch {
                return error.LaunchFailed;
            },
            .named => member_head,
        };

        var pipeline = try gst.Pipeline.launch(runtime, text);
        errdefer pipeline.deinit();

        switch (output) {
            .described => {},
            .named => |name| try attachNamed(&pipeline, name),
        }

        const progress = try std.heap.c_allocator.create(Progress);
        errdefer std.heap.c_allocator.destroy(progress);
        progress.* = .{};

        try watchReached(&pipeline, progress);

        const source = pipeline.child("source") orelse return error.LaunchFailed;

        pipeline.schedule(clock, 0);
        _ = pipeline.setState(.playing);

        return .{ .pipeline = pipeline, .source = source, .progress = progress };
    }

    pub fn deinit(self: *Member) void {
        const runtime = self.pipeline.gst;
        const io = io_context();

        self.hold.mutex.lockUncancelable(io);
        self.dropHeld();
        self.hold.stopping = true;
        self.hold.condition.signal(io);
        const waiter = self.hold.waiter;
        self.hold.mutex.unlock(io);

        if (waiter) |thread| thread.join();
        self.hold.chunks.deinit(std.heap.c_allocator);

        self.pipeline.deinit();
        runtime.gstreamer.gst_object_unref(self.source);
        std.heap.c_allocator.destroy(self.progress);
    }

    pub fn check(self: *Member, now_ns: u64, tolerance_ns: u64) OutputState {
        const measured = self.progress.measure(now_ns, tolerance_ns);

        if (measured.state != self.state) {
            switch (measured.state) {
                .stalled => log.warn("audio", "output is behind {f}", .{
                    log.fields(.{ .behindMs = measured.lag_ns / std.time.ns_per_ms }),
                }),
                .playing => if (self.state == .stalled) {
                    log.info("audio", "output is playing again", .{});
                } else {
                    log.debug("audio", "output is playing", .{});
                },
                .idle => log.debug("audio", "output is idle", .{}),
            }

            self.state = measured.state;
        }

        return measured.state;
    }

    pub fn flush(self: *Member) void {
        const io = io_context();

        self.hold.mutex.lockUncancelable(io);
        defer self.hold.mutex.unlock(io);

        self.flushLocked();
    }

    pub fn play(self: *Member, play_at_ns: u64, format: Format, bytes: []const u8) bool {
        const io = io_context();

        self.hold.mutex.lockUncancelable(io);
        defer self.hold.mutex.unlock(io);

        return self.accept(play_at_ns, format, bytes);
    }

    pub fn playOn(self: *Member, clock: *gst.Object) void {
        const io = io_context();

        self.hold.mutex.lockUncancelable(io);
        defer self.hold.mutex.unlock(io);

        self.flushLocked();
        _ = self.pipeline.setState(.ready);
        self.pipeline.schedule(clock, 0);
        _ = self.pipeline.setState(.playing);
    }

    fn accept(self: *Member, play_at_ns: u64, format: Format, bytes: []const u8) bool {
        if (self.hold.holding) return self.keep(play_at_ns, format, bytes);

        const current = self.format orelse return self.push(play_at_ns, format, bytes);
        if (current.rate == format.rate) return self.push(play_at_ns, format, bytes);

        if (self.startHold()) return self.keep(play_at_ns, format, bytes);

        self.reopen(current.rate, format.rate);

        return self.push(play_at_ns, format, bytes);
    }

    fn announce(self: *const Member, play_at_ns: u64) void {
        const runtime = self.pipeline.gst;
        const clock = runtime.gstreamer.gst_pipeline_get_clock(self.pipeline.element) orelse return;
        defer runtime.gstreamer.gst_object_unref(clock);

        const now_ns = runtime.gstreamer.gst_clock_get_time(clock);
        const due_in_ns = @as(i128, play_at_ns) - @as(i128, now_ns);
        const due_in_ms: i64 = @intCast(@divTrunc(due_in_ns, std.time.ns_per_ms));

        log.info("audio", "output got its next audio {f}", .{log.fields(.{ .dueInMs = due_in_ms })});
    }

    fn awaitBoundaries(self: *Member) void {
        const runtime = self.pipeline.gst;
        const io = io_context();

        self.hold.mutex.lockUncancelable(io);
        defer self.hold.mutex.unlock(io);

        while (!self.hold.stopping) {
            if (!self.hold.holding) {
                self.hold.condition.waitUncancelable(io, &self.hold.mutex);
                continue;
            }

            const generation = self.hold.generation;
            const id = self.boundaryId() orelse {
                self.release();
                continue;
            };

            self.hold.id = id;
            self.hold.mutex.unlock(io);
            const result = runtime.gstreamer.gst_clock_id_wait(id, null);
            self.hold.mutex.lockUncancelable(io);
            self.hold.id = null;
            runtime.gstreamer.gst_clock_id_unref(id);

            if (result == gst.clock_unscheduled or self.hold.generation != generation) continue;

            self.release();
        }
    }

    fn boundaryId(self: *const Member) ?*gst.ClockId {
        const runtime = self.pipeline.gst;
        const clock = runtime.gstreamer.gst_pipeline_get_clock(self.pipeline.element) orelse return null;
        defer runtime.gstreamer.gst_object_unref(clock);

        return runtime.gstreamer.gst_clock_new_single_shot_id(clock, self.hold.boundary_ns);
    }

    fn dropHeld(self: *Member) void {
        const runtime = self.pipeline.gst;

        self.hold.holding = false;
        self.hold.generation +%= 1;
        if (self.hold.id) |id| runtime.gstreamer.gst_clock_id_unschedule(id);

        for (self.hold.chunks.items) |chunk| std.heap.c_allocator.free(chunk.bytes);
        self.hold.chunks.clearRetainingCapacity();
    }

    fn flushLocked(self: *Member) void {
        const runtime = self.pipeline.gst;

        self.dropHeld();

        if (runtime.gstreamer.gst_event_new_flush_start()) |event| {
            _ = runtime.gstreamer.gst_element_send_event(self.source, event);
        }

        if (runtime.gstreamer.gst_event_new_flush_stop(0)) |event| {
            _ = runtime.gstreamer.gst_element_send_event(self.source, event);
        }

        self.progress.reset();
        _ = self.pipeline.setState(.playing);
    }

    fn keep(self: *Member, play_at_ns: u64, format: Format, bytes: []const u8) bool {
        const allocator = std.heap.c_allocator;
        const copy = allocator.dupe(u8, bytes) catch return false;

        self.hold.chunks.append(allocator, .{ .play_at_ns = play_at_ns, .format = format, .bytes = copy }) catch {
            allocator.free(copy);

            return false;
        };

        return true;
    }

    fn pendingUntil(self: *const Member) ?u64 {
        const runtime = self.pipeline.gst;
        const clock = runtime.gstreamer.gst_pipeline_get_clock(self.pipeline.element) orelse return null;
        defer runtime.gstreamer.gst_object_unref(clock);

        return self.progress.pendingUntil(runtime.gstreamer.gst_clock_get_time(clock));
    }

    fn push(self: *Member, play_at_ns: u64, format: Format, bytes: []const u8) bool {
        const runtime = self.pipeline.gst;

        self.setFormat(format);

        const buffer = runtime.gstreamer.gst_buffer_new_allocate(null, bytes.len, null) orelse {
            return false;
        };

        const duration = durationNs(format, bytes.len);

        _ = runtime.gstreamer.gst_buffer_fill(buffer, 0, bytes.ptr, bytes.len);
        buffer.pts = play_at_ns;
        buffer.duration = duration;

        const flow = runtime.app.gst_app_src_push_buffer(self.source, buffer);
        const first_since_flush = self.progress.pushed(play_at_ns, play_at_ns + duration);

        if (first_since_flush) self.announce(play_at_ns);

        if (flow != gst.flow_ok) {
            if (self.refused == 0) {
                log.warn("audio", "output refused audio {f}", .{
                    log.fields(.{ .reason = std.mem.span(runtime.gstreamer.gst_flow_get_name(flow)) }),
                });
            }

            self.refused += 1;

            return false;
        }

        if (self.refused > 0) {
            log.info("audio", "output took audio again {f}", .{log.fields(.{ .refused = self.refused })});
            self.refused = 0;
        }

        return true;
    }

    fn release(self: *Member) void {
        const allocator = std.heap.c_allocator;

        var held = self.hold.chunks;
        self.hold.chunks = .empty;
        self.hold.holding = false;
        defer {
            for (held.items) |chunk| allocator.free(chunk.bytes);
            held.deinit(allocator);
        }

        for (held.items) |chunk| _ = self.accept(chunk.play_at_ns, chunk.format, chunk.bytes);
    }

    fn reopen(self: *Member, from_rate: u32, to_rate: u32) void {
        const runtime = self.pipeline.gst;
        const clock = runtime.gstreamer.gst_pipeline_get_clock(self.pipeline.element) orelse return;
        defer runtime.gstreamer.gst_object_unref(clock);

        _ = self.pipeline.setState(.null);
        self.progress.reset();
        self.pipeline.schedule(clock, 0);
        _ = self.pipeline.setState(.playing);

        log.info("audio", "output reopened for a new rate {f}", .{log.fields(.{ .from = from_rate, .to = to_rate })});
    }

    fn setFormat(self: *Member, format: Format) void {
        if (self.format) |current| {
            if (std.meta.eql(current, format)) return;
        }

        var text: [160]u8 = undefined;

        self.pipeline.gst.gstreamer.gst_util_set_object_arg(self.source, "caps", capsOf(&text, format).ptr);
        self.format = format;

        log.info("audio", "playing {d}Hz {s} with {d} channels", .{
            format.rate,
            @tagName(format.sample),
            format.channels,
        });
    }

    fn startHold(self: *Member) bool {
        const boundary_ns = self.pendingUntil() orelse return false;

        if (self.hold.waiter == null) {
            self.hold.waiter = std.Thread.spawn(.{}, awaitBoundaries, .{self}) catch return false;
        }

        self.hold.holding = true;
        self.hold.boundary_ns = boundary_ns;
        self.hold.generation +%= 1;
        self.hold.condition.signal(io_context());

        return true;
    }
};

fn capsOf(buffer: *[160]u8, format: Format) [:0]const u8 {
    const head = "audio/x-raw,layout=interleaved,format={s},rate={d},channels={d}";
    const name = sampleName(format.sample);

    if (format.channel_mask == 0 and format.channels <= 2) {
        return std.fmt.bufPrintZ(buffer, head, .{ name, format.rate, format.channels }) catch unreachable;
    }

    return std.fmt.bufPrintZ(buffer, head ++ ",channel-mask=(bitmask)0x{x}", .{
        name,
        format.rate,
        format.channels,
        format.channel_mask,
    }) catch unreachable;
}

fn durationNs(format: Format, bytes_len: usize) u64 {
    return @as(u64, bytes_len) * std.time.ns_per_s / format.bytesPerSecond();
}

fn formatOf(runtime: *const gst.Gst, caps: *const gst.Caps) ?Format {
    const structure = runtime.gstreamer.gst_caps_get_structure(caps, 0) orelse return null;
    const name = runtime.gstreamer.gst_structure_get_string(structure, "format") orelse return null;
    const sample = sampleNamed(std.mem.span(name)) orelse return null;

    var rate: c_int = 0;
    var channels: c_int = 0;

    if (runtime.gstreamer.gst_structure_get_int(structure, "rate", &rate) == 0) return null;
    if (runtime.gstreamer.gst_structure_get_int(structure, "channels", &channels) == 0) return null;

    const channel_mask = if (runtime.gstreamer.gst_structure_get_value(structure, "channel-mask")) |value|
        runtime.gstreamer.gst_value_get_bitmask(value)
    else
        0;

    return .{
        .rate = std.math.cast(u32, rate) orelse return null,
        .channels = std.math.cast(u16, channels) orelse return null,
        .sample = sample,
        .channel_mask = channel_mask,
    };
}

fn sampleName(sample: audio_wire.Sample) []const u8 {
    return switch (sample) {
        .s16 => "S16LE",
        .s24 => "S24LE",
        .s32 => "S32LE",
        .f32 => "F32LE",
    };
}

fn sampleNamed(name: []const u8) ?audio_wire.Sample {
    for (std.enums.values(audio_wire.Sample)) |sample| {
        if (std.mem.eql(u8, sampleName(sample), name)) return sample;
    }

    return null;
}

fn attachNamed(pipeline: *const gst.Pipeline, name: []const u8) Error!void {
    const runtime = pipeline.gst;
    const sink = runtime.sinkNamed(name) orelse {
        log.err("audio", "no output named {s}", .{name});

        return error.OutputNotFound;
    };

    if (runtime.gstreamer.gst_bin_add(pipeline.element, sink) == 0) return error.LaunchFailed;

    const resample = pipeline.child("resample") orelse return error.LaunchFailed;
    defer runtime.gstreamer.gst_object_unref(resample);

    if (runtime.gstreamer.gst_element_link(resample, sink) == 0) return error.LaunchFailed;
}

fn watchReached(pipeline: *const gst.Pipeline, progress: *Progress) Error!void {
    const runtime = pipeline.gst;

    const resample = pipeline.child("resample") orelse return error.LaunchFailed;
    defer runtime.gstreamer.gst_object_unref(resample);

    const pad = runtime.gstreamer.gst_element_get_static_pad(resample, "src") orelse return error.LaunchFailed;
    defer runtime.gstreamer.gst_object_unref(pad);

    _ = runtime.gstreamer.gst_pad_add_probe(pad, gst.pad_probe_buffer, onReached, progress, null);
}

pub const Sender = struct {
    gst: *const gst.Gst,
    pipeline: *gst.Object,
    latency_ns: u64,
    member: *Member,
    listener: std.atomic.Value(?*Listener) = .init(null),
    joined: std.atomic.Value(bool) = .init(false),

    pub fn attach(self: *Sender, sink: *gst.Object) void {
        const runtime = self.gst;

        runtime.gstreamer.gst_util_set_object_arg(sink, "caps", decoded_caps);
        runtime.gstreamer.gst_util_set_object_arg(sink, "sync", "true");
        runtime.gstreamer.gst_util_set_object_arg(sink, "emit-signals", "true");

        _ = runtime.gobject.g_signal_connect_data(sink, "new-sample", @ptrCast(&onNewSample), self, null, 0);
    }

    pub fn flush(self: *const Sender) void {
        if (self.joined.load(.acquire)) return;

        log.info("audio", "flushed output and members", .{});
        self.member.flush();
        if (self.listener.load(.acquire)) |members| members.flush();
    }

    fn send(self: *const Sender, sink: *gst.Object) void {
        const runtime = self.gst;
        const sample = runtime.app.gst_app_sink_pull_sample(sink) orelse return;
        defer runtime.gstreamer.gst_mini_object_unref(sample);

        if (self.joined.load(.acquire)) return;

        const buffer = runtime.gstreamer.gst_sample_get_buffer(sample) orelse return;
        const segment = runtime.gstreamer.gst_sample_get_segment(sample) orelse return;
        const caps = runtime.gstreamer.gst_sample_get_caps(sample) orelse return;
        const format = formatOf(runtime, caps) orelse return;

        const running = runtime.gstreamer.gst_segment_to_running_time(segment, .time, buffer.pts);
        if (running == gst.clock_time_none) return;

        var map: gst.MapInfo = .{};
        if (runtime.gstreamer.gst_buffer_map(buffer, &map, gst.map_read) == 0) return;
        defer runtime.gstreamer.gst_buffer_unmap(buffer, &map);

        const data = (map.data orelse return)[0..map.size];
        const heard_at = runtime.gstreamer.gst_element_get_base_time(self.pipeline) + running + self.latency_ns;
        const listener = self.listener.load(.acquire);
        const piece_bytes = max_chunk_bytes - max_chunk_bytes % format.bytesPerFrame();

        var offset: usize = 0;
        while (offset < data.len) {
            const piece = data[offset..@min(data.len, offset + piece_bytes)];
            const play_at_ns = heard_at + durationNs(format, offset);

            _ = self.member.play(play_at_ns, format, piece);
            if (listener) |members| members.send(play_at_ns, format, piece);

            offset += piece.len;
        }
    }
};

fn onNewSample(sink: *gst.Object, user_data: ?*anyopaque) callconv(.c) c_int {
    const sender: *const Sender = @ptrCast(@alignCast(user_data orelse return gst.flow_ok));

    sender.send(sink);

    return gst.flow_ok;
}

pub const Listener = struct {
    io: std.Io,
    server: net.Server,
    hello: audio_wire.Hello,
    key: audio_wire.Key,
    key_timeout_ms: i32,
    latency_ns: u64,
    format: ?Format = null,
    running: std.atomic.Value(bool) = .init(true),
    mutex: std.Io.Mutex = .init,
    members: std.ArrayList(net.Stream) = .empty,
    thread: ?std.Thread = null,

    pub fn init(
        self: *Listener,
        address: *const net.IpAddress,
        clock_port: u16,
        latency_ns: u64,
        key: audio_wire.Key,
        timeout_ms: i32,
    ) !void {
        const io = io_context();

        self.* = .{
            .io = io,
            .server = try net.IpAddress.listen(address, io, .{ .mode = .stream, .reuse_address = true }),
            .hello = .{ .version = audio_wire.version, .clock_port = clock_port },
            .key = key,
            .key_timeout_ms = timeout_ms,
            .latency_ns = latency_ns,
        };
        errdefer self.server.deinit(io);

        self.thread = try std.Thread.spawn(.{}, run, .{self});
    }

    pub fn deinit(self: *Listener) void {
        self.running.store(false, .release);

        if (net.IpAddress.connect(&self.server.socket.address, self.io, .{ .mode = .stream })) |wake| {
            wake.close(self.io);
        } else |_| {}

        if (self.thread) |thread| thread.join();

        for (self.members.items) |member| member.close(self.io);
        self.members.deinit(std.heap.c_allocator);
        self.server.deinit(self.io);
    }

    pub fn flush(self: *Listener) void {
        var header_buffer: [audio_wire.header_bytes]u8 = undefined;

        self.broadcast(audio_wire.flushHeader(&header_buffer), &.{});
    }

    pub fn memberCount(self: *Listener) usize {
        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);

        return self.members.items.len;
    }

    pub fn port(self: *const Listener) u16 {
        return self.server.socket.address.getPort();
    }

    pub fn send(self: *Listener, play_at_ns: u64, format: Format, bytes: []const u8) void {
        var header_buffer: [audio_wire.chunk_header_bytes]u8 = undefined;

        self.useFormat(format);
        self.broadcast(audio_wire.chunkHeader(&header_buffer, play_at_ns, format, bytes.len), bytes);
    }

    fn admit(self: *Listener, stream: net.Stream) !void {
        const no_delay: c_int = 1;

        try posix.setsockopt(stream.socket.handle, posix.IPPROTO.TCP, posix.TCP.NODELAY, std.mem.asBytes(&no_delay));

        dscp.mark(stream, .af41) catch |err| {
            log.warn("audio", "could not mark a member's audio as high priority {f}", .{log.fields(.{ .err = @errorName(err) })});
        };

        var buffer: [64]u8 = undefined;
        var writer = stream.writer(self.io, &buffer);

        try audio_wire.writeHello(&writer.interface, self.hello);
        try writer.interface.flush();

        if (!self.presentsKey(stream)) return error.Refused;

        try nonBlocking(stream.socket.handle);

        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);

        if (self.format) |format| try self.sizeSendBuffer(stream, format);
        try self.members.append(std.heap.c_allocator, stream);
    }

    fn broadcast(self: *Listener, header: []const u8, bytes: []const u8) void {
        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);

        var index: usize = 0;
        while (index < self.members.items.len) {
            const member = self.members.items[index];

            const sent = sendWhole(member.socket.handle, header, bytes);

            if (sent == .whole) {
                index += 1;
                continue;
            }

            var host_buffer: [64]u8 = undefined;
            const host = hostOf(&host_buffer, member.socket.address) catch "an unknown address";
            const where = log.fields(.{ .host = host });

            switch (sent) {
                .behind => log.warn("audio", "dropped a member that fell behind {f}", .{where}),
                .disconnected => log.warn("audio", "dropped a member that had disconnected {f}", .{where}),
                .whole => unreachable,
            }

            member.close(self.io);
            _ = self.members.swapRemove(index);
        }
    }

    fn presentsKey(self: *const Listener, stream: net.Stream) bool {
        var read_buffer: [audio_wire.header_bytes + audio_wire.key_bytes]u8 = undefined;
        var reader: socket_reader.Reader = .init(stream.socket.handle, &read_buffer, self.key_timeout_ms);
        var no_chunk: [0]u8 = undefined;

        return switch (audio_wire.read(&reader.interface, &no_chunk) catch return false) {
            .key => |given| std.crypto.timing_safe.eql(audio_wire.Key, given, self.key),
            .hello, .chunk, .flush => false,
        };
    }

    fn run(self: *Listener) void {
        while (true) {
            const stream = self.server.accept(self.io) catch |err| switch (err) {
                error.ConnectionAborted, error.ProtocolFailure, error.BlockedByFirewall => continue,
                else => return,
            };

            if (!self.running.load(.acquire)) {
                stream.close(self.io);
                return;
            }

            self.admit(stream) catch |err| {
                var host_buffer: [64]u8 = undefined;
                const host = hostOf(&host_buffer, stream.socket.address) catch "an unknown address";

                switch (err) {
                    error.Refused => log.warn("audio", "refused a member at {s} without the stream key", .{host}),
                    else => log.warn("audio", "could not admit a member at {s}", .{host}),
                }

                stream.close(self.io);
            };
        }
    }

    fn sizeSendBuffer(self: *const Listener, stream: net.Stream, format: Format) !void {
        const bytes = sendBufferBytes(format, self.latency_ns);

        try posix.setsockopt(stream.socket.handle, posix.SOL.SOCKET, posix.SO.SNDBUF, std.mem.asBytes(&bytes));
    }

    fn useFormat(self: *Listener, format: Format) void {
        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);

        if (self.format) |current| {
            if (std.meta.eql(current, format)) return;
        }

        self.format = format;

        for (self.members.items) |member| {
            self.sizeSendBuffer(member, format) catch log.warn("audio", "could not size a member's send buffer", .{});
        }
    }
};

fn sendBufferBytes(format: Format, latency_ns: u64) c_int {
    const backlog_bytes = format.bytesPerSecond() *| latency_ns / std.time.ns_per_s;

    const bytes = audio_wire.chunk_header_bytes + max_chunk_bytes +| backlog_bytes;

    return std.math.cast(c_int, bytes) orelse std.math.maxInt(c_int);
}

fn nonBlocking(handle: posix.socket_t) !void {
    const flags = posix.system.fcntl(handle, posix.F.GETFL);
    if (flags < 0) return error.Unexpected;

    const non_blocking = @as(c_int, 1) << @bitOffsetOf(posix.O, "NONBLOCK");
    if (posix.system.fcntl(handle, posix.F.SETFL, flags | non_blocking) < 0) return error.Unexpected;
}

const Sent = enum { behind, disconnected, whole };

fn sendWhole(handle: posix.socket_t, header: []const u8, bytes: []const u8) Sent {
    const vectors = [_]posix.iovec_const{
        .{ .base = header.ptr, .len = header.len },
        .{ .base = bytes.ptr, .len = bytes.len },
    };
    const message: posix.msghdr_const = .{
        .name = null,
        .namelen = 0,
        .iov = &vectors,
        .iovlen = vectors.len,
        .control = null,
        .controllen = 0,
        .flags = 0,
    };

    while (true) {
        const sent = posix.system.sendmsg(handle, &message, posix.MSG.NOSIGNAL);

        switch (posix.errno(sent)) {
            .SUCCESS => return if (@as(usize, @intCast(sent)) == header.len + bytes.len) .whole else .behind,
            .INTR => continue,
            .AGAIN => return .behind,
            else => return .disconnected,
        }
    }
}

pub const Receiver = struct {
    io: std.Io,
    sync: gst_net.GstNet,
    member: *Member,
    host: [max_host_bytes + 1]u8 = undefined,
    host_len: usize = 0,
    port: u16 = 0,
    key: audio_wire.Key = undefined,
    stopping: std.atomic.Value(bool) = .init(false),
    clock: std.atomic.Value(?*gst.Object) = .init(null),
    play_until_ns: std.atomic.Value(u64) = .init(0),
    received: std.atomic.Value(u32) = .init(0),
    late: std.atomic.Value(u32) = .init(0),
    skipped: std.atomic.Value(u32) = .init(0),
    smallest_lead_ns: std.atomic.Value(u64) = .init(no_lead),
    thread: ?std.Thread = null,

    pub fn start(self: *Receiver, host: []const u8, port: u16, key: audio_wire.Key) !void {
        if (host.len > max_host_bytes) return error.HostTooLong;

        @memcpy(self.host[0..host.len], host);
        self.host[host.len] = 0;
        self.host_len = host.len;
        self.port = port;
        self.key = key;

        self.stopping.store(false, .release);
        self.play_until_ns.store(0, .release);
        self.received.store(0, .release);
        self.late.store(0, .release);
        self.skipped.store(0, .release);
        self.smallest_lead_ns.store(no_lead, .release);

        self.thread = try std.Thread.spawn(.{}, run, .{self});
    }

    pub fn stop(self: *Receiver) void {
        const thread = self.thread orelse return;

        self.stopping.store(true, .release);
        thread.join();
        self.thread = null;

        if (self.clock.swap(null, .acq_rel)) |clock| self.member.pipeline.gst.gstreamer.gst_object_unref(clock);
    }

    pub fn clockFollowed(self: *const Receiver) ?*gst.Object {
        return self.clock.load(.acquire);
    }

    pub fn receiving(self: *const Receiver) bool {
        const clock = self.clock.load(.acquire) orelse return false;

        return self.play_until_ns.load(.acquire) > self.sync.now(clock);
    }

    fn awakeMs(self: *const Receiver) i64 {
        return std.Io.Timestamp.now(self.io, .awake).toMilliseconds();
    }

    fn hear(self: *Receiver, now_ns: u64, piece: audio_wire.Chunk) void {
        _ = self.received.fetchAdd(1, .acq_rel);

        if (piece.play_at_ns <= now_ns) {
            _ = self.late.fetchAdd(1, .acq_rel);

            return;
        }

        _ = self.smallest_lead_ns.fetchMin(piece.play_at_ns - now_ns, .acq_rel);
        _ = self.member.play(piece.play_at_ns, piece.format, piece.bytes);
        self.play_until_ns.store(piece.play_at_ns + durationNs(piece.format, piece.bytes.len), .release);
    }

    fn report(self: *Receiver) void {
        const received = self.received.swap(0, .acq_rel);
        const late = self.late.swap(0, .acq_rel);
        const skipped = self.skipped.swap(0, .acq_rel);
        const smallest_lead_ns = self.smallest_lead_ns.swap(no_lead, .acq_rel);

        const tally = log.fields(.{
            .chunks = received + skipped,
            .late = late,
            .skipped = skipped,
            .headroomMs = if (smallest_lead_ns == no_lead) null else smallest_lead_ns / std.time.ns_per_ms,
        });

        if (late > 0 or skipped > 0) {
            log.warn("audio", "audio from the source in the last minute {f}", .{tally});
        } else {
            log.debug("audio", "audio from the source in the last minute {f}", .{tally});
        }
    }

    fn run(self: *Receiver) void {
        const connected = connect(self.io, self.host[0..self.host_len], self.port) catch |err| {
            log.warn("audio", "could not reach the source: {s}", .{@errorName(err)});

            return;
        };
        const stream = connected.stream;
        defer stream.close(self.io);

        var read_buffer: [4 * 1024]u8 = undefined;
        var reader: socket_reader.Reader = .initUntilStopped(stream.socket.handle, &read_buffer, poll_interval_ms, &self.stopping);
        var chunk_buffer: [max_chunk_bytes]u8 = undefined;

        const hello = switch (audio_wire.read(&reader.interface, &chunk_buffer) catch return) {
            .hello => |given| given,
            .chunk, .flush, .key => return,
        };

        if (hello.version != audio_wire.version) {
            log.warn("audio", "the source speaks wire version {d} and this speaker speaks {d}", .{
                hello.version,
                audio_wire.version,
            });

            return;
        }

        var write_buffer: [audio_wire.header_bytes + audio_wire.key_bytes]u8 = undefined;
        var writer = stream.writer(self.io, &write_buffer);

        audio_wire.writeKey(&writer.interface, self.key) catch return;
        writer.interface.flush() catch return;

        var clock_host_buffer: [64]u8 = undefined;
        const clock_host = hostOf(&clock_host_buffer, connected.address) catch return;
        const clock = self.sync.clientClock(clock_host, hello.clock_port) orelse return;
        self.clock.store(clock, .release);
        self.member.playOn(clock);

        log.info("audio", "following a source {f}", .{log.fields(.{ .host = self.host[0..self.host_len], .port = self.port })});

        var synced = false;
        var unsynced_since_ms = self.awakeMs();
        var skipped_until_synced: u32 = 0;
        var tally_started_ms = self.awakeMs();
        var last_frame_ms = self.awakeMs();

        while (!self.stopping.load(.acquire)) {
            const frame = audio_wire.read(&reader.interface, &chunk_buffer) catch {
                if (!self.stopping.load(.acquire)) {
                    log.warn("audio", "source closed the stream {f}", .{log.fields(.{ .quietMs = self.awakeMs() - last_frame_ms })});
                }

                return;
            };

            last_frame_ms = self.awakeMs();

            switch (frame) {
                .hello, .key => return,
                .chunk => |piece| {
                    if (self.sync.isSynced(clock)) {
                        if (!synced) {
                            log.info("audio", "clock synced with the source {f}", .{
                                log.fields(.{ .afterMs = self.awakeMs() - unsynced_since_ms, .skipped = skipped_until_synced }),
                            });
                            synced = true;
                        }

                        self.hear(self.sync.now(clock), piece);
                    } else {
                        if (synced) {
                            log.warn("audio", "clock lost sync with the source", .{});
                            synced = false;
                            unsynced_since_ms = self.awakeMs();
                            skipped_until_synced = 0;
                        }

                        skipped_until_synced += 1;
                        _ = self.skipped.fetchAdd(1, .acq_rel);
                    }

                    if (self.awakeMs() - tally_started_ms >= tally_interval_ms) {
                        self.report();
                        tally_started_ms = self.awakeMs();
                    }
                },
                .flush => {
                    log.info("audio", "source flushed", .{});
                    self.member.flush();
                    self.play_until_ns.store(0, .release);
                },
            }
        }
    }
};

const Connected = struct {
    stream: net.Stream,
    address: net.IpAddress,
};

fn connect(io: std.Io, host: []const u8, port: u16) !Connected {
    if (net.IpAddress.resolve(io, host, port)) |address| {
        return .{ .stream = try net.IpAddress.connect(&address, io, .{ .mode = .stream }), .address = address };
    } else |_| {}

    const name = try net.HostName.init(host);
    var results: [16]net.HostName.LookupResult = undefined;
    var resolved: std.Io.Queue(net.HostName.LookupResult) = .init(&results);

    try name.lookup(io, &resolved, .{ .port = port });

    while (resolved.getOne(io)) |result| switch (result) {
        .address => |address| {
            const stream = net.IpAddress.connect(&address, io, .{ .mode = .stream }) catch continue;

            return .{ .stream = stream, .address = address };
        },
        .canonical_name => {},
    } else |_| {}

    return error.UnknownHostName;
}

fn hostOf(buffer: []u8, address: net.IpAddress) ![:0]const u8 {
    return switch (address) {
        .ip4 => |ip4| std.fmt.bufPrintZ(
            buffer,
            "{d}.{d}.{d}.{d}",
            .{ ip4.bytes[0], ip4.bytes[1], ip4.bytes[2], ip4.bytes[3] },
        ),
        .ip6 => |ip6| std.fmt.bufPrintZ(
            buffer,
            "{f}",
            .{net.Ip6Address.Unresolved{ .bytes = ip6.bytes, .interface_name = null }},
        ),
    };
}

fn io_context() std.Io {
    return std.Io.Threaded.global_single_threaded.io();
}

const testing = std.testing;

const test_format: Format = .{ .rate = 48000, .channels = 2, .sample = .s16, .channel_mask = 0 };

const test_caps = "audio/x-raw,rate=48000,channels=2";

const watched_output: Output = .{ .described = "fakesink name=output sync=true signal-handoffs=true" };

const test_key: audio_wire.Key = ("0123456789abcdef" ** 4).*;

const other_key: audio_wire.Key = ("fedcba9876543210" ** 4).*;

const test_tolerance_ns = 100 * std.time.ns_per_ms;

const Rendered = struct {
    clock: *const Clock,
    at_ns: std.atomic.Value(u64) = .init(0),
    pts: std.atomic.Value(u64) = .init(0),
    count: std.atomic.Value(u32) = .init(0),
    last_pts: std.atomic.Value(u64) = .init(0),
    last_duration_ns: std.atomic.Value(u64) = .init(0),
    last_rate: std.atomic.Value(u32) = .init(0),
};

fn onHandoff(_: *gst.Object, buffer: *gst.Buffer, pad: *gst.Object, user_data: ?*anyopaque) callconv(.c) void {
    const rendered: *Rendered = @ptrCast(@alignCast(user_data orelse return));
    const runtime = rendered.clock.gst;

    _ = rendered.count.fetchAdd(1, .acq_rel);
    rendered.last_pts.store(buffer.pts, .release);
    rendered.last_duration_ns.store(buffer.duration, .release);

    if (runtime.gstreamer.gst_pad_get_current_caps(pad)) |caps| {
        defer runtime.gstreamer.gst_mini_object_unref(caps);

        if (formatOf(runtime, caps)) |format| rendered.last_rate.store(format.rate, .release);
    }

    if (rendered.at_ns.load(.acquire) != 0) return;

    rendered.pts.store(buffer.pts, .release);
    rendered.at_ns.store(rendered.clock.net.now(rendered.clock.system), .release);
}

fn loaded() !gst.Gst {
    var runtime = gst.load() catch |failure| switch (failure) {
        error.LibraryNotFound => return error.SkipZigTest,
        else => return failure,
    };

    runtime.initialise();

    return runtime;
}

fn startedClock(runtime: *gst.Gst) !Clock {
    return Clock.init(runtime) catch |failure| switch (failure) {
        error.LibraryNotFound => error.SkipZigTest,
        else => failure,
    };
}

fn watch(member: *const Member, rendered: *Rendered) !void {
    const runtime = member.pipeline.gst;
    const output = member.pipeline.child("output") orelse return error.TestUnexpectedResult;
    defer runtime.gstreamer.gst_object_unref(output);

    _ = runtime.gobject.g_signal_connect_data(output, "handoff", @ptrCast(&onHandoff), rendered, null, 0);
}

fn sleep(milliseconds: i64) void {
    io_context().sleep(.fromMilliseconds(milliseconds), .awake) catch {};
}

fn sleepUntil(clock: *const Clock, at_ns: u64) void {
    const now = clock.net.now(clock.system);
    if (at_ns <= now) return;

    io_context().sleep(.fromNanoseconds(at_ns - now), .awake) catch {};
}

fn untilRendered(rendered: *const Rendered) !void {
    for (0..100) |_| {
        if (rendered.at_ns.load(.acquire) != 0) return;

        sleep(50);
    }

    return error.TestExpectedRender;
}

fn untilRenderedAtLeast(rendered: *const Rendered, count: u32) !void {
    for (0..100) |_| {
        if (rendered.count.load(.acquire) >= count) return;

        sleep(50);
    }

    return error.TestExpectedRender;
}

const TestSource = struct {
    clock: Clock,
    member: Member,
    sender: Sender,
    listener: Listener,
    pipeline: gst.Pipeline,

    fn init(self: *TestSource, runtime: *gst.Gst, caps: []const u8, buffers: u32, latency_ns: u64) !void {
        self.clock = try startedClock(runtime);
        const clock_port = self.clock.provide("127.0.0.1", 0) orelse return error.TestUnexpectedResult;

        self.member = try Member.init(runtime, watched_output, self.clock.system);

        var description: [256]u8 = undefined;
        self.pipeline = try gst.Pipeline.launch(runtime, try std.fmt.bufPrintZ(
            &description,
            "audiotestsrc name=tone num-buffers={d} ! {s} ! appsink name=decoded",
            .{ buffers, caps },
        ));

        const loopback: net.IpAddress = .{ .ip4 = .loopback(0) };
        try self.listener.init(&loopback, clock_port, latency_ns, test_key, key_timeout_ms);

        self.sender = .{
            .gst = runtime,
            .pipeline = self.pipeline.element,
            .latency_ns = latency_ns,
            .member = &self.member,
        };
        self.sender.listener.store(&self.listener, .release);

        const sink = self.pipeline.child("decoded") orelse return error.TestUnexpectedResult;
        defer runtime.gstreamer.gst_object_unref(sink);

        self.sender.attach(sink);
        self.pipeline.useClock(self.clock.system);
    }

    fn deinit(self: *TestSource) void {
        self.pipeline.deinit();
        self.listener.deinit();
        self.member.deinit();
    }

    fn baseTime(self: *const TestSource) u64 {
        return self.pipeline.gst.gstreamer.gst_element_get_base_time(self.pipeline.element);
    }

    fn play(self: *const TestSource) void {
        _ = self.pipeline.setState(.playing);
    }
};

const TestWireSource = struct {
    clock: Clock,
    clock_port: u16,
    server: net.Server,
    stream: ?net.Stream,

    fn open(self: *TestWireSource, runtime: *gst.Gst) !void {
        self.clock = try startedClock(runtime);
        self.clock_port = self.clock.provide("127.0.0.1", 0) orelse return error.TestUnexpectedResult;

        const loopback: net.IpAddress = .{ .ip4 = .loopback(0) };
        self.server = try net.IpAddress.listen(&loopback, io_context(), .{ .mode = .stream });
        self.stream = null;
    }

    fn close(self: *TestWireSource) void {
        if (self.stream) |stream| stream.close(io_context());
        self.server.deinit(io_context());
    }

    fn port(self: *const TestWireSource) u16 {
        return self.server.socket.address.getPort();
    }

    fn accept(self: *TestWireSource) !void {
        self.stream = try self.server.accept(io_context());

        var buffer: [64]u8 = undefined;
        var writer = self.stream.?.writer(io_context(), &buffer);

        try audio_wire.writeHello(&writer.interface, .{ .version = audio_wire.version, .clock_port = self.clock_port });
        try writer.interface.flush();
    }

    fn write(self: *TestWireSource, bytes: []const u8) !void {
        var buffer: [256]u8 = undefined;
        var writer = self.stream.?.writer(io_context(), &buffer);

        try writer.interface.writeAll(bytes);
        try writer.interface.flush();
    }

    fn writeChunk(self: *TestWireSource, play_at_ns: u64, bytes: []const u8) !void {
        var header: [audio_wire.chunk_header_bytes]u8 = undefined;

        try self.write(audio_wire.chunkHeader(&header, play_at_ns, test_format, bytes.len));
        try self.write(bytes);
    }
};

fn connectWithKey(port: u16, key: audio_wire.Key) !net.Stream {
    const address: net.IpAddress = .{ .ip4 = .loopback(port) };
    const stream = try net.IpAddress.connect(&address, io_context(), .{ .mode = .stream });
    errdefer stream.close(io_context());

    var buffer: [audio_wire.header_bytes + audio_wire.key_bytes]u8 = undefined;
    var writer = stream.writer(io_context(), &buffer);

    try audio_wire.writeKey(&writer.interface, key);
    try writer.interface.flush();

    return stream;
}

fn untilSynced(receiver: *const Receiver) !void {
    for (0..100) |_| {
        const clock = receiver.clockFollowed();

        if (clock != null and receiver.sync.isSynced(clock.?)) return;

        sleep(50);
    }

    return error.TestExpectedSync;
}

fn untilJoined(source: *TestSource, receiver: *const Receiver) !void {
    for (0..100) |_| {
        const clock = receiver.clockFollowed();

        if (source.listener.memberCount() == 1 and clock != null and receiver.sync.isSynced(clock.?)) return;

        sleep(50);
    }

    return error.TestExpectedJoin;
}

test "audio_stream: a member holds a chunk until the time it is stamped with" {
    var runtime = try loaded();
    const clock = try startedClock(&runtime);

    var member = try Member.init(&runtime, watched_output, clock.system);
    defer member.deinit();

    var rendered: Rendered = .{ .clock = &clock };
    try watch(&member, &rendered);

    const silence: [test_format.bytesPerSecond() / 10]u8 = @splat(0);
    const at = clock.net.now(clock.system) + 500 * std.time.ns_per_ms;

    try testing.expect(member.play(at, test_format, &silence));
    try untilRendered(&rendered);

    try testing.expectEqual(at, rendered.pts.load(.acquire));
    try testing.expect(rendered.at_ns.load(.acquire) >= at);
    try testing.expect(rendered.at_ns.load(.acquire) < at + 200 * std.time.ns_per_ms);
}

test "audio_stream: a member moved to another clock drops what it held for the old one" {
    var runtime = try loaded();
    const clock = try startedClock(&runtime);

    var member = try Member.init(&runtime, watched_output, clock.system);
    defer member.deinit();

    var rendered: Rendered = .{ .clock = &clock };
    try watch(&member, &rendered);

    const silence: [test_format.bytesPerSecond() / 10]u8 = @splat(0);

    try testing.expect(member.play(clock.net.now(clock.system) + 60 * std.time.ns_per_s, test_format, &silence));
    sleep(100);

    member.playOn(clock.system);

    const at = clock.net.now(clock.system) + 200 * std.time.ns_per_ms;

    try testing.expect(member.play(at, test_format, &silence));
    try untilRendered(&rendered);

    try testing.expectEqual(at, rendered.pts.load(.acquire));
}

test "audio_stream: an output's played position follows what its sink has rendered" {
    var runtime = try loaded();
    const clock = try startedClock(&runtime);

    var member = try Member.init(&runtime, watched_output, clock.system);
    defer member.deinit();

    var rendered: Rendered = .{ .clock = &clock };
    try watch(&member, &rendered);

    const chunk: [test_format.bytesPerSecond() / 10]u8 = @splat(0);
    const chunk_ns = durationNs(test_format, chunk.len);
    const from = clock.net.now(clock.system) + 200 * std.time.ns_per_ms;

    for (0..10) |index| {
        try testing.expect(member.play(from + index * chunk_ns, test_format, &chunk));
    }

    try untilRenderedAtLeast(&rendered, 5);

    const reached = member.progress.reached_until_ns.load(.acquire);
    const rendered_pts = rendered.last_pts.load(.acquire);

    try testing.expect(reached >= rendered_pts);
    try testing.expect(reached <= rendered_pts + 2 * chunk_ns);
}

test "audio_stream: an output is idle until the audio it holds is due, then playing" {
    var runtime = try loaded();
    const clock = try startedClock(&runtime);

    var member = try Member.init(&runtime, watched_output, clock.system);
    defer member.deinit();

    try testing.expectEqual(OutputState.idle, member.check(clock.net.now(clock.system), test_tolerance_ns));

    const chunk: [test_format.bytesPerSecond() / 10]u8 = @splat(0);
    const chunk_ns = durationNs(test_format, chunk.len);
    const from = clock.net.now(clock.system) + 300 * std.time.ns_per_ms;

    for (0..10) |index| {
        try testing.expect(member.play(from + index * chunk_ns, test_format, &chunk));
    }

    try testing.expectEqual(OutputState.idle, member.check(clock.net.now(clock.system), test_tolerance_ns));

    sleepUntil(&clock, from + 300 * std.time.ns_per_ms);

    try testing.expectEqual(OutputState.playing, member.check(clock.net.now(clock.system), test_tolerance_ns));
}

test "audio_stream: an output that has played everything it was given is idle" {
    var runtime = try loaded();
    const clock = try startedClock(&runtime);

    var member = try Member.init(&runtime, watched_output, clock.system);
    defer member.deinit();

    const chunk: [test_format.bytesPerSecond() / 10]u8 = @splat(0);
    const chunk_ns = durationNs(test_format, chunk.len);
    const from = clock.net.now(clock.system) + 100 * std.time.ns_per_ms;

    for (0..3) |index| {
        try testing.expect(member.play(from + index * chunk_ns, test_format, &chunk));
    }

    sleepUntil(&clock, from + 3 * chunk_ns + 200 * std.time.ns_per_ms);

    try testing.expectEqual(OutputState.idle, member.check(clock.net.now(clock.system), test_tolerance_ns));
}

test "audio_stream: an output holding due audio it has not played is stalled, until a flush" {
    var runtime = try loaded();
    const clock = try startedClock(&runtime);

    var member = try Member.init(&runtime, watched_output, clock.system);
    defer member.deinit();

    _ = member.pipeline.setState(.paused);

    const chunk: [test_format.bytesPerSecond() / 10]u8 = @splat(0);
    const chunk_ns = durationNs(test_format, chunk.len);
    const from = clock.net.now(clock.system) + 50 * std.time.ns_per_ms;

    for (0..10) |index| {
        try testing.expect(member.play(from + index * chunk_ns, test_format, &chunk));
    }

    sleepUntil(&clock, from + 400 * std.time.ns_per_ms);

    try testing.expectEqual(OutputState.stalled, member.check(clock.net.now(clock.system), test_tolerance_ns));

    member.flush();

    try testing.expectEqual(OutputState.idle, member.check(clock.net.now(clock.system), test_tolerance_ns));
}

test "audio_stream: the sender stamps each chunk to be heard the latency after it is decoded" {
    var runtime = try loaded();
    const clock = try startedClock(&runtime);

    var member = try Member.init(&runtime, watched_output, clock.system);
    defer member.deinit();

    var rendered: Rendered = .{ .clock = &clock };
    try watch(&member, &rendered);

    var source = try gst.Pipeline.launch(&runtime, "audiotestsrc num-buffers=20 ! appsink name=decoded");
    defer source.deinit();

    const latency = 300 * std.time.ns_per_ms;
    var sender: Sender = .{
        .gst = &runtime,
        .pipeline = source.element,
        .latency_ns = latency,
        .member = &member,
    };

    const sink = source.child("decoded") orelse return error.TestUnexpectedResult;
    defer runtime.gstreamer.gst_object_unref(sink);

    sender.attach(sink);
    source.useClock(clock.system);
    _ = source.setState(.playing);

    try untilRendered(&rendered);

    const heard_at = runtime.gstreamer.gst_element_get_base_time(source.element) + latency;

    try testing.expectEqual(heard_at, rendered.pts.load(.acquire));
    try testing.expect(rendered.at_ns.load(.acquire) >= heard_at);
}

test "audio_stream: a member that joined a source hears its audio at the time it is stamped with" {
    var runtime = try loaded();
    const latency = 300 * std.time.ns_per_ms;

    var source: TestSource = undefined;
    try source.init(&runtime, test_caps, 20, latency);
    defer source.deinit();

    var member = try Member.init(&runtime, watched_output, source.clock.system);
    defer member.deinit();

    var rendered: Rendered = .{ .clock = &source.clock };
    try watch(&member, &rendered);

    var receiver: Receiver = .{ .io = io_context(), .sync = source.clock.net, .member = &member };
    try receiver.start("127.0.0.1", source.listener.port(), test_key);
    defer receiver.stop();

    try untilJoined(&source, &receiver);
    source.play();
    try untilRendered(&rendered);

    const heard_at = source.baseTime() + latency;

    try testing.expectEqual(heard_at, rendered.pts.load(.acquire));
    try testing.expect(rendered.at_ns.load(.acquire) >= heard_at);
}

test "audio_stream: a member is receiving while its source plays, and not once the source has stopped" {
    var runtime = try loaded();
    const latency = 300 * std.time.ns_per_ms;

    var source: TestSource = undefined;
    try source.init(&runtime, test_caps, 40, latency);
    defer source.deinit();

    var member = try Member.init(&runtime, watched_output, source.clock.system);
    defer member.deinit();

    var rendered: Rendered = .{ .clock = &source.clock };
    try watch(&member, &rendered);

    var receiver: Receiver = .{ .io = io_context(), .sync = source.clock.net, .member = &member };
    try receiver.start("localhost", source.listener.port(), test_key);
    defer receiver.stop();

    try untilJoined(&source, &receiver);
    try testing.expect(!receiver.receiving());

    source.play();
    try untilRendered(&rendered);
    try testing.expect(receiver.receiving());

    for (0..100) |_| {
        if (!receiver.receiving()) return;

        sleep(50);
    }

    return error.TestExpectedSilence;
}

test "audio_stream: a backlog too big for a socket asks for the largest send buffer there is" {
    const hi_res: Format = .{ .rate = 192000, .channels = 2, .sample = .s24, .channel_mask = 0 };

    try testing.expectEqual(std.math.maxInt(c_int), sendBufferBytes(hi_res, 12_000 * std.time.ns_per_s));
}

test "audio_stream: a member stays joined through a chunk that stalls part-way on the network" {
    var runtime = try loaded();

    var source: TestWireSource = undefined;
    try source.open(&runtime);
    defer source.close();

    var member = try Member.init(&runtime, watched_output, source.clock.system);
    defer member.deinit();

    var rendered: Rendered = .{ .clock = &source.clock };
    try watch(&member, &rendered);

    var receiver: Receiver = .{ .io = io_context(), .sync = source.clock.net, .member = &member };
    try receiver.start("127.0.0.1", source.port(), test_key);
    defer receiver.stop();

    try source.accept();
    try untilSynced(&receiver);

    const silence: [test_format.bytesPerSecond() / 10]u8 = @splat(0);
    const at = source.clock.net.now(source.clock.system) + 800 * std.time.ns_per_ms;
    var header: [audio_wire.chunk_header_bytes]u8 = undefined;

    try source.write(audio_wire.chunkHeader(&header, at, test_format, silence.len));
    try source.write(silence[0 .. silence.len / 2]);
    sleep(300);
    try source.write(silence[silence.len / 2 ..]);

    try untilRendered(&rendered);

    try testing.expectEqual(at, rendered.pts.load(.acquire));
}

test "audio_stream: a member drops a chunk that arrives after its play time, and keeps the smallest lead" {
    var runtime = try loaded();

    var source: TestWireSource = undefined;
    try source.open(&runtime);
    defer source.close();

    var member = try Member.init(&runtime, watched_output, source.clock.system);
    defer member.deinit();

    var rendered: Rendered = .{ .clock = &source.clock };
    try watch(&member, &rendered);

    var receiver: Receiver = .{ .io = io_context(), .sync = source.clock.net, .member = &member };
    try receiver.start("127.0.0.1", source.port(), test_key);
    defer receiver.stop();

    try source.accept();
    try untilSynced(&receiver);

    const silence: [test_format.bytesPerSecond() / 10]u8 = @splat(0);
    const lead = 300 * std.time.ns_per_ms;
    const now = source.clock.net.now(source.clock.system);
    const on_time = now + lead;

    try source.writeChunk(now - 100 * std.time.ns_per_ms, &silence);
    try source.writeChunk(on_time, &silence);
    try untilRendered(&rendered);

    const smallest = receiver.smallest_lead_ns.load(.acquire);

    try testing.expectEqual(on_time, rendered.pts.load(.acquire));
    try testing.expectEqual(2, receiver.received.load(.acquire));
    try testing.expectEqual(1, receiver.late.load(.acquire));
    try testing.expect(smallest > 0 and smallest <= lead);
}

test "audio_stream: a member keeping up stays joined when one chunk holds more audio than the latency" {
    var runtime = try loaded();
    const latency = 100 * std.time.ns_per_ms;

    var source: TestSource = undefined;
    try source.init(&runtime, test_caps, 8, latency);
    defer source.deinit();

    const tone = source.pipeline.child("tone") orelse return error.TestUnexpectedResult;
    defer runtime.gstreamer.gst_object_unref(tone);
    runtime.gstreamer.gst_util_set_object_arg(tone, "samplesperbuffer", "12000");

    var member = try Member.init(&runtime, watched_output, source.clock.system);
    defer member.deinit();

    var rendered: Rendered = .{ .clock = &source.clock };
    try watch(&member, &rendered);

    var receiver: Receiver = .{ .io = io_context(), .sync = source.clock.net, .member = &member };
    try receiver.start("127.0.0.1", source.listener.port(), test_key);
    defer receiver.stop();

    try untilJoined(&source, &receiver);
    source.play();
    try untilRendered(&rendered);

    try testing.expectEqual(1, source.listener.memberCount());
}

test "audio_stream: a member drops what it holds when its source flushes" {
    var runtime = try loaded();

    var source: TestWireSource = undefined;
    try source.open(&runtime);
    defer source.close();

    var member = try Member.init(&runtime, watched_output, source.clock.system);
    defer member.deinit();

    var rendered: Rendered = .{ .clock = &source.clock };
    try watch(&member, &rendered);

    var receiver: Receiver = .{ .io = io_context(), .sync = source.clock.net, .member = &member };
    try receiver.start("127.0.0.1", source.port(), test_key);
    defer receiver.stop();

    try source.accept();
    try untilSynced(&receiver);

    const silence: [test_format.bytesPerSecond() / 10]u8 = @splat(0);
    var header: [audio_wire.header_bytes]u8 = undefined;

    try source.writeChunk(source.clock.net.now(source.clock.system) + 500 * std.time.ns_per_ms, &silence);
    try source.write(audio_wire.flushHeader(&header));

    for (0..20) |_| {
        if (!receiver.receiving()) break;

        sleep(10);
    }

    try testing.expect(!receiver.receiving());

    const at = source.clock.net.now(source.clock.system) + 300 * std.time.ns_per_ms;

    try source.writeChunk(at, &silence);
    try untilRendered(&rendered);

    try testing.expectEqual(at, rendered.pts.load(.acquire));
}

test "audio_stream: a source's flush reaches its members" {
    var runtime = try loaded();

    var source: TestSource = undefined;
    try source.init(&runtime, test_caps, 20, 300 * std.time.ns_per_ms);
    defer source.deinit();

    const stream = try connectWithKey(source.listener.port(), test_key);
    defer stream.close(io_context());

    var read_buffer: [64]u8 = undefined;
    var reader = stream.reader(io_context(), &read_buffer);
    var chunk_buffer: [16]u8 = undefined;

    const hello = try audio_wire.read(&reader.interface, &chunk_buffer);

    try testing.expectEqual(audio_wire.Kind.hello, std.meta.activeTag(hello));

    for (0..100) |_| {
        if (source.listener.memberCount() == 1) break;

        sleep(50);
    }

    source.sender.flush();

    try testing.expectEqual(audio_wire.Frame.flush, try audio_wire.read(&reader.interface, &chunk_buffer));
}

test "audio_stream: a source marks the audio it sends its members as high priority" {
    var runtime = try loaded();

    var source: TestSource = undefined;
    try source.init(&runtime, test_caps, 20, 300 * std.time.ns_per_ms);
    defer source.deinit();

    const stream = try connectWithKey(source.listener.port(), test_key);
    defer stream.close(io_context());

    for (0..100) |_| {
        if (source.listener.memberCount() == 1) break;

        sleep(50);
    }

    try testing.expectEqual(1, source.listener.memberCount());

    var traffic_class: c_int = 0;
    var length: std.c.socklen_t = @sizeOf(c_int);
    const member = source.listener.members.items[0];

    try testing.expectEqual(0, std.c.getsockopt(member.socket.handle, posix.IPPROTO.IP, dscp.ip_tos, &traffic_class, &length));
    try testing.expectEqual(0x88, traffic_class);
}

test "audio_stream: a member is receiving until the end of the audio it holds, not just its start" {
    var runtime = try loaded();

    var source: TestWireSource = undefined;
    try source.open(&runtime);
    defer source.close();

    var member = try Member.init(&runtime, watched_output, source.clock.system);
    defer member.deinit();

    var receiver: Receiver = .{ .io = io_context(), .sync = source.clock.net, .member = &member };
    try receiver.start("127.0.0.1", source.port(), test_key);
    defer receiver.stop();

    try source.accept();
    try untilSynced(&receiver);

    const long: [test_format.bytesPerSecond() / 2]u8 = @splat(0);
    const at = source.clock.net.now(source.clock.system) + 100 * std.time.ns_per_ms;

    try source.writeChunk(at, &long);

    sleepUntil(&source.clock, at + 200 * std.time.ns_per_ms);
    try testing.expect(receiver.receiving());

    sleepUntil(&source.clock, at + 600 * std.time.ns_per_ms);
    try testing.expect(!receiver.receiving());
}

test "audio_stream: a member that stops reading is dropped without holding up the source" {
    var runtime = try loaded();
    const latency = 100 * std.time.ns_per_ms;

    var source: TestSource = undefined;
    try source.init(&runtime, test_caps, 400, latency);
    defer source.deinit();

    var played: Rendered = .{ .clock = &source.clock };
    try watch(&source.member, &played);

    const stalled = try connectWithKey(source.listener.port(), test_key);
    defer stalled.close(io_context());

    const small: c_int = 1024;
    try posix.setsockopt(stalled.socket.handle, posix.SOL.SOCKET, posix.SO.RCVBUF, std.mem.asBytes(&small));

    for (0..100) |_| {
        if (source.listener.memberCount() == 1) break;

        sleep(50);
    }

    try testing.expectEqual(1, source.listener.memberCount());

    source.play();

    for (0..100) |_| {
        if (source.listener.memberCount() == 0) break;

        sleep(50);
    }

    try testing.expectEqual(0, source.listener.memberCount());

    const dropped_at = played.count.load(.acquire);
    sleep(300);

    try testing.expect(played.count.load(.acquire) > dropped_at);
}

fn untilNotWhole(handle: posix.socket_t, header: []const u8, bytes: []const u8) Sent {
    for (0..1000) |_| {
        const sent = sendWhole(handle, header, bytes);
        if (sent != .whole) return sent;

        sleep(1);
    }

    return .whole;
}

test "audio_stream: a send to a member that stops reading says it fell behind" {
    const loopback: net.IpAddress = .{ .ip4 = .loopback(0) };
    var server = try net.IpAddress.listen(&loopback, io_context(), .{ .mode = .stream });
    defer server.deinit(io_context());

    const address: net.IpAddress = .{ .ip4 = .loopback(server.socket.address.getPort()) };
    const client = try net.IpAddress.connect(&address, io_context(), .{ .mode = .stream });
    defer client.close(io_context());

    const accepted = try server.accept(io_context());
    defer accepted.close(io_context());
    try nonBlocking(accepted.socket.handle);

    const header = [_]u8{0} ** audio_wire.chunk_header_bytes;
    const bytes = [_]u8{0} ** (64 * 1024);

    try testing.expectEqual(.behind, untilNotWhole(accepted.socket.handle, &header, &bytes));
}

test "audio_stream: a send to a member that has disconnected says it disconnected" {
    const loopback: net.IpAddress = .{ .ip4 = .loopback(0) };
    var server = try net.IpAddress.listen(&loopback, io_context(), .{ .mode = .stream });
    defer server.deinit(io_context());

    const address: net.IpAddress = .{ .ip4 = .loopback(server.socket.address.getPort()) };
    const client = try net.IpAddress.connect(&address, io_context(), .{ .mode = .stream });

    const accepted = try server.accept(io_context());
    defer accepted.close(io_context());
    try nonBlocking(accepted.socket.handle);

    client.close(io_context());

    const header = [_]u8{0} ** audio_wire.chunk_header_bytes;
    const bytes = [_]u8{0} ** 1024;

    try testing.expectEqual(.disconnected, untilNotWhole(accepted.socket.handle, &header, &bytes));
}

test "audio_stream: a member plays each chunk in the format it came with" {
    var runtime = try loaded();
    const clock = try startedClock(&runtime);

    var member = try Member.init(&runtime, watched_output, clock.system);
    defer member.deinit();

    var rendered: Rendered = .{ .clock = &clock };
    try watch(&member, &rendered);

    const hi_res: Format = .{ .rate = 96000, .channels = 2, .sample = .s24, .channel_mask = 0 };
    const first: [test_format.bytesPerSecond() / 10]u8 = @splat(0);
    const second: [hi_res.bytesPerSecond() / 10]u8 = @splat(0);
    const at = clock.net.now(clock.system) + 300 * std.time.ns_per_ms;

    try testing.expect(member.play(at, test_format, &first));
    try testing.expect(member.play(at + 100 * std.time.ns_per_ms, hi_res, &second));

    for (0..100) |_| {
        if (rendered.count.load(.acquire) == 2) break;

        sleep(50);
    }

    try testing.expectEqual(2, rendered.count.load(.acquire));
    try testing.expectEqual(at + 100 * std.time.ns_per_ms, rendered.last_pts.load(.acquire));
    try testing.expectEqual(100 * std.time.ns_per_ms, rendered.last_duration_ns.load(.acquire));
    try testing.expectEqual(96000, rendered.last_rate.load(.acquire));
}

test "audio_stream: a member holds audio at a new rate until what it has already been given has played, then plays it on time" {
    var runtime = try loaded();
    const clock = try startedClock(&runtime);

    var member = try Member.init(&runtime, watched_output, clock.system);
    defer member.deinit();

    var rendered: Rendered = .{ .clock = &clock };
    try watch(&member, &rendered);

    const hi_res: Format = .{ .rate = 96000, .channels = 2, .sample = .s24, .channel_mask = 0 };
    const first: [test_format.bytesPerSecond() / 10]u8 = @splat(0);
    const second: [hi_res.bytesPerSecond() / 10]u8 = @splat(0);
    const at = clock.net.now(clock.system) + 300 * std.time.ns_per_ms;
    const boundary = at + 100 * std.time.ns_per_ms;

    try testing.expect(member.play(at, test_format, &first));
    try testing.expect(member.play(boundary, hi_res, &second));

    try untilRendered(&rendered);
    rendered.at_ns.store(0, .release);
    try untilRenderedAtLeast(&rendered, 2);

    try testing.expectEqual(boundary, rendered.pts.load(.acquire));
    try testing.expect(rendered.at_ns.load(.acquire) >= boundary);
    try testing.expect(rendered.at_ns.load(.acquire) < boundary + 100 * std.time.ns_per_ms);
}

test "audio_stream: a flush while a member holds audio drops it, and nothing plays it later" {
    var runtime = try loaded();
    const clock = try startedClock(&runtime);

    var member = try Member.init(&runtime, watched_output, clock.system);
    defer member.deinit();

    var rendered: Rendered = .{ .clock = &clock };
    try watch(&member, &rendered);

    const hi_res: Format = .{ .rate = 96000, .channels = 2, .sample = .s24, .channel_mask = 0 };
    const first: [test_format.bytesPerSecond() / 10]u8 = @splat(0);
    const second: [hi_res.bytesPerSecond() / 10]u8 = @splat(0);
    const at = clock.net.now(clock.system) + 300 * std.time.ns_per_ms;

    try testing.expect(member.play(at, test_format, &first));
    try testing.expect(member.play(at + 100 * std.time.ns_per_ms, hi_res, &second));
    member.flush();

    sleepUntil(&clock, at + 300 * std.time.ns_per_ms);

    try testing.expectEqual(0, rendered.count.load(.acquire));
}

test "audio_stream: audio at a new rate plays at once when nothing of the old rate is still to be heard" {
    var runtime = try loaded();
    const clock = try startedClock(&runtime);

    var member = try Member.init(&runtime, watched_output, clock.system);
    defer member.deinit();

    var rendered: Rendered = .{ .clock = &clock };
    try watch(&member, &rendered);

    const cd_format: Format = .{ .rate = 44100, .channels = 2, .sample = .s16, .channel_mask = 0 };
    const cd_silence: [cd_format.bytesPerSecond() / 10]u8 = @splat(0);
    const cd_at = clock.net.now(clock.system) + 300 * std.time.ns_per_ms;

    try testing.expect(member.play(cd_at, cd_format, &cd_silence));
    try untilRendered(&rendered);
    sleepUntil(&clock, cd_at + 200 * std.time.ns_per_ms);
    rendered.at_ns.store(0, .release);

    const silence: [test_format.bytesPerSecond() / 10]u8 = @splat(0);
    const at = clock.net.now(clock.system) + 300 * std.time.ns_per_ms;

    try testing.expect(member.play(at, test_format, &silence));
    try untilRenderedAtLeast(&rendered, 2);

    try testing.expectEqual(at, rendered.pts.load(.acquire));
    try testing.expectEqual(48000, rendered.last_rate.load(.acquire));
    try testing.expect(rendered.at_ns.load(.acquire) >= at);
    try testing.expect(rendered.at_ns.load(.acquire) < at + 100 * std.time.ns_per_ms);
}

test "audio_stream: a member torn down while it holds audio stops its waiter" {
    var runtime = try loaded();
    const clock = try startedClock(&runtime);

    var member = try Member.init(&runtime, watched_output, clock.system);

    const hi_res: Format = .{ .rate = 96000, .channels = 2, .sample = .s24, .channel_mask = 0 };
    const first: [test_format.bytesPerSecond() / 10]u8 = @splat(0);
    const second: [hi_res.bytesPerSecond() / 10]u8 = @splat(0);
    const at = clock.net.now(clock.system) + 300 * std.time.ns_per_ms;

    try testing.expect(member.play(at, test_format, &first));
    try testing.expect(member.play(at + 100 * std.time.ns_per_ms, hi_res, &second));

    member.deinit();
}

test "audio_stream: a source splits a long buffer on whole frames and keeps its channel layout" {
    var runtime = try loaded();

    var source: TestSource = undefined;
    try source.init(&runtime, "audio/x-raw,format=S24LE,rate=48000,channels=6", 4, 300 * std.time.ns_per_ms);
    defer source.deinit();

    const tone = source.pipeline.child("tone") orelse return error.TestUnexpectedResult;
    defer runtime.gstreamer.gst_object_unref(tone);
    runtime.gstreamer.gst_util_set_object_arg(tone, "samplesperbuffer", "12000");

    const stream = try connectWithKey(source.listener.port(), test_key);
    defer stream.close(io_context());

    var read_buffer: [4 * 1024]u8 = undefined;
    var reader: socket_reader.Reader = .init(stream.socket.handle, &read_buffer, 5000);
    const chunk_buffer = try testing.allocator.alloc(u8, max_chunk_bytes);
    defer testing.allocator.free(chunk_buffer);

    try testing.expectEqual(audio_wire.Kind.hello, std.meta.activeTag(try audio_wire.read(&reader.interface, chunk_buffer)));

    for (0..100) |_| {
        if (source.listener.memberCount() == 1) break;

        sleep(50);
    }

    source.play();

    const surround: Format = .{ .rate = 48000, .channels = 6, .sample = .s24, .channel_mask = 0x3f };
    var received: usize = 0;

    while (received < 48000 * surround.bytesPerFrame()) {
        const chunk = (try audio_wire.read(&reader.interface, chunk_buffer)).chunk;

        try testing.expectEqual(surround, chunk.format);
        try testing.expectEqual(0, chunk.bytes.len % surround.bytesPerFrame());

        received += chunk.bytes.len;
    }

    try testing.expectEqual(48000 * surround.bytesPerFrame(), received);
}

fn sendBufferOf(handle: posix.socket_t) !c_int {
    var bytes: c_int = 0;
    var length: posix.socklen_t = @sizeOf(c_int);

    if (posix.system.getsockopt(handle, posix.SOL.SOCKET, posix.SO.SNDBUF, &bytes, &length) != 0) {
        return error.TestUnexpectedResult;
    }

    return bytes;
}

test "audio_stream: a listener grows its members' send buffers when the format grows" {
    const loopback: net.IpAddress = .{ .ip4 = .loopback(0) };
    var listener: Listener = undefined;

    try listener.init(&loopback, 45890, 100 * std.time.ns_per_ms, test_key, key_timeout_ms);
    defer listener.deinit();

    const stream = try connectWithKey(listener.port(), test_key);
    defer stream.close(io_context());

    for (0..100) |_| {
        if (listener.memberCount() == 1) break;

        sleep(50);
    }

    const narrow: Format = .{ .rate = 8000, .channels = 1, .sample = .s16, .channel_mask = 0 };
    const hi_res: Format = .{ .rate = 192000, .channels = 2, .sample = .s24, .channel_mask = 0 };
    const chunk: [12]u8 = @splat(0);
    const member = listener.members.items[0].socket.handle;

    listener.send(1, narrow, &chunk);
    const narrow_bytes = try sendBufferOf(member);

    listener.send(2, hi_res, &chunk);

    try testing.expect(try sendBufferOf(member) > narrow_bytes);
}

test "audio_stream: a source refuses a member that presents another key" {
    const loopback: net.IpAddress = .{ .ip4 = .loopback(0) };
    var listener: Listener = undefined;

    try listener.init(&loopback, 45890, 100 * std.time.ns_per_ms, test_key, key_timeout_ms);
    defer listener.deinit();

    const stream = try connectWithKey(listener.port(), other_key);
    defer stream.close(io_context());

    var read_buffer: [64]u8 = undefined;
    var reader: socket_reader.Reader = .init(stream.socket.handle, &read_buffer, 5000);
    var chunk_buffer: [16]u8 = undefined;

    try testing.expectEqual(audio_wire.Kind.hello, std.meta.activeTag(try audio_wire.read(&reader.interface, &chunk_buffer)));
    try testing.expectError(error.EndOfStream, audio_wire.read(&reader.interface, &chunk_buffer));
    try testing.expectEqual(0, listener.memberCount());
}

test "audio_stream: a source refuses a member that presents no key in time, then admits the next" {
    const loopback: net.IpAddress = .{ .ip4 = .loopback(0) };
    var listener: Listener = undefined;

    try listener.init(&loopback, 45890, 100 * std.time.ns_per_ms, test_key, 100);
    defer listener.deinit();

    const address: net.IpAddress = .{ .ip4 = .loopback(listener.port()) };
    const silent = try net.IpAddress.connect(&address, io_context(), .{ .mode = .stream });
    defer silent.close(io_context());

    const keyed = try connectWithKey(listener.port(), test_key);
    defer keyed.close(io_context());

    var read_buffer: [64]u8 = undefined;
    var reader: socket_reader.Reader = .init(silent.socket.handle, &read_buffer, 5000);
    var chunk_buffer: [16]u8 = undefined;

    try testing.expectEqual(audio_wire.Kind.hello, std.meta.activeTag(try audio_wire.read(&reader.interface, &chunk_buffer)));
    try testing.expectError(error.EndOfStream, audio_wire.read(&reader.interface, &chunk_buffer));

    for (0..100) |_| {
        if (listener.memberCount() == 1) break;

        sleep(50);
    }

    try testing.expectEqual(1, listener.memberCount());
}
