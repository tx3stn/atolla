const std = @import("std");

pub const digits = 8;

pub const Code = [digits]u8;

pub const token_digits = 64;

pub const Token = [token_digits]u8;

/// What `addController` keeps, so a file this parser refuses is one nothing here wrote.
pub const max_controllers = 32;

const max_file_bytes = 64;

/// A record is a 64-character token, a 64-byte id, a 128-byte name and a timestamp, plus the JSON
/// around them. Doubling that leaves room for a name in a script that costs several bytes a
/// character without letting the file reach a size a Pi Zero would feel.
const max_controller_bytes = 512;

const max_controllers_bytes = max_controllers * max_controller_bytes;

/// `std.json` needs an allocator for the record slice and its own scanner stack. Both are bounded
/// by the cap above, and the buffers are per call rather than shared: 32 connection threads reach
/// this concurrently, so one buffer between them would be a data race.
const parse_bytes = 8 * 1024;

pub const SetPathError = error{PathTooLong};

pub const authorization_header = "authorization";

const scheme = "bearer";

const Held = struct {
    token: []const u8,
};

/// The controllers file is not one route's business, unlike `/pair`'s code, so the path lives with
/// the reader rather than with a route.
var controllers_path: [std.Io.Dir.max_path_bytes]u8 = undefined;
var controllers_path_len: usize = 0;

pub fn setControllersPath(path: []const u8) SetPathError!void {
    if (path.len > controllers_path.len) return error.PathTooLong;

    @memcpy(controllers_path[0..path.len], path);
    controllers_path_len = path.len;
}

/// Whether a request presents a token this daemon has minted. The file is read per request, so
/// `atolla pair --reset` takes effect without a restart.
pub fn authorized(io: std.Io, request: *const std.http.Server.Request) bool {
    var headers = request.iterateHeaders();

    while (headers.next()) |header| {
        if (!std.ascii.eqlIgnoreCase(header.name, authorization_header)) continue;

        const token = bearer(header.value) orelse return false;

        return authorizes(io, controllers_path[0..controllers_path_len], token);
    }

    return false;
}

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

/// Whether the controllers file holds this token. Every way of failing to read or parse the file
/// refuses it, so a credential store that has been corrupted locks the daemon rather than opening
/// it: `atolla pair --reset` is the way back.
pub fn authorizes(io: std.Io, path: []const u8, token: Token) bool {
    var contents: [max_controllers_bytes]u8 = undefined;
    const bytes = std.Io.Dir.cwd().readFile(io, path, &contents) catch return false;

    if (bytes.len == contents.len) return false;

    var scratch: [parse_bytes]u8 = undefined;
    var fixed: std.heap.FixedBufferAllocator = .init(&scratch);

    const held = std.json.parseFromSliceLeaky(
        []const Held,
        fixed.allocator(),
        bytes,
        .{ .ignore_unknown_fields = true },
    ) catch return false;

    if (held.len > max_controllers) return false;

    for (held) |controller| {
        if (controller.token.len != token_digits) continue;
        if (std.crypto.timing_safe.eql(Token, controller.token[0..token_digits].*, token)) return true;
    }

    return false;
}

