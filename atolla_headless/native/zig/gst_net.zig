const std = @import("std");
const builtin = @import("builtin");
const gst = @import("gst.zig");
const log = @import("log.zig");

pub const ClockTime = u64;

pub const none: ClockTime = std.math.maxInt(u64);

const g_type_int: usize = 6 << 2;

const Net = struct {
    gst_net_client_clock_new: *const fn (
        ?[*:0]const u8,
        [*:0]const u8,
        c_int,
        ClockTime,
    ) callconv(.c) ?*gst.Object,
    gst_net_time_provider_new: *const fn (
        *gst.Object,
        ?[*:0]const u8,
        c_int,
    ) callconv(.c) ?*gst.Object,
};

const Clocks = struct {
    gst_clock_get_time: *const fn (*gst.Object) callconv(.c) ClockTime,
    gst_clock_is_synced: *const fn (*gst.Object) callconv(.c) c_int,
    gst_clock_wait_for_sync: *const fn (*gst.Object, ClockTime) callconv(.c) c_int,
    gst_element_set_base_time: *const fn (*gst.Object, ClockTime) callconv(.c) void,
    gst_element_set_start_time: *const fn (*gst.Object, ClockTime) callconv(.c) void,
    gst_pipeline_set_latency: *const fn (*gst.Object, ClockTime) callconv(.c) void,
    gst_pipeline_use_clock: *const fn (*gst.Object, ?*gst.Object) callconv(.c) void,
    gst_system_clock_obtain: *const fn () callconv(.c) ?*gst.Object,
};

const Properties = struct {
    g_object_get_property: *const fn (*gst.Object, [*:0]const u8, *gst.Value) callconv(.c) void,
    g_value_init: *const fn (*gst.Value, usize) callconv(.c) *gst.Value,
    g_value_unset: *const fn (*gst.Value) callconv(.c) void,
};

const net_candidates = switch (builtin.os.tag) {
    .macos => &[_][]const u8{
        "/Library/Frameworks/GStreamer.framework/Versions/1.0/lib/libgstnet-1.0.0.dylib",
        "libgstnet-1.0.0.dylib",
    },
    else => &[_][]const u8{
        "libgstnet-1.0.so.0",
        "libgstnet-1.0.so",
    },
};

pub const GstNet = struct {
    net_library: std.DynLib,

    net: Net,
    clocks: Clocks,
    properties: Properties,

    pub fn close(self: *GstNet) void {
        self.net_library.close();
    }

    pub fn systemClock(self: *const GstNet) ?*gst.Object {
        return self.clocks.gst_system_clock_obtain();
    }

    pub fn now(self: *const GstNet, clock: *gst.Object) ClockTime {
        return self.clocks.gst_clock_get_time(clock);
    }

    pub fn provide(
        self: *const GstNet,
        clock: *gst.Object,
        address: [:0]const u8,
        port: c_int,
    ) ?*gst.Object {
        return self.net.gst_net_time_provider_new(clock, address.ptr, port);
    }

    pub fn isSynced(self: *const GstNet, clock: *gst.Object) bool {
        return self.clocks.gst_clock_is_synced(clock) != 0;
    }

    pub fn clientClock(self: *const GstNet, address: [:0]const u8, port: c_int) ?*gst.Object {
        return self.net.gst_net_client_clock_new(null, address.ptr, port, 0);
    }

    pub fn portOf(self: *const GstNet, provider: *gst.Object) c_int {
        var value: gst.Value = .{};
        _ = self.properties.g_value_init(&value, g_type_int);
        defer self.properties.g_value_unset(&value);

        self.properties.g_object_get_property(provider, "port", &value);

        return @truncate(@as(i64, @bitCast(value.data[0])));
    }

    pub fn waitForSync(self: *const GstNet, clock: *gst.Object, timeout: ClockTime) bool {
        return self.clocks.gst_clock_wait_for_sync(clock, timeout) != 0;
    }

    pub fn startAt(
        self: *const GstNet,
        pipeline: *gst.Object,
        clock: *gst.Object,
        base_time: ClockTime,
        latency: ClockTime,
    ) void {
        self.clocks.gst_pipeline_use_clock(pipeline, clock);
        self.clocks.gst_element_set_start_time(pipeline, none);
        self.clocks.gst_pipeline_set_latency(pipeline, latency);
        self.clocks.gst_element_set_base_time(pipeline, base_time);
    }
};

pub fn load(
    gstreamer_library: *std.DynLib,
    gobject_library: *std.DynLib,
) gst.Error!GstNet {
    var net_library = gst.open(net_candidates) catch |failure| {
        log.err("sync", "gstreamer's net library is not installed", .{});

        return failure;
    };
    errdefer net_library.close();

    return .{
        .net_library = net_library,
        .net = try gst.resolve(Net, &net_library),
        .clocks = try gst.resolve(Clocks, gstreamer_library),
        .properties = try gst.resolve(Properties, gobject_library),
    };
}

const testing = std.testing;

fn loaded(host: *gst.Gst) !GstNet {
    return load(&host.gstreamer_library, &host.gobject_library) catch |failure| switch (failure) {
        error.LibraryNotFound => error.SkipZigTest,
        else => failure,
    };
}

test "gst_net: a client clock syncs to a provider over the loopback" {
    var host = gst.load() catch |failure| switch (failure) {
        error.LibraryNotFound => return error.SkipZigTest,
        else => return failure,
    };
    host.initialise();

    var sync = try loaded(&host);

    const system = sync.systemClock() orelse return error.TestUnexpectedResult;
    defer host.gstreamer.gst_object_unref(system);

    const provider = sync.provide(system, "127.0.0.1", 0) orelse return error.TestUnexpectedResult;
    defer host.gstreamer.gst_object_unref(provider);

    const port = sync.portOf(provider);
    try testing.expect(port > 0);

    const client = sync.clientClock("127.0.0.1", port) orelse return error.TestUnexpectedResult;
    defer host.gstreamer.gst_object_unref(client);

    try testing.expect(sync.waitForSync(client, 5 * gst.second));

    const provided = sync.now(system);
    const observed = sync.now(client);
    const skew = if (observed > provided) observed - provided else provided - observed;

    try testing.expect(skew < 50 * std.time.ns_per_ms);
}
