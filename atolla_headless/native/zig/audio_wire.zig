const std = @import("std");

pub const version: u16 = 4;

pub const header_bytes = 1 + 4;

const format_bytes = 4 + 2 + 1 + 8;

const chunk_fields_bytes = 8 + format_bytes;

pub const chunk_header_bytes = header_bytes + chunk_fields_bytes;

const hello_payload_bytes = 2 + 2;

pub const key_bytes = 64;

pub const Key = [key_bytes]u8;

pub const Kind = enum(u8) {
    hello = 1,
    chunk = 2,
    flush = 3,
    key = 4,
};

pub const Sample = enum(u8) {
    s16 = 1,
    s24 = 2,
    s32 = 3,
    f32 = 4,

    pub fn bytes(self: Sample) usize {
        return switch (self) {
            .s16 => 2,
            .s24 => 3,
            .s32, .f32 => 4,
        };
    }
};

pub const Format = struct {
    rate: u32,
    channels: u16,
    sample: Sample,
    channel_mask: u64,

    pub fn bytesPerFrame(self: Format) usize {
        return @as(usize, self.channels) * self.sample.bytes();
    }

    pub fn bytesPerSecond(self: Format) u64 {
        return @as(u64, self.rate) * self.bytesPerFrame();
    }
};

pub const Hello = struct {
    version: u16,
    clock_port: u16,
};

pub const Chunk = struct {
    play_at_ns: u64,
    format: Format,
    bytes: []const u8,
};

pub const Frame = union(Kind) {
    hello: Hello,
    chunk: Chunk,
    flush: void,
    key: Key,
};

pub const ReadError = std.Io.Reader.Error || error{Malformed};

pub fn chunkHeader(buffer: *[chunk_header_bytes]u8, play_at_ns: u64, format: Format, bytes_len: usize) []const u8 {
    buffer[0] = @intFromEnum(Kind.chunk);
    std.mem.writeInt(u32, buffer[1..5], @intCast(chunk_fields_bytes + bytes_len), .big);
    std.mem.writeInt(u64, buffer[5..13], play_at_ns, .big);
    std.mem.writeInt(u32, buffer[13..17], format.rate, .big);
    std.mem.writeInt(u16, buffer[17..19], format.channels, .big);
    buffer[19] = @intFromEnum(format.sample);
    std.mem.writeInt(u64, buffer[20..28], format.channel_mask, .big);

    return buffer;
}

pub fn flushHeader(buffer: *[header_bytes]u8) []const u8 {
    buffer[0] = @intFromEnum(Kind.flush);
    std.mem.writeInt(u32, buffer[1..5], 0, .big);

    return buffer;
}

pub fn writeHello(writer: *std.Io.Writer, hello: Hello) std.Io.Writer.Error!void {
    try writer.writeByte(@intFromEnum(Kind.hello));
    try writer.writeInt(u32, hello_payload_bytes, .big);
    try writer.writeInt(u16, hello.version, .big);
    try writer.writeInt(u16, hello.clock_port, .big);
}

pub fn writeKey(writer: *std.Io.Writer, key: Key) std.Io.Writer.Error!void {
    try writer.writeByte(@intFromEnum(Kind.key));
    try writer.writeInt(u32, key_bytes, .big);
    try writer.writeAll(&key);
}

pub fn read(reader: *std.Io.Reader, buffer: []u8) ReadError!Frame {
    const kind = std.enums.fromInt(Kind, try reader.takeByte()) orelse return error.Malformed;
    const length = try reader.takeInt(u32, .big);

    switch (kind) {
        .hello => {
            if (length < 2) return error.Malformed;

            const given = try reader.takeInt(u16, .big);

            if (given != version) {
                try reader.discardAll(length - 2);

                return .{ .hello = .{ .version = given, .clock_port = 0 } };
            }

            if (length != hello_payload_bytes) return error.Malformed;

            return .{ .hello = .{ .version = given, .clock_port = try reader.takeInt(u16, .big) } };
        },
        .chunk => {
            if (length < chunk_fields_bytes or length - chunk_fields_bytes > buffer.len) return error.Malformed;

            const play_at_ns = try reader.takeInt(u64, .big);
            const format = try readFormat(reader);
            const bytes = buffer[0 .. length - chunk_fields_bytes];

            try reader.readSliceAll(bytes);

            return .{ .chunk = .{ .play_at_ns = play_at_ns, .format = format, .bytes = bytes } };
        },
        .flush => {
            if (length != 0) return error.Malformed;

            return .flush;
        },
        .key => {
            if (length != key_bytes) return error.Malformed;

            var key: Key = undefined;
            try reader.readSliceAll(&key);

            return .{ .key = key };
        },
    }
}

