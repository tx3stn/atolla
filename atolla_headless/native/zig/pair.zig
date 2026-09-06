//! `POST /pair`: the route's own body shape, size cap and rejections.
//!
//! This is the only unauthenticated body that reaches a parser, so it is checked here rather than
//! across the bridge, and a malformed one never wakes the JavaScript thread. Every field is a
//! primitive, which is what makes that safe. A domain payload like a track array has its one
//! definition in TypeScript, and a copy here would drift from it.

const std = @import("std");
const api_version = @import("api_version.zig");

/// A code, two identifiers and four short strings. Nothing this route takes needs more, and the
/// unauthenticated surface is worth keeping small.
pub const max_body_bytes = 4 * 1024;

const max_code_bytes = 32;
const max_id_bytes = 64;
const max_name_bytes = 128;
const max_token_bytes = 512;
const max_url_bytes = 512;

pub const rejection = "{\"error\":\"malformedBody\"}";

/// Neutral by name: the daemon stores whatever media server provisioned it, and only the contents
/// are Jellyfin-shaped today.
pub const MediaServer = struct {
    accessToken: []const u8,
    baseUrl: []const u8,
    deviceId: []const u8,
    userId: []const u8,
};

pub const Body = struct {
    code: []const u8,
    controllerId: []const u8,
    controllerName: []const u8,
    mediaServer: ?MediaServer = null,
};

pub const Outcome = union(enum) {
    answered: u16,
    cross,
};

pub const ParseError = error{Malformed};

pub fn handle(request: *std.http.Server.Request, body: []const u8) !Outcome {
    _ = parse(body) catch {
        try request.respond(rejection, .{
            .status = .bad_request,
            .extra_headers = &.{ api_version.response_header, api_version.json_header },
        });

        return .{ .answered = 400 };
    };

    return .cross;
}

/// The returned strings point into `body` and live as long as it does.
pub fn parse(body: []const u8) ParseError!Body {
    // Bounded rather than the heap, so an oversized body is a parse error instead of an
    // allocation failure on a Pi Zero.
    var scratch: [max_body_bytes]u8 = undefined;
    var fixed: std.heap.FixedBufferAllocator = .init(&scratch);

    // The version header gates compatibility, so a v1 daemon must not refuse a body that a later
    // client added a field to.
    const parsed = std.json.parseFromSliceLeaky(Body, fixed.allocator(), body, .{
        .allocate = .alloc_if_needed,
        .ignore_unknown_fields = true,
    }) catch return error.Malformed;

    if (parsed.code.len == 0 or parsed.code.len > max_code_bytes) return error.Malformed;
    if (parsed.controllerId.len == 0 or parsed.controllerId.len > max_id_bytes) return error.Malformed;
    if (parsed.controllerName.len > max_name_bytes) return error.Malformed;

    if (parsed.mediaServer) |media_server| {
        if (media_server.baseUrl.len == 0 or media_server.baseUrl.len > max_url_bytes) return error.Malformed;
        if (media_server.userId.len == 0 or media_server.userId.len > max_id_bytes) return error.Malformed;
        if (media_server.deviceId.len == 0 or media_server.deviceId.len > max_id_bytes) return error.Malformed;
        if (media_server.accessToken.len == 0 or media_server.accessToken.len > max_token_bytes) return error.Malformed;
    }

    return parsed;
}

const testing = std.testing;

const minimal =
    \\{"code":"19524002","controllerId":"phone-1","controllerName":"Tristan's phone"}
;

const provisioned =
    \\{"code":"19524002","controllerId":"phone-1","controllerName":"Phone",
    \\ "mediaServer":{"baseUrl":"http://jellyfin.local:8096","userId":"u1",
    \\ "accessToken":"tok","deviceId":"d1"}}
;

test "pair: reads the fields a controller must send" {
    const body = try parse(minimal);

    try testing.expectEqualStrings("19524002", body.code);
    try testing.expectEqualStrings("phone-1", body.controllerId);
    try testing.expectEqualStrings("Tristan's phone", body.controllerName);
    try testing.expectEqual(null, body.mediaServer);
}

test "pair: reads the provisioning payload when one is sent" {
    const body = try parse(provisioned);
    const media_server = body.mediaServer.?;

    try testing.expectEqualStrings("http://jellyfin.local:8096", media_server.baseUrl);
    try testing.expectEqualStrings("u1", media_server.userId);
    try testing.expectEqualStrings("tok", media_server.accessToken);
    try testing.expectEqualStrings("d1", media_server.deviceId);
}

test "pair: a body without a media server is legal" {
    try testing.expect((try parse(minimal)).mediaServer == null);
}

test "pair: refuses a body that is not JSON at all" {
    try testing.expectError(error.Malformed, parse(""));
    try testing.expectError(error.Malformed, parse("{"));
    try testing.expectError(error.Malformed, parse("not json"));
    try testing.expectError(error.Malformed, parse("[]"));
    try testing.expectError(error.Malformed, parse("null"));
}

test "pair: refuses a body missing a field it needs" {
    try testing.expectError(error.Malformed, parse("{\"code\":\"19524002\"}"));
    try testing.expectError(
        error.Malformed,
        parse("{\"controllerId\":\"phone-1\",\"controllerName\":\"Phone\"}"),
    );
}

test "pair: refuses a field of the wrong type" {
    try testing.expectError(
        error.Malformed,
        parse("{\"code\":19524002,\"controllerId\":\"p\",\"controllerName\":\"P\"}"),
    );
}

test "pair: ignores a field it does not know" {
    const body = try parse(
        \\{"code":"19524002","controllerId":"p","controllerName":"P","futureThing":{"a":[1,2]}}
    );

    try testing.expectEqualStrings("19524002", body.code);
}

test "pair: refuses an empty code or identifier" {
    try testing.expectError(
        error.Malformed,
        parse("{\"code\":\"\",\"controllerId\":\"p\",\"controllerName\":\"P\"}"),
    );
    try testing.expectError(
        error.Malformed,
        parse("{\"code\":\"19524002\",\"controllerId\":\"\",\"controllerName\":\"P\"}"),
    );
}

test "pair: refuses a field longer than its cap" {
    var buffer: [max_body_bytes]u8 = undefined;
    const long = try std.fmt.bufPrint(
        &buffer,
        "{{\"code\":\"19524002\",\"controllerId\":\"p\",\"controllerName\":\"{s}\"}}",
        .{"n" ** (max_name_bytes + 1)},
    );

    try testing.expectError(error.Malformed, parse(long));
}

test "pair: refuses a provisioning payload with a field missing" {
    try testing.expectError(
        error.Malformed,
        parse(
            \\{"code":"1","controllerId":"p","controllerName":"P","mediaServer":{"baseUrl":"http://x"}}
        ),
    );
}

test "pair: refuses a provisioning payload with an empty field" {
    try testing.expectError(
        error.Malformed,
        parse(
            \\{"code":"1","controllerId":"p","controllerName":"P","mediaServer":{"baseUrl":"",
            \\ "userId":"u","accessToken":"t","deviceId":"d"}}
        ),
    );
}

test "pair: refuses a body large enough to exhaust its scratch" {
    var buffer: [max_body_bytes]u8 = undefined;
    @memset(&buffer, 'x');
    buffer[0] = '{';

    try testing.expectError(error.Malformed, parse(&buffer));
}
