// PUT /media-server, and the provisioning member POST /pair may carry

const std = @import("std");

pub const max_body_bytes = 4 * 1024;

const max_id_bytes = 64;
const max_token_bytes = 512;
const max_url_bytes = 512;

pub const MediaServer = struct {
    accessToken: []const u8,
    baseUrl: []const u8,
    deviceId: []const u8,
    serverId: []const u8,
    userId: []const u8,
};

pub const ParseError = error{Malformed};

/// Split from `parse` because `/pair` reaches it with a value the pair body already decoded, and
/// the two routes must hold the same line on what a credential may contain.
pub fn validate(media_server: MediaServer) ParseError!void {
    if (media_server.accessToken.len == 0 or media_server.accessToken.len > max_token_bytes) return error.Malformed;
    if (media_server.baseUrl.len == 0 or media_server.baseUrl.len > max_url_bytes) return error.Malformed;
    if (media_server.deviceId.len == 0 or media_server.deviceId.len > max_id_bytes) return error.Malformed;
    if (media_server.serverId.len == 0 or media_server.serverId.len > max_id_bytes) return error.Malformed;
    if (media_server.userId.len == 0 or media_server.userId.len > max_id_bytes) return error.Malformed;
}

/// The returned strings point into `body`, or into `scratch` for a string that had to be
/// unescaped, and live as long as those buffers do.
pub fn parse(scratch: []u8, body: []const u8) ParseError!MediaServer {
    // Bounded rather than the heap, so an oversized body is a parse error instead of an
    // allocation failure on a Pi Zero.
    var fixed: std.heap.FixedBufferAllocator = .init(scratch);

    // The version header gates compatibility, so a v1 daemon must not refuse a body a later
    // controller added a field to.
    const parsed = std.json.parseFromSliceLeaky(MediaServer, fixed.allocator(), body, .{
        .allocate = .alloc_if_needed,
        .ignore_unknown_fields = true,
    }) catch return error.Malformed;

    try validate(parsed);

    return parsed;
}

const testing = std.testing;

const complete =
    \\{"accessToken":"tok","baseUrl":"http://jellyfin.local:8096",
    \\ "deviceId":"atolla-4f3c9a1de8b27065-u1","serverId":"s1","userId":"u1"}
;

fn pointsInto(slice: []const u8, buffer: []const u8) bool {
    const start = @intFromPtr(buffer.ptr);
    const address = @intFromPtr(slice.ptr);

    return address >= start and address + slice.len <= start + buffer.len;
}

test "media_server: reads every field a controller must send" {
    var scratch: [max_body_bytes]u8 = undefined;
    const parsed = try parse(&scratch, complete);

    try testing.expectEqualStrings("tok", parsed.accessToken);
    try testing.expectEqualStrings("http://jellyfin.local:8096", parsed.baseUrl);
    try testing.expectEqualStrings("atolla-4f3c9a1de8b27065-u1", parsed.deviceId);
    try testing.expectEqualStrings("s1", parsed.serverId);
    try testing.expectEqualStrings("u1", parsed.userId);
}

test "media_server: the strings it returns live in the buffers the caller owns" {
    var scratch: [max_body_bytes]u8 = undefined;
    const escaped =
        \\{"accessToken":"to\u006b","baseUrl":"http://x","deviceId":"d","serverId":"s","userId":"u"}
    ;
    const parsed = try parse(&scratch, escaped);

    try testing.expect(pointsInto(parsed.accessToken, &scratch));
    try testing.expect(pointsInto(parsed.userId, escaped));
}

test "media_server: refuses a body that is not JSON at all" {
    var scratch: [max_body_bytes]u8 = undefined;

    try testing.expectError(error.Malformed, parse(&scratch, ""));
    try testing.expectError(error.Malformed, parse(&scratch, "{"));
    try testing.expectError(error.Malformed, parse(&scratch, "not json"));
    try testing.expectError(error.Malformed, parse(&scratch, "[]"));
    try testing.expectError(error.Malformed, parse(&scratch, "null"));
}

test "media_server: refuses a body missing any field it needs" {
    var scratch: [max_body_bytes]u8 = undefined;

    const missing = [_][]const u8{
        \\{"baseUrl":"http://x","deviceId":"d","serverId":"s","userId":"u"}
        ,
        \\{"accessToken":"t","deviceId":"d","serverId":"s","userId":"u"}
        ,
        \\{"accessToken":"t","baseUrl":"http://x","serverId":"s","userId":"u"}
        ,
        \\{"accessToken":"t","baseUrl":"http://x","deviceId":"d","userId":"u"}
        ,
        \\{"accessToken":"t","baseUrl":"http://x","deviceId":"d","serverId":"s"}
        ,
    };

    for (missing) |body| try testing.expectError(error.Malformed, parse(&scratch, body));
}

