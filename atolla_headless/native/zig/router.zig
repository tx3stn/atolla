const std = @import("std");

pub const Route = enum { hello };

pub const Outcome = union(enum) {
    route: Route,
    /// No route claims this path, whatever the method.
    not_found,
    /// A route claims the path, but not with this method.
    method_not_allowed,
};

pub fn resolve(method: std.http.Method, target: []const u8) Outcome {
    const path = target[0 .. std.mem.indexOfScalar(u8, target, '?') orelse target.len];

    if (std.mem.eql(u8, path, "/hello")) {
        return if (method == .GET) .{ .route = .hello } else .method_not_allowed;
    }

    return .not_found;
}

const testing = std.testing;

test "router: resolves the hello route" {
    try testing.expectEqual(Outcome{ .route = .hello }, resolve(.GET, "/hello"));
}

test "router: matches the path without the query string" {
    try testing.expectEqual(Outcome{ .route = .hello }, resolve(.GET, "/hello?since=4"));
}

test "router: refuses a known path reached with the wrong method" {
    for ([_]std.http.Method{ .POST, .PUT, .DELETE }) |method| {
        try testing.expectEqual(Outcome.method_not_allowed, resolve(method, "/hello"));
    }
}

test "router: does not claim a path that merely starts with a route" {
    try testing.expectEqual(Outcome.not_found, resolve(.GET, "/hello/there"));
    try testing.expectEqual(Outcome.not_found, resolve(.GET, "/helloooo"));
}

test "router: an unknown path is not found whatever the method" {
    try testing.expectEqual(Outcome.not_found, resolve(.GET, "/nope"));
    try testing.expectEqual(Outcome.not_found, resolve(.POST, "/nope"));
}
