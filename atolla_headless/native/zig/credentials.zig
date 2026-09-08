const std = @import("std");

pub const digits = 8;

pub const Code = [digits]u8;

const max_file_bytes = 64;

pub fn read(io: std.Io, path: []const u8) ?Code {
    var buffer: [max_file_bytes]u8 = undefined;
    const bytes = std.Io.Dir.cwd().readFile(io, path, &buffer) catch return null;

    if (bytes.len == buffer.len) return null;

    return normalized(bytes);
}

pub fn matches(submitted: []const u8, stored: Code) bool {
    const code = normalized(submitted) orelse return false;

    return std.crypto.timing_safe.eql(Code, code, stored);
}

fn normalized(text: []const u8) ?Code {
    var code: Code = undefined;
    var length: usize = 0;

    for (text) |byte| {
        if (std.ascii.isWhitespace(byte)) continue;
        if (!std.ascii.isDigit(byte)) return null;
        if (length == digits) return null;

        code[length] = byte;
        length += 1;
    }

    return if (length == digits) code else null;
}

const testing = std.testing;

const provisioned: Code = "19524002".*;

fn fixture(tmp: *testing.TmpDir, buffer: []u8, contents: []const u8) ![]const u8 {
    try tmp.dir.writeFile(testing.io, .{ .sub_path = "pairing", .data = contents });

    return std.fmt.bufPrint(buffer, ".zig-cache/tmp/{s}/pairing", .{tmp.sub_path});
}

fn readFixture(contents: []const u8) !?Code {
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();

    var buffer: [std.Io.Dir.max_path_bytes]u8 = undefined;

    return read(testing.io, try fixture(&tmp, &buffer, contents));
}

test "credentials: reads the digits a file holds" {
    const code = (try readFixture("19524002")).?;

    try testing.expectEqualStrings("19524002", &code);
}

test "credentials: reads a file written with a trailing newline" {
    const code = (try readFixture("19524002\n")).?;

    try testing.expectEqualStrings("19524002", &code);
}

test "credentials: reads a file provisioned with the code spaced out" {
    const code = (try readFixture(" 1952 4002 \n")).?;

    try testing.expectEqualStrings("19524002", &code);
}

test "credentials: refuses a file holding the wrong number of digits" {
    try testing.expectEqual(null, try readFixture("1952400"));
    try testing.expectEqual(null, try readFixture("195240021"));
}

test "credentials: refuses a file holding something other than digits" {
    try testing.expectEqual(null, try readFixture("password"));
    try testing.expectEqual(null, try readFixture("1952400x"));
}

test "credentials: refuses a file with no code in it" {
    try testing.expectEqual(null, try readFixture(""));
    try testing.expectEqual(null, try readFixture("\n\n"));
}

test "credentials: refuses a file too large to be a code" {
    try testing.expectEqual(null, try readFixture("x" ** (max_file_bytes * 2)));
}

test "credentials: a file that is not there is not an error" {
    try testing.expectEqual(null, read(testing.io, "/nonexistent/atolla/pairing"));
}

test "credentials: a directory where the file should be is not an error" {
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();

    var buffer: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const path = try std.fmt.bufPrint(&buffer, ".zig-cache/tmp/{s}", .{tmp.sub_path});

    try testing.expectEqual(null, read(testing.io, path));
}

test "credentials: accepts the code exactly as it is stored" {
    try testing.expect(matches("19524002", provisioned));
}

test "credentials: accepts the spaced form the app displays" {
    try testing.expect(matches("1952 4002", provisioned));
    try testing.expect(matches(" 19524002\n", provisioned));
}

test "credentials: refuses a code that is merely close" {
    try testing.expect(!matches("19524003", provisioned));
    try testing.expect(!matches("29524002", provisioned));
}

test "credentials: refuses a code of the wrong length" {
    try testing.expect(!matches("1952400", provisioned));
    try testing.expect(!matches("195240020", provisioned));
    try testing.expect(!matches("", provisioned));
}

test "credentials: refuses a submission that is only whitespace" {
    try testing.expect(!matches("        ", provisioned));
}
