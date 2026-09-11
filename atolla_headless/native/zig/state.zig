// GET /state?since=

const std = @import("std");

/// `StateVersion`'s ceiling. A `since` above it cannot name a version the daemon will ever reach.
pub const max_version = 2147483647;

pub const ParseError = error{Malformed};

const parameter = "since";

/// The version a controller already holds, or null when it asked for the current one. Refused
/// rather than ignored when it is present but not a version: a controller that sent a broken
/// `since` is asking a question nobody can answer, and silently handing it the current snapshot
/// would look like a successful poll that never blocks.
pub fn since(target: []const u8) ParseError!?u32 {
    const query = target[(std.mem.indexOfScalar(u8, target, '?') orelse return null) + 1 ..];
    var pairs = std.mem.splitScalar(u8, query, '&');

    while (pairs.next()) |pair| {
        const name = pair[0 .. std.mem.indexOfScalar(u8, pair, '=') orelse pair.len];

        // A parameter this route does not know is ignored, as an unknown member of a body is.
        if (!std.mem.eql(u8, name, parameter)) continue;
        if (name.len == pair.len) return error.Malformed;

        const value = pair[name.len + 1 ..];

        return std.fmt.parseInt(u32, value, 10) catch return error.Malformed;
    }

    return null;
}

const testing = std.testing;

test "state: a target with no query asks for the current snapshot" {
    try testing.expectEqual(null, try since("/state"));
}

test "state: reads the version a controller already holds" {
    try testing.expectEqual(412, try since("/state?since=412"));
}

test "state: reads it from among other parameters" {
    try testing.expectEqual(412, try since("/state?other=1&since=412"));
    try testing.expectEqual(412, try since("/state?since=412&other=1"));
}

test "state: ignores a parameter this route does not know" {
    try testing.expectEqual(null, try since("/state?other=1"));
    try testing.expectEqual(null, try since("/state?sincerely=412"));
}

test "state: takes the first version when one is sent twice" {
    try testing.expectEqual(1, try since("/state?since=1&since=2"));
}

test "state: accepts the lowest version there is" {
    try testing.expectEqual(0, try since("/state?since=0"));
}

test "state: accepts the highest version the counter reaches" {
    try testing.expectEqual(max_version, try since("/state?since=2147483647"));
}

test "state: refuses a version that is not a number" {
    try testing.expectError(error.Malformed, since("/state?since=soon"));
    try testing.expectError(error.Malformed, since("/state?since=4.5"));
    try testing.expectError(error.Malformed, since("/state?since= 412"));
}

test "state: refuses a version outside what the counter can hold" {
    try testing.expectError(error.Malformed, since("/state?since=-1"));
    try testing.expectError(error.Malformed, since("/state?since=4294967296"));
    try testing.expectError(error.Malformed, since("/state?since=99999999999999999999"));
}

test "state: refuses a since with nothing after it" {
    try testing.expectError(error.Malformed, since("/state?since="));
    try testing.expectError(error.Malformed, since("/state?since"));
}

test "state: an empty query asks for the current snapshot" {
    try testing.expectEqual(null, try since("/state?"));
}
