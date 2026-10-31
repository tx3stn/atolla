const std = @import("std");
const audio_wire = @import("audio_wire.zig");
const Clock = @import("clock.zig").Clock;
const gst = @import("gst.zig");
const gst_net = @import("gst_net.zig");
const log = @import("log.zig");
const max_host_bytes = @import("command.zig").max_host_bytes;
const socket_reader = @import("socket_reader.zig");

const net = std.Io.net;
const posix = std.posix;

const rate = 48000;
const channels = 2;
const bits = 16;

pub const caps = "audio/x-raw,format=S16LE,layout=interleaved,rate=48000,channels=2";

const bytes_per_second = rate * channels * bits / 8;

const max_chunk_bytes = bytes_per_second;

const poll_interval_ms = 100;

const no_lead = std.math.maxInt(u64);

const tally_interval_ns = 60 * std.time.ns_per_s;

const member_head = "appsrc name=source format=time caps=\"" ++ caps ++
    "\" ! audioconvert ! audioresample name=resample";

pub const Error = gst.PipelineError || error{OutputNotFound};

pub const Output = union(enum) {
    described: [:0]const u8,
    named: []const u8,
};

pub const Member = struct {
    pipeline: gst.Pipeline,
    source: *gst.Object,

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

        const source = pipeline.child("source") orelse return error.LaunchFailed;

        pipeline.schedule(clock, 0);
        _ = pipeline.setState(.playing);

        return .{ .pipeline = pipeline, .source = source };
    }

    pub fn deinit(self: *Member) void {
        const runtime = self.pipeline.gst;

        self.pipeline.deinit();
        runtime.gstreamer.gst_object_unref(self.source);
    }

    pub fn flush(self: *const Member) void {
        const runtime = self.pipeline.gst;

        if (runtime.gstreamer.gst_event_new_flush_start()) |event| {
            _ = runtime.gstreamer.gst_element_send_event(self.source, event);
        }

        if (runtime.gstreamer.gst_event_new_flush_stop(0)) |event| {
            _ = runtime.gstreamer.gst_element_send_event(self.source, event);
        }

        _ = self.pipeline.setState(.playing);
    }

    pub fn play(self: *const Member, play_at_ns: u64, bytes: []const u8) bool {
        const runtime = self.pipeline.gst;
        const buffer = runtime.gstreamer.gst_buffer_new_allocate(null, bytes.len, null) orelse {
            return false;
        };

        _ = runtime.gstreamer.gst_buffer_fill(buffer, 0, bytes.ptr, bytes.len);
        buffer.pts = play_at_ns;
        buffer.duration = durationNs(bytes.len);

        return runtime.app.gst_app_src_push_buffer(self.source, buffer) == gst.flow_ok;
    }

    pub fn playOn(self: *const Member, clock: *gst.Object) void {
        self.flush();
        _ = self.pipeline.setState(.paused);
        self.pipeline.schedule(clock, 0);
        _ = self.pipeline.setState(.playing);
    }
};

