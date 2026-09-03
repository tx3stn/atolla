// Single compilation root for the daemon's Zig code.
const std = @import("std");

comptime {
    _ = @import("random_bytes.zig");
    _ = @import("rate_limit.zig");
}
