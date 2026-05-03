// Palette extraction algorithm.
// Strategy: 4-bit RGB quantisation (4096 bins, 64 KB on stack) → score each
// bin for primary colour (saturation/lightness weighted, neutral-penalised) →
// pick accent by hue distance + rarity → derive surface/text colours from HSL.

const std = @import("std");

pub const Palette = extern struct {
    primary: [8]u8,
    accent: [8]u8,
    surface: [8]u8,
    on_surface: [8]u8,
    muted_on_surface: [8]u8,
};

// 4 bits per channel → 16 levels → 4096 bins, 64 KB on stack.
const SHIFT = 4;
const LEVELS: usize = 1 << SHIFT; // 16
const MAX_BINS: usize = LEVELS * LEVELS * LEVELS; // 4096

const Bin = struct {
    count: u32,
    sum_r: u32,
    sum_g: u32,
    sum_b: u32,
};

const Hsl = struct { h: f64, s: f64, l: f64 };
const Rgb = struct { r: u8, g: u8, b: u8 };

fn rgbToHsl(r: u8, g: u8, b: u8) Hsl {
    const rn: f64 = @as(f64, @floatFromInt(r)) / 255.0;
    const gn: f64 = @as(f64, @floatFromInt(g)) / 255.0;
    const bn: f64 = @as(f64, @floatFromInt(b)) / 255.0;
    const maxV = @max(rn, @max(gn, bn));
    const minV = @min(rn, @min(gn, bn));
    const l = (maxV + minV) / 2.0;
    const d = maxV - minV;
    if (d < 1e-9) return .{ .h = 0.0, .s = 0.0, .l = l };
    const s = if (l > 0.5) d / (2.0 - maxV - minV) else d / (maxV + minV);
    const h = blk: {
        const raw = if (maxV == rn)
            ((gn - bn) / d + (if (gn < bn) @as(f64, 6.0) else 0.0)) / 6.0
        else if (maxV == gn)
            ((bn - rn) / d + 2.0) / 6.0
        else
            ((rn - gn) / d + 4.0) / 6.0;
        break :blk raw * 360.0;
    };
    return .{ .h = h, .s = s, .l = l };
}

fn hue2rgb(p: f64, q: f64, t_in: f64) f64 {
    var t = t_in;
    if (t < 0.0) t += 1.0;
    if (t > 1.0) t -= 1.0;
    if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
    if (t < 0.5) return q;
    if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
    return p;
}

fn hslToRgb(h: f64, s: f64, l: f64) Rgb {
    if (s < 1e-9) {
        const v: u8 = @intFromFloat(@min(255.0, @max(0.0, l * 255.0)));
        return .{ .r = v, .g = v, .b = v };
    }
    const hk = h / 360.0;
    const q = if (l < 0.5) l * (1.0 + s) else l + s - l * s;
    const p = 2.0 * l - q;
    return .{
        .r = @intFromFloat(@min(255.0, @max(0.0, hue2rgb(p, q, hk + 1.0 / 3.0) * 255.0))),
        .g = @intFromFloat(@min(255.0, @max(0.0, hue2rgb(p, q, hk) * 255.0))),
        .b = @intFromFloat(@min(255.0, @max(0.0, hue2rgb(p, q, hk - 1.0 / 3.0) * 255.0))),
    };
}

fn clamp(v: f64, lo: f64, hi: f64) f64 {
    return @max(lo, @min(hi, v));
}

fn normalizedHueDistance(a: f64, b: f64) f64 {
    const delta = @abs(a - b);
    return @min(delta, 360.0 - delta) / 180.0;
}

const HEX = "0123456789abcdef";

fn writeHex(out: *[8]u8, r: u8, g: u8, b: u8) void {
    out[0] = '#';
    out[1] = HEX[r >> 4];
    out[2] = HEX[r & 0xf];
    out[3] = HEX[g >> 4];
    out[4] = HEX[g & 0xf];
    out[5] = HEX[b >> 4];
    out[6] = HEX[b & 0xf];
    out[7] = 0;
}

fn hexNibble(c: u8) u8 {
    return switch (c) {
        '0'...'9' => c - '0',
        'a'...'f' => c - 'a' + 10,
        'A'...'F' => c - 'A' + 10,
        else => 0,
    };
}

fn parseHex(hex: [8]u8) Rgb {
    return .{
        .r = (hexNibble(hex[1]) << 4) | hexNibble(hex[2]),
        .g = (hexNibble(hex[3]) << 4) | hexNibble(hex[4]),
        .b = (hexNibble(hex[5]) << 4) | hexNibble(hex[6]),
    };
}

