// Image blur using multi-scale pyramid algorithm:
//   1. Iterative bilinear halvings from source down to ~8px (many passes
//      approximate a Gaussian and avoid the linear ramps of a single large
//      downsample step).
//   2. Two-step bilinear upsample: 8px → 48px → output (the intermediate
//      step smooths the bilinear gradients before the final stretch).
// Input/output: row-major RGBA bytes (4 bytes per pixel).

extern fn malloc(size: usize) ?*anyopaque;
extern fn free(ptr: ?*anyopaque) void;

fn bilinearSample(pixels: []const u8, w: u32, h: u32, fx: f32, fy: f32) [4]u8 {
    const cx = @min(@as(f32, @floatFromInt(w - 1)), @max(0.0, fx));
    const cy = @min(@as(f32, @floatFromInt(h - 1)), @max(0.0, fy));
    const x0: u32 = @intFromFloat(cx);
    const y0: u32 = @intFromFloat(cy);
    const x1 = @min(x0 + 1, w - 1);
    const y1 = @min(y0 + 1, h - 1);
    const sx = cx - @as(f32, @floatFromInt(x0));
    const sy = cy - @as(f32, @floatFromInt(y0));

    const p00: usize = (@as(usize, y0) * @as(usize, w) + @as(usize, x0)) * 4;
    const p10: usize = (@as(usize, y0) * @as(usize, w) + @as(usize, x1)) * 4;
    const p01: usize = (@as(usize, y1) * @as(usize, w) + @as(usize, x0)) * 4;
    const p11: usize = (@as(usize, y1) * @as(usize, w) + @as(usize, x1)) * 4;

    var out: [4]u8 = undefined;
    for (0..4) |c| {
        const v00: f32 = @floatFromInt(pixels[p00 + c]);
        const v10: f32 = @floatFromInt(pixels[p10 + c]);
        const v01: f32 = @floatFromInt(pixels[p01 + c]);
        const v11: f32 = @floatFromInt(pixels[p11 + c]);
        const v = v00 * (1.0 - sx) * (1.0 - sy) +
            v10 * sx * (1.0 - sy) +
            v01 * (1.0 - sx) * sy +
            v11 * sx * sy;
        out[c] = @intFromFloat(@min(255.0, @max(0.0, v + 0.5)));
    }
    return out;
}

fn bilinearResize(
    src: []const u8,
    src_w: u32,
    src_h: u32,
    dst: []u8,
    dst_w: u32,
    dst_h: u32,
) void {
    const scale_x: f32 = @as(f32, @floatFromInt(src_w)) / @as(f32, @floatFromInt(dst_w));
    const scale_y: f32 = @as(f32, @floatFromInt(src_h)) / @as(f32, @floatFromInt(dst_h));
    var y: u32 = 0;
    while (y < dst_h) : (y += 1) {
        var x: u32 = 0;
        while (x < dst_w) : (x += 1) {
            const fx = (@as(f32, @floatFromInt(x)) + 0.5) * scale_x - 0.5;
            const fy = (@as(f32, @floatFromInt(y)) + 0.5) * scale_y - 0.5;
            const sample = bilinearSample(src, src_w, src_h, fx, fy);
            const idx = (@as(usize, y) * @as(usize, dst_w) + @as(usize, x)) * 4;
            dst[idx + 0] = sample[0];
            dst[idx + 1] = sample[1];
            dst[idx + 2] = sample[2];
            dst[idx + 3] = sample[3];
        }
    }
}

export fn atolla_blur_pixels(
    pixels_in: [*]const u8,
    width_in: u32,
    height_in: u32,
    pixels_out: [*]u8,
    width_out: u32,
    height_out: u32,
) void {
    if (width_in == 0 or height_in == 0 or width_out == 0 or height_out == 0) return;

    const out_size: usize = @as(usize, width_out) * @as(usize, height_out) * 4;

    // Allocate two ping-pong buffers for the halving passes.
    // buf[0] holds even-numbered halvings (max = src/2 × src/2).
    // buf[1] holds odd-numbered halvings  (max = src/4 × src/4).
    const hw: u32 = @max(8, width_in / 2);
    const hh: u32 = @max(8, height_in / 2);
    const buf0_size: usize = @as(usize, hw) * @as(usize, hh) * 4;
    const buf0_raw = malloc(buf0_size) orelse return;
    defer free(buf0_raw);
    const buf0: [*]u8 = @ptrCast(buf0_raw);

    const qw: u32 = @max(8, hw / 2);
    const qh: u32 = @max(8, hh / 2);
    const buf1_size: usize = @as(usize, qw) * @as(usize, qh) * 4;
    const buf1_raw = malloc(buf1_size) orelse return;
    defer free(buf1_raw);
    const buf1: [*]u8 = @ptrCast(buf1_raw);

    const ping_pong: [2][*]u8 = .{ buf0, buf1 };

    // Phase 1: iteratively halve with bilinear filtering until ≤ 8px.
    // First step always reads from the caller-supplied pixels_in.
    var cur_w: u32 = width_in;
    var cur_h: u32 = height_in;
    var cur_src: [*]const u8 = pixels_in;
    var dst_idx: usize = 0;

    while (cur_w > 8 and cur_h > 8) {
        const next_w: u32 = @max(8, cur_w / 2);
        const next_h: u32 = @max(8, cur_h / 2);
        const src_size: usize = @as(usize, cur_w) * @as(usize, cur_h) * 4;
        const next_size: usize = @as(usize, next_w) * @as(usize, next_h) * 4;
        bilinearResize(cur_src[0..src_size], cur_w, cur_h, ping_pong[dst_idx][0..next_size], next_w, next_h);
        cur_src = ping_pong[dst_idx];
        cur_w = next_w;
        cur_h = next_h;
        dst_idx ^= 1;
    }

    // Phase 2: two-step bilinear upsample — 8px → 48px → output.
    // The intermediate at 48px smooths the bilinear gradients before the
    // final stretch, matching Android's createScaledBitmap two-step approach.
    const mid_size: usize = 48 * 48 * 4;
    var mid_48: [48 * 48 * 4]u8 = undefined;
    bilinearResize(cur_src[0 .. @as(usize, cur_w) * @as(usize, cur_h) * 4], cur_w, cur_h, mid_48[0..mid_size], 48, 48);
    bilinearResize(mid_48[0..mid_size], 48, 48, pixels_out[0..out_size], width_out, height_out);
}

