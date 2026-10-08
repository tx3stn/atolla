// Single compilation root for the daemon's Zig code.
const std = @import("std");

comptime {
    _ = @import("api_version.zig");
    _ = @import("audio_player.zig");
    _ = @import("bridge.zig");
    _ = @import("clock.zig");
    _ = @import("command.zig");
    _ = @import("credentials.zig");
    _ = @import("gst.zig");
    _ = @import("gst_net.zig");
    _ = @import("hello.zig");
    _ = @import("http_server.zig");
    _ = @import("local_address.zig");
    _ = @import("log.zig");
    _ = @import("media_server.zig");
    _ = @import("pair.zig");
    _ = @import("problem.zig");
    _ = @import("random_bytes.zig");
    _ = @import("rate_limit.zig");
    _ = @import("router.zig");
    _ = @import("socket_reader.zig");
    _ = @import("state.zig");
    _ = @import("wav.zig");
}
