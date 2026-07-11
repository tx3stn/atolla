// palette extraction algorithm.
// strategy: 4-bit RGB quantisation (4096 bins, 64 KB on stack); colours are scored and compared in
// perceptual OKLab/OKLCh. surface = the dominant (most-populous) colour; accent = the most chromatic
// colour distinct from the surface, falling back to the most-vibrant colour on single-hue covers;
// text colours are derived from the surface with a contrast floor. a near-white dominant that only
// narrowly out-populates a tied or larger chromatic hue family is swapped. the chromatic colour
// becomes the surface and the near-white becomes the accent.
//
// atolla_extract_palette accepts pre-decoded RGBA pixels (used by platform bridges).

const std = @import("std");

extern fn malloc(size: usize) ?*anyopaque;
extern fn free(ptr: ?*anyopaque) void;

pub const Palette = extern struct {
    accent: [8]u8,
    surface: [8]u8,
    on_surface: [8]u8,
    muted_on_surface: [8]u8,
};

// 4 bits per channel → 16 levels → 4096 bins, 64 KB on stack.
const SHIFT = 4;
const LEVELS: usize = 1 << SHIFT; // 16
const MAX_BINS: usize = LEVELS * LEVELS * LEVELS; // 4096

const DOMINANT_SHIFT = 5;
const DOMINANT_BITS = 8 - DOMINANT_SHIFT;
const DOMINANT_BINS: usize = 1 << (DOMINANT_BITS * 3); // 512

const TEXT_CONTRAST_FLOOR = 0.3;

// a flat near-white region (e.g. a bright element over a colour field) can narrowly
// out-populate a strong chromatic colour and steal the surface, reading washed-out.
// when the dominant is near-white and a chromatic hue family is tied-or-larger they
// swap. the chromatic colour becomes the surface, the near-white becomes the accent.
const NEAR_WHITE_L = 0.90;
const NEAR_WHITE_C = 0.03;
const SWAP_HUE_WINDOW = 40.0;
const SWAP_RATIO = 0.9;

// on near-monochrome covers the accent falls to the vibrant score, where a small
// pop of colour and near-neutral noise score within a hair of each other and flip
// between platform image decoders. among bins that tie the top score (within
// FALLBACK_TIE_FRACTION) lean to the most chromatic that clears FALLBACK_TIE_CHROMA_MIN,
// so a genuinely greyscale cover keeps its neutral accent.
const FALLBACK_TIE_FRACTION = 0.15;
const FALLBACK_TIE_CHROMA_MIN = 0.04;

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

// OKLCh is OKLab (Björn Ottosson's perceptually-uniform Lab colour space) in cylindrical form:
// l = lightness, c = chroma (how colourful; 0 = grey), h = hue angle in degrees. Palette colours
// are selected in this space because its chroma and lightness track human perception — unlike HSL,
// which over-rates pale colours and misjudges brightness.
const Oklch = struct { l: f64, c: f64, h: f64 };

// undo the sRGB gamma curve so the channel is linear light, which the OKLab matrices expect.
fn srgbToLinear(c: u8) f64 {
    const cn: f64 = @as(f64, @floatFromInt(c)) / 255.0;
    return if (cn <= 0.04045) cn / 12.92 else std.math.pow(f64, (cn + 0.055) / 1.055, 2.4);
}

