const std = @import("std");

pub const current = 1;

pub const request_header = "atolla-api-version";

pub const response_header: std.http.Header = .{ .name = request_header, .value = "1" };

pub const json_header: std.http.Header = .{ .name = "content-type", .value = "application/json" };

pub const rejection = "{\"error\":\"unsupportedApiVersion\",\"supported\":[1]}";

pub fn accepted(request: *const std.http.Server.Request) bool {
    var headers = request.iterateHeaders();

    while (headers.next()) |header| {
        if (std.ascii.eqlIgnoreCase(header.name, request_header)) return supported(header.value);
    }

    return supported(null);
}

/// Absent means 1, so a bare `curl` works and it agrees with the beacon's `"v": 1`.
pub fn supported(value: ?[]const u8) bool {
    const given = value orelse return true;
    const trimmed = std.mem.trim(u8, given, " \t");
    const requested = std.fmt.parseInt(u32, trimmed, 10) catch return false;

    return requested == current;
}

const testing = std.testing;

test "api_version: a request that names no version is the current one" {
    try testing.expect(supported(null));
}

test "api_version: accepts the version it speaks" {
    try testing.expect(supported("1"));
}

test "api_version: tolerates the whitespace a header may carry" {
    try testing.expect(supported(" 1 "));
    try testing.expect(supported("\t1"));
}

test "api_version: refuses a version it does not speak" {
    try testing.expect(!supported("2"));
    try testing.expect(!supported("0"));
    try testing.expect(!supported("99"));
}

test "api_version: refuses a value that is not a version at all" {
    try testing.expect(!supported(""));
    try testing.expect(!supported("one"));
    try testing.expect(!supported("1.0"));
    try testing.expect(!supported("-1"));
    try testing.expect(!supported("1;drop"));
}

test "api_version: refuses a number too large to be one" {
    try testing.expect(!supported("4294967296"));
    try testing.expect(!supported("9" ** 64));
}

test "api_version: the rejection names what it does speak" {
    try testing.expect(std.mem.indexOf(u8, rejection, "unsupportedApiVersion") != null);
    try testing.expect(std.mem.indexOf(u8, rejection, "[1]") != null);
}
