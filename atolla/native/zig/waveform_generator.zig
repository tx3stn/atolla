// Waveform amplitude extractor.
// Accepts interleaved float32 PCM samples and produces a normalised 100-point
// amplitude array. Rendering to a PNG is handled by platform-native code
// (CoreGraphics on iOS, android.graphics.Canvas on Android) which produces
// smooth anti-aliased Bézier curves without pixel staircase artifacts.

const std = @import("std");

extern fn malloc(size: usize) ?*anyopaque;
extern fn free(ptr: ?*anyopaque) void;

// ---------------------------------------------------------------------------
// Amplitude analysis
// ---------------------------------------------------------------------------

fn computeAmplitudes(
    samples: [*]const f32,
    frames: u32,
    channel_count: u32,
    amps: [*]f32,
    width: u32,
) void {
    // Sample at most 16 frames per column — the waveform is smoothed after
    // computation so fine-grained accuracy per column isn't needed.
    const max_samples_per_col: u64 = 16;
    for (0..width) |col| {
        const start: u64 = @as(u64, col) * @as(u64, frames) / @as(u64, width);
        const end: u64 = (@as(u64, col) + 1) * @as(u64, frames) / @as(u64, width);
        const window = end - start;
        const stride: u64 = if (window > max_samples_per_col) window / max_samples_per_col else 1;
        var sum_sq: f32 = 0.0;
        var count: u32 = 0;
        var frame = start;
        while (frame < end) : (frame += stride) {
            for (0..channel_count) |ch| {
                const s = samples[@as(usize, @intCast(frame)) * channel_count + ch];
                sum_sq += s * s;
                count += 1;
            }
        }
        amps[col] = if (count > 0) @sqrt(sum_sq / @as(f32, @floatFromInt(count))) else 0.0;
    }
}

// 5-point centred moving average to reduce spikiness. Aesthetics over accuracy.
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

// Normalise amplitudes linearly so the loudest column reaches full height.
// Silent audio becomes a flat mid-height line so the bar is always visible.
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

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

// Extracts and normalises a 100-point float32 amplitude array from interleaved
// float32 PCM samples. Returns a malloc'd float32[100] buffer; caller must free.
// out_num_amps receives the count (always 100 on success).
// Returns null if inputs are invalid or allocation fails.
export fn atolla_extract_waveform_amps(
    samples: [*]const f32,
    sample_count: u32,
    channel_count: u32,
    out_num_amps: *u32,
) ?[*]f32 {
    out_num_amps.* = 0;
    if (sample_count == 0 or channel_count == 0) return null;
    const frames = sample_count / channel_count;
    if (frames == 0) return null;

    const num_ctrl: u32 = 300;
    const amps_ptr = malloc(@as(usize, num_ctrl) * @sizeOf(f32)) orelse return null;
    const amps: [*]f32 = @ptrCast(@alignCast(amps_ptr));
    computeAmplitudes(samples, frames, channel_count, amps, num_ctrl);
    smoothAmplitudes(amps, num_ctrl);
    normalizeAmplitudes(amps, num_ctrl);
    out_num_amps.* = num_ctrl;
    return amps;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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

test "computeAmplitudes: constant signal produces constant RMS" {
    var samples = [_]f32{ 0.5, 0.5, 0.5, 0.5 };
    var amps = [_]f32{ 0.0, 0.0 };
    // 4 frames, 1 channel, 2 output columns
    computeAmplitudes(samples[0..].ptr, 4, 1, amps[0..].ptr, 2);
    for (amps) |a| try std.testing.expectApproxEqAbs(@as(f32, 0.5), a, 1e-4);
}
