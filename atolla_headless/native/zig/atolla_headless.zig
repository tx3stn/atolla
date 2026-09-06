// Single compilation root for the daemon's Zig code.
const std = @import("std");

comptime {
    _ = @import("bridge.zig");
    _ = @import("hello.zig");
    _ = @import("http_server.zig");
    _ = @import("log.zig");
    _ = @import("random_bytes.zig");
    _ = @import("rate_limit.zig");
    _ = @import("router.zig");
}
