const std = @import("std");

pub const tone_bytes = 8000 * 2 * 2 + 44;

/// Two seconds of 440Hz at 8kHz mono. Long enough that a pipeline honouring timestamps has to wait
/// for it, short enough that a test waiting in real time is not the slowest thing in the suite.
pub fn tone(buffer: []u8) []const u8 {
    const rate = 8000;
    const samples = rate * 2;
    const data_bytes: u32 = samples * 2;

    var writer = std.Io.Writer.fixed(buffer);

    writer.writeAll("RIFF") catch unreachable;
    writer.writeInt(u32, 36 + data_bytes, .little) catch unreachable;
    writer.writeAll("WAVEfmt ") catch unreachable;
    writer.writeInt(u32, 16, .little) catch unreachable;
    writer.writeInt(u16, 1, .little) catch unreachable;
    writer.writeInt(u16, 1, .little) catch unreachable;
    writer.writeInt(u32, rate, .little) catch unreachable;
    writer.writeInt(u32, rate * 2, .little) catch unreachable;
    writer.writeInt(u16, 2, .little) catch unreachable;
    writer.writeInt(u16, 16, .little) catch unreachable;
    writer.writeAll("data") catch unreachable;
    writer.writeInt(u32, data_bytes, .little) catch unreachable;

    for (0..samples) |index| {
        const phase = @as(f32, @floatFromInt(index)) * 440.0 * 2.0 * std.math.pi / rate;
        const sample: i16 = @intFromFloat(@sin(phase) * 8000.0);

        writer.writeInt(i16, sample, .little) catch unreachable;
    }

    return writer.buffered();
}

const testing = std.testing;

test "wav: writes a header a decoder can read" {
    var buffer: [tone_bytes]u8 = undefined;
    const bytes = tone(&buffer);

    try testing.expectEqual(tone_bytes, bytes.len);
    try testing.expectEqualStrings("RIFF", bytes[0..4]);
    try testing.expectEqualStrings("WAVE", bytes[8..12]);
    try testing.expectEqual(@as(u32, tone_bytes - 44), std.mem.readInt(u32, bytes[40..44], .little));
}
