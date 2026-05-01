// Single compilation root for all Zig native algorithms.
// export fn declarations in each imported module are always emitted
// regardless of whether they are called from Zig code.
comptime {
    _ = @import("palette_extractor.zig");
    _ = @import("image_blur.zig");
}
