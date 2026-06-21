// waveform path builder. accepts a raw per-column RMS amplitude array (from the platform
// audio decoders) and emits the closed waveform outline as a flat stream of cubic Bézier
// control points. smoothing and normalisation happen here so the math lives in one place; the
// platforms replay the control points into their native vector path API
// (android.graphics.Path / UIBezierPath) and fill it, which anti-aliases for free and encodes
// the PNG.

const std = @import("std");

extern fn malloc(size: usize) ?*anyopaque;
extern fn free(ptr: ?*anyopaque) void;

// 5-point centred moving average to reduce spikiness; aesthetics over accuracy
fn smoothAmplitudes(amps: [*]f32, width: u32) void {
    if (width < 3) return;
    const tmp_ptr = malloc(@as(usize, width) * @sizeOf(f32)) orelse return;
    defer free(tmp_ptr);
    const tmp: [*]f32 = @ptrCast(@alignCast(tmp_ptr));
    @memcpy(tmp[0..width], amps[0..width]);
    for (0..width) |i| {
        const lo: usize = if (i > 2) i - 2 else 0;
        const hi: usize = if (i + 2 < width) i + 2 else width - 1;
        var s: f32 = 0.0;
        var n: u32 = 0;
        for (lo..hi + 1) |j| {
            s += tmp[j];
            n += 1;
        }
        amps[i] = s / @as(f32, @floatFromInt(n));
    }
}

// normalise amplitudes linearly so the loudest column reaches full height. silent audio
// becomes a flat mid-height line so the bar is always visible
fn normalizeAmplitudes(amps: [*]f32, width: u32) void {
    var max: f32 = 0.0;
    for (0..width) |i| if (amps[i] > max) {
        max = amps[i];
    };
    if (max < 1e-6) {
        for (0..width) |i| amps[i] = 0.5;
        return;
    }
    for (0..width) |i| amps[i] = amps[i] / max;
}

fn xAt(i: u32, n: u32, width: f32) f32 {
    if (n <= 1) return 0.0;
    return @as(f32, @floatFromInt(i)) * (width - 1.0) / @as(f32, @floatFromInt(n - 1));
}

fn yTopAt(amps: [*]const f32, i: u32, cy: f32) f32 {
    return cy - amps[i] * cy;
}

fn yBotAt(amps: [*]const f32, i: u32, cy: f32) f32 {
    return cy + amps[i] * cy;
}

fn appendSegment(out: [*]f32, idx: *usize, cp1x: f32, cp1y: f32, cp2x: f32, cp2y: f32, ex: f32, ey: f32) void {
    out[idx.*] = cp1x;
    out[idx.* + 1] = cp1y;
    out[idx.* + 2] = cp2x;
    out[idx.* + 3] = cp2y;
    out[idx.* + 4] = ex;
    out[idx.* + 5] = ey;
    idx.* += 6;
}

// builds the closed waveform outline from `num_amps` raw per-column RMS amps. smooths +
// normalises internally, then writes a flat float stream to out_pts:
//   [0..1]                       start point (moveTo target)
//   then (2 * num_amps - 1) cubic segments, 6 floats each:
//                                cp1x, cp1y, cp2x, cp2y, endx, endy
// segment order: top edge left→right, the straight right cap (a degenerate cubic with both
// control points on the endpoints, so it renders as a line), then the bottom edge right→left.
// the caller issues moveTo(start), one cubicTo per segment, then closePath(), where the close
// draws the straight left cap. out_count receives the number of floats written:
// 2 + (2 * num_amps - 1) * 6. returns false on invalid input (num_amps < 2) or if out_capacity
// is too small
export fn atolla_waveform_build_path(
    amps: [*]const f32,
    num_amps: u32,
    width: f32,
    height: f32,
    out_pts: [*]f32,
    out_capacity: u32,
    out_count: *u32,
) bool {
    out_count.* = 0;
    if (num_amps < 2) return false;
    const n = num_amps;

    const num_segments: u32 = 2 * n - 1;
    const required: u32 = 2 + num_segments * 6;
    if (out_capacity < required) return false;

    // Mutable copy so we can smooth/normalise the caller's const input.
    const work_ptr = malloc(@as(usize, n) * @sizeOf(f32)) orelse return false;
    defer free(work_ptr);
    const a: [*]f32 = @ptrCast(@alignCast(work_ptr));
    @memcpy(a[0..n], amps[0..n]);

    smoothAmplitudes(a, n);
    normalizeAmplitudes(a, n);

    const cy: f32 = height / 2.0;
    var idx: usize = 0;

    // start point: top of the first column
    out_pts[0] = xAt(0, n, width);
    out_pts[1] = yTopAt(a, 0, cy);
    idx = 2;

    // top edge, left → right. Catmull-Rom → cubic Bézier:
    //   cp1 = p1 + (p2 - p0) / 6,  cp2 = p2 - (p3 - p1) / 6
    var i: u32 = 0;
    while (i < n - 1) : (i += 1) {
        const p0i: u32 = if (i > 0) i - 1 else 0;
        const p3i: u32 = if (i + 2 < n) i + 2 else n - 1;
        const cp1x = xAt(i, n, width) + (xAt(i + 1, n, width) - xAt(p0i, n, width)) / 6.0;
        const cp1y = yTopAt(a, i, cy) + (yTopAt(a, i + 1, cy) - yTopAt(a, p0i, cy)) / 6.0;
        const cp2x = xAt(i + 1, n, width) - (xAt(p3i, n, width) - xAt(i, n, width)) / 6.0;
        const cp2y = yTopAt(a, i + 1, cy) - (yTopAt(a, p3i, cy) - yTopAt(a, i, cy)) / 6.0;
        appendSegment(out_pts, &idx, cp1x, cp1y, cp2x, cp2y, xAt(i + 1, n, width), yTopAt(a, i + 1, cy));
    }

    // right cap: straight line top → bottom of the last column, as a degenerate cubic
    const xr = xAt(n - 1, n, width);
    appendSegment(out_pts, &idx, xr, yTopAt(a, n - 1, cy), xr, yBotAt(a, n - 1, cy), xr, yBotAt(a, n - 1, cy));

    // bottom edge, right → left
    var j: i64 = @as(i64, n) - 2;
    while (j >= 0) : (j -= 1) {
        const k: u32 = @intCast(j);
        const p0i: u32 = if (k + 2 < n) k + 2 else n - 1;
        const p3i: u32 = if (k > 0) k - 1 else 0;
        const cp1x = xAt(k + 1, n, width) + (xAt(k, n, width) - xAt(p0i, n, width)) / 6.0;
        const cp1y = yBotAt(a, k + 1, cy) + (yBotAt(a, k, cy) - yBotAt(a, p0i, cy)) / 6.0;
        const cp2x = xAt(k, n, width) - (xAt(p3i, n, width) - xAt(k + 1, n, width)) / 6.0;
        const cp2y = yBotAt(a, k, cy) - (yBotAt(a, p3i, cy) - yBotAt(a, k + 1, cy)) / 6.0;
        appendSegment(out_pts, &idx, cp1x, cp1y, cp2x, cp2y, xAt(k, n, width), yBotAt(a, k, cy));
    }

    out_count.* = @intCast(idx);
    return true;
}