fn rgbLightness(r: u8, g: u8, b: u8) f64 {
    const rn: f64 = @as(f64, @floatFromInt(r)) / 255.0;
    const gn: f64 = @as(f64, @floatFromInt(g)) / 255.0;
    const bn: f64 = @as(f64, @floatFromInt(b)) / 255.0;
    return (@max(rn, @max(gn, bn)) + @min(rn, @min(gn, bn))) / 2.0;
}

fn enhancePrimary(r: u8, g: u8, b: u8) Rgb {
    const hsl = rgbToHsl(r, g, b);
    if (hsl.s < 0.08) return .{ .r = r, .g = g, .b = b };
    return hslToRgb(hsl.h, clamp(@max(hsl.s, 0.28) * 1.05, 0.0, 0.92), clamp(hsl.l, 0.2, 0.78));
}

fn enhanceAccent(r: u8, g: u8, b: u8) Rgb {
    const hsl = rgbToHsl(r, g, b);
    return hslToRgb(hsl.h, clamp(@max(hsl.s, 0.34) * 1.08, 0.0, 0.95), clamp(hsl.l, 0.24, 0.74));
}

fn mutedVariant(hex: [8]u8) Rgb {
    const rgb = parseHex(hex);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    return hslToRgb(hsl.h, @max(0.22, hsl.s * 0.6), @max(0.08, hsl.l * 0.8));
}

fn legibleText(surface: Rgb) Rgb {
    const hsl = rgbToHsl(surface.r, surface.g, surface.b);
    if (hsl.l < 0.5) {
        return hslToRgb(hsl.h, @min(hsl.s * 1.5, 0.35), @min(0.88, hsl.l + 0.65));
    } else {
        return hslToRgb(hsl.h, @min(hsl.s * 0.8, 0.45), @max(0.12, hsl.l - 0.6));
    }
}

fn mixChannel(t: u8, s: u8) u8 {
    const diff: f64 = @as(f64, @floatFromInt(s)) - @as(f64, @floatFromInt(t));
    const blend: i32 = @intFromFloat(diff * 0.22);
    const result: i32 = @as(i32, t) + blend;
    return @intCast(@max(0, @min(255, result)));
}

fn mutedText(text: Rgb, surface: Rgb) Rgb {
    return .{
        .r = mixChannel(text.r, surface.r),
        .g = mixChannel(text.g, surface.g),
        .b = mixChannel(text.b, surface.b),
    };
}

fn writeDefaults(out: *Palette) void {
    writeHex(&out.primary, 0xd8, 0xde, 0xe9);
    writeHex(&out.accent, 0x3b, 0x82, 0xf6);
    writeHex(&out.surface, 0x1e, 0x20, 0x30);
    writeHex(&out.on_surface, 0xd8, 0xde, 0xe9);
    writeHex(&out.muted_on_surface, 0xb8, 0xbf, 0xd0);
}

