const std = @import("std");

const max_body_bytes = 1024;

var body: [max_body_bytes]u8 = undefined;
var body_len: usize = 0;

pub const SetError = error{BodyTooLarge};

/// Copied, because the bytes arrive from JavaScript through the C ABI and do not outlive that
/// call. Set before the first connection is served and never after, so the connection threads
/// only ever read it.
pub fn set(bytes: []const u8) SetError!void {
    if (bytes.len > max_body_bytes) return error.BodyTooLarge;

    @memcpy(body[0..bytes.len], bytes);
    body_len = bytes.len;
}

pub fn respond(request: *std.http.Server.Request) !void {
    return request.respond(body[0..body_len], .{
        .extra_headers = &.{.{ .name = "content-type", .value = "application/json" }},
    });
}

const testing = std.testing;

test "hello: keeps the bytes it was given" {
    try set("{\"id\":\"abc\"}");

    try testing.expectEqualStrings("{\"id\":\"abc\"}", body[0..body_len]);
}

test "hello: replacing a longer body leaves none of it behind" {
    try set("{\"name\":\"a long player name\"}");
    try set("{}");

    try testing.expectEqualStrings("{}", body[0..body_len]);
}

test "hello: refuses a body it cannot store" {
    try testing.expectError(error.BodyTooLarge, set(&[_]u8{'x'} ** (max_body_bytes + 1)));
}
