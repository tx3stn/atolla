const std = @import("std");

pub const header_bytes = 44;

pub const tone_bytes = 8000 * 2 * 2 + header_bytes;

pub const Pcm = struct {
    rate: u32,
    bits: u16,
    channels: u16,
    frames: u32,

    pub fn dataBytes(self: Pcm) u32 {
        return self.frames * self.channels * (self.bits / 8);
    }

    pub fn fileBytes(self: Pcm) usize {
        return header_bytes + @as(usize, self.dataBytes());
    }
};

/// Two seconds of 440Hz at 8kHz mono. Long enough that a pipeline honouring timestamps has to wait
/// for it, short enough that a test waiting in real time is not the slowest thing in the suite.
pub fn tone(buffer: []u8) []const u8 {
    const pcm: Pcm = .{ .rate = 8000, .bits = 16, .channels = 1, .frames = 8000 * 2 };

    var writer = std.Io.Writer.fixed(buffer);

    writeHeader(&writer, pcm);

    for (0..pcm.frames) |index| {
        const phase = @as(f32, @floatFromInt(index)) * 440.0 * 2.0 * std.math.pi / @as(f32, @floatFromInt(pcm.rate));
        const sample: i16 = @intFromFloat(@sin(phase) * 8000.0);

        writer.writeInt(i16, sample, .little) catch unreachable;
    }

    return writer.buffered();
}

pub fn noise(buffer: []u8, pcm: Pcm) []const u8 {
    var writer = std.Io.Writer.fixed(buffer);

    writeHeader(&writer, pcm);

    var state: u32 = 0x9e3779b9;
    for (0..pcm.dataBytes()) |_| {
        state = state *% 1664525 +% 1013904223;
        writer.writeByte(@truncate(state >> 24)) catch unreachable;
    }

    return writer.buffered();
}

fn writeHeader(writer: *std.Io.Writer, pcm: Pcm) void {
    const block_align = pcm.channels * (pcm.bits / 8);

    writer.writeAll("RIFF") catch unreachable;
    writer.writeInt(u32, 36 + pcm.dataBytes(), .little) catch unreachable;
    writer.writeAll("WAVEfmt ") catch unreachable;
    writer.writeInt(u32, 16, .little) catch unreachable;
    writer.writeInt(u16, 1, .little) catch unreachable;
    writer.writeInt(u16, pcm.channels, .little) catch unreachable;
    writer.writeInt(u32, pcm.rate, .little) catch unreachable;
    writer.writeInt(u32, pcm.rate * block_align, .little) catch unreachable;
    writer.writeInt(u16, block_align, .little) catch unreachable;
    writer.writeInt(u16, pcm.bits, .little) catch unreachable;
    writer.writeAll("data") catch unreachable;
    writer.writeInt(u32, pcm.dataBytes(), .little) catch unreachable;
}

const testing = std.testing;

test "wav: writes a header a decoder can read" {
    var buffer: [tone_bytes]u8 = undefined;
    const bytes = tone(&buffer);

    try testing.expectEqual(tone_bytes, bytes.len);
    try testing.expectEqualStrings("RIFF", bytes[0..4]);
    try testing.expectEqualStrings("WAVE", bytes[8..12]);
    try testing.expectEqual(@as(u32, tone_bytes - header_bytes), std.mem.readInt(u32, bytes[40..44], .little));
}

test "wav: noise fills the data its header promises, the same every time" {
    const pcm: Pcm = .{ .rate = 96000, .bits = 24, .channels = 2, .frames = 4 };
    var first: [header_bytes + 24]u8 = undefined;
    var second: [header_bytes + 24]u8 = undefined;

    const bytes = noise(&first, pcm);

    try testing.expectEqual(pcm.fileBytes(), bytes.len);
    try testing.expectEqual(@as(u32, 24), std.mem.readInt(u32, bytes[40..44], .little));
    try testing.expectEqual(@as(u16, 6), std.mem.readInt(u16, bytes[32..34], .little));
    try testing.expectEqualSlices(u8, bytes, noise(&second, pcm));
}
