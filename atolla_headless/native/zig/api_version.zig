const std = @import("std");
const problem = @import("problem.zig");

/// The one source: the membership check and the problem's `supported` member both come from here,
/// so neither can drift from the other.
pub const supported_versions = [_]u16{1};

/// The version travels on requests only. A client learns what the daemon speaks from `/hello`,
/// which is the endpoint that exists to tell it, and a rejection carries `supported` in its body.
pub const request_header = "atolla-api-version";

pub const unsupported: problem.Problem = .{
    .code = "unsupported_api_version",
    .status = 400,
    .supported = &supported_versions,
    .title = "unsupported api version",
};

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
    const requested = std.fmt.parseInt(u16, trimmed, 10) catch return false;

    return std.mem.indexOfScalar(u16, &supported_versions, requested) != null;
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

test "api_version: the rejection reports the versions it does speak" {
    var buffer: [problem.max_bytes]u8 = undefined;

    try testing.expectEqualStrings(
        \\{"code":"unsupported_api_version","status":400,"supported":[1],"title":"unsupported api version"}
    ,
        problem.render(&buffer, unsupported),
    );
}
