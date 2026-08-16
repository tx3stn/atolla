// Single compilation root for all Zig native algorithms.
// export fn declarations in each imported module are always emitted
// regardless of whether they are called from Zig code.
const std = @import("std");

// Panics still trap — release_safe bounds and overflow checks are the point — but
// without a backtrace. Rendering one calls _dyld_get_image_header_containing_address,
// which macOS exports and the iOS SDK does not, breaking the device link.
pub const panic = std.debug.simple_panic;

comptime {
    _ = @import("palette_extractor.zig");
    _ = @import("image_blur.zig");
    _ = @import("waveform_generator.zig");
    _ = @import("scrobble_tracker.zig");
}