fn rgbToOklch(r: u8, g: u8, b: u8) Oklch {
    // linear RGB → LMS: approximate the response of the eye's long/medium/short-wavelength cones.
    const lr = srgbToLinear(r);
    const lg = srgbToLinear(g);
    const lb = srgbToLinear(b);
    const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
    const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
    const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
    // cube root models the compressive nonlinearity of perceived brightness — the key to uniformity.
    const l_ = std.math.cbrt(l);
    const m_ = std.math.cbrt(m);
    const s_ = std.math.cbrt(s);
    // LMS' → OKLab: lab_l lightness (0 black … 1 white), lab_a green↔red, lab_b blue↔yellow.
    const lab_l = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
    const lab_a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
    const lab_b = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
    // rectangular (a, b) → polar: chroma is distance from the grey axis, hue is the angle in degrees.
    const chroma = @sqrt(lab_a * lab_a + lab_b * lab_b);
    var hue = std.math.atan2(lab_b, lab_a) * 180.0 / std.math.pi;
    if (hue < 0.0) hue += 360.0;
    return .{ .l = lab_l, .c = chroma, .h = hue };
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

// a very pale dominant colour reads washed-out as a translucent tint over the blurred artwork, and
// sits noticeably lighter than the artwork's true shade. deepen only those (OKLab L >= 0.85) toward
// a richer tone of the same hue; mid and dark surfaces are left untouched.
fn enrichSurface(rgb: Rgb) Rgb {
    const oklch = rgbToOklch(rgb.r, rgb.g, rgb.b);
    if (oklch.l < 0.85) return rgb;
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    return hslToRgb(hsl.h, hsl.s, hsl.l - 0.08);
}

fn isNearWhite(rgb: Rgb) bool {
    const oklch = rgbToOklch(rgb.r, rgb.g, rgb.b);
    return oklch.l >= NEAR_WHITE_L and oklch.c <= NEAR_WHITE_C;
}

fn legibleText(surface: Rgb) Rgb {
    const hsl = rgbToHsl(surface.r, surface.g, surface.b);
    const surfaceL = rgbToOklch(surface.r, surface.g, surface.b).l;
    const wantLight = hsl.l < 0.5;
    const candidate = if (wantLight)
        hslToRgb(hsl.h, @min(hsl.s * 1.5, 0.35), @min(0.88, hsl.l + 0.65))
    else
        hslToRgb(hsl.h, @min(hsl.s * 0.8, 0.45), @max(0.12, hsl.l - 0.6));
    const candidateL = rgbToOklch(candidate.r, candidate.g, candidate.b).l;
    if (@abs(candidateL - surfaceL) >= TEXT_CONTRAST_FLOOR) return candidate;
    return if (wantLight)
        hslToRgb(hsl.h, 0.10, 0.98)
    else
        hslToRgb(hsl.h, 0.10, 0.02);
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
    writeHex(&out.accent, 0x3b, 0x82, 0xf6);
    writeHex(&out.surface, 0x1e, 0x20, 0x30);
    writeHex(&out.on_surface, 0xd8, 0xde, 0xe9);
    writeHex(&out.muted_on_surface, 0xb8, 0xbf, 0xd0);
}

fn addToBin(bins: *[MAX_BINS]Bin, r: u8, g: u8, b: u8) void {
    const key: usize = (@as(usize, r >> SHIFT) << (SHIFT * 2)) |
        (@as(usize, g >> SHIFT) << SHIFT) |
        @as(usize, b >> SHIFT);
    bins[key].count +|= 1;
    bins[key].sum_r +|= r;
    bins[key].sum_g +|= g;
    bins[key].sum_b +|= b;
}

// vibrant score for the accent fallback: rewards chroma and mid lightness, damps population with a
// sqrt so a saturated minority can beat a muted majority, and penalises near-neutral bins.
fn vibrantScore(count: u32, lab: Oklch) f64 {
    const satWeight = 0.2 + lab.c * 6.5;
    const litWeight = clamp(1.0 - @abs(lab.l - 0.6) * 1.7, 0.35, 1.0);
    const neutralThreshold = 0.03 + (1.0 - lab.l) * 0.05;
    const neutralPenalty: f64 = if (lab.c < neutralThreshold) 0.4 else 1.0;
    return @sqrt(@as(f64, @floatFromInt(count))) * satWeight * litWeight * neutralPenalty;
}

fn selectPaletteFromBins(bins: *const [MAX_BINS]Bin, out: *Palette) void {
    // most-vibrant colour, used only as the accent fallback for single-hue covers.
    var fallbackHex: [8]u8 = undefined;
    var bestScore: f64 = -std.math.inf(f64);
    var topRgb: Rgb = undefined;
    var hasFallback = false;

    for (bins) |bin| {
        if (bin.count == 0) continue;
        const r: u8 = @intCast(bin.sum_r / bin.count);
        const g: u8 = @intCast(bin.sum_g / bin.count);
        const b: u8 = @intCast(bin.sum_b / bin.count);
        const lab = rgbToOklch(r, g, b);
        if (lab.l <= 0.10) continue;
        const score = vibrantScore(bin.count, lab);
        if (score > bestScore) {
            bestScore = score;
            topRgb = .{ .r = r, .g = g, .b = b };
            hasFallback = true;
        }
    }

    if (hasFallback) {
        // among the bins that tie the top score, lean to the most chromatic one.
        const tieFloor = bestScore * (1.0 - FALLBACK_TIE_FRACTION);
        var chromaRgb = topRgb;
        var bestChroma: f64 = -1.0;
        for (bins) |bin| {
            if (bin.count == 0) continue;
            const r: u8 = @intCast(bin.sum_r / bin.count);
            const g: u8 = @intCast(bin.sum_g / bin.count);
            const b: u8 = @intCast(bin.sum_b / bin.count);
            const lab = rgbToOklch(r, g, b);
            if (lab.l <= 0.10) continue;
            if (vibrantScore(bin.count, lab) < tieFloor) continue;
            if (lab.c > bestChroma) {
                bestChroma = lab.c;
                chromaRgb = .{ .r = r, .g = g, .b = b };
            }
        }
        const chosen = if (bestChroma >= FALLBACK_TIE_CHROMA_MIN) chromaRgb else topRgb;
        const enhanced = enhancePrimary(chosen.r, chosen.g, chosen.b);
        writeHex(&fallbackHex, enhanced.r, enhanced.g, enhanced.b);
    }

    if (!hasFallback) {
        var found = false;
        for (bins) |bin| {
            if (bin.count == 0) continue;
            const r: u8 = @intCast(bin.sum_r / bin.count);
            const g: u8 = @intCast(bin.sum_g / bin.count);
            const b: u8 = @intCast(bin.sum_b / bin.count);
            if (rgbLightness(r, g, b) > 0.15) {
                writeHex(&fallbackHex, r, g, b);
                found = true;
                break;
            }
        }
        if (!found) writeHex(&fallbackHex, 0xd8, 0xde, 0xe9);
    }

    var totalPop: u64 = 0;
    var coarse: [DOMINANT_BINS]Bin = std.mem.zeroes([DOMINANT_BINS]Bin);
    for (bins) |bin| {
        if (bin.count == 0) continue;
        totalPop +|= bin.count;
        const r: u8 = @intCast(bin.sum_r / bin.count);
        const g: u8 = @intCast(bin.sum_g / bin.count);
        const b: u8 = @intCast(bin.sum_b / bin.count);
        const key: usize = (@as(usize, r >> DOMINANT_SHIFT) << (DOMINANT_BITS * 2)) |
            (@as(usize, g >> DOMINANT_SHIFT) << DOMINANT_BITS) |
            @as(usize, b >> DOMINANT_SHIFT);
        coarse[key].count +|= bin.count;
        coarse[key].sum_r +|= bin.sum_r;
        coarse[key].sum_g +|= bin.sum_g;
        coarse[key].sum_b +|= bin.sum_b;
    }

    var dominantCount: u32 = 0;
    var dominantRgb: Rgb = .{ .r = 0x1e, .g = 0x20, .b = 0x30 };
    for (coarse) |bin| {
        if (bin.count > dominantCount) {
            dominantCount = bin.count;
            dominantRgb = .{
                .r = @intCast(bin.sum_r / bin.count),
                .g = @intCast(bin.sum_g / bin.count),
                .b = @intCast(bin.sum_b / bin.count),
            };
        }
    }

    var surfaceRgb = enrichSurface(dominantRgb);
    var forcedAccent: ?Rgb = null;
    if (isNearWhite(dominantRgb)) {
        var anchorRgb: Rgb = undefined;
        var anchorCount: u32 = 0;
        var anchorHue: f64 = 0.0;
        for (coarse) |bin| {
            if (bin.count == 0) continue;
            const r: u8 = @intCast(bin.sum_r / bin.count);
            const g: u8 = @intCast(bin.sum_g / bin.count);
            const b: u8 = @intCast(bin.sum_b / bin.count);
            const lab = rgbToOklch(r, g, b);
            if (lab.l <= 0.20 or lab.l >= 0.92 or lab.c < 0.05) continue;
            if (bin.count > anchorCount) {
                anchorCount = bin.count;
                anchorRgb = .{ .r = r, .g = g, .b = b };
                anchorHue = lab.h;
            }
        }
        if (anchorCount > 0) {
            var chromaticFamilyMass: u64 = 0;
            var nearWhiteMass: u64 = 0;
            for (coarse) |bin| {
                if (bin.count == 0) continue;
                const r: u8 = @intCast(bin.sum_r / bin.count);
                const g: u8 = @intCast(bin.sum_g / bin.count);
                const b: u8 = @intCast(bin.sum_b / bin.count);
                if (isNearWhite(.{ .r = r, .g = g, .b = b })) {
                    nearWhiteMass +|= bin.count;
                    continue;
                }
                const lab = rgbToOklch(r, g, b);
                if (lab.l <= 0.20 or lab.l >= 0.92 or lab.c < 0.05) continue;
                if (normalizedHueDistance(lab.h, anchorHue) * 180.0 <= SWAP_HUE_WINDOW) {
                    chromaticFamilyMass +|= bin.count;
                }
            }
            const threshold = @as(f64, @floatFromInt(nearWhiteMass)) * SWAP_RATIO;
            if (@as(f64, @floatFromInt(chromaticFamilyMass)) >= threshold) {
                surfaceRgb = enrichSurface(anchorRgb);
                forcedAccent = dominantRgb;
            }
        }
    }
    const surfaceLab = rgbToOklch(surfaceRgb.r, surfaceRgb.g, surfaceRgb.b);

    var accentHex: [8]u8 = fallbackHex;
    var bestAccentScore: f64 = -std.math.inf(f64);

    if (forcedAccent) |nw| {
        // the near-white sampled from the art, used as-is (enhanceAccent would muddy it).
        writeHex(&accentHex, nw.r, nw.g, nw.b);
    } else if (totalPop > 0) {
        for (coarse) |bin| {
            if (bin.count == 0) continue;
            const r: u8 = @intCast(bin.sum_r / bin.count);
            const g: u8 = @intCast(bin.sum_g / bin.count);
            const b: u8 = @intCast(bin.sum_b / bin.count);
            const lab = rgbToOklch(r, g, b);
            if (lab.l <= 0.20 or lab.l >= 0.92) continue;
            if (lab.c < 0.05) continue;
            const share = @as(f64, @floatFromInt(bin.count)) / @as(f64, @floatFromInt(totalPop));
            if (share < 0.01) continue;
            // chroma-plane (a,b) distance between this colour and the surface, via the law of cosines.
            const dh = (surfaceLab.h - lab.h) * std.math.pi / 180.0;
            const chromaDist = @sqrt(surfaceLab.c * surfaceLab.c + lab.c * lab.c -
                2.0 * surfaceLab.c * lab.c * @cos(dh));
            if (chromaDist < 0.06) continue;
            const presence = clamp(share / 0.15, 0.0, 1.0);
            const score = lab.c * (0.4 + 0.6 * presence);
            if (score > bestAccentScore) {
                bestAccentScore = score;
                const enhanced = enhanceAccent(r, g, b);
                writeHex(&accentHex, enhanced.r, enhanced.g, enhanced.b);
            }
        }
    }

    const onSurfaceRgb = legibleText(surfaceRgb);
    const mutedOnSurfaceRgb = mutedText(onSurfaceRgb, surfaceRgb);

    out.accent = accentHex;
    writeHex(&out.surface, surfaceRgb.r, surfaceRgb.g, surfaceRgb.b);
    writeHex(&out.on_surface, onSurfaceRgb.r, onSurfaceRgb.g, onSurfaceRgb.b);
    writeHex(&out.muted_on_surface, mutedOnSurfaceRgb.r, mutedOnSurfaceRgb.g, mutedOnSurfaceRgb.b);
}

// ---------------------------------------------------------------------------
// RGBA pixel path (used by platform bridges that do their own decode)
// ---------------------------------------------------------------------------

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
            addToBin(&bins, pixels[i + 0], pixels[i + 1], pixels[i + 2]);
        }
    }

    selectPaletteFromBins(&bins, out);
    return true;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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
    try std.testing.expectEqual(@as(u8, '#'), palette.accent[0]);
}

