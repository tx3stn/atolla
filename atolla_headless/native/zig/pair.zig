// POST /pair

const std = @import("std");
const credentials = @import("credentials.zig");
const problem = @import("problem.zig");
const rate_limit = @import("rate_limit.zig");

pub const max_body_bytes = 4 * 1024;

const max_code_bytes = 32;
const max_id_bytes = 64;
const max_name_bytes = 128;
const max_token_bytes = 512;
const max_url_bytes = 512;

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
    problem: problem.Problem,
    cross,
};

pub const ParseError = error{Malformed};

pub const SetPathError = error{PathTooLong};

pub const Gate = struct {
    limiter: rate_limit.Limiter = .empty,
    mutex: std.Io.Mutex = .init,

    pub const Held = struct {
        gate: *Gate,
        io: std.Io,

        pub fn release(self: Held) void {
            self.gate.mutex.unlock(self.io);
        }
    };

    pub fn acquire(self: *Gate, io: std.Io) Held {
        self.mutex.lockUncancelable(io);

        return .{ .gate = self, .io = io };
    }
};

var code_path: [std.Io.Dir.max_path_bytes]u8 = undefined;
var code_path_len: usize = 0;

pub fn setCodePath(path: []const u8) SetPathError!void {
    if (path.len > code_path.len) return error.PathTooLong;

    @memcpy(code_path[0..path.len], path);
    code_path_len = path.len;
}

pub fn handle(held: Gate.Held, now_ms: i64, key: rate_limit.Key, body: []const u8) Outcome {
    const limiter = &held.gate.limiter;

    switch (limiter.check(now_ms, key)) {
        .deny_seconds => |seconds| return .{ .problem = problem.tooManyAttempts(seconds) },
        .allow => {},
    }

    const parsed = parse(body) catch {
        limiter.record(now_ms, key, .{ .failure = .key });
        return .{ .problem = problem.malformed_body };
    };

    const authorised = if (credentials.read(held.io, code_path[0..code_path_len])) |stored|
        credentials.matches(parsed.code, stored)
    else
        false;

    if (!authorised) {
        limiter.record(now_ms, key, .{ .failure = .key_and_global });
        return .{ .problem = problem.invalid_pairing_code };
    }

    limiter.record(now_ms, key, .success);

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

const wrong_code =
    \\{"code":"00000000","controllerId":"phone-1","controllerName":"Phone"}
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

const unprovisioned = "/nonexistent/atolla/pairing";

const caller: rate_limit.Key = 0x0a00_0001;

fn provision(tmp: *testing.TmpDir, buffer: []u8, code: []const u8) !void {
    try tmp.dir.writeFile(testing.io, .{ .sub_path = "pairing", .data = code });

    try setCodePath(try std.fmt.bufPrint(buffer, ".zig-cache/tmp/{s}/pairing", .{tmp.sub_path}));
}

test "pair: hands a body carrying the provisioned code on to be answered elsewhere" {
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();

    var buffer: [std.Io.Dir.max_path_bytes]u8 = undefined;
    try provision(&tmp, &buffer, "19524002");

    var gate: Gate = .{};
    const held = gate.acquire(testing.io);
    defer held.release();

    try testing.expectEqual(Outcome.cross, handle(held, 0, caller, minimal));
}

test "pair: refuses a body it cannot parse without consulting the code" {
    try setCodePath(unprovisioned);

    var gate: Gate = .{};
    const held = gate.acquire(testing.io);
    defer held.release();

    try testing.expectEqualStrings("malformed_body", handle(held, 0, caller, "nope").problem.code);
}

test "pair: refuses every attempt while no code is provisioned" {
    try setCodePath(unprovisioned);

    var gate: Gate = .{};
    const held = gate.acquire(testing.io);
    defer held.release();

    const outcome = handle(held, 0, caller, minimal);

    try testing.expectEqualStrings("invalid_pairing_code", outcome.problem.code);
    try testing.expectEqual(401, outcome.problem.status);
}

test "pair: refuses a code that is not the provisioned one" {
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();

    var buffer: [std.Io.Dir.max_path_bytes]u8 = undefined;
    try provision(&tmp, &buffer, "00000000");

    var gate: Gate = .{};
    const held = gate.acquire(testing.io);
    defer held.release();

    try testing.expectEqualStrings("invalid_pairing_code", handle(held, 0, caller, minimal).problem.code);
}

test "pair: throttles once a caller has spent its free attempts" {
    try setCodePath(unprovisioned);

    var gate: Gate = .{};
    const held = gate.acquire(testing.io);
    defer held.release();

    for (0..3) |_| {
        try testing.expectEqual(401, handle(held, 0, caller, minimal).problem.status);
    }

    const throttled = handle(held, 0, caller, minimal).problem;

    try testing.expectEqualStrings("too_many_attempts", throttled.code);
    try testing.expectEqual(429, throttled.status);
    try testing.expectEqual(1, throttled.retryAfterSeconds);
}

test "pair: a throttled attempt does not extend the block it was refused by" {
    try setCodePath(unprovisioned);

    var gate: Gate = .{};
    const held = gate.acquire(testing.io);
    defer held.release();

    for (0..5) |_| _ = handle(held, 0, caller, minimal);

    try testing.expectEqualStrings(
        "invalid_pairing_code",
        handle(held, 1_000, caller, minimal).problem.code,
    );
}

test "pair: a malformed body does not throttle a different caller" {
    try setCodePath(unprovisioned);

    var gate: Gate = .{};
    const held = gate.acquire(testing.io);
    defer held.release();

    for (0..20) |index| _ = handle(held, 0, @intCast(index), "nope");

    try testing.expectEqualStrings("invalid_pairing_code", handle(held, 0, caller, minimal).problem.code);
}

test "pair: a successful pair clears the failures behind it" {
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();

    var buffer: [std.Io.Dir.max_path_bytes]u8 = undefined;
    try provision(&tmp, &buffer, "19524002");

    var gate: Gate = .{};
    const held = gate.acquire(testing.io);
    defer held.release();

    for (0..3) |_| _ = handle(held, 0, caller, wrong_code);

    try testing.expectEqual(Outcome.cross, handle(held, 1_000, caller, minimal));
    try testing.expectEqual(Outcome.cross, handle(held, 1_000, caller, minimal));
}

test "pair: refuses a path too long to hold" {
    try testing.expectError(error.PathTooLong, setCodePath(&[_]u8{'x'} ** (std.Io.Dir.max_path_bytes + 1)));
}
