const std = @import("std");

/// The values cross the C ABI to the `switch` in `Server.ts`, so they are explicit and only ever
/// appended to.
pub const Route = enum(u32) {
    hello = 0,
    pair = 1,
    command = 2,
    state = 3,
};

pub const Outcome = union(enum) {
    route: Route,
    not_found,
    method_not_allowed,
};

const Entry = struct {
    method: std.http.Method,
    path: []const u8,
    route: Route,
    /// Whether a controller token admits the request. The table is where a route is declared, so
    /// it is also where the answer lives, mirroring the spec's default security and its overrides.
    token: bool = true,
};

const table = [_]Entry{
    .{ .method = .GET, .path = "/hello", .route = .hello, .token = false },
    .{ .method = .POST, .path = "/pair", .route = .pair, .token = false },
    .{ .method = .POST, .path = "/command", .route = .command },
    .{ .method = .GET, .path = "/state", .route = .state },
};

pub fn requiresToken(route: Route) bool {
    for (table) |entry| {
        if (entry.route == route) return entry.token;
    }

    return true;
}

pub fn resolve(method: std.http.Method, target: []const u8) Outcome {
    const path = target[0 .. std.mem.indexOfScalar(u8, target, '?') orelse target.len];
    var claimed = false;

    for (table) |entry| {
        if (!std.mem.eql(u8, path, entry.path)) continue;
        if (entry.method == method) return .{ .route = entry.route };

        claimed = true;
    }

    return if (claimed) .method_not_allowed else .not_found;
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

test "router: resolves every route in the table" {
    try testing.expectEqual(Outcome{ .route = .pair }, resolve(.POST, "/pair"));
    try testing.expectEqual(Outcome{ .route = .command }, resolve(.POST, "/command"));
    try testing.expectEqual(Outcome{ .route = .state }, resolve(.GET, "/state?since=4"));
}

test "router: a route is reachable only by its own method" {
    try testing.expectEqual(Outcome.method_not_allowed, resolve(.GET, "/pair"));
    try testing.expectEqual(Outcome.method_not_allowed, resolve(.POST, "/state"));
}

test "router: only the discovery and pairing routes are reachable without a token" {
    try testing.expect(!requiresToken(.hello));
    try testing.expect(!requiresToken(.pair));
    try testing.expect(requiresToken(.command));
    try testing.expect(requiresToken(.state));
}

test "router: a route defaults to needing a token" {
    for (table) |entry| {
        if (entry.token) continue;

        try testing.expect(entry.route == .hello or entry.route == .pair);
    }
}

test "router: route ids are stable" {
    try testing.expectEqual(0, @intFromEnum(Route.hello));
    try testing.expectEqual(1, @intFromEnum(Route.pair));
    try testing.expectEqual(2, @intFromEnum(Route.command));
    try testing.expectEqual(3, @intFromEnum(Route.state));
}
