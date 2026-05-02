// Waveform mask image generator.
// Accepts interleaved float32 PCM samples and produces a greyscale alpha-mask
// PNG representing the audio waveform shape. The PNG uses RGBA encoding with
// white opaque pixels where the waveform fills and transparent pixels elsewhere;
// the caller applies tint at render time to colour the played/unplayed regions.
//
// Algorithm:
//   1. Divide the audio into `width` equal time windows.
//   2. Compute peak amplitude per window across all channels.
//   3. Apply sqrt compression so quiet sections remain visible.
//   4. Render a symmetric bar (centred vertically) for each column.
//   5. Encode as a valid PNG using zlib stored blocks (no compression).
//      Stored blocks produce a larger file but require no compression library.

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
    // Sample at most 32 frames per column — sufficient for accurate peak detection.
    const max_samples_per_col: u64 = 32;
    for (0..width) |col| {
        const start: u64 = @as(u64, col) * @as(u64, frames) / @as(u64, width);
        const end: u64 = (@as(u64, col) + 1) * @as(u64, frames) / @as(u64, width);
        const window = end - start;
        const stride: u64 = if (window > max_samples_per_col) window / max_samples_per_col else 1;
        var peak: f32 = 0.0;
        var frame = start;
        while (frame < end) : (frame += stride) {
            for (0..channel_count) |ch| {
                const s = @abs(samples[@as(usize, @intCast(frame)) * channel_count + ch]);
                if (s > peak) peak = s;
            }
        }
        amps[col] = peak;
    }
}

// Normalise to [0, 1] with sqrt loudness compression.
// Silent audio becomes a flat 50%-height line so the bar is always visible.
fn normalizeAmplitudes(amps: [*]f32, width: u32) void {
    var max: f32 = 0.0;
    for (0..width) |i| if (amps[i] > max) {
        max = amps[i];
    };
    if (max < 1e-6) {
        for (0..width) |i| amps[i] = 0.5;
        return;
    }
    for (0..width) |i| amps[i] = @sqrt(amps[i] / max);
}

// ---------------------------------------------------------------------------
// Pixel rendering (RGBA, symmetric waveform centred vertically)
// ---------------------------------------------------------------------------

fn renderColumn(
    pixels: [*]u8,
    x: usize,
    width: usize,
    height: usize,
    amp: f32,
) void {
    const min_amp: f32 = 0.02;
    const effective = @max(amp, min_amp);
    const center: f32 = @as(f32, @floatFromInt(height)) / 2.0;
    const half_px = effective * center;
    const y_lo: usize = @intFromFloat(@max(0.0, center - half_px));
    const y_hi: usize = @intFromFloat(@min(@as(f32, @floatFromInt(height - 1)), center + half_px));
    for (y_lo..y_hi + 1) |y| {
        const idx = (y * width + x) * 4;
        pixels[idx + 0] = 255; // R (tint replaces the colour at render time)
        pixels[idx + 1] = 255; // G
        pixels[idx + 2] = 255; // B
        pixels[idx + 3] = 255; // A (opaque)
    }
}

// ---------------------------------------------------------------------------
// PNG helpers
// ---------------------------------------------------------------------------

fn writeU32BE(buf: [*]u8, offset: *usize, v: u32) void {
    buf[offset.*] = @intCast((v >> 24) & 0xff);
    buf[offset.* + 1] = @intCast((v >> 16) & 0xff);
    buf[offset.* + 2] = @intCast((v >> 8) & 0xff);
    buf[offset.* + 3] = @intCast(v & 0xff);
    offset.* += 4;
}

fn writeU16LE(buf: [*]u8, offset: *usize, v: u16) void {
    buf[offset.*] = @intCast(v & 0xff);
    buf[offset.* + 1] = @intCast((v >> 8) & 0xff);
    offset.* += 2;
}

fn writeBytes(buf: [*]u8, offset: *usize, data: []const u8) void {
    @memcpy(buf[offset.*..][0..data.len], data);
    offset.* += data.len;
}

// Write a PNG chunk: length(4BE) + type(4) + data + CRC32(4BE).
fn writeChunk(buf: [*]u8, offset: *usize, chunk_type: *const [4]u8, data: []const u8) void {
    writeU32BE(buf, offset, @intCast(data.len));
    writeBytes(buf, offset, chunk_type);
    writeBytes(buf, offset, data);
    var crc = std.hash.Crc32.init();
    crc.update(chunk_type);
    crc.update(data);
    writeU32BE(buf, offset, crc.final());
}