fn durationNs(bytes_len: usize) u64 {
    return @as(u64, bytes_len) * std.time.ns_per_s / bytes_per_second;
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

pub const Sender = struct {
    gst: *const gst.Gst,
    pipeline: *gst.Object,
    latency_ns: u64,
    member: *const Member,
    listener: std.atomic.Value(?*Listener) = .init(null),
    joined: std.atomic.Value(bool) = .init(false),

    pub fn attach(self: *Sender, sink: *gst.Object) void {
        const runtime = self.gst;

        runtime.gstreamer.gst_util_set_object_arg(sink, "caps", caps);
        runtime.gstreamer.gst_util_set_object_arg(sink, "sync", "true");
        runtime.gstreamer.gst_util_set_object_arg(sink, "emit-signals", "true");

        _ = runtime.gobject.g_signal_connect_data(sink, "new-sample", @ptrCast(&onNewSample), self, null, 0);
    }

    pub fn flush(self: *const Sender) void {
        if (self.joined.load(.acquire)) return;

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

        const running = runtime.gstreamer.gst_segment_to_running_time(segment, .time, buffer.pts);
        if (running == gst.clock_time_none) return;

        var map: gst.MapInfo = .{};
        if (runtime.gstreamer.gst_buffer_map(buffer, &map, gst.map_read) == 0) return;
        defer runtime.gstreamer.gst_buffer_unmap(buffer, &map);

        const data = (map.data orelse return)[0..map.size];
        const heard_at = runtime.gstreamer.gst_element_get_base_time(self.pipeline) + running + self.latency_ns;
        const listener = self.listener.load(.acquire);

        var offset: usize = 0;
        while (offset < data.len) {
            const piece = data[offset..@min(data.len, offset + max_chunk_bytes)];
            const play_at_ns = heard_at + @as(u64, offset) * std.time.ns_per_s / bytes_per_second;

            _ = self.member.play(play_at_ns, piece);
            if (listener) |members| members.send(play_at_ns, piece);

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
    send_buffer_bytes: c_int,
    running: std.atomic.Value(bool) = .init(true),
    mutex: std.Io.Mutex = .init,
    members: std.ArrayList(net.Stream) = .empty,
    thread: ?std.Thread = null,

    pub fn init(self: *Listener, address: *const net.IpAddress, clock_port: u16, latency_ns: u64) !void {
        const io = io_context();
        const backlog_bytes = bytes_per_second * latency_ns / std.time.ns_per_s;
        const send_buffer_bytes = std.math.cast(c_int, audio_wire.chunk_header_bytes + max_chunk_bytes + backlog_bytes) orelse {
            return error.LatencyTooLong;
        };

        self.* = .{
            .io = io,
            .server = try net.IpAddress.listen(address, io, .{ .mode = .stream, .reuse_address = true }),
            .hello = .{
                .version = audio_wire.version,
                .clock_port = clock_port,
                .rate = rate,
                .channels = channels,
                .bits = bits,
            },
            .send_buffer_bytes = send_buffer_bytes,
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

    pub fn send(self: *Listener, play_at_ns: u64, bytes: []const u8) void {
        var header_buffer: [audio_wire.chunk_header_bytes]u8 = undefined;

        self.broadcast(audio_wire.chunkHeader(&header_buffer, play_at_ns, bytes.len), bytes);
    }

    fn admit(self: *Listener, stream: net.Stream) !void {
        const no_delay: c_int = 1;

        try posix.setsockopt(stream.socket.handle, posix.IPPROTO.TCP, posix.TCP.NODELAY, std.mem.asBytes(&no_delay));
        try posix.setsockopt(
            stream.socket.handle,
            posix.SOL.SOCKET,
            posix.SO.SNDBUF,
            std.mem.asBytes(&self.send_buffer_bytes),
        );

        var buffer: [64]u8 = undefined;
        var writer = stream.writer(self.io, &buffer);

        try audio_wire.writeHello(&writer.interface, self.hello);
        try writer.interface.flush();
        try nonBlocking(stream.socket.handle);

        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);

        try self.members.append(std.heap.c_allocator, stream);
    }

    fn broadcast(self: *Listener, header: []const u8, bytes: []const u8) void {
        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);

        var index: usize = 0;
        while (index < self.members.items.len) {
            const member = self.members.items[index];

            if (sendWhole(member.socket.handle, header, bytes)) {
                index += 1;
                continue;
            }

            log.warn("audio", "dropped a member that fell behind", .{});
            member.close(self.io);
            _ = self.members.swapRemove(index);
        }
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

            self.admit(stream) catch {
                log.warn("audio", "could not admit a member", .{});
                stream.close(self.io);
            };
        }
    }
};

fn nonBlocking(handle: posix.socket_t) !void {
    const flags = posix.system.fcntl(handle, posix.F.GETFL);
    if (flags < 0) return error.Unexpected;

    const non_blocking = @as(c_int, 1) << @bitOffsetOf(posix.O, "NONBLOCK");
    if (posix.system.fcntl(handle, posix.F.SETFL, flags | non_blocking) < 0) return error.Unexpected;
}

fn sendWhole(handle: posix.socket_t, header: []const u8, bytes: []const u8) bool {
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
            .SUCCESS => return @as(usize, @intCast(sent)) == header.len + bytes.len,
            .INTR => continue,
            else => return false,
        }
    }
}

