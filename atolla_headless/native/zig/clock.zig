const std = @import("std");
const gst = @import("gst.zig");
const gst_net = @import("gst_net.zig");
const max_host_bytes = @import("command.zig").max_host_bytes;

pub const Clock = struct {
    gst: *const gst.Gst,
    net: gst_net.GstNet,
    system: *gst.Object,
    provider: ?*gst.Object = null,

    client: ?*gst.Object = null,
    host: [max_host_bytes + 1]u8 = undefined,
    host_len: usize = 0,
    port: u16 = 0,

    pub fn init(runtime: *gst.Gst) !Clock {
        var net = try gst_net.load(&runtime.gstreamer_library, &runtime.gobject_library);
        errdefer net.close();

        const system = net.systemClock() orelse return error.NoSystemClock;

        return .{ .gst = runtime, .net = net, .system = system };
    }

    pub fn follow(self: *Clock, host: []const u8, port: u16) bool {
        if (host.len > max_host_bytes) return false;

        if (self.client != null and
            port == self.port and
            std.mem.eql(u8, host, self.host[0..self.host_len])) return true;

        if (self.client) |client| self.gst.gstreamer.gst_object_unref(client);
        self.client = null;
        self.host_len = 0;
        self.port = 0;

        if (host.len == 0) return true;

        @memcpy(self.host[0..host.len], host);
        self.host[host.len] = 0;

        self.client = self.net.clientClock(self.host[0..host.len :0], port) orelse return false;
        self.host_len = host.len;
        self.port = port;

        return true;
    }

    pub fn nowNs(self: *const Clock) u64 {
        return self.net.now(self.system);
    }

    pub fn provide(self: *Clock, address: [:0]const u8, port: u16) ?u16 {
        if (self.provider) |provider| self.gst.gstreamer.gst_object_unref(provider);
        self.provider = null;

        const provider = self.net.provide(self.system, address, port) orelse return null;
        self.provider = provider;

        return @intCast(self.net.portOf(provider));
    }

    pub fn synced(self: *const Clock) bool {
        const client = self.client orelse return true;

        return self.net.isSynced(client);
    }
};

const testing = std.testing;

fn loaded() !gst.Gst {
    var runtime = gst.load() catch |failure| switch (failure) {
        error.LibraryNotFound => return error.SkipZigTest,
        else => return failure,
    };

    runtime.initialise();

    return runtime;
}

fn started(runtime: *gst.Gst) !Clock {
    return Clock.init(runtime) catch |failure| switch (failure) {
        error.LibraryNotFound => error.SkipZigTest,
        else => failure,
    };
}

fn untilSynced(clock: *const Clock) !void {
    for (0..100) |_| {
        if (clock.synced()) return;

        std.Io.Threaded.global_single_threaded.io().sleep(.fromMilliseconds(50), .awake) catch {};
    }

    return error.TestExpectedSync;
}

test "clock: serves its clock on the port it is given" {
    var runtime = try loaded();
    var clock = try started(&runtime);

    const port = clock.provide("127.0.0.1", 0) orelse return error.TestUnexpectedResult;

    try testing.expect(port > 0);
}

test "clock: is synced while it plays on its own clock" {
    var runtime = try loaded();
    const clock = try started(&runtime);

    try testing.expect(clock.synced());
}

test "clock: follows another clock and says when it has synced" {
    var runtime = try loaded();
    var served = try started(&runtime);
    var follower = try started(&runtime);

    const port = served.provide("127.0.0.1", 0) orelse return error.TestUnexpectedResult;

    try testing.expect(follower.follow("127.0.0.1", port));
    try untilSynced(&follower);
}

test "clock: following the clock it already follows keeps its sync" {
    var runtime = try loaded();
    var served = try started(&runtime);
    var follower = try started(&runtime);

    const port = served.provide("127.0.0.1", 0) orelse return error.TestUnexpectedResult;

    try testing.expect(follower.follow("127.0.0.1", port));
    try untilSynced(&follower);
    try testing.expect(follower.follow("127.0.0.1", port));
    try testing.expect(follower.synced());
}

test "clock: following nothing puts it back on its own clock" {
    var runtime = try loaded();
    var served = try started(&runtime);
    var follower = try started(&runtime);

    const port = served.provide("127.0.0.1", 0) orelse return error.TestUnexpectedResult;

    try testing.expect(follower.follow("127.0.0.1", port));
    try testing.expect(follower.follow("", 0));
    try testing.expectEqual(null, follower.client);
    try testing.expect(follower.synced());
}

test "clock: refuses a host it cannot hold" {
    var runtime = try loaded();
    var clock = try started(&runtime);

    try testing.expect(!clock.follow("h" ** (max_host_bytes + 1), 45890));
}
