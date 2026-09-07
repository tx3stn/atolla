//! RFC 9457 problem details, and the code vocabulary the app and the e2e switch on.
//!
//! `type` is omitted rather than written as `about:blank`, which the RFC says is what an absent
//! `type` means. That keeps it free for a documentation URL later without breaking a client.
//!
//! Extension members are flat alongside the standard ones, so they are optional fields here and
//! `emit_null_optional_fields` drops the ones a given problem does not carry. A fixed superset
//! beats a generic merge while there are two of them.

const std = @import("std");

pub const content_type: std.http.Header = .{
    .name = "content-type",
    .value = "application/problem+json",
};

/// Long enough for any problem here with its extensions, and every caller holds it on the stack.
pub const max_bytes = 256;

pub const Problem = struct {
    code: []const u8,
    /// Left null by default: naming the field that failed tells an unauthenticated caller which
    /// field to fix, and `/pair` is the one body a stranger on the LAN can post.
    detail: ?[]const u8 = null,
    retryAfterSeconds: ?u32 = null,
    status: u16,
    supported: ?[]const u16 = null,
    title: []const u8,
};

pub const ResponseOptions = struct {
    /// False wherever the body has not been drained, since the connection cannot be reused then.
    keep_alive: bool = true,
};

/// Answers with the problem's own status and a rendered body, and reports that status for the log.
/// Every buffer lives on this frame, so nothing allocates on a connection thread.
pub fn response(
    request: *std.http.Server.Request,
    problem: Problem,
    options: ResponseOptions,
) !u16 {
    var buffer: [max_bytes]u8 = undefined;
    var retry_buffer: [retry_after_bytes]u8 = undefined;

    var headers: [2]std.http.Header = .{ content_type, undefined };
    const count = writeRetryAfter(&headers, &retry_buffer, problem);

    try request.respond(render(&buffer, problem), .{
        .status = @enumFromInt(problem.status),
        .keep_alive = options.keep_alive,
        .extra_headers = headers[0..count],
    });

    return problem.status;
}

/// `Retry-After` is the mechanism a client or proxy already understands, so a problem carrying the
/// member gets the header too. Returns how many of `headers` are in use.
fn writeRetryAfter(
    headers: *[2]std.http.Header,
    buffer: *[retry_after_bytes]u8,
    problem: Problem,
) usize {
    const seconds = problem.retryAfterSeconds orelse return 1;

    headers[1] = .{
        .name = "retry-after",
        .value = std.fmt.bufPrint(buffer, "{d}", .{seconds}) catch return 1,
    };

    return 2;
}

const retry_after_bytes = 16;

/// The returned slice points into `buffer`. A problem too big to render is a bug rather than a
/// runtime condition, so this falls back to the one body that always fits.
pub fn render(buffer: []u8, problem: Problem) []const u8 {
    return std.fmt.bufPrint(buffer, "{f}", .{
        std.json.fmt(problem, .{ .emit_null_optional_fields = false }),
    }) catch unrenderable;
}

const unrenderable =
    \\{"code":"internal","status":500,"title":"internal error"}
;

pub const incomplete_body: Problem = .{
    .code = "incomplete_body",
    .status = 400,
    .title = "incomplete body",
};

pub const malformed_body: Problem = .{
    .code = "malformed_body",
    .status = 400,
    .title = "malformed body",
};

pub const not_found: Problem = .{
    .code = "not_found",
    .status = 404,
    .title = "not found",
};

pub const method_not_allowed: Problem = .{
    .code = "method_not_allowed",
    .status = 405,
    .title = "method not allowed",
};

pub const length_required: Problem = .{
    .code = "length_required",
    .status = 411,
    .title = "length required",
};

pub const body_too_large: Problem = .{
    .code = "body_too_large",
    .status = 413,
    .title = "body too large",
};

pub const expectation_failed: Problem = .{
    .code = "expectation_failed",
    .status = 417,
    .title = "expectation failed",
};

pub const headers_too_large: Problem = .{
    .code = "headers_too_large",
    .status = 431,
    .title = "headers too large",
};

pub const unavailable: Problem = .{
    .code = "unavailable",
    .status = 503,
    .title = "unavailable",
};

pub const busy: Problem = .{
    .code = "busy",
    .retryAfterSeconds = 1,
    .status = 503,
    .title = "busy",
};

pub const handler_timeout: Problem = .{
    .code = "handler_timeout",
    .status = 504,
    .title = "handler timeout",
};

const testing = std.testing;

test "problem: renders the members it carries and omits the rest" {
    var buffer: [max_bytes]u8 = undefined;

    try testing.expectEqualStrings(
        \\{"code":"not_found","status":404,"title":"not found"}
    ,
        render(&buffer, not_found),
    );
}

test "problem: renders an extension member alongside the standard ones" {
    var buffer: [max_bytes]u8 = undefined;
    const versions = [_]u16{1};

    try testing.expectEqualStrings(
        \\{"code":"unsupported_version","status":400,"supported":[1],"title":"unsupported"}
    ,
        render(&buffer, .{
            .code = "unsupported_version",
            .status = 400,
            .supported = &versions,
            .title = "unsupported",
        }),
    );
}

test "problem: renders a detail when one is given" {
    var buffer: [max_bytes]u8 = undefined;

    try testing.expectEqualStrings(
        \\{"code":"busy","detail":"try later","status":503,"title":"busy"}
    ,
        render(&buffer, .{ .code = "busy", .detail = "try later", .status = 503, .title = "busy" }),
    );
}

test "problem: escapes a title that would otherwise break the json" {
    var buffer: [max_bytes]u8 = undefined;

    try testing.expectEqualStrings(
        \\{"code":"busy","status":503,"title":"a \"quoted\" title"}
    ,
        render(&buffer, .{ .code = "busy", .status = 503, .title = "a \"quoted\" title" }),
    );
}

// The bodies go out on a connection thread, where a panic would take the daemon with it.
test "problem: falls back to a body that fits when the buffer is too small" {
    var buffer: [8]u8 = undefined;

    try testing.expectEqualStrings(unrenderable, render(&buffer, not_found));
}