test "atolla_extract_palette: 1x1 red pixel returns true with valid hex strings" {
    const pixels: [4]u8 = .{ 255, 0, 0, 255 };
    var palette: Palette = std.mem.zeroes(Palette);
    const ok = atolla_extract_palette(&pixels, 1, 1, &palette);
    try std.testing.expect(ok);
    try std.testing.expectEqual(@as(u8, '#'), palette.accent[0]);
    try std.testing.expectEqual(@as(u8, '#'), palette.surface[0]);
    try std.testing.expectEqual(@as(u8, '#'), palette.on_surface[0]);
    try std.testing.expectEqual(@as(u8, '#'), palette.muted_on_surface[0]);
}

test "atolla_extract_palette: all-black image falls back to defaults" {
    const pixels: [4]u8 = .{ 0, 0, 0, 255 };
    var palette: Palette = std.mem.zeroes(Palette);
    _ = atolla_extract_palette(&pixels, 1, 1, &palette);
    // black is filtered out, so the accent falls back to the default vibrant colour #d8dee9
    try std.testing.expectEqual(@as(u8, 'd'), palette.accent[1]);
    try std.testing.expectEqual(@as(u8, '8'), palette.accent[2]);
}

test "atolla_extract_palette: dark warm-grey does not beat moderately-saturated cooler mid-tone" {
    // 16 low-chroma warm-grey pixels vs 4 chromatic blue pixels: the warm-grey is penalised as
    // near-neutral, so the blue wins the vibrant score despite fewer pixels and becomes the accent.
    var pixels: [20 * 4]u8 = undefined;
    for (0..16) |i| {
        pixels[i * 4 + 0] = 114;
        pixels[i * 4 + 1] = 86;
        pixels[i * 4 + 2] = 79;
        pixels[i * 4 + 3] = 255;
    }
    for (16..20) |i| {
        pixels[i * 4 + 0] = 89;
        pixels[i * 4 + 1] = 115;
        pixels[i * 4 + 2] = 166;
        pixels[i * 4 + 3] = 255;
    }
    var palette: Palette = std.mem.zeroes(Palette);
    _ = atolla_extract_palette(&pixels, 4, 5, &palette);
    const accent = parseHex(palette.accent);
    try std.testing.expect(accent.b > accent.r);
}

