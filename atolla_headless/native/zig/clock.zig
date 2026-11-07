const std = @import("std");
const gst = @import("gst.zig");
const gst_net = @import("gst_net.zig");

pub const Clock = struct {
    gst: *const gst.Gst,
    net: gst_net.GstNet,
    system: *gst.Object,
    provider: ?*gst.Object = null,

    pub fn init(runtime: *gst.Gst) !Clock {
        var net = try gst_net.load(&runtime.gstreamer_library, &runtime.gobject_library);
        errdefer net.close();

        const system = net.systemClock() orelse return error.NoSystemClock;

        return .{ .gst = runtime, .net = net, .system = system };
    }

    pub fn provide(self: *Clock, address: [:0]const u8, port: u16) ?u16 {
        if (self.provider) |provider| self.gst.gstreamer.gst_object_unref(provider);
        self.provider = null;

        const provider = self.net.provide(self.system, address, port) orelse return null;
        self.provider = provider;

        return @intCast(self.net.portOf(provider));
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

test "clock: serves its clock on the port it is given" {
    var runtime = try loaded();
    var clock = try started(&runtime);

    const port = clock.provide("127.0.0.1", 0) orelse return error.TestUnexpectedResult;

    try testing.expect(port > 0);
}