fn readFormat(reader: *std.Io.Reader) ReadError!Format {
    const rate = try reader.takeInt(u32, .big);
    const channels = try reader.takeInt(u16, .big);
    const sample = std.enums.fromInt(Sample, try reader.takeByte()) orelse return error.Malformed;
    const channel_mask = try reader.takeInt(u64, .big);

    if (rate == 0 or channels == 0) return error.Malformed;

    return .{ .rate = rate, .channels = channels, .sample = sample, .channel_mask = channel_mask };
}

const testing = std.testing;

const kitchen: Hello = .{ .version = version, .clock_port = 45890 };

const hi_res: Format = .{ .rate = 96000, .channels = 2, .sample = .s24, .channel_mask = 0x3 };

const surround: Format = .{ .rate = 48000, .channels = 6, .sample = .s16, .channel_mask = 0x3f };

test "audio_wire: a hello reads back as it was written" {
    var bytes: [64]u8 = undefined;
    var writer = std.Io.Writer.fixed(&bytes);

    try writeHello(&writer, kitchen);

    var reader = std.Io.Reader.fixed(writer.buffered());
    var buffer: [16]u8 = undefined;

    try testing.expectEqualDeep(Frame{ .hello = kitchen }, try read(&reader, &buffer));
}

test "audio_wire: a hello from another version reads back as that version" {
    var reader = std.Io.Reader.fixed(&.{ 1, 0, 0, 0, 12, 0, 2, 0xb3, 0x92, 0, 0, 0xbb, 0x80, 0, 2, 0, 16 });
    var buffer: [16]u8 = undefined;

    try testing.expectEqual(2, (try read(&reader, &buffer)).hello.version);
}

test "audio_wire: a chunk reads back with its time, its format and its bytes" {
    var header: [chunk_header_bytes]u8 = undefined;
    const audio = "atolla audio";

    var bytes: [64]u8 = undefined;
    var writer = std.Io.Writer.fixed(&bytes);

    try writer.writeAll(chunkHeader(&header, 81_236_567_890_123, surround, audio.len));
    try writer.writeAll(audio);

    var reader = std.Io.Reader.fixed(writer.buffered());
    var buffer: [16]u8 = undefined;
    const frame = try read(&reader, &buffer);

    try testing.expectEqual(81_236_567_890_123, frame.chunk.play_at_ns);
    try testing.expectEqual(surround, frame.chunk.format);
    try testing.expectEqualStrings(audio, frame.chunk.bytes);
}

test "audio_wire: reads frames one after another" {
    var header: [chunk_header_bytes]u8 = undefined;

    var bytes: [128]u8 = undefined;
    var writer = std.Io.Writer.fixed(&bytes);

    try writeHello(&writer, kitchen);
    try writer.writeAll(chunkHeader(&header, 1, hi_res, 2));
    try writer.writeAll("ab");
    try writer.writeAll(chunkHeader(&header, 2, surround, 2));
    try writer.writeAll("cd");

    var reader = std.Io.Reader.fixed(writer.buffered());
    var buffer: [16]u8 = undefined;

    try testing.expectEqual(Kind.hello, std.meta.activeTag(try read(&reader, &buffer)));

    const first = (try read(&reader, &buffer)).chunk;
    try testing.expectEqual(hi_res, first.format);
    try testing.expectEqualStrings("ab", first.bytes);

    const second = (try read(&reader, &buffer)).chunk;
    try testing.expectEqual(surround, second.format);
    try testing.expectEqualStrings("cd", second.bytes);
}