pub const Receiver = struct {
    io: std.Io,
    sync: gst_net.GstNet,
    member: *const Member,
    host: [max_host_bytes + 1]u8 = undefined,
    host_len: usize = 0,
    port: u16 = 0,
    stopping: std.atomic.Value(bool) = .init(false),
    clock: std.atomic.Value(?*gst.Object) = .init(null),
    play_until_ns: std.atomic.Value(u64) = .init(0),
    received: std.atomic.Value(u32) = .init(0),
    late: std.atomic.Value(u32) = .init(0),
    smallest_lead_ns: std.atomic.Value(u64) = .init(no_lead),
    thread: ?std.Thread = null,

    pub fn start(self: *Receiver, host: []const u8, port: u16) !void {
        if (host.len > max_host_bytes) return error.HostTooLong;

        @memcpy(self.host[0..host.len], host);
        self.host[host.len] = 0;
        self.host_len = host.len;
        self.port = port;

        self.stopping.store(false, .release);
        self.play_until_ns.store(0, .release);
        self.received.store(0, .release);
        self.late.store(0, .release);
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

    fn hear(self: *Receiver, now_ns: u64, piece: audio_wire.Chunk) void {
        _ = self.received.fetchAdd(1, .acq_rel);

        if (piece.play_at_ns <= now_ns) {
            _ = self.late.fetchAdd(1, .acq_rel);

            return;
        }

        _ = self.smallest_lead_ns.fetchMin(piece.play_at_ns - now_ns, .acq_rel);
        _ = self.member.play(piece.play_at_ns, piece.bytes);
        self.play_until_ns.store(piece.play_at_ns + durationNs(piece.bytes.len), .release);
    }

    fn report(self: *Receiver) void {
        const received = self.received.swap(0, .acq_rel);
        const late = self.late.swap(0, .acq_rel);
        const smallest_lead_ns = self.smallest_lead_ns.swap(no_lead, .acq_rel);

        if (smallest_lead_ns == no_lead) {
            log.warn("audio", "in the last minute {d} chunks arrived, all of them late", .{received});
        } else if (late > 0) {
            log.warn("audio", "in the last minute {d} chunks arrived, {d} of them late; the closest on time had {d}ms to spare", .{
                received,
                late,
                smallest_lead_ns / std.time.ns_per_ms,
            });
        } else {
            log.debug("audio", "in the last minute {d} chunks arrived, none late; the closest had {d}ms to spare", .{
                received,
                smallest_lead_ns / std.time.ns_per_ms,
            });
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
            .chunk, .flush => return,
        };

        if (hello.version != audio_wire.version or
            hello.rate != rate or
            hello.channels != channels or
            hello.bits != bits)
        {
            log.warn("audio", "the source streams a version or format this speaker does not play", .{});

            return;
        }

        var clock_host_buffer: [64]u8 = undefined;
        const clock_host = hostOf(&clock_host_buffer, connected.address) catch return;
        const clock = self.sync.clientClock(clock_host, hello.clock_port) orelse return;
        self.clock.store(clock, .release);
        self.member.playOn(clock);

        var tally_started_ns: ?u64 = null;

        while (!self.stopping.load(.acquire)) {
            const frame = audio_wire.read(&reader.interface, &chunk_buffer) catch return;

            switch (frame) {
                .hello => return,
                .chunk => |piece| {
                    if (!self.sync.isSynced(clock)) continue;

                    const now_ns = self.sync.now(clock);
                    self.hear(now_ns, piece);

                    if (tally_started_ns == null) tally_started_ns = now_ns;
                    if (now_ns -| tally_started_ns.? >= tally_interval_ns) {
                        self.report();
                        tally_started_ns = now_ns;
                    }
                },
                .flush => {
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

const watched_output: Output = .{ .described = "fakesink name=output sync=true signal-handoffs=true" };

const Rendered = struct {
    clock: *const Clock,
    at_ns: std.atomic.Value(u64) = .init(0),
    pts: std.atomic.Value(u64) = .init(0),
    count: std.atomic.Value(u32) = .init(0),
};

fn onHandoff(_: *gst.Object, buffer: *gst.Buffer, _: *gst.Object, user_data: ?*anyopaque) callconv(.c) void {
    const rendered: *Rendered = @ptrCast(@alignCast(user_data orelse return));

    _ = rendered.count.fetchAdd(1, .acq_rel);

    if (rendered.at_ns.load(.acquire) != 0) return;

    rendered.pts.store(buffer.pts, .release);
    rendered.at_ns.store(rendered.clock.nowNs(), .release);
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
    const now = clock.nowNs();
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

const TestSource = struct {
    clock: Clock,
    member: Member,
    sender: Sender,
    listener: Listener,
    pipeline: gst.Pipeline,

    fn init(self: *TestSource, runtime: *gst.Gst, buffers: u32, latency_ns: u64) !void {
        self.clock = try startedClock(runtime);
        const clock_port = self.clock.provide("127.0.0.1", 0) orelse return error.TestUnexpectedResult;

        self.member = try Member.init(runtime, watched_output, self.clock.system);

        var description: [128]u8 = undefined;
        self.pipeline = try gst.Pipeline.launch(runtime, try std.fmt.bufPrintZ(
            &description,
            "audiotestsrc name=tone num-buffers={d} ! appsink name=decoded",
            .{buffers},
        ));

        const loopback: net.IpAddress = .{ .ip4 = .loopback(0) };
        try self.listener.init(&loopback, clock_port, latency_ns);

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

        try audio_wire.writeHello(&writer.interface, .{
            .version = audio_wire.version,
            .clock_port = self.clock_port,
            .rate = rate,
            .channels = channels,
            .bits = bits,
        });
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

        try self.write(audio_wire.chunkHeader(&header, play_at_ns, bytes.len));
        try self.write(bytes);
    }
};

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

    const silence: [bytes_per_second / 10]u8 = @splat(0);
    const at = clock.nowNs() + 500 * std.time.ns_per_ms;

    try testing.expect(member.play(at, &silence));
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

    const silence: [bytes_per_second / 10]u8 = @splat(0);

    try testing.expect(member.play(clock.nowNs() + 60 * std.time.ns_per_s, &silence));
    sleep(100);

    member.playOn(clock.system);

    const at = clock.nowNs() + 200 * std.time.ns_per_ms;

    try testing.expect(member.play(at, &silence));
    try untilRendered(&rendered);

    try testing.expectEqual(at, rendered.pts.load(.acquire));
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
    try source.init(&runtime, 20, latency);
    defer source.deinit();

    var member = try Member.init(&runtime, watched_output, source.clock.system);
    defer member.deinit();

    var rendered: Rendered = .{ .clock = &source.clock };
    try watch(&member, &rendered);

    var receiver: Receiver = .{ .io = io_context(), .sync = source.clock.net, .member = &member };
    try receiver.start("127.0.0.1", source.listener.port());
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
    try source.init(&runtime, 40, latency);
    defer source.deinit();

    var member = try Member.init(&runtime, watched_output, source.clock.system);
    defer member.deinit();

    var rendered: Rendered = .{ .clock = &source.clock };
    try watch(&member, &rendered);

    var receiver: Receiver = .{ .io = io_context(), .sync = source.clock.net, .member = &member };
    try receiver.start("localhost", source.listener.port());
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

test "audio_stream: a listener refuses a latency too long for a send buffer to hold" {
    const loopback: net.IpAddress = .{ .ip4 = .loopback(0) };
    var listener: Listener = undefined;

    try testing.expectError(error.LatencyTooLong, listener.init(&loopback, 45890, 12_000 * std.time.ns_per_s));
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
    try receiver.start("127.0.0.1", source.port());
    defer receiver.stop();

    try source.accept();
    try untilSynced(&receiver);

    const silence: [bytes_per_second / 10]u8 = @splat(0);
    const at = source.clock.nowNs() + 800 * std.time.ns_per_ms;
    var header: [audio_wire.chunk_header_bytes]u8 = undefined;

    try source.write(audio_wire.chunkHeader(&header, at, silence.len));
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
    try receiver.start("127.0.0.1", source.port());
    defer receiver.stop();

    try source.accept();
    try untilSynced(&receiver);

    const silence: [bytes_per_second / 10]u8 = @splat(0);
    const lead = 300 * std.time.ns_per_ms;
    const now = source.clock.nowNs();
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
    try source.init(&runtime, 8, latency);
    defer source.deinit();

    const tone = source.pipeline.child("tone") orelse return error.TestUnexpectedResult;
    defer runtime.gstreamer.gst_object_unref(tone);
    runtime.gstreamer.gst_util_set_object_arg(tone, "samplesperbuffer", "12000");

    var member = try Member.init(&runtime, watched_output, source.clock.system);
    defer member.deinit();

    var rendered: Rendered = .{ .clock = &source.clock };
    try watch(&member, &rendered);

    var receiver: Receiver = .{ .io = io_context(), .sync = source.clock.net, .member = &member };
    try receiver.start("127.0.0.1", source.listener.port());
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
    try receiver.start("127.0.0.1", source.port());
    defer receiver.stop();

    try source.accept();
    try untilSynced(&receiver);

    const silence: [bytes_per_second / 10]u8 = @splat(0);
    var header: [audio_wire.header_bytes]u8 = undefined;

    try source.writeChunk(source.clock.nowNs() + 500 * std.time.ns_per_ms, &silence);
    try source.write(audio_wire.flushHeader(&header));

    for (0..20) |_| {
        if (!receiver.receiving()) break;

        sleep(10);
    }

    try testing.expect(!receiver.receiving());

    const at = source.clock.nowNs() + 300 * std.time.ns_per_ms;

    try source.writeChunk(at, &silence);
    try untilRendered(&rendered);

    try testing.expectEqual(at, rendered.pts.load(.acquire));
}

test "audio_stream: a source's flush reaches its members" {
    var runtime = try loaded();

    var source: TestSource = undefined;
    try source.init(&runtime, 20, 300 * std.time.ns_per_ms);
    defer source.deinit();

    const address: net.IpAddress = .{ .ip4 = .loopback(source.listener.port()) };
    const stream = try net.IpAddress.connect(&address, io_context(), .{ .mode = .stream });
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

test "audio_stream: a member is receiving until the end of the audio it holds, not just its start" {
    var runtime = try loaded();

    var source: TestWireSource = undefined;
    try source.open(&runtime);
    defer source.close();

    var member = try Member.init(&runtime, watched_output, source.clock.system);
    defer member.deinit();

    var receiver: Receiver = .{ .io = io_context(), .sync = source.clock.net, .member = &member };
    try receiver.start("127.0.0.1", source.port());
    defer receiver.stop();

    try source.accept();
    try untilSynced(&receiver);

    const long: [bytes_per_second / 2]u8 = @splat(0);
    const at = source.clock.nowNs() + 100 * std.time.ns_per_ms;

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
    try source.init(&runtime, 400, latency);
    defer source.deinit();

    var played: Rendered = .{ .clock = &source.clock };
    try watch(&source.member, &played);

    const address: net.IpAddress = .{ .ip4 = .loopback(source.listener.port()) };
    const stalled = try net.IpAddress.connect(&address, io_context(), .{ .mode = .stream });
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