test "bilinearSample: exact pixel corners return exact values" {
    const std = @import("std");
    // 2x2 RGBA: red, green, blue, yellow
    const pixels: [16]u8 = .{
        255, 0,   0,   255,
        0,   255, 0,   255,
        0,   0,   255, 255,
        255, 255, 0,   255,
    };
    const p00 = bilinearSample(pixels[0..], 2, 2, 0.0, 0.0);
    try std.testing.expectEqual(@as(u8, 255), p00[0]);
    try std.testing.expectEqual(@as(u8, 0), p00[1]);

    const p10 = bilinearSample(pixels[0..], 2, 2, 1.0, 0.0);
    try std.testing.expectEqual(@as(u8, 0), p10[0]);
    try std.testing.expectEqual(@as(u8, 255), p10[1]);
}

test "bilinearSample: midpoint between white and black blends to ~128" {
    const std = @import("std");
    const pixels: [16]u8 = .{
        255, 255, 255, 255,
        0,   0,   0,   255,
        255, 255, 255, 255,
        0,   0,   0,   255,
    };
    const mid = bilinearSample(pixels[0..], 2, 2, 0.5, 0.0);
    try std.testing.expectApproxEqAbs(@as(f32, 128.0), @as(f32, @floatFromInt(mid[0])), 1.0);
}

test "bilinearResize: 1x1 to 1x1 is identity" {
    const std = @import("std");
    const src: [4]u8 = .{ 100, 150, 200, 255 };
    var dst: [4]u8 = undefined;
    bilinearResize(src[0..], 1, 1, dst[0..], 1, 1);
    try std.testing.expectEqual(src[0], dst[0]);
    try std.testing.expectEqual(src[1], dst[1]);
    try std.testing.expectEqual(src[2], dst[2]);
    try std.testing.expectEqual(src[3], dst[3]);
}

test "bilinearResize: uniform color is preserved on downscale" {
    const std = @import("std");
    var src: [4 * 4 * 4]u8 = undefined;
    for (0..16) |i| {
        src[i * 4 + 0] = 255;
        src[i * 4 + 1] = 0;
        src[i * 4 + 2] = 0;
        src[i * 4 + 3] = 255;
    }
    var dst: [2 * 2 * 4]u8 = undefined;
    bilinearResize(src[0..], 4, 4, dst[0..], 2, 2);
    for (0..4) |i| {
        try std.testing.expectEqual(@as(u8, 255), dst[i * 4 + 0]);
        try std.testing.expectEqual(@as(u8, 0), dst[i * 4 + 1]);
    }
}

test "atolla_blur_pixels: zero dimensions is a no-op" {
    const std = @import("std");
    var out: [4]u8 = .{ 42, 42, 42, 42 };
    const src: [4]u8 = .{ 255, 0, 0, 255 };
    atolla_blur_pixels(&src, 0, 0, &out, 1, 1);
    try std.testing.expectEqual(@as(u8, 42), out[0]);
}

test "atolla_blur_pixels: uniform color survives blur" {
    const std = @import("std");
    var src: [16 * 16 * 4]u8 = undefined;
    for (0..16 * 16) |i| {
        src[i * 4 + 0] = 200;
        src[i * 4 + 1] = 100;
        src[i * 4 + 2] = 50;
        src[i * 4 + 3] = 255;
    }
    var out: [4 * 4 * 4]u8 = undefined;
    atolla_blur_pixels(&src, 16, 16, &out, 4, 4);
    for (0..16) |i| {
        try std.testing.expectApproxEqAbs(@as(f32, 200.0), @as(f32, @floatFromInt(out[i * 4 + 0])), 2.0);
        try std.testing.expectApproxEqAbs(@as(f32, 100.0), @as(f32, @floatFromInt(out[i * 4 + 1])), 2.0);
    }
}