/// The scheme is matched case-insensitively per RFC 7235. The shape is enforced here, so a header
/// that cannot be a token is refused without reading the credential store at all, and only
/// lowercase hex passes: `randomHex` mints the token and nothing ever retypes it.
pub fn bearer(header: []const u8) ?Token {
    const trimmed = std.mem.trim(u8, header, &std.ascii.whitespace);

    if (trimmed.len <= scheme.len) return null;
    if (!std.ascii.eqlIgnoreCase(trimmed[0..scheme.len], scheme)) return null;
    if (!std.ascii.isWhitespace(trimmed[scheme.len])) return null;

    const presented = std.mem.trim(u8, trimmed[scheme.len..], &std.ascii.whitespace);

    if (presented.len != token_digits) return null;

    var token: Token = undefined;

    for (presented, 0..) |byte, index| {
        if (!std.ascii.isDigit(byte) and (byte < 'a' or byte > 'f')) return null;

        token[index] = byte;
    }

    return token;
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

const minted_text = "7c1e5a9b3d8f204617ca0be9352d8f7461a0c3d95e28b7f4016cad3928bf5e7d";

const minted: Token = minted_text.*;

const unknown: Token = "0000000000000000000000000000000000000000000000000000000000000000".*;

fn fixture(tmp: *testing.TmpDir, buffer: []u8, name: []const u8, contents: []const u8) ![]const u8 {
    try tmp.dir.writeFile(testing.io, .{ .sub_path = name, .data = contents });

    return std.fmt.bufPrint(buffer, ".zig-cache/tmp/{s}/{s}", .{ tmp.sub_path, name });
}

fn readFixture(contents: []const u8) !?Code {
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();

    var buffer: [std.Io.Dir.max_path_bytes]u8 = undefined;

    return read(testing.io, try fixture(&tmp, &buffer, "pairing", contents));
}

fn authorizesFixture(contents: []const u8, token: Token) !bool {
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();

    var buffer: [std.Io.Dir.max_path_bytes]u8 = undefined;

    return authorizes(testing.io, try fixture(&tmp, &buffer, "controllers", contents), token);
}

/// The shape `addController` writes, so a fixture cannot drift from the file the daemon produces.
/// Every record but the last holds a token of its own, minted from its index: decimal digits are
/// lowercase hex, so the filler is the shape of a real token while never being one a test presents.
fn controllers(buffer: []u8, count: usize, last: Token) ![]const u8 {
    var writer = std.Io.Writer.fixed(buffer);

    try writer.writeByte('[');

    for (0..count) |index| {
        if (index != 0) try writer.writeByte(',');

        var filler: Token = undefined;
        _ = try std.fmt.bufPrint(&filler, "{d:0>64}", .{index + 1});

        const token = if (index + 1 == count) last else filler;

        try writer.print(
            \\{{"controllerId":"phone-{d}","controllerName":"pixel {d}","pairedAt":17{d:0>11},"token":"{s}"}}
        ,
            .{ index, index, index, &token },
        );
    }

    try writer.writeByte(']');

    return writer.buffered();
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

test "credentials: authorizes a token the controllers file holds" {
    var buffer: [max_controllers_bytes]u8 = undefined;

    try testing.expect(try authorizesFixture(try controllers(&buffer, 1, minted), minted));
}

test "credentials: authorizes a token held by any record, not just the first" {
    var buffer: [max_controllers_bytes]u8 = undefined;

    try testing.expect(try authorizesFixture(try controllers(&buffer, max_controllers, minted), minted));
}

test "credentials: refuses a token the controllers file does not hold" {
    var buffer: [max_controllers_bytes]u8 = undefined;

    try testing.expect(!try authorizesFixture(try controllers(&buffer, 4, minted), unknown));
}

test "credentials: refuses every token when nothing is paired" {
    try testing.expect(!try authorizesFixture("[]", minted));
}

test "credentials: refuses a token when the file is not there" {
    try testing.expect(!authorizes(testing.io, "/nonexistent/atolla/controllers", minted));
}

test "credentials: refuses a token when a directory is where the file should be" {
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();

    var buffer: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const path = try std.fmt.bufPrint(&buffer, ".zig-cache/tmp/{s}", .{tmp.sub_path});

    try testing.expect(!authorizes(testing.io, path, minted));
}

test "credentials: refuses a token when the file is not json" {
    try testing.expect(!try authorizesFixture("", minted));
    try testing.expect(!try authorizesFixture("[{", minted));
    try testing.expect(!try authorizesFixture("not json at all", minted));
}

test "credentials: refuses a token when the file is not an array of records" {
    try testing.expect(!try authorizesFixture("{}", minted));
    try testing.expect(!try authorizesFixture("[\"token\"]", minted));
}

test "credentials: refuses a record carrying no token" {
    try testing.expect(!try authorizesFixture("[{\"controllerId\":\"phone-1\"}]", minted));
}

test "credentials: refuses a token whose record holds one of the wrong length" {
    try testing.expect(!try authorizesFixture("[{\"token\":\"7c1e5a9b\"}]", minted));
}

test "credentials: refuses a file holding more controllers than the cap" {
    var buffer: [max_controllers_bytes * 2]u8 = undefined;
    const over = try controllers(&buffer, max_controllers + 1, minted);

    try testing.expect(!try authorizesFixture(over, minted));
}

test "credentials: refuses a file too large to be the controllers list" {
    var buffer: [max_controllers_bytes * 2]u8 = undefined;
    @memset(&buffer, ' ');
    buffer[0] = '[';
    buffer[buffer.len - 1] = ']';

    try testing.expect(!try authorizesFixture(&buffer, minted));
}

test "credentials: takes the token out of an authorization header" {
    try testing.expectEqual(minted, bearer("Bearer " ++ minted_text));
}

test "credentials: matches the authorization scheme whatever its case" {
    try testing.expectEqual(minted, bearer("bearer " ++ minted_text));
    try testing.expectEqual(minted, bearer("BEARER " ++ minted_text));
    try testing.expectEqual(minted, bearer("BeArEr " ++ minted_text));
}

test "credentials: tolerates whitespace around the authorization value" {
    try testing.expectEqual(minted, bearer("  Bearer   " ++ minted_text ++ " \t"));
}

test "credentials: refuses an authorization header naming another scheme" {
    try testing.expectEqual(null, bearer("Basic " ++ minted_text));
    try testing.expectEqual(null, bearer("MediaBrowser " ++ minted_text));
}

test "credentials: refuses an authorization header with no scheme" {
    try testing.expectEqual(null, bearer(minted_text));
    try testing.expectEqual(null, bearer("Bearer" ++ minted_text));
}

test "credentials: refuses an authorization header carrying no token" {
    try testing.expectEqual(null, bearer(""));
    try testing.expectEqual(null, bearer("Bearer"));
    try testing.expectEqual(null, bearer("Bearer "));
}

test "credentials: refuses a token of the wrong length" {
    try testing.expectEqual(null, bearer("Bearer 7c1e5a9b"));
    try testing.expectEqual(null, bearer("Bearer " ++ minted_text ++ "0"));
}

test "credentials: refuses a token that is not lowercase hex" {
    try testing.expectEqual(null, bearer("Bearer 7C1E5A9B3D8F204617CA0BE9352D8F7461A0C3D95E28B7F4016CAD3928BF5E7D"));
    try testing.expectEqual(null, bearer("Bearer 7c1e5a9b3d8f204617ca0be9352d8f7461a0c3d95e28b7f4016cad3928bf5e7z"));
}
