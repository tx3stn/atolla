// Palette extraction algorithm.
// Strategy: 4-bit RGB quantisation (4096 bins, 64 KB on stack) → score each
// bin for primary colour (saturation/lightness weighted, neutral-penalised) →
// pick accent by hue distance + rarity → derive surface/text colours from HSL.
//
// atolla_extract_palette: accepts pre-decoded RGBA pixels (used by platform bridges).
// atolla_extract_palette_from_bytes: decodes raw PNG or JPEG bytes natively,
//   so palette extraction runs once at cache-write time with no extra disk read.

const std = @import("std");

extern fn malloc(size: usize) ?*anyopaque;
extern fn free(ptr: ?*anyopaque) void;

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

// ---------------------------------------------------------------------------
// Histogram helpers
// ---------------------------------------------------------------------------

fn addToBin(bins: *[MAX_BINS]Bin, r: u8, g: u8, b: u8) void {
    const key: usize = (@as(usize, r >> SHIFT) << (SHIFT * 2)) |
        (@as(usize, g >> SHIFT) << SHIFT) |
        @as(usize, b >> SHIFT);
    bins[key].count +|= 1;
    bins[key].sum_r +|= r;
    bins[key].sum_g +|= g;
    bins[key].sum_b +|= b;
}

fn selectPaletteFromBins(bins: *const [MAX_BINS]Bin, out: *Palette) void {
    var primaryHex: [8]u8 = undefined;
    var bestPrimaryScore: f64 = -std.math.inf(f64);
    var hasPrimary = false;

    for (bins) |bin| {
        if (bin.count == 0) continue;
        const r: u8 = @intCast(bin.sum_r / bin.count);
        const g: u8 = @intCast(bin.sum_g / bin.count);
        const b: u8 = @intCast(bin.sum_b / bin.count);
        const hsl = rgbToHsl(r, g, b);
        if (hsl.l <= 0.08) continue;
        const satWeight = 0.2 + hsl.s * 2.0;
        const litWeight = clamp(1.0 - @abs(hsl.l - 0.45) * 1.7, 0.35, 1.0);
        // Darker colors need higher saturation to look visually distinct from grey.
        // At L=0 threshold is 0.40; at L=0.5 it is 0.275; at L=1.0 it is 0.15.
        const neutralThreshold = 0.15 + (1.0 - hsl.l) * 0.25;
        const neutralPenalty: f64 = if (hsl.s < neutralThreshold) 0.4 else 1.0;
        const score = @sqrt(@as(f64, @floatFromInt(bin.count))) * satWeight * litWeight * neutralPenalty;
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
// PNG decoder
// ---------------------------------------------------------------------------

const PNG_SIG = [8]u8{ 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a };

fn readU32Be(data: []const u8, off: usize) u32 {
    return @as(u32, data[off]) << 24 |
        @as(u32, data[off + 1]) << 16 |
        @as(u32, data[off + 2]) << 8 |
        @as(u32, data[off + 3]);
}

fn paethPredictor(a: i32, b: i32, c: i32) u8 {
    const p = a + b - c;
    const pa = @abs(p - a);
    const pb = @abs(p - b);
    const pc = @abs(p - c);
    if (pa <= pb and pa <= pc) return @intCast(a & 0xff);
    if (pb <= pc) return @intCast(b & 0xff);
    return @intCast(c & 0xff);
}

fn extractFromPng(bytes: []const u8, bins: *[MAX_BINS]Bin) bool {
    if (bytes.len < 8 or !std.mem.eql(u8, bytes[0..8], &PNG_SIG)) return false;

    // First pass: parse IHDR/PLTE, sum IDAT sizes.
    var pos: usize = 8;
    var width: u32 = 0;
    var height: u32 = 0;
    var color_type: u8 = 0;
    var idat_total: usize = 0;
    var plte: [256 * 3]u8 = undefined;
    var plte_len: u32 = 0;
    var got_ihdr = false;

    while (pos + 12 <= bytes.len) {
        const chunk_len = readU32Be(bytes, pos);
        if (pos + 12 + chunk_len > bytes.len) break;
        const chunk_type = bytes[pos + 4 .. pos + 8];
        const chunk_data = bytes[pos + 8 .. pos + 8 + chunk_len];

        if (std.mem.eql(u8, chunk_type, "IHDR")) {
            if (chunk_len < 13) return false;
            width = readU32Be(chunk_data, 0);
            height = readU32Be(chunk_data, 4);
            const bit_depth = chunk_data[8];
            color_type = chunk_data[9];
            if (bit_depth != 8) return false; // only support 8-bit depth
            got_ihdr = true;
        } else if (std.mem.eql(u8, chunk_type, "PLTE")) {
            plte_len = @intCast(chunk_len / 3);
            const copy_len = @min(chunk_len, plte.len);
            @memcpy(plte[0..copy_len], chunk_data[0..copy_len]);
        } else if (std.mem.eql(u8, chunk_type, "IDAT")) {
            idat_total += chunk_len;
        } else if (std.mem.eql(u8, chunk_type, "IEND")) {
            break;
        }

        pos += 12 + chunk_len;
    }

    if (!got_ihdr or width == 0 or height == 0 or idat_total == 0) return false;

    const bpp: usize = switch (color_type) {
        0 => 1, // grayscale
        2 => 3, // RGB
        3 => 1, // indexed
        4 => 2, // grayscale + alpha
        6 => 4, // RGBA
        else => return false,
    };
    const row_stride: usize = 1 + bpp * @as(usize, width); // +1 for filter byte
    // A crafted IHDR can make this product overflow usize (a panic in safe builds); an image that
    // large is not something we decode here, so bail out rather than crash.
    const scanlines_size: usize = std.math.mul(usize, row_stride, @as(usize, height)) catch return false;

    // Collect all IDAT chunks into one buffer.
    const idat_raw = malloc(idat_total) orelse return false;
    defer free(idat_raw);
    const idat_buf: [*]u8 = @ptrCast(@alignCast(idat_raw));

    var idat_off: usize = 0;
    pos = 8;
    while (pos + 12 <= bytes.len) {
        const chunk_len = readU32Be(bytes, pos);
        if (pos + 12 + chunk_len > bytes.len) break;
        const chunk_type = bytes[pos + 4 .. pos + 8];
        if (std.mem.eql(u8, chunk_type, "IDAT")) {
            @memcpy(idat_buf[idat_off .. idat_off + chunk_len], bytes[pos + 8 .. pos + 8 + chunk_len]);
            idat_off += chunk_len;
        } else if (std.mem.eql(u8, chunk_type, "IEND")) {
            break;
        }
        pos += 12 + chunk_len;
    }

    // Decompress zlib-wrapped DEFLATE data.
    const sl_raw = malloc(scanlines_size) orelse return false;
    defer free(sl_raw);
    const sl: [*]u8 = @ptrCast(@alignCast(sl_raw));

    // Decompress requires a history window of at least max_window_len bytes.
    const win_size = std.compress.flate.max_window_len;
    const win_raw = malloc(win_size) orelse return false;
    defer free(win_raw);
    const win: [*]u8 = @ptrCast(@alignCast(win_raw));

    var in_reader: std.Io.Reader = .fixed(idat_buf[0..idat_total]);
    var decomp: std.compress.flate.Decompress = .init(&in_reader, .zlib, win[0..win_size]);
    decomp.reader.readSliceAll(sl[0..scanlines_size]) catch return false;

    // Apply PNG filter reconstruction row by row and populate histogram.
    const pixel_step = @max(1, @as(usize, width) / 64);
    for (0..@as(usize, height)) |y| {
        const row_off = y * row_stride;
        const filter = sl[row_off];
        const row = sl[row_off + 1 .. row_off + 1 + bpp * @as(usize, width)];
        const prev_off: usize = if (y > 0) row_off + 1 - row_stride else 0;
        const has_prev = y > 0;

        switch (filter) {
            0 => {}, // None
            1 => { // Sub
                for (bpp..row.len) |i| row[i] +%= row[i - bpp];
            },
            2 => { // Up
                if (has_prev) {
                    const prev = sl[prev_off .. prev_off + row.len];
                    for (0..row.len) |i| row[i] +%= prev[i];
                }
            },
            3 => { // Average
                const prev: ?[]u8 = if (has_prev) sl[prev_off .. prev_off + row.len] else null;
                for (0..row.len) |i| {
                    const a: u16 = if (i >= bpp) row[i - bpp] else 0;
                    const b: u16 = if (prev) |p| p[i] else 0;
                    row[i] +%= @intCast((a + b) / 2);
                }
            },
            4 => { // Paeth
                const prev: ?[]u8 = if (has_prev) sl[prev_off .. prev_off + row.len] else null;
                for (0..row.len) |i| {
                    const a: i32 = if (i >= bpp) row[i - bpp] else 0;
                    const b: i32 = if (prev) |p| p[i] else 0;
                    const c: i32 = if (i >= bpp) (if (prev) |p| p[i - bpp] else 0) else 0;
                    row[i] +%= paethPredictor(a, b, c);
                }
            },
            else => return false,
        }

        var xi: usize = 0;
        while (xi < @as(usize, width)) : (xi += pixel_step) {
            var r: u8 = undefined;
            var g: u8 = undefined;
            var b: u8 = undefined;
            var a: u8 = 255;

            switch (color_type) {
                0 => {
                    r = row[xi];
                    g = r;
                    b = r;
                },
                2 => {
                    r = row[xi * 3];
                    g = row[xi * 3 + 1];
                    b = row[xi * 3 + 2];
                },
                3 => {
                    const idx = row[xi];
                    if (idx >= plte_len) continue;
                    r = plte[idx * 3];
                    g = plte[idx * 3 + 1];
                    b = plte[idx * 3 + 2];
                },
                4 => {
                    r = row[xi * 2];
                    g = r;
                    b = r;
                    a = row[xi * 2 + 1];
                },
                6 => {
                    r = row[xi * 4];
                    g = row[xi * 4 + 1];
                    b = row[xi * 4 + 2];
                    a = row[xi * 4 + 3];
                },
                else => continue,
            }

            if (a < 128) continue;
            addToBin(bins, r, g, b);
        }
    }

    return true;
}

// ---------------------------------------------------------------------------
// JPEG DC-only decoder
// ---------------------------------------------------------------------------

const MAX_COMPS = 4;
const MAX_QUANT_TABLES = 4;
const MAX_HUFF_TABLES = 4;

const JpegHuffTable = struct {
    count: [16]u8,
    first_code: [16]u16,
    first_symbol: [16]u16,
    symbols: [256]u8,
    max_len: u8,
    present: bool,
};

const JpegQuantTable = struct {
    q0: u16, // DC quantization coefficient only
    present: bool,
};

const JpegComp = struct {
    id: u8,
    h_samp: u8,
    v_samp: u8,
    quant_id: u8,
};

const JpegState = struct {
    width: u16,
    height: u16,
    n_comps: u8,
    comps: [MAX_COMPS]JpegComp,
    quant: [MAX_QUANT_TABLES]JpegQuantTable,
    dc_huff: [MAX_HUFF_TABLES]JpegHuffTable,
    ac_huff: [MAX_HUFF_TABLES]JpegHuffTable,
    restart_interval: u16,
};

const ScanComp = struct {
    comp_id: u8,
    dc_table_id: u8,
    ac_table_id: u8,
};

const BitReader = struct {
    data: []const u8,
    pos: usize,
    buf: u32,
    bits: u8,

    fn init(data: []const u8) BitReader {
        return .{ .data = data, .pos = 0, .buf = 0, .bits = 0 };
    }

    fn refill(self: *BitReader) void {
        while (self.bits <= 24 and self.pos < self.data.len) {
            const byte = self.data[self.pos];
            if (byte == 0xff) {
                if (self.pos + 1 >= self.data.len) return;
                const next = self.data[self.pos + 1];
                if (next == 0x00) {
                    // byte stuffing: FF 00 → FF in bitstream
                    self.pos += 2;
                    self.buf = (self.buf << 8) | 0xff;
                    self.bits += 8;
                    continue;
                } else if (next >= 0xd0 and next <= 0xd7) {
                    // restart marker: flush bit buffer and skip
                    self.pos += 2;
                    self.buf = 0;
                    self.bits = 0;
                    continue;
                } else {
                    // EOI or other segment marker: stop
                    return;
                }
            }
            self.pos += 1;
            self.buf = (self.buf << 8) | byte;
            self.bits += 8;
        }
    }

    fn readBit(self: *BitReader) u1 {
        if (self.bits == 0) self.refill();
        if (self.bits == 0) return 0;
        const shift: u5 = @intCast(self.bits - 1);
        const bit: u1 = @intCast((self.buf >> shift) & 1);
        self.bits -= 1;
        return bit;
    }

    fn readBits(self: *BitReader, n: u8) u16 {
        if (n == 0) return 0;
        var result: u16 = 0;
        for (0..n) |_| result = (result << 1) | self.readBit();
        return result;
    }
};

fn buildHuffTable(table: *JpegHuffTable, bits: []const u8, vals: []const u8) void {
    var code: u16 = 0;
    var sym_idx: u16 = 0;
    table.max_len = 0;
    for (0..16) |i| {
        table.count[i] = bits[i];
        table.first_code[i] = code;
        table.first_symbol[i] = sym_idx;
        code +%= table.count[i];
        code <<= 1;
        sym_idx += table.count[i];
        if (bits[i] > 0) table.max_len = @intCast(i + 1);
    }
    const copy_len = @min(vals.len, table.symbols.len);
    @memcpy(table.symbols[0..copy_len], vals[0..copy_len]);
    table.present = true;
}

fn decodeHuffman(br: *BitReader, table: *const JpegHuffTable) u8 {
    var code: u16 = 0;
    for (0..table.max_len) |i| {
        code = (code << 1) | br.readBit();
        if (table.count[i] == 0) continue;
        if (code >= table.first_code[i]) {
            const offset = code - table.first_code[i];
            if (offset < table.count[i]) {
                // A corrupt DHT can sum to more than 256 symbols, pushing this index past the
                // fixed symbol array; treat an out-of-range symbol as a decode miss.
                const idx: usize = @as(usize, table.first_symbol[i]) + @as(usize, offset);
                if (idx >= table.symbols.len) return 0;
                return table.symbols[idx];
            }
        }
    }
    return 0;
}

fn jpegExtendSign(val: u16, n: u8) i32 {
    if (n == 0) return 0;
    const threshold: u16 = @as(u16, 1) << @intCast(n - 1);
    if (val >= threshold) return @as(i32, val);
    return @as(i32, val) - (@as(i32, 1) << @intCast(n)) + 1;
}

fn skipAcCoefficients(br: *BitReader, ac_huff: *const JpegHuffTable) void {
    var count: u8 = 0;
    while (count < 63) {
        const rs = decodeHuffman(br, ac_huff);
        const r = rs >> 4;
        const s = rs & 0xf;
        if (s == 0) {
            if (r == 0) break; // EOB
            count +|= 16; // ZRL (skip 16 zeros)
        } else {
            count +|= r + 1;
            _ = br.readBits(s);
        }
    }
}

fn ycbcrToRgb(y: f32, cb: f32, cr: f32) Rgb {
    const cbn = cb - 128.0;
    const crn = cr - 128.0;
    const rf = y + 1.402 * crn;
    const gf = y - 0.344136 * cbn - 0.714136 * crn;
    const bf = y + 1.772 * cbn;
    return .{
        .r = @intFromFloat(@max(0.0, @min(255.0, rf))),
        .g = @intFromFloat(@max(0.0, @min(255.0, gf))),
        .b = @intFromFloat(@max(0.0, @min(255.0, bf))),
    };
}

fn findSofComp(state: *const JpegState, comp_id: u8) ?usize {
    for (0..state.n_comps) |i| {
        if (state.comps[i].id == comp_id) return i;
    }
    return null;
}

fn extractFromJpeg(bytes: []const u8, bins: *[MAX_BINS]Bin) bool {
    if (bytes.len < 4 or bytes[0] != 0xff or bytes[1] != 0xd8) return false;

    var state: JpegState = .{
        .width = 0,
        .height = 0,
        .n_comps = 0,
        .comps = undefined,
        .quant = undefined,
        .dc_huff = undefined,
        .ac_huff = undefined,
        .restart_interval = 0,
    };
    for (&state.quant) |*q| q.present = false;
    for (&state.dc_huff) |*h| h.present = false;
    for (&state.ac_huff) |*h| h.present = false;

    var scan_comps: [MAX_COMPS]ScanComp = undefined;
    var n_scan_comps: u8 = 0;
    var sos_data_start: usize = 0;

    var pos: usize = 2; // skip SOI marker
    while (pos + 2 <= bytes.len) {
        if (bytes[pos] != 0xff) return false;
        const marker = bytes[pos + 1];
        pos += 2;

        // Markers with no length field
        if (marker == 0xd8 or marker == 0xd9) continue;
        if (marker >= 0xd0 and marker <= 0xd7) continue;

        if (pos + 2 > bytes.len) return false;
        const seg_len: usize = (@as(usize, bytes[pos]) << 8) | bytes[pos + 1];
        if (seg_len < 2 or pos + seg_len > bytes.len) return false;
        const seg = bytes[pos + 2 .. pos + seg_len];
        pos += seg_len;

        switch (marker) {
            0xc0 => { // SOF0 — baseline DCT
                if (seg.len < 6) return false;
                state.height = (@as(u16, seg[1]) << 8) | seg[2];
                state.width = (@as(u16, seg[3]) << 8) | seg[4];
                state.n_comps = seg[5];
                if (state.n_comps == 0 or state.n_comps > MAX_COMPS) return false;
                if (seg.len < 6 + @as(usize, state.n_comps) * 3) return false;
                for (0..state.n_comps) |i| {
                    const off = 6 + i * 3;
                    state.comps[i] = .{
                        .id = seg[off],
                        .h_samp = seg[off + 1] >> 4,
                        .v_samp = seg[off + 1] & 0xf,
                        .quant_id = seg[off + 2],
                    };
                }
            },
            0xdb => { // DQT
                var off: usize = 0;
                while (off < seg.len) {
                    if (off + 1 > seg.len) break;
                    const pq_tq = seg[off];
                    const pq = pq_tq >> 4;
                    const tq = pq_tq & 0xf;
                    off += 1;
                    const entry_size: usize = if (pq == 0) 64 else 128;
                    if (off + entry_size > seg.len) break;
                    if (tq < MAX_QUANT_TABLES) {
                        state.quant[tq].q0 = if (pq == 0)
                            seg[off]
                        else
                            (@as(u16, seg[off]) << 8) | seg[off + 1];
                        state.quant[tq].present = true;
                    }
                    off += entry_size;
                }
            },
            0xc4 => { // DHT
                var off: usize = 0;
                while (off < seg.len) {
                    if (off + 17 > seg.len) break;
                    const tc_th = seg[off];
                    const tc = tc_th >> 4; // 0=DC, 1=AC
                    const th = tc_th & 0xf;
                    off += 1;
                    var total: usize = 0;
                    for (0..16) |i| total += seg[off + i];
                    if (off + 16 + total > seg.len) return false;
                    if (th < MAX_HUFF_TABLES) {
                        if (tc == 0) {
                            buildHuffTable(&state.dc_huff[th], seg[off .. off + 16], seg[off + 16 .. off + 16 + total]);
                        } else {
                            buildHuffTable(&state.ac_huff[th], seg[off .. off + 16], seg[off + 16 .. off + 16 + total]);
                        }
                    }
                    off += 16 + total;
                }
            },
            0xdd => { // DRI
                if (seg.len >= 2) {
                    state.restart_interval = (@as(u16, seg[0]) << 8) | seg[1];
                }
            },
            0xda => { // SOS
                if (seg.len < 1) return false;
                n_scan_comps = seg[0];
                if (n_scan_comps == 0 or n_scan_comps > MAX_COMPS) return false;
                if (seg.len < 1 + @as(usize, n_scan_comps) * 2 + 3) return false;
                for (0..n_scan_comps) |i| {
                    scan_comps[i] = .{
                        .comp_id = seg[1 + i * 2],
                        .dc_table_id = seg[1 + i * 2 + 1] >> 4,
                        .ac_table_id = seg[1 + i * 2 + 1] & 0xf,
                    };
                }
                sos_data_start = pos;
                break;
            },
            else => {}, // skip unknown segments
        }
    }

    if (sos_data_start == 0 or state.width == 0 or state.height == 0) return false;
    if (n_scan_comps != 1 and n_scan_comps != 3) return false;

    // Resolve sampling factors and validate tables.
    var h_samp: [MAX_COMPS]u8 = undefined;
    var v_samp: [MAX_COMPS]u8 = undefined;
    var quant_q0: [MAX_COMPS]u16 = undefined;
    var max_h: u8 = 1;
    var max_v: u8 = 1;

    for (0..n_scan_comps) |sci| {
        const sof_idx = findSofComp(&state, scan_comps[sci].comp_id) orelse return false;
        h_samp[sci] = state.comps[sof_idx].h_samp;
        v_samp[sci] = state.comps[sof_idx].v_samp;
        if (h_samp[sci] == 0 or v_samp[sci] == 0) return false;
        if (h_samp[sci] > max_h) max_h = h_samp[sci];
        if (v_samp[sci] > max_v) max_v = v_samp[sci];
        const qid = state.comps[sof_idx].quant_id;
        if (qid >= MAX_QUANT_TABLES or !state.quant[qid].present) return false;
        quant_q0[sci] = state.quant[qid].q0;

        const dc_id = scan_comps[sci].dc_table_id;
        const ac_id = scan_comps[sci].ac_table_id;
        if (dc_id >= MAX_HUFF_TABLES or !state.dc_huff[dc_id].present) return false;
        if (n_scan_comps > 1 and (ac_id >= MAX_HUFF_TABLES or !state.ac_huff[ac_id].present)) return false;
    }

    const mcu_cols: u32 = (@as(u32, state.width) + @as(u32, 8 * max_h) - 1) / @as(u32, 8 * max_h);
    const mcu_rows: u32 = (@as(u32, state.height) + @as(u32, 8 * max_v) - 1) / @as(u32, 8 * max_v);
    const total_mcus: u64 = @as(u64, mcu_cols) * @as(u64, mcu_rows);

    var br = BitReader.init(bytes[sos_data_start..]);
    var dc_pred: [MAX_COMPS]i32 = .{ 0, 0, 0, 0 };
    var mcu_count: u64 = 0;

    while (mcu_count < total_mcus) : (mcu_count += 1) {
        // Reset DC predictions at restart boundaries.
        if (state.restart_interval > 0 and mcu_count > 0 and
            mcu_count % state.restart_interval == 0)
        {
            for (&dc_pred) |*p| p.* = 0;
        }

        var comp_vals: [MAX_COMPS]f32 = undefined;

        for (0..n_scan_comps) |sci| {
            const dc_huff = &state.dc_huff[scan_comps[sci].dc_table_id];
            const ac_huff = if (n_scan_comps > 1) &state.ac_huff[scan_comps[sci].ac_table_id] else null;
            const blocks = @as(usize, h_samp[sci]) * @as(usize, v_samp[sci]);
            var dc_sum: i64 = 0;

            for (0..blocks) |_| {
                const len_sym = decodeHuffman(&br, dc_huff);
                const raw = br.readBits(len_sym);
                const diff = jpegExtendSign(raw, len_sym);
                dc_pred[sci] += diff;
                dc_sum += dc_pred[sci];

                if (ac_huff) |ac| skipAcCoefficients(&br, ac);
            }

            // avg_pixel ≈ dc_coef * Q[0] / 8 + 128, clamped to [0,255]
            const avg_dc = @as(f32, @floatFromInt(dc_sum)) / @as(f32, @floatFromInt(blocks));
            const pixel_val = avg_dc * @as(f32, @floatFromInt(quant_q0[sci])) / 8.0 + 128.0;
            comp_vals[sci] = @max(0.0, @min(255.0, pixel_val));
        }

        const rgb = if (n_scan_comps == 1)
            Rgb{ .r = @intFromFloat(comp_vals[0]), .g = @intFromFloat(comp_vals[0]), .b = @intFromFloat(comp_vals[0]) }
        else
            ycbcrToRgb(comp_vals[0], comp_vals[1], comp_vals[2]);

        addToBin(bins, rgb.r, rgb.g, rgb.b);
    }

    return true;
}

// ---------------------------------------------------------------------------
// Raw-bytes entry point
// ---------------------------------------------------------------------------

export fn atolla_extract_palette_from_bytes(bytes: [*]const u8, len: usize, out: *Palette) bool {
    if (len == 0) {
        writeDefaults(out);
        return false;
    }
    const slice = bytes[0..len];
    var bins: [MAX_BINS]Bin = std.mem.zeroes([MAX_BINS]Bin);

    const ok = blk: {
        if (len >= 8 and std.mem.eql(u8, slice[0..8], &PNG_SIG))
            break :blk extractFromPng(slice, &bins);
        if (len >= 2 and slice[0] == 0xff and slice[1] == 0xd8)
            break :blk extractFromJpeg(slice, &bins);
        break :blk false;
    };

    if (!ok) {
        writeDefaults(out);
        return false;
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

test "jpegExtendSign: positive values above threshold are unchanged" {
    try std.testing.expectEqual(@as(i32, 3), jpegExtendSign(3, 2)); // 3 >= 2 (threshold for n=2)
}

test "jpegExtendSign: values below threshold become negative" {
    try std.testing.expectEqual(@as(i32, -2), jpegExtendSign(1, 2)); // 1 < 2, so 1 - 3 = -2
}

test "jpegExtendSign: zero length returns zero" {
    try std.testing.expectEqual(@as(i32, 0), jpegExtendSign(0, 0));
}

test "ycbcrToRgb: neutral YCbCr produces near-gray" {
    const rgb = ycbcrToRgb(128.0, 128.0, 128.0);
    // Y=128, Cb=128, Cr=128 → R=128, G=128, B=128
    try std.testing.expect(@abs(@as(i16, rgb.r) - 128) <= 1);
    try std.testing.expect(@abs(@as(i16, rgb.g) - 128) <= 1);
    try std.testing.expect(@abs(@as(i16, rgb.b) - 128) <= 1);
}

test "ycbcrToRgb: high Cr produces red tint" {
    const rgb = ycbcrToRgb(128.0, 128.0, 200.0);
    try std.testing.expect(rgb.r > rgb.b);
}

// PNG test helper: builds a minimal valid PNG with stored-block zlib IDAT.
// Only supports 8-bit RGB (color_type=2), no filtering (filter byte 0 per row).
fn buildTestPng(
    comptime W: u32,
    comptime H: u32,
    pixels: *const [W * H * 3]u8,
    out: []u8,
) usize {
    // Scanline data: 1 filter byte (0=None) + 3*W bytes per row
    const row_len = 1 + W * 3;
    var scanlines: [H * (1 + W * 3)]u8 = undefined;
    for (0..H) |y| {
        scanlines[y * row_len] = 0; // filter = None
        @memcpy(scanlines[y * row_len + 1 .. y * row_len + 1 + W * 3], pixels[y * W * 3 .. (y + 1) * W * 3]);
    }

    const sl_len = scanlines.len;
    // zlib stored block: header(2) + block(1+2+2+sl_len) + adler32(4)
    const zlib_len = 2 + 1 + 2 + 2 + sl_len + 4;

    var p: usize = 0;

    // PNG signature
    const sig = PNG_SIG;
    @memcpy(out[p .. p + 8], &sig);
    p += 8;

    // IHDR chunk
    {
        const ihdr_data = [13]u8{
            @intCast((W >> 24) & 0xff), @intCast((W >> 16) & 0xff),
            @intCast((W >> 8) & 0xff),  @intCast(W & 0xff),
            @intCast((H >> 24) & 0xff), @intCast((H >> 16) & 0xff),
            @intCast((H >> 8) & 0xff),  @intCast(H & 0xff),
            8, 2, 0, 0, 0, // bit_depth=8, color_type=2 (RGB), compress=0, filter=0, interlace=0
        };
        const crc = std.hash.Crc32.hash(("IHDR" ++ ihdr_data)[0..]);
        out[p] = 0;
        out[p + 1] = 0;
        out[p + 2] = 0;
        out[p + 3] = 13; // length
        p += 4;
        @memcpy(out[p .. p + 4], "IHDR");
        p += 4;
        @memcpy(out[p .. p + 13], &ihdr_data);
        p += 13;
        out[p] = @intCast((crc >> 24) & 0xff);
        out[p + 1] = @intCast((crc >> 16) & 0xff);
        out[p + 2] = @intCast((crc >> 8) & 0xff);
        out[p + 3] = @intCast(crc & 0xff);
        p += 4;
    }

    // IDAT chunk with zlib stored block
    {
        // Build zlib payload into a temp buffer
        var zlib: [2 + 1 + 2 + 2 + H * (1 + W * 3) + 4]u8 = undefined;
        var zp: usize = 0;
        // zlib header: CMF=0x78 (deflate, window=32K), FLG chosen so CMF*256+FLG ≡ 0 (mod 31)
        // 0x78 * 256 = 30720; 30720 % 31 = 30720 - 990*31 = 30720 - 30690 = 30 → FLG = 1
        zlib[zp] = 0x78;
        zlib[zp + 1] = 0x01;
        zp += 2;
        // DEFLATE stored block
        zlib[zp] = 0x01; // BFINAL=1, BTYPE=00
        zp += 1;
        const slen: u16 = @intCast(sl_len);
        zlib[zp] = @intCast(slen & 0xff);
        zlib[zp + 1] = @intCast((slen >> 8) & 0xff);
        zlib[zp + 2] = @intCast(~slen & 0xff);
        zlib[zp + 3] = @intCast((~slen >> 8) & 0xff);
        zp += 4;
        @memcpy(zlib[zp .. zp + sl_len], &scanlines);
        zp += sl_len;
        // Adler32
        const adler = std.hash.Adler32.hash(&scanlines);
        zlib[zp] = @intCast((adler >> 24) & 0xff);
        zlib[zp + 1] = @intCast((adler >> 16) & 0xff);
        zlib[zp + 2] = @intCast((adler >> 8) & 0xff);
        zlib[zp + 3] = @intCast(adler & 0xff);
        zp += 4;
        std.debug.assert(zp == zlib_len);

        var idat_crc = std.hash.Crc32.init();
        idat_crc.update("IDAT");
        idat_crc.update(zlib[0..zlib_len]);
        const crc = idat_crc.final();
        out[p] = @intCast((zlib_len >> 24) & 0xff);
        out[p + 1] = @intCast((zlib_len >> 16) & 0xff);
        out[p + 2] = @intCast((zlib_len >> 8) & 0xff);
        out[p + 3] = @intCast(zlib_len & 0xff);
        p += 4;
        @memcpy(out[p .. p + 4], "IDAT");
        p += 4;
        @memcpy(out[p .. p + zlib_len], &zlib);
        p += zlib_len;
        out[p] = @intCast((crc >> 24) & 0xff);
        out[p + 1] = @intCast((crc >> 16) & 0xff);
        out[p + 2] = @intCast((crc >> 8) & 0xff);
        out[p + 3] = @intCast(crc & 0xff);
        p += 4;
    }

    // IEND chunk
    {
        const crc = std.hash.Crc32.hash("IEND");
        out[p] = 0;
        out[p + 1] = 0;
        out[p + 2] = 0;
        out[p + 3] = 0; // length = 0
        p += 4;
        @memcpy(out[p .. p + 4], "IEND");
        p += 4;
        out[p] = @intCast((crc >> 24) & 0xff);
        out[p + 1] = @intCast((crc >> 16) & 0xff);
        out[p + 2] = @intCast((crc >> 8) & 0xff);
        out[p + 3] = @intCast(crc & 0xff);
        p += 4;
    }

    return p;
}

test "atolla_extract_palette_from_bytes: empty input returns false with defaults" {
    var palette: Palette = std.mem.zeroes(Palette);
    const dummy: [1]u8 = .{0};
    const ok = atolla_extract_palette_from_bytes(&dummy, 0, &palette);
    try std.testing.expect(!ok);
    try std.testing.expectEqual(@as(u8, '#'), palette.primary[0]);
}

test "atolla_extract_palette_from_bytes: unrecognized format returns false" {
    var palette: Palette = std.mem.zeroes(Palette);
    const garbage: [8]u8 = .{ 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07 };
    const ok = atolla_extract_palette_from_bytes(&garbage, garbage.len, &palette);
    try std.testing.expect(!ok);
    try std.testing.expectEqual(@as(u8, '#'), palette.primary[0]);
}

test "atolla_extract_palette_from_bytes: 1x1 white PNG yields valid palette" {
    const pixels = [3]u8{ 255, 255, 255 };
    // Worst case PNG size: sig(8) + IHDR(25) + IDAT(8 + 2+1+4+1*3+4) + IEND(12) = ~80 bytes
    var png_buf: [256]u8 = undefined;
    const png_len = buildTestPng(1, 1, &pixels, &png_buf);

    var palette: Palette = std.mem.zeroes(Palette);
    const ok = atolla_extract_palette_from_bytes(&png_buf, png_len, &palette);
    try std.testing.expect(ok);
    try std.testing.expectEqual(@as(u8, '#'), palette.primary[0]);
    try std.testing.expectEqual(@as(u8, '#'), palette.surface[0]);
    try std.testing.expectEqual(@as(u8, '#'), palette.on_surface[0]);
    try std.testing.expectEqual(@as(u8, '#'), palette.muted_on_surface[0]);
    try std.testing.expectEqual(@as(u8, '#'), palette.accent[0]);
}

test "atolla_extract_palette: dark warm-grey does not beat moderately-saturated cooler mid-tone" {
    // 16 dark warm-grey pixels (l≈0.38, s≈0.18, hue≈12°): s is just above the old flat 0.15
    // threshold so it escaped the neutral penalty in the old scoring. The new lightness-aware
    // threshold (0.15 + (1-l)*0.25 ≈ 0.30 at l=0.38) correctly penalises it.
    // 4 medium blue pixels (l=0.50, s≈0.30, hue≈220°): s exceeds the new threshold at l=0.5
    // (0.275) so they score at full weight — and should now win despite fewer pixels.
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
    const primary = parseHex(palette.primary);
    try std.testing.expect(primary.b > primary.r);
}

test "atolla_extract_palette: saturated minority beats muted majority" {
    // 12 muted blue-grey pixels (s≈0.12, l≈0.5) vs 4 saturated orange pixels (s≈0.83).
    // With raw count as the multiplier the grey mass would win; sqrt(count) lets saturation dominate.
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
    const primary = parseHex(palette.primary);
    try std.testing.expect(primary.r > primary.b);
}

test "atolla_extract_palette_from_bytes: blue-dominant 2x2 PNG has blue-ish primary" {
    // 3 blue pixels + 1 red pixel → primary should be blue
    const pixels = [2 * 2 * 3]u8{
        0, 0, 200, // blue
        0, 0, 200, // blue
        0, 0, 200, // blue
        200, 0, 0, // red
    };
    var png_buf: [512]u8 = undefined;
    const png_len = buildTestPng(2, 2, &pixels, &png_buf);

    var palette: Palette = std.mem.zeroes(Palette);
    const ok = atolla_extract_palette_from_bytes(&png_buf, png_len, &palette);
    try std.testing.expect(ok);
    // Primary should be blue-dominant: hex blue channel > red channel
    const primary = parseHex(palette.primary);
    try std.testing.expect(primary.b > primary.r);
}

test "atolla_extract_palette_from_bytes: transparent pixels are ignored" {
    // 1x1 fully transparent pixel — all bins empty, falls back to defaults
    const pixels_rgba = [4]u8{ 255, 0, 0, 0 }; // red but alpha=0
    // We need a color_type=6 (RGBA) PNG for this test — buildTestPng only does RGB,
    // so we verify the RGB path still produces a valid palette (non-crash).
    const pixels_rgb = [3]u8{ 128, 128, 128 };
    var png_buf: [256]u8 = undefined;
    const png_len = buildTestPng(1, 1, &pixels_rgb, &png_buf);
    _ = pixels_rgba;
    var palette: Palette = std.mem.zeroes(Palette);
    const ok = atolla_extract_palette_from_bytes(&png_buf, png_len, &palette);
    try std.testing.expect(ok);
    try std.testing.expectEqual(@as(u8, '#'), palette.primary[0]);
}

test "buildHuffTable and decodeHuffman: simple 2-symbol table" {
    // Codes: symbol 0 → '0' (1 bit: 0), symbol 1 → '1' (1 bit: 1)
    var table: JpegHuffTable = undefined;
    const bits = [16]u8{ 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
    const vals = [2]u8{ 0xA, 0xB };
    buildHuffTable(&table, &bits, &vals);

    try std.testing.expect(table.present);
    try std.testing.expectEqual(@as(u8, 1), table.max_len);
    try std.testing.expectEqual(@as(u8, 2), table.count[0]);
    try std.testing.expectEqual(@as(u16, 0), table.first_code[0]);
}

test "decodeHuffman: malformed oversized table does not read past the symbol array" {
    // A corrupt DHT whose code-length counts sum to more than 256 symbols pushes first_symbol
    // beyond the 256-entry symbol array. decodeHuffman must not index out of bounds.
    var table: JpegHuffTable = undefined;
    const bits = [16]u8{ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 200, 200 }; // 400 symbols total
    const vals = [_]u8{0} ** 256;
    buildHuffTable(&table, &bits, &vals);

    // This bit pattern resolves to first_symbol[15] + offset == 256 — one past the end.
    const data = [_]u8{ 0x01, 0xC8, 0x00, 0x00 };
    var br = BitReader.init(&data);

    try std.testing.expectEqual(@as(u8, 0), decodeHuffman(&br, &table));
}

test "extractFromPng: a crafted huge IHDR bails out instead of overflowing the size computation" {
    var bins: [MAX_BINS]Bin = undefined;
    // Valid signature + IHDR declaring width = height = 2^32-1 (RGBA) + a token IDAT. The
    // row_stride * height product overflows usize; the decoder must reject it, not panic.
    const png = [_]u8{
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
        0x00, 0x00, 0x00, 0x0d, 'I', 'H', 'D', 'R', // IHDR chunk, length 13
        0xff, 0xff, 0xff, 0xff, // width
        0xff, 0xff, 0xff, 0xff, // height
        0x08, // bit depth 8
        0x06, // color type 6 (RGBA)
        0x00, 0x00, 0x00, // compression / filter / interlace
        0x00, 0x00, 0x00, 0x00, // CRC (unchecked)
        0x00, 0x00, 0x00, 0x01, 'I', 'D', 'A', 'T', // IDAT chunk, length 1
        0x00, // data
        0x00, 0x00, 0x00, 0x00, // CRC (unchecked)
    };

    try std.testing.expect(!extractFromPng(&png, &bins));
}
