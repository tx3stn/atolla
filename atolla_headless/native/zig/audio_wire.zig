const std = @import("std");

pub const version: u16 = 2;

pub const header_bytes = 1 + 4;

pub const chunk_header_bytes = header_bytes + 8;

const hello_payload_bytes = 2 + 2 + 4 + 2 + 2;

pub const Kind = enum(u8) {
    hello = 1,
    chunk = 2,
    flush = 3,
};

pub const Hello = struct {
    version: u16,
    clock_port: u16,
    rate: u32,
    channels: u16,
    bits: u16,
};

pub const Chunk = struct {
    play_at_ns: u64,
    bytes: []const u8,
};

pub const Frame = union(Kind) {
    hello: Hello,
    chunk: Chunk,
    flush: void,
};

pub const ReadError = std.Io.Reader.Error || error{Malformed};

pub fn chunkHeader(buffer: *[chunk_header_bytes]u8, play_at_ns: u64, bytes_len: usize) []const u8 {
    buffer[0] = @intFromEnum(Kind.chunk);
    std.mem.writeInt(u32, buffer[1..5], @intCast(8 + bytes_len), .big);
    std.mem.writeInt(u64, buffer[5..13], play_at_ns, .big);

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
    try writer.writeInt(u32, hello.rate, .big);
    try writer.writeInt(u16, hello.channels, .big);
    try writer.writeInt(u16, hello.bits, .big);
}

pub fn read(reader: *std.Io.Reader, buffer: []u8) ReadError!Frame {
    const kind = std.enums.fromInt(Kind, try reader.takeByte()) orelse return error.Malformed;
    const length = try reader.takeInt(u32, .big);

    switch (kind) {
        .hello => {
            if (length != hello_payload_bytes) return error.Malformed;

            return .{ .hello = .{
                .version = try reader.takeInt(u16, .big),
                .clock_port = try reader.takeInt(u16, .big),
                .rate = try reader.takeInt(u32, .big),
                .channels = try reader.takeInt(u16, .big),
                .bits = try reader.takeInt(u16, .big),
            } };
        },
        .chunk => {
            if (length < 8 or length - 8 > buffer.len) return error.Malformed;

            const play_at_ns = try reader.takeInt(u64, .big);
            const bytes = buffer[0 .. length - 8];

            try reader.readSliceAll(bytes);

            return .{ .chunk = .{ .play_at_ns = play_at_ns, .bytes = bytes } };
        },
        .flush => {
            if (length != 0) return error.Malformed;

            return .flush;
        },
    }
}

const testing = std.testing;

const kitchen: Hello = .{ .version = version, .clock_port = 45890, .rate = 48000, .channels = 2, .bits = 16 };

test "audio_wire: a hello reads back as it was written" {
    var bytes: [64]u8 = undefined;
    var writer = std.Io.Writer.fixed(&bytes);

    try writeHello(&writer, kitchen);

    var reader = std.Io.Reader.fixed(writer.buffered());
    var buffer: [16]u8 = undefined;

    try testing.expectEqualDeep(Frame{ .hello = kitchen }, try read(&reader, &buffer));
}

test "audio_wire: a chunk reads back with its time and its bytes" {
    var header: [chunk_header_bytes]u8 = undefined;
    const audio = "atolla audio";

    var bytes: [64]u8 = undefined;
    var writer = std.Io.Writer.fixed(&bytes);

    try writer.writeAll(chunkHeader(&header, 81_236_567_890_123, audio.len));
    try writer.writeAll(audio);

    var reader = std.Io.Reader.fixed(writer.buffered());
    var buffer: [16]u8 = undefined;
    const frame = try read(&reader, &buffer);

    try testing.expectEqual(81_236_567_890_123, frame.chunk.play_at_ns);
    try testing.expectEqualStrings(audio, frame.chunk.bytes);
}

test "audio_wire: reads frames one after another" {
    var header: [chunk_header_bytes]u8 = undefined;

    var bytes: [64]u8 = undefined;
    var writer = std.Io.Writer.fixed(&bytes);

    try writeHello(&writer, kitchen);
    try writer.writeAll(chunkHeader(&header, 1, 2));
    try writer.writeAll("ab");
    try writer.writeAll(chunkHeader(&header, 2, 2));
    try writer.writeAll("cd");

    var reader = std.Io.Reader.fixed(writer.buffered());
    var buffer: [16]u8 = undefined;

    try testing.expectEqual(Kind.hello, std.meta.activeTag(try read(&reader, &buffer)));
    try testing.expectEqualStrings("ab", (try read(&reader, &buffer)).chunk.bytes);
    try testing.expectEqualStrings("cd", (try read(&reader, &buffer)).chunk.bytes);
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

    try writer.writeAll(chunkHeader(&header, 1, 17));
    try writer.splatByteAll(0, 17);

    var reader = std.Io.Reader.fixed(writer.buffered());
    var buffer: [16]u8 = undefined;

    try testing.expectError(error.Malformed, read(&reader, &buffer));
}

test "audio_wire: refuses a frame of a kind it does not know" {
    var reader = std.Io.Reader.fixed(&.{ 9, 0, 0, 0, 0 });
    var buffer: [16]u8 = undefined;

    try testing.expectError(error.Malformed, read(&reader, &buffer));
}

test "audio_wire: refuses a hello whose length is not a hello's" {
    var reader = std.Io.Reader.fixed(&.{ 1, 0, 0, 0, 4, 0, 1, 0xb3, 0x92 });
    var buffer: [16]u8 = undefined;

    try testing.expectError(error.Malformed, read(&reader, &buffer));
}

test "audio_wire: refuses a chunk too short to carry its time" {
    var reader = std.Io.Reader.fixed(&.{ 2, 0, 0, 0, 4, 0, 0, 0, 1 });
    var buffer: [16]u8 = undefined;

    try testing.expectError(error.Malformed, read(&reader, &buffer));
}