test "normalizeAmplitudes: all-zero input becomes 0.5" {
    var amps = [_]f32{ 0.0, 0.0, 0.0 };
    normalizeAmplitudes(amps[0..].ptr, 3);
    for (amps) |a| try std.testing.expectApproxEqAbs(@as(f32, 0.5), a, 1e-6);
}

test "normalizeAmplitudes: max element becomes 1.0" {
    var amps = [_]f32{ 0.2, 0.8, 0.5 };
    normalizeAmplitudes(amps[0..].ptr, 3);
    try std.testing.expectApproxEqAbs(@as(f32, 1.0), amps[1], 1e-6);
    try std.testing.expectApproxEqAbs(@as(f32, 0.25), amps[0], 1e-5);
}

test "smoothAmplitudes: width < 3 leaves values unchanged" {
    var amps = [_]f32{ 1.0, 2.0 };
    const before = amps;
    smoothAmplitudes(amps[0..].ptr, 2);
    try std.testing.expectEqual(before[0], amps[0]);
    try std.testing.expectEqual(before[1], amps[1]);
}

test "atolla_waveform_build_path: writes expected float count" {
    var amps = [_]f32{ 0.2, 0.8, 0.5, 0.6 };
    const n: u32 = 4;
    var out: [256]f32 = undefined;
    var count: u32 = 0;
    const ok = atolla_waveform_build_path(amps[0..].ptr, n, 100.0, 20.0, out[0..].ptr, out.len, &count);
    try std.testing.expect(ok);
    try std.testing.expectEqual(@as(u32, 2 + (2 * n - 1) * 6), count);
}

test "atolla_waveform_build_path: rejects too-small capacity" {
    var amps = [_]f32{ 0.2, 0.8, 0.5, 0.6 };
    var out: [8]f32 = undefined;
    var count: u32 = 0;
    const ok = atolla_waveform_build_path(amps[0..].ptr, 4, 100.0, 20.0, out[0..].ptr, out.len, &count);
    try std.testing.expect(!ok);
    try std.testing.expectEqual(@as(u32, 0), count);
}

test "atolla_waveform_build_path: rejects fewer than two amplitudes" {
    var amps = [_]f32{0.5};
    var out: [256]f32 = undefined;
    var count: u32 = 0;
    const ok = atolla_waveform_build_path(amps[0..].ptr, 1, 100.0, 20.0, out[0..].ptr, out.len, &count);
    try std.testing.expect(!ok);
}

test "atolla_waveform_build_path: constant signal fills full height" {
    // A constant non-silent signal normalises to 1.0 everywhere, so the top edge
    // sits at y=0 (start point) and the bottom edge at y=height.
    var amps = [_]f32{ 0.3, 0.3, 0.3, 0.3 };
    var out: [256]f32 = undefined;
    var count: u32 = 0;
    const ok = atolla_waveform_build_path(amps[0..].ptr, 4, 100.0, 20.0, out[0..].ptr, out.len, &count);
    try std.testing.expect(ok);
    // Start point = (xAt(0) = 0, yTop(0) = cy - 1.0 * cy = 0).
    try std.testing.expectApproxEqAbs(@as(f32, 0.0), out[0], 1e-5);
    try std.testing.expectApproxEqAbs(@as(f32, 0.0), out[1], 1e-5);
}