test "atolla_extract_palette: saturated minority beats muted majority" {
    // 12 muted blue-grey pixels (s≈0.12, l≈0.5) vs 4 saturated orange pixels (s≈0.83).
    // with raw count as the multiplier the grey mass would win; sqrt(count) lets saturation dominate.
    var pixels: [16 * 4]u8 = undefined;
    for (0..12) |i| {
        pixels[i * 4 + 0] = 112;
        pixels[i * 4 + 1] = 127;
        pixels[i * 4 + 2] = 143;
        pixels[i * 4 + 3] = 255;
    }
    for (12..16) |i| {
        pixels[i * 4 + 0] = 210;
        pixels[i * 4 + 1] = 80;
        pixels[i * 4 + 2] = 20;
        pixels[i * 4 + 3] = 255;
    }
    var palette: Palette = std.mem.zeroes(Palette);
    _ = atolla_extract_palette(&pixels, 4, 4, &palette);
    const accent = parseHex(palette.accent);
    try std.testing.expect(accent.r > accent.b);
}

test "atolla_extract_palette: surface tracks the dominant colour, not the vibrant accent" {
    var pixels: [16 * 4]u8 = undefined;
    for (0..12) |i| {
        pixels[i * 4 + 0] = 112;
        pixels[i * 4 + 1] = 127;
        pixels[i * 4 + 2] = 143;
        pixels[i * 4 + 3] = 255;
    }
    for (12..16) |i| {
        pixels[i * 4 + 0] = 210;
        pixels[i * 4 + 1] = 80;
        pixels[i * 4 + 2] = 20;
        pixels[i * 4 + 3] = 255;
    }
    var palette: Palette = std.mem.zeroes(Palette);
    _ = atolla_extract_palette(&pixels, 4, 4, &palette);
    const accent = parseHex(palette.accent);
    const surface = parseHex(palette.surface);
    try std.testing.expect(accent.r > accent.b);
    try std.testing.expect(surface.b > surface.r);
}

