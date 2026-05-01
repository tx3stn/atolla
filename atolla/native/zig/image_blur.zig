// Image blur via area-average downsample + single bilinear upsample.
// No heap allocation: the intermediate stage uses a fixed-size stack buffer
// (64×64×4 = 16 KB). The area-average pass is a box filter that prevents
// aliasing when the source is much larger than the output; the bilinear step
// then smoothly stretches it to the requested output size.
// Input/output: row-major RGBA bytes (4 bytes per pixel).

const MID_W: u32 = 64;
const MID_H: u32 = 64;

fn bilinearSample(pixels: []const u8, w: u32, h: u32, fx: f32, fy: f32) [4]u8 {
    const cx = @min(@as(f32, @floatFromInt(w - 1)), @max(0.0, fx));
    const cy = @min(@as(f32, @floatFromInt(h - 1)), @max(0.0, fy));
    // cx and cy are clamped to ≥ 0 above; for non-negative floats
    // @intFromFloat truncation equals floor, with no libm dependency.
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

// Area-average downsample: each output pixel averages the corresponding
// rectangular region of the source. No allocation — dst must be pre-allocated.
fn areaDownsample(
    src: []const u8,
    src_w: u32,
    src_h: u32,
    dst: []u8,
    dst_w: u32,
    dst_h: u32,
) void {
    var dy: u32 = 0;
    while (dy < dst_h) : (dy += 1) {
        const ry0: u32 = @intFromFloat(@as(f32, @floatFromInt(dy)) * @as(f32, @floatFromInt(src_h)) / @as(f32, @floatFromInt(dst_h)));
        const ry1_raw: u32 = @intFromFloat(@as(f32, @floatFromInt(dy + 1)) * @as(f32, @floatFromInt(src_h)) / @as(f32, @floatFromInt(dst_h)));
        const ry1: u32 = @min(src_h, @max(ry0 + 1, ry1_raw));

        var dx: u32 = 0;
        while (dx < dst_w) : (dx += 1) {
            const rx0: u32 = @intFromFloat(@as(f32, @floatFromInt(dx)) * @as(f32, @floatFromInt(src_w)) / @as(f32, @floatFromInt(dst_w)));
            const rx1_raw: u32 = @intFromFloat(@as(f32, @floatFromInt(dx + 1)) * @as(f32, @floatFromInt(src_w)) / @as(f32, @floatFromInt(dst_w)));
            const rx1: u32 = @min(src_w, @max(rx0 + 1, rx1_raw));

            var sum: [4]u64 = .{ 0, 0, 0, 0 };
            var count: u64 = 0;
            var sy = ry0;
            while (sy < ry1) : (sy += 1) {
                var sx = rx0;
                while (sx < rx1) : (sx += 1) {
                    const pidx = (@as(usize, sy) * @as(usize, src_w) + @as(usize, sx)) * 4;
                    for (0..4) |c| sum[c] += src[pidx + c];
                    count += 1;
                }
            }
            const denom = @max(1, count);
            const oidx = (@as(usize, dy) * @as(usize, dst_w) + @as(usize, dx)) * 4;
            for (0..4) |c| dst[oidx + c] = @intCast(sum[c] / denom);
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

    const in_size: usize = @as(usize, width_in) * @as(usize, height_in) * 4;
    const out_size: usize = @as(usize, width_out) * @as(usize, height_out) * 4;

    // Step 1: area-average downsample to 64×64 on the stack (16 KB).
    // Box-filter prevents aliasing when the source is much larger than the output.
    const mid_w = @min(MID_W, width_out);
    const mid_h = @min(MID_H, height_out);
    var mid_buf: [MID_H * MID_W * 4]u8 = undefined;
    areaDownsample(pixels_in[0..in_size], width_in, height_in, &mid_buf, mid_w, mid_h);

    // Step 2: bilinear upsample 64×64 → output (caller-provided buffer).
    const mid_size: usize = @as(usize, mid_w) * @as(usize, mid_h) * 4;
    bilinearResize(mid_buf[0..mid_size], mid_w, mid_h, pixels_out[0..out_size], width_out, height_out);
}
