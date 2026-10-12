const std = @import("std");
const Clock = @import("clock.zig").Clock;
const gst = @import("gst.zig");
const log = @import("log.zig");

pub const caps = "audio/x-raw,format=S16LE,layout=interleaved,rate=48000,channels=2";

const bytes_per_second = 48000 * 2 * 2;

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

    pub fn play(self: *const Member, play_at_ns: u64, bytes: []const u8) bool {
        const runtime = self.pipeline.gst;
        const buffer = runtime.gstreamer.gst_buffer_new_allocate(null, bytes.len, null) orelse {
            return false;
        };

        _ = runtime.gstreamer.gst_buffer_fill(buffer, 0, bytes.ptr, bytes.len);
        buffer.pts = play_at_ns;
        buffer.duration = @as(u64, bytes.len) * std.time.ns_per_s / bytes_per_second;

        return runtime.app.gst_app_src_push_buffer(self.source, buffer) == gst.flow_ok;
    }

    pub fn playOn(self: *const Member, clock: *gst.Object) void {
        _ = self.pipeline.setState(.paused);
        self.pipeline.schedule(clock, 0);
        _ = self.pipeline.setState(.playing);
    }
};

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

    pub fn attach(self: *Sender, sink: *gst.Object) void {
        const runtime = self.gst;

        runtime.gstreamer.gst_util_set_object_arg(sink, "caps", caps);
        runtime.gstreamer.gst_util_set_object_arg(sink, "sync", "true");
        runtime.gstreamer.gst_util_set_object_arg(sink, "emit-signals", "true");

        _ = runtime.gobject.g_signal_connect_data(sink, "new-sample", @ptrCast(&onNewSample), self, null, 0);
    }

    fn send(self: *const Sender, sink: *gst.Object) void {
        const runtime = self.gst;
        const sample = runtime.app.gst_app_sink_pull_sample(sink) orelse return;
        defer runtime.gstreamer.gst_mini_object_unref(sample);

        const buffer = runtime.gstreamer.gst_sample_get_buffer(sample) orelse return;
        const segment = runtime.gstreamer.gst_sample_get_segment(sample) orelse return;

        const running = runtime.gstreamer.gst_segment_to_running_time(segment, .time, buffer.pts);
        if (running == gst.clock_time_none) return;

        var map: gst.MapInfo = .{};
        if (runtime.gstreamer.gst_buffer_map(buffer, &map, gst.map_read) == 0) return;
        defer runtime.gstreamer.gst_buffer_unmap(buffer, &map);

        const data = map.data orelse return;
        const base_time = runtime.gstreamer.gst_element_get_base_time(self.pipeline);

        _ = self.member.play(base_time + running + self.latency_ns, data[0..map.size]);
    }
};

fn onNewSample(sink: *gst.Object, user_data: ?*anyopaque) callconv(.c) c_int {
    const sender: *const Sender = @ptrCast(@alignCast(user_data orelse return gst.flow_ok));

    sender.send(sink);

    return gst.flow_ok;
}

const testing = std.testing;

const watched_output: Output = .{ .described = "fakesink name=output sync=true signal-handoffs=true" };

const Rendered = struct {
    clock: *const Clock,
    at_ns: std.atomic.Value(u64) = .init(0),
    pts: std.atomic.Value(u64) = .init(0),
};

fn onHandoff(_: *gst.Object, buffer: *gst.Buffer, _: *gst.Object, user_data: ?*anyopaque) callconv(.c) void {
    const rendered: *Rendered = @ptrCast(@alignCast(user_data orelse return));

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

fn untilRendered(rendered: *const Rendered) !void {
    for (0..100) |_| {
        if (rendered.at_ns.load(.acquire) != 0) return;

        std.Io.Threaded.global_single_threaded.io().sleep(.fromMilliseconds(50), .awake) catch {};
    }

    return error.TestExpectedRender;
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