test "atolla_extract_palette: near-white dominant swaps surface to a tied chromatic colour" {
    // 11 near-white pixels vs 10 orange: white is the single-largest mass, but the chromatic
    // family is within SWAP_RATIO of it, so the surface becomes orange and the near-white
    // becomes the accent (sampled as-is).
    var pixels: [21 * 4]u8 = undefined;
    for (0..11) |i| {
        pixels[i * 4 + 0] = 254;
        pixels[i * 4 + 1] = 254;
        pixels[i * 4 + 2] = 253;
        pixels[i * 4 + 3] = 255;
    }
    for (11..21) |i| {
        pixels[i * 4 + 0] = 217;
        pixels[i * 4 + 1] = 136;
        pixels[i * 4 + 2] = 51;
        pixels[i * 4 + 3] = 255;
    }
    var palette: Palette = std.mem.zeroes(Palette);
    _ = atolla_extract_palette(&pixels, 3, 7, &palette);
    const surface = parseHex(palette.surface);
    const accent = parseHex(palette.accent);
    try std.testing.expect(!isNearWhite(surface));
    try std.testing.expect(surface.r > surface.b);
    try std.testing.expect(isNearWhite(accent));
}

test "atolla_extract_palette: mostly-white cover keeps the near-white surface" {
    // 18 near-white pixels vs 2 orange: the chromatic family is far below SWAP_RATIO, so no
    // swap happens — the surface stays near-white and the orange is the accent.
    var pixels: [20 * 4]u8 = undefined;
    for (0..18) |i| {
        pixels[i * 4 + 0] = 254;
        pixels[i * 4 + 1] = 254;
        pixels[i * 4 + 2] = 253;
        pixels[i * 4 + 3] = 255;
    }
    for (18..20) |i| {
        pixels[i * 4 + 0] = 217;
        pixels[i * 4 + 1] = 136;
        pixels[i * 4 + 2] = 51;
        pixels[i * 4 + 3] = 255;
    }
    var palette: Palette = std.mem.zeroes(Palette);
    _ = atolla_extract_palette(&pixels, 4, 5, &palette);
    const surface = parseHex(palette.surface);
    const accent = parseHex(palette.accent);
    try std.testing.expect(isNearWhite(surface));
    try std.testing.expect(accent.r > accent.b);
}