test "media_server: refuses an empty field" {
    var scratch: [max_body_bytes]u8 = undefined;

    const empty = [_][]const u8{
        \\{"accessToken":"","baseUrl":"http://x","deviceId":"d","serverId":"s","userId":"u"}
        ,
        \\{"accessToken":"t","baseUrl":"","deviceId":"d","serverId":"s","userId":"u"}
        ,
        \\{"accessToken":"t","baseUrl":"http://x","deviceId":"","serverId":"s","userId":"u"}
        ,
        \\{"accessToken":"t","baseUrl":"http://x","deviceId":"d","serverId":"","userId":"u"}
        ,
        \\{"accessToken":"t","baseUrl":"http://x","deviceId":"d","serverId":"s","userId":""}
        ,
    };

    for (empty) |body| try testing.expectError(error.Malformed, parse(&scratch, body));
}

test "media_server: refuses a field of the wrong type" {
    var scratch: [max_body_bytes]u8 = undefined;

    try testing.expectError(error.Malformed, parse(&scratch,
        \\{"accessToken":1,"baseUrl":"http://x","deviceId":"d","serverId":"s","userId":"u"}
    ));
}

test "media_server: ignores a field it does not know" {
    var scratch: [max_body_bytes]u8 = undefined;
    const parsed = try parse(&scratch,
        \\{"accessToken":"t","baseUrl":"http://x","deviceId":"d","serverId":"s","userId":"u",
        \\ "futureThing":{"a":[1,2]}}
    );

    try testing.expectEqualStrings("u", parsed.userId);
}

test "media_server: refuses a token longer than its cap" {
    var scratch: [max_body_bytes]u8 = undefined;
    var buffer: [max_body_bytes]u8 = undefined;
    const long = try std.fmt.bufPrint(
        &buffer,
        "{{\"accessToken\":\"{s}\",\"baseUrl\":\"http://x\",\"deviceId\":\"d\",\"serverId\":\"s\",\"userId\":\"u\"}}",
        .{"t" ** (max_token_bytes + 1)},
    );

    try testing.expectError(error.Malformed, parse(&scratch, long));
}

test "media_server: refuses a url longer than its cap" {
    var scratch: [max_body_bytes]u8 = undefined;
    var buffer: [max_body_bytes]u8 = undefined;
    const long = try std.fmt.bufPrint(
        &buffer,
        "{{\"accessToken\":\"t\",\"baseUrl\":\"{s}\",\"deviceId\":\"d\",\"serverId\":\"s\",\"userId\":\"u\"}}",
        .{"u" ** (max_url_bytes + 1)},
    );

    try testing.expectError(error.Malformed, parse(&scratch, long));
}

test "media_server: refuses an identifier longer than its cap" {
    var scratch: [max_body_bytes]u8 = undefined;
    var buffer: [max_body_bytes]u8 = undefined;
    const long = try std.fmt.bufPrint(
        &buffer,
        "{{\"accessToken\":\"t\",\"baseUrl\":\"http://x\",\"deviceId\":\"d\",\"serverId\":\"s\",\"userId\":\"{s}\"}}",
        .{"u" ** (max_id_bytes + 1)},
    );

    try testing.expectError(error.Malformed, parse(&scratch, long));
}

test "media_server: refuses a body large enough to exhaust its scratch" {
    var scratch: [max_body_bytes]u8 = undefined;
    var buffer: [max_body_bytes]u8 = undefined;
    @memset(&buffer, 'x');
    buffer[0] = '{';

    try testing.expectError(error.Malformed, parse(&scratch, &buffer));
}

test "media_server: validate holds the same line as parse" {
    const usable: MediaServer = .{
        .accessToken = "t",
        .baseUrl = "http://x",
        .deviceId = "d",
        .serverId = "s",
        .userId = "u",
    };

    try validate(usable);

    var short = usable;
    short.userId = "";
    try testing.expectError(error.Malformed, validate(short));

    var long = usable;
    long.serverId = "s" ** (max_id_bytes + 1);
    try testing.expectError(error.Malformed, validate(long));
}