export fn atolla_extract_palette(
    pixels: [*]const u8,
    width: u32,
    height: u32,
    out: *Palette,
) bool {
    if (width == 0 or height == 0) {
        writeDefaults(out);
        return false;
    }

    var bins: [MAX_BINS]Bin = std.mem.zeroes([MAX_BINS]Bin);

    const step = @max(1, @max(width, height) / 64);
    var y: u32 = 0;
    while (y < height) : (y += step) {
        var x: u32 = 0;
        while (x < width) : (x += step) {
            const i = (y * width + x) * 4;
            const r = pixels[i + 0];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            // alpha channel ignored
            const key: usize = (@as(usize, r >> SHIFT) << (SHIFT * 2)) |
                (@as(usize, g >> SHIFT) << SHIFT) |
                @as(usize, b >> SHIFT);
            bins[key].count +|= 1;
            bins[key].sum_r +|= r;
            bins[key].sum_g +|= g;
            bins[key].sum_b +|= b;
        }
    }

    // Select primary: highest score = count × satWeight × litWeight × neutralPenalty
    var primaryHex: [8]u8 = undefined;
    var bestPrimaryScore: f64 = -std.math.inf(f64);
    var hasPrimary = false;

    for (bins) |bin| {
        if (bin.count == 0) continue;
        const r: u8 = @intCast(bin.sum_r / bin.count);
        const g: u8 = @intCast(bin.sum_g / bin.count);
        const b: u8 = @intCast(bin.sum_b / bin.count);
        const hsl = rgbToHsl(r, g, b);
        if (hsl.l <= 0.15) continue;
        const satWeight = 0.45 + hsl.s * 1.15;
        const litWeight = clamp(1.0 - @abs(hsl.l - 0.55) * 1.7, 0.35, 1.0);
        const neutralPenalty: f64 = if (hsl.s < 0.12) 0.55 else 1.0;
        const score = @as(f64, @floatFromInt(bin.count)) * satWeight * litWeight * neutralPenalty;
        if (score > bestPrimaryScore) {
            bestPrimaryScore = score;
            const enhanced = enhancePrimary(r, g, b);
            writeHex(&primaryHex, enhanced.r, enhanced.g, enhanced.b);
            hasPrimary = true;
        }
    }

    if (!hasPrimary) {
        var found = false;
        for (bins) |bin| {
            if (bin.count == 0) continue;
            const r: u8 = @intCast(bin.sum_r / bin.count);
            const g: u8 = @intCast(bin.sum_g / bin.count);
            const b: u8 = @intCast(bin.sum_b / bin.count);
            if (rgbLightness(r, g, b) > 0.15) {
                writeHex(&primaryHex, r, g, b);
                found = true;
                break;
            }
        }
        if (!found) writeHex(&primaryHex, 0xd8, 0xde, 0xe9);
    }

    // Select accent: hue distance > 0.12, saturation > 0.2, population share 1–35%
    var totalPop: u64 = 0;
    for (bins) |bin| totalPop +|= bin.count;

    var accentHex: [8]u8 = primaryHex;
    const primaryRgb = parseHex(primaryHex);
    const primaryHsl = rgbToHsl(primaryRgb.r, primaryRgb.g, primaryRgb.b);
    var bestAccentScore: f64 = -std.math.inf(f64);

    if (totalPop > 0) {
        for (bins) |bin| {
            if (bin.count == 0) continue;
            const r: u8 = @intCast(bin.sum_r / bin.count);
            const g: u8 = @intCast(bin.sum_g / bin.count);
            const b: u8 = @intCast(bin.sum_b / bin.count);
            const hsl = rgbToHsl(r, g, b);
            if (hsl.l <= 0.15 or hsl.l >= 0.88) continue;
            if (hsl.s < 0.2) continue;
            const share = @as(f64, @floatFromInt(bin.count)) / @as(f64, @floatFromInt(totalPop));
            if (share < 0.01 or share > 0.35) continue;
            const hueDist = normalizedHueDistance(primaryHsl.h, hsl.h);
            if (hueDist < 0.12) continue;
            const litDist = @abs(hsl.l - primaryHsl.l);
            const rarityWeight = clamp(1.0 - @abs(share - 0.12) / 0.12, 0.0, 1.0);
            const score = (hueDist * 1.4 + litDist * 0.35) * (0.35 + hsl.s) * (0.2 + rarityWeight);
            if (score > bestAccentScore) {
                bestAccentScore = score;
                const enhanced = enhanceAccent(r, g, b);
                writeHex(&accentHex, enhanced.r, enhanced.g, enhanced.b);
            }
        }
    }

    const surfaceRgb = mutedVariant(primaryHex);
    const onSurfaceRgb = legibleText(surfaceRgb);
    const mutedOnSurfaceRgb = mutedText(onSurfaceRgb, surfaceRgb);

    out.primary = primaryHex;
    out.accent = accentHex;
    writeHex(&out.surface, surfaceRgb.r, surfaceRgb.g, surfaceRgb.b);
    writeHex(&out.on_surface, onSurfaceRgb.r, onSurfaceRgb.g, onSurfaceRgb.b);
    writeHex(&out.muted_on_surface, mutedOnSurfaceRgb.r, mutedOnSurfaceRgb.g, mutedOnSurfaceRgb.b);
    return true;
}

test "hexNibble: decimal digits and hex letters" {
    try std.testing.expectEqual(@as(u8, 0), hexNibble('0'));
    try std.testing.expectEqual(@as(u8, 9), hexNibble('9'));
    try std.testing.expectEqual(@as(u8, 10), hexNibble('a'));
    try std.testing.expectEqual(@as(u8, 15), hexNibble('f'));
    try std.testing.expectEqual(@as(u8, 10), hexNibble('A'));
    try std.testing.expectEqual(@as(u8, 15), hexNibble('F'));
}

test "writeHex and parseHex round-trip" {
    var hex: [8]u8 = undefined;
    writeHex(&hex, 0xde, 0xad, 0xbe);
    const rgb = parseHex(hex);
    try std.testing.expectEqual(@as(u8, 0xde), rgb.r);
    try std.testing.expectEqual(@as(u8, 0xad), rgb.g);
    try std.testing.expectEqual(@as(u8, 0xbe), rgb.b);
}