test "audio_wire: a flush reads back as a flush" {
    var header: [header_bytes]u8 = undefined;
    var reader = std.Io.Reader.fixed(flushHeader(&header));
    var buffer: [16]u8 = undefined;

    try testing.expectEqual(Frame.flush, try read(&reader, &buffer));
}

test "audio_wire: refuses a flush that carries a payload" {
    var reader = std.Io.Reader.fixed(&.{ 3, 0, 0, 0, 1, 0 });
    var buffer: [16]u8 = undefined;

    try testing.expectError(error.Malformed, read(&reader, &buffer));
}

test "audio_wire: refuses a chunk longer than the buffer it would be read into" {
    var header: [chunk_header_bytes]u8 = undefined;

    var bytes: [64]u8 = undefined;
    var writer = std.Io.Writer.fixed(&bytes);

    try writer.writeAll(chunkHeader(&header, 1, hi_res, 17));
    try writer.splatByteAll(0, 17);

    var reader = std.Io.Reader.fixed(writer.buffered());
    var buffer: [16]u8 = undefined;

    try testing.expectError(error.Malformed, read(&reader, &buffer));
}

test "audio_wire: refuses a chunk in a sample format it does not know" {
    var header: [chunk_header_bytes]u8 = undefined;
    _ = chunkHeader(&header, 1, hi_res, 0);
    header[19] = 9;

    var reader = std.Io.Reader.fixed(&header);
    var buffer: [16]u8 = undefined;

    try testing.expectError(error.Malformed, read(&reader, &buffer));
}

test "audio_wire: refuses a chunk whose format has no rate or no channels" {
    var header: [chunk_header_bytes]u8 = undefined;
    var buffer: [16]u8 = undefined;

    var reader = std.Io.Reader.fixed(chunkHeader(&header, 1, .{ .rate = 0, .channels = 2, .sample = .s16, .channel_mask = 0 }, 0));
    try testing.expectError(error.Malformed, read(&reader, &buffer));

    reader = std.Io.Reader.fixed(chunkHeader(&header, 1, .{ .rate = 48000, .channels = 0, .sample = .s16, .channel_mask = 0 }, 0));
    try testing.expectError(error.Malformed, read(&reader, &buffer));
}

test "audio_wire: refuses a frame of a kind it does not know" {
    var reader = std.Io.Reader.fixed(&.{ 9, 0, 0, 0, 0 });
    var buffer: [16]u8 = undefined;

    try testing.expectError(error.Malformed, read(&reader, &buffer));
}

test "audio_wire: refuses a hello whose length is not a hello's" {
    var reader = std.Io.Reader.fixed(&.{ 1, 0, 0, 0, 3, 0, 4, 0xb3 });
    var buffer: [16]u8 = undefined;

    try testing.expectError(error.Malformed, read(&reader, &buffer));
}

test "audio_wire: a key reads back as it was written" {
    const key: Key = ("0123456789abcdef" ** 4).*;

    var bytes: [128]u8 = undefined;
    var writer = std.Io.Writer.fixed(&bytes);

    try writeKey(&writer, key);

    var reader = std.Io.Reader.fixed(writer.buffered());
    var buffer: [16]u8 = undefined;

    try testing.expectEqualDeep(Frame{ .key = key }, try read(&reader, &buffer));
}

test "audio_wire: refuses a key whose length is not a key's" {
    var reader = std.Io.Reader.fixed(&.{ 4, 0, 0, 0, 2, 'a', 'b' });
    var buffer: [16]u8 = undefined;

    try testing.expectError(error.Malformed, read(&reader, &buffer));
}

test "audio_wire: refuses a chunk too short to carry its time and format" {
    var reader = std.Io.Reader.fixed(&.{ 2, 0, 0, 0, 4, 0, 0, 0, 1 });
    var buffer: [16]u8 = undefined;

    try testing.expectError(error.Malformed, read(&reader, &buffer));
}

test "audio_wire: a format knows how many bytes a frame and a second of it take" {
    try testing.expectEqual(6, hi_res.bytesPerFrame());
    try testing.expectEqual(576_000, hi_res.bytesPerSecond());
    try testing.expectEqual(12, surround.bytesPerFrame());
}