test "atolla_extract_palette: near-monochrome fallback leans to the chromatic tie, not the neutral" {
    // 103 mid-grey pixels narrowly out-score 1 purple pixel on the vibrant fallback, but they tie
    // within FALLBACK_TIE_FRACTION — the tie-break leans to the more chromatic purple, so a
    // near-monochrome cover's accent stays stable across platform decoders instead of collapsing
    // to a neutral. without the tie-break the accent would be the grey.
    var pixels: [104 * 4]u8 = undefined;
    for (0..103) |i| {
        pixels[i * 4 + 0] = 128;
        pixels[i * 4 + 1] = 128;
        pixels[i * 4 + 2] = 128;
        pixels[i * 4 + 3] = 255;
    }
    pixels[103 * 4 + 0] = 130;
    pixels[103 * 4 + 1] = 121;
    pixels[103 * 4 + 2] = 183;
    pixels[103 * 4 + 3] = 255;
    var palette: Palette = std.mem.zeroes(Palette);
    _ = atolla_extract_palette(&pixels, 13, 8, &palette);
    const accent = parseHex(palette.accent);
    try std.testing.expect(accent.b > accent.r);
    try std.testing.expect(accent.b > accent.g);
}

test "atolla_extract_palette: on_surface clears the contrast floor on a mid-tone surface" {
    const pixels: [4]u8 = .{ 128, 128, 128, 255 };
    var palette: Palette = std.mem.zeroes(Palette);
    _ = atolla_extract_palette(&pixels, 1, 1, &palette);
    const surface = parseHex(palette.surface);
    const text = parseHex(palette.on_surface);
    const surfaceL = rgbToOklch(surface.r, surface.g, surface.b).l;
    const textL = rgbToOklch(text.r, text.g, text.b).l;
    try std.testing.expect(@abs(textL - surfaceL) >= TEXT_CONTRAST_FLOOR);
}