test "writeHex produces # prefix" {
    var hex: [8]u8 = undefined;
    writeHex(&hex, 0, 0, 0);
    try std.testing.expectEqual(@as(u8, '#'), hex[0]);
}

test "rgbToHsl: gray has zero saturation" {
    const hsl = rgbToHsl(128, 128, 128);
    try std.testing.expectApproxEqAbs(@as(f64, 0.0), hsl.s, 1e-6);
}

test "rgbToHsl: pure red is hue 0 full saturation mid lightness" {
    const hsl = rgbToHsl(255, 0, 0);
    try std.testing.expectApproxEqAbs(@as(f64, 0.0), hsl.h, 1e-3);
    try std.testing.expectApproxEqAbs(@as(f64, 1.0), hsl.s, 1e-3);
    try std.testing.expectApproxEqAbs(@as(f64, 0.5), hsl.l, 1e-3);
}

test "rgbToHsl: pure green is hue 120" {
    const hsl = rgbToHsl(0, 255, 0);
    try std.testing.expectApproxEqAbs(@as(f64, 120.0), hsl.h, 1e-3);
}

test "hslToRgb: zero saturation produces gray" {
    const rgb = hslToRgb(0.0, 0.0, 0.5);
    try std.testing.expectEqual(rgb.r, rgb.g);
    try std.testing.expectEqual(rgb.g, rgb.b);
}

test "rgbToHsl and hslToRgb round-trip within 2 units" {
    const r_in: u8 = 200;
    const g_in: u8 = 80;
    const b_in: u8 = 40;
    const hsl = rgbToHsl(r_in, g_in, b_in);
    const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
    const dr = @abs(@as(i16, r_in) - @as(i16, rgb.r));
    const dg = @abs(@as(i16, g_in) - @as(i16, rgb.g));
    const db = @abs(@as(i16, b_in) - @as(i16, rgb.b));
    try std.testing.expect(dr <= 2);
    try std.testing.expect(dg <= 2);
    try std.testing.expect(db <= 2);
}

test "normalizedHueDistance: same hue is zero" {
    try std.testing.expectApproxEqAbs(@as(f64, 0.0), normalizedHueDistance(120.0, 120.0), 1e-9);
}

test "normalizedHueDistance: opposite hues is 1" {
    try std.testing.expectApproxEqAbs(@as(f64, 1.0), normalizedHueDistance(0.0, 180.0), 1e-9);
}

test "normalizedHueDistance: wraparound is symmetric" {
    const d = normalizedHueDistance(10.0, 350.0);
    try std.testing.expectApproxEqAbs(@as(f64, 20.0 / 180.0), d, 1e-6);
    try std.testing.expectApproxEqAbs(d, normalizedHueDistance(350.0, 10.0), 1e-9);
}

test "rgbLightness: black is 0 and white is 1" {
    try std.testing.expectApproxEqAbs(@as(f64, 0.0), rgbLightness(0, 0, 0), 1e-9);
    try std.testing.expectApproxEqAbs(@as(f64, 1.0), rgbLightness(255, 255, 255), 1e-9);
}

test "atolla_extract_palette: zero dimensions writes defaults and returns false" {
    var palette: Palette = std.mem.zeroes(Palette);
    const dummy: [4]u8 = .{ 255, 0, 0, 255 };
    const ok = atolla_extract_palette(&dummy, 0, 0, &palette);
    try std.testing.expect(!ok);
    try std.testing.expectEqual(@as(u8, '#'), palette.primary[0]);
}

test "atolla_extract_palette: 1x1 red pixel returns true with valid hex strings" {
    const pixels: [4]u8 = .{ 255, 0, 0, 255 };
    var palette: Palette = std.mem.zeroes(Palette);
    const ok = atolla_extract_palette(&pixels, 1, 1, &palette);
    try std.testing.expect(ok);
    try std.testing.expectEqual(@as(u8, '#'), palette.primary[0]);
    try std.testing.expectEqual(@as(u8, '#'), palette.surface[0]);
    try std.testing.expectEqual(@as(u8, '#'), palette.on_surface[0]);
    try std.testing.expectEqual(@as(u8, '#'), palette.muted_on_surface[0]);
}

test "atolla_extract_palette: all-black image falls back to defaults" {
    const pixels: [4]u8 = .{ 0, 0, 0, 255 };
    var palette: Palette = std.mem.zeroes(Palette);
    _ = atolla_extract_palette(&pixels, 1, 1, &palette);
    // black is filtered by lightness <= 0.15, default primary #d8dee9 applies
    try std.testing.expectEqual(@as(u8, 'd'), palette.primary[1]);
    try std.testing.expectEqual(@as(u8, '8'), palette.primary[2]);
}