// Compute the output size of a zlib stored-blocks stream for `data_len` bytes.
fn zlibStoredSize(data_len: usize) usize {
    // zlib header (2B) + n_blocks × 5B header + data + Adler-32 footer (4B)
    const n_blocks: usize = if (data_len == 0) 1 else (data_len + 65534) / 65535;
    return 2 + n_blocks * 5 + data_len + 4;
}

// Write a zlib stored-blocks stream for `data` into `buf` starting at `offset`.
fn writeZlibStored(buf: [*]u8, offset: *usize, data: []const u8) void {
    // zlib header: CMF=0x78 (CM=8, CINFO=7), FLG=0x01
    // (CMF*256 + FLG) % 31 == 0: 120*256+1 = 30721 = 991*31 ✓
    buf[offset.*] = 0x78;
    buf[offset.* + 1] = 0x01;
    offset.* += 2;

    const max_block: usize = 65535;
    var pos: usize = 0;
    while (pos < data.len) {
        const chunk_end = @min(pos + max_block, data.len);
        const chunk = data[pos..chunk_end];
        pos = chunk_end;
        buf[offset.*] = if (pos >= data.len) 0x01 else 0x00; // BFINAL + BTYPE=00
        offset.* += 1;
        const len: u16 = @intCast(chunk.len);
        writeU16LE(buf, offset, len);
        writeU16LE(buf, offset, ~len);
        writeBytes(buf, offset, chunk);
    }
    if (data.len == 0) {
        // one empty stored block
        buf[offset.*] = 0x01;
        offset.* += 1;
        writeU16LE(buf, offset, 0);
        writeU16LE(buf, offset, 0xffff);
    }

    // Adler-32 checksum (big-endian)
    var adler: std.hash.Adler32 = .{};
    adler.update(data);
    writeU32BE(buf, offset, adler.adler);
}

// Compute the total size of the PNG in bytes.
fn pngSize(width: u32, height: u32) usize {
    const row_stride = @as(usize, width) * 4;
    const raw_len = @as(usize, height) * (1 + row_stride); // filter byte + RGBA row
    const idat_len = zlibStoredSize(raw_len);
    return 8 + // PNG signature
        25 + // IHDR chunk (4+4+13+4)
        (4 + 4 + idat_len + 4) + // IDAT chunk
        12; // IEND chunk (4+4+0+4)
}

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

// Generates a greyscale alpha-mask PNG from pre-computed per-column amplitudes.
//   amps:      normalised amplitude per column, float32 in [0.0, 1.0], length = width
//   width:     number of columns (must equal length of amps)
//   height:    output image height in pixels
//   out_len:   receives the byte count of the returned buffer
// Returns a malloc'd byte buffer containing the PNG, or null on failure.
// The caller must pass the returned pointer to free() when done.
export fn atolla_render_waveform_from_amps(
    amps_in: [*]const f32,
    width: u32,
    height: u32,
    out_len: *u32,
) ?[*]u8 {
    out_len.* = 0;
    if (width == 0 or height == 0) return null;

    const amps_ptr = malloc(@as(usize, width) * @sizeOf(f32)) orelse return null;
    defer free(amps_ptr);
    const amps: [*]f32 = @ptrCast(@alignCast(amps_ptr));
    @memcpy(amps[0..width], amps_in[0..width]);
    normalizeAmplitudes(amps, width);

    const pixel_bytes = @as(usize, width) * @as(usize, height) * 4;
    const pixels_ptr = malloc(pixel_bytes) orelse return null;
    defer free(pixels_ptr);
    const pixels: [*]u8 = @ptrCast(pixels_ptr);
    @memset(pixels[0..pixel_bytes], 0);
    for (0..width) |x| renderColumn(pixels, x, width, height, amps[x]);

    const png_len = pngSize(width, height);
    const png_ptr = malloc(png_len) orelse return null;
    const png: [*]u8 = @ptrCast(png_ptr);
    var offset: usize = 0;

    writeBytes(png, &offset, "\x89PNG\r\n\x1a\n");

    var ihdr: [13]u8 = undefined;
    std.mem.writeInt(u32, ihdr[0..4], width, .big);
    std.mem.writeInt(u32, ihdr[4..8], height, .big);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;
    writeChunk(png, &offset, "IHDR", &ihdr);

    {
        const row_stride = @as(usize, width) * 4;
        const raw_len = @as(usize, height) * (1 + row_stride);
        const raw_ptr = malloc(raw_len) orelse {
            free(png_ptr);
            return null;
        };
        defer free(raw_ptr);
        const raw: [*]u8 = @ptrCast(raw_ptr);
        var ri: usize = 0;
        for (0..height) |y| {
            raw[ri] = 0;
            ri += 1;
            @memcpy(raw[ri..][0..row_stride], pixels[y * row_stride ..][0..row_stride]);
            ri += row_stride;
        }

        const idat_data_len = zlibStoredSize(raw_len);
        writeU32BE(png, &offset, @intCast(idat_data_len));
        writeBytes(png, &offset, "IDAT");
        const idat_start = offset;
        writeZlibStored(png, &offset, raw[0..raw_len]);
        var crc = std.hash.Crc32.init();
        crc.update("IDAT");
        crc.update(png[idat_start..offset]);
        writeU32BE(png, &offset, crc.final());
    }

    writeChunk(png, &offset, "IEND", &[_]u8{});

    out_len.* = @intCast(offset);
    return png;
}

// Generates a greyscale alpha-mask PNG from interleaved float32 PCM samples.
//   samples:       interleaved PCM, float32 in [-1.0, 1.0]
//   sample_count:  total number of floats (frames × channel_count)
//   channel_count: number of audio channels
//   width:         output image width (waveform columns)
//   height:        output image height in pixels
//   out_len:       receives the byte count of the returned buffer
// Returns a malloc'd byte buffer containing the PNG, or null on failure.
// The caller must pass the returned pointer to free() when done.
export fn atolla_generate_waveform(
    samples: [*]const f32,
    sample_count: u32,
    channel_count: u32,
    width: u32,
    height: u32,
    out_len: *u32,
) ?[*]u8 {
    out_len.* = 0;
    if (sample_count == 0 or channel_count == 0 or width == 0 or height == 0) return null;
    const frames = sample_count / channel_count;
    if (frames == 0) return null;

    // --- Compute amplitudes ---
    const amps_ptr = malloc(@as(usize, width) * @sizeOf(f32)) orelse return null;
    defer free(amps_ptr);
    const amps: [*]f32 = @ptrCast(@alignCast(amps_ptr));
    computeAmplitudes(samples, frames, channel_count, amps, width);
    normalizeAmplitudes(amps, width);

    // --- Render pixel buffer (RGBA, all zeroed then filled) ---
    const pixel_bytes = @as(usize, width) * @as(usize, height) * 4;
    const pixels_ptr = malloc(pixel_bytes) orelse return null;
    defer free(pixels_ptr);
    const pixels: [*]u8 = @ptrCast(pixels_ptr);
    @memset(pixels[0..pixel_bytes], 0);
    for (0..width) |x| renderColumn(pixels, x, width, height, amps[x]);

    // --- Encode PNG into a single pre-sized buffer ---
    const png_len = pngSize(width, height);
    const png_ptr = malloc(png_len) orelse return null;
    const png: [*]u8 = @ptrCast(png_ptr);
    var offset: usize = 0;

    // PNG signature
    writeBytes(png, &offset, "\x89PNG\r\n\x1a\n");

    // IHDR chunk (25 bytes)
    var ihdr: [13]u8 = undefined;
    std.mem.writeInt(u32, ihdr[0..4], width, .big);
    std.mem.writeInt(u32, ihdr[4..8], height, .big);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // colour type: RGBA
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter method
    ihdr[12] = 0; // interlace: none
    writeChunk(png, &offset, "IHDR", &ihdr);

    // IDAT chunk: build raw row data then zlib-encode inline
    {
        const row_stride = @as(usize, width) * 4;
        const raw_len = @as(usize, height) * (1 + row_stride);
        const raw_ptr = malloc(raw_len) orelse {
            free(png_ptr);
            return null;
        };
        defer free(raw_ptr);
        const raw: [*]u8 = @ptrCast(raw_ptr);
        var ri: usize = 0;
        for (0..height) |y| {
            raw[ri] = 0; // filter: None
            ri += 1;
            @memcpy(raw[ri..][0..row_stride], pixels[y * row_stride ..][0..row_stride]);
            ri += row_stride;
        }

        const idat_data_len = zlibStoredSize(raw_len);
        // Write chunk header manually so we can write compressed data inline.
        writeU32BE(png, &offset, @intCast(idat_data_len));
        writeBytes(png, &offset, "IDAT");
        const idat_start = offset;
        writeZlibStored(png, &offset, raw[0..raw_len]);
        // CRC over "IDAT" + compressed data
        var crc = std.hash.Crc32.init();
        crc.update("IDAT");
        crc.update(png[idat_start..offset]);
        writeU32BE(png, &offset, crc.final());
    }

    // IEND chunk (12 bytes)
    writeChunk(png, &offset, "IEND", &[_]u8{});

    out_len.* = @intCast(offset);
    return png;
}
