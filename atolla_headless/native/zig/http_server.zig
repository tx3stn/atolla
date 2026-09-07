const std = @import("std");
const net = std.Io.net;
const api_version = @import("api_version.zig");
const bridge = @import("bridge.zig");
const hello = @import("hello.zig");
const log = @import("log.zig");
const pair = @import("pair.zig");
const problem = @import("problem.zig");
const rate_limit = @import("rate_limit.zig");
const router = @import("router.zig");
const socket_reader = @import("socket_reader.zig");

/// `std.http.Server` caps the head at the reader buffer's size, so this is the header limit and
/// not just an allocation.
const head_buffer_bytes = 8 * 1024;

/// The cap for routes that do not yet declare their own.
const unrouted_body_bytes = 4 * 1024;

/// One buffer per connection thread, sized for the largest cap any route declares. A body over
/// its own route's cap is refused from the content-length, before a byte of it is read.
const max_route_body_bytes = blk: {
    var most: usize = 0;
    for (std.enums.values(router.Route)) |route| most = @max(most, bodyLimit(route));

    break :blk most;
};

const json_content_type: std.http.Header = .{ .name = "content-type", .value = "application/json" };

const reject_timeout_ms = 1_000;

const max_logged_target_bytes = 128;

const log_name = "server";

pub const Options = struct {
    max_connections: usize = 32,
    max_body_bytes: u64 = 1024 * 1024,
    idle_timeout_ms: i32 = 30_000,
    head_timeout_ms: i32 = 5_000,
    write_timeout_ms: i32 = 30_000,
    handler_timeout_ms: u64 = 28_000,
    handler: bridge.Handler = .{},
};

pub const ListenError = net.IpAddress.ListenError;

pub const Server = struct {
    active: std.atomic.Value(usize),
    io: std.Io,
    listener: net.Server,
    options: Options,
    pair_gate: pair.Gate,
    running: std.atomic.Value(bool),

    pub fn listen(io: std.Io, address: *const net.IpAddress, options: Options) ListenError!Server {
        return .{
            .active = .init(0),
            .io = io,
            // Without reuse_address the previous run's sockets hold the port through TIME_WAIT,
            // so a restarted daemon cannot rebind for about a minute.
            .listener = try net.IpAddress.listen(address, io, .{
                .mode = .stream,
                .reuse_address = true,
            }),
            .options = options,
            .pair_gate = .{},
            .running = .init(true),
        };
    }

    /// Connection threads are detached and hold `self` until they decrement `active`, so
    /// without this wait a teardown frees the listener under one still using it.
    pub fn deinit(self: *Server) void {
        while (self.active.load(.acquire) != 0) std.Thread.yield() catch {};

        self.listener.deinit(self.io);
    }

    pub fn port(self: *const Server) u16 {
        return self.listener.socket.address.getPort();
    }

    pub fn run(self: *Server) void {
        while (true) {
            const stream = self.listener.accept(self.io) catch |err| switch (err) {
                error.ConnectionAborted, error.ProtocolFailure, error.BlockedByFirewall => continue,
                else => return,
            };

            if (!self.running.load(.acquire)) {
                stream.close(self.io);
                return;
            }

            if (self.active.fetchAdd(1, .acq_rel) >= self.options.max_connections) {
                _ = self.active.fetchSub(1, .acq_rel);
                self.reject(stream);
                continue;
            }

            const thread = std.Thread.spawn(.{}, serve, .{ self, stream }) catch {
                _ = self.active.fetchSub(1, .acq_rel);
                stream.close(self.io);
                continue;
            };

            thread.detach();
        }
    }

    /// Callable from any thread. Wakes `accept` by connecting to our own listener, because
    /// `shutdown` on a listening socket does nothing on Darwin and `std.Io.net` has no unix
    /// family for a socketpair.
    pub fn stop(self: *Server) void {
        self.running.store(false, .release);

        const stream = net.IpAddress.connect(
            &self.listener.socket.address,
            self.io,
            .{ .mode = .stream },
        ) catch return;

        stream.close(self.io);
    }

    fn crossBridge(
        self: *Server,
        request: *std.http.Server.Request,
        route: router.Route,
        target: []const u8,
        body: []const u8,
    ) !u16 {
        const dispatch = self.options.handler.dispatch orelse {
            log.err(log_name, "no handler attached {f}", .{log.fields(.{ .route = @tagName(route) })});
            return problem.response(request, problem.unavailable, .{ .keep_alive = false });
        };

        const id = bridge.pending.claim(self.io) orelse {
            log.warn(log_name, "no free slot to answer in {f}", .{log.fields(.{ .route = @tagName(route) })});
            return problem.response(request, problem.unavailable, .{ .keep_alive = false });
        };
        defer bridge.pending.release(self.io, id);

        dispatch(
            self.options.handler.context,
            id,
            @intFromEnum(route),
            target.ptr,
            target.len,
            body.ptr,
            body.len,
        );

        const answer = bridge.pending.awaitResponse(self.io, id, self.options.handler_timeout_ms) orelse {
            log.warn(log_name, "handler did not answer {f}", .{log.fields(.{ .route = @tagName(route) })});
            return problem.response(request, problem.handler_timeout, .{ .keep_alive = false });
        };

        // TypeScript answers a problem body on an error status and a plain one otherwise.
        try request.respond(answer.body, .{
            .status = @enumFromInt(answer.status),
            .extra_headers = &.{
                if (answer.status >= 400) problem.content_type else json_content_type,
            },
        });

        return answer.status;
    }

    fn reject(self: *Server, stream: net.Stream) void {
        defer stream.close(self.io);

        setTimeout(stream, .send, reject_timeout_ms) catch return;

        var out_buffer: [problem.max_bytes * 2]u8 = undefined;
        var writer = stream.writer(self.io, &out_buffer);

        writeProblem(&writer.interface, problem.busy);
    }

    fn respond(
        self: *Server,
        request: *std.http.Server.Request,
        key: rate_limit.Key,
        target: []const u8,
    ) !u16 {
        if (request.head.transfer_encoding == .chunked) {
            return problem.response(request, problem.length_required, .{ .keep_alive = false });
        }

        if ((request.head.content_length orelse 0) > self.options.max_body_bytes) {
            return problem.response(request, problem.body_too_large, .{ .keep_alive = false });
        }

        switch (router.resolve(request.head.method, request.head.target)) {
            .route => |route| switch (route) {
                .hello => {
                    try hello.respond(request);
                    return 200;
                },
                else => {
                    // Both checks run before the body is read, so a rejection goes out ahead of
                    // the `100 Continue` that would invite the upload it is meant to prevent.
                    if (!api_version.accepted(request)) {
                        return problem.response(request, api_version.unsupported, .{});
                    }

                    const limit = bodyLimit(route);
                    if ((request.head.content_length orelse 0) > limit) {
                        return problem.response(request, problem.body_too_large, .{ .keep_alive = false });
                    }

                    // Reading the body invalidates every string in the head, so nothing may read
                    // one after this point. `target` is already a copy taken by `serve`.
                    var body_buffer: [max_route_body_bytes]u8 = undefined;
                    const body = readBody(request, body_buffer[0..limit]) catch |err| {
                        if (err == error.HttpExpectationFailed) return err;

                        return problem.response(request, problem.incomplete_body, .{ .keep_alive = false });
                    };

                    if (route == .pair) return self.servePair(request, key, target, body);

                    return self.crossBridge(request, route, target, body);
                },
            },
            .method_not_allowed => return problem.response(request, problem.method_not_allowed, .{}),
            .not_found => return problem.response(request, problem.not_found, .{}),
        }
    }

    fn serve(self: *Server, stream: net.Stream) void {
        defer {
            discardPending(stream);
            stream.close(self.io);
            _ = self.active.fetchSub(1, .acq_rel);
        }

        // Only the send side takes a socket timeout. The read deadline is `socket_reader`'s poll,
        // because SO_RCVTIMEO surfaces as EAGAIN and std.Io treats that as a programmer bug.
        setTimeout(stream, .send, self.options.write_timeout_ms) catch return;

        var head_buffer: [head_buffer_bytes]u8 = undefined;
        var out_buffer: [4 * 1024]u8 = undefined;
        var reader: socket_reader.Reader = .init(
            stream.socket.handle,
            &head_buffer,
            self.options.head_timeout_ms,
        );
        var writer = stream.writer(self.io, &out_buffer);

        var http: std.http.Server = .init(&reader.interface, &writer.interface);
        var head_wait_ms = self.options.head_timeout_ms;
        const key = limiterKey(stream.socket.address);

        while (self.running.load(.acquire)) {
            if (!waitReadable(stream, head_wait_ms)) return;

            var request = http.receiveHead() catch |err| return oversizeReply(&http, err);

            if (request.head.content_length == null and request.head.transfer_encoding == .none) {
                request.head.content_length = 0;
            }

            var target_buffer: [max_logged_target_bytes]u8 = undefined;
            const method = @tagName(request.head.method);
            const target = clamped(&target_buffer, request.head.target);

            // An unrecognised `Expect` fails before anything is written, so the connection is
            // still owed an answer rather than a silent close. Clearing it is what lets that
            // answer go out the normal way: `respondUnflushed` tries to meet the expectation
            // again otherwise, and `readerExpectNone` documents null as how a caller says it has
            // handled one itself.
            const status = self.respond(&request, key, target) catch |err| {
                if (err != error.HttpExpectationFailed) return;

                request.head.expect = null;
                const refused = problem.response(&request, problem.expectation_failed, .{
                    .keep_alive = false,
                }) catch return;

                log.info(log_name, "{s} {s} {f}", .{ method, target, log.fields(.{ .status = refused }) });
                return;
            };

            log.info(log_name, "{s} {s} {f}", .{ method, target, log.fields(.{ .status = status }) });

            if (!request.head.keep_alive) return;

            head_wait_ms = self.options.idle_timeout_ms;
        }
    }

    fn servePair(
        self: *Server,
        request: *std.http.Server.Request,
        key: rate_limit.Key,
        target: []const u8,
        body: []const u8,
    ) !u16 {
        const held = self.pair_gate.acquire(self.io);
        defer held.release();

        return switch (pair.handle(held, nowMs(self.io), key, body)) {
            .problem => |value| problem.response(request, value, .{}),
            .cross => self.crossBridge(request, .pair, target, body),
        };
    }
};

fn limiterKey(address: net.IpAddress) rate_limit.Key {
    return switch (address) {
        .ip4 => |ip4| std.mem.readInt(u32, &ip4.bytes, .big),
        .ip6 => |ip6| if (net.Ip4Address.fromIp6(ip6)) |ip4|
            std.mem.readInt(u32, &ip4.bytes, .big)
        else
            std.mem.readInt(u128, &ip6.bytes, .big),
    };
}

fn nowMs(io: std.Io) i64 {
    return @intCast(@divTrunc(std.Io.Clock.boot.now(io).nanoseconds, std.time.ns_per_ms));
}

fn bodyLimit(route: router.Route) usize {
    return switch (route) {
        .hello => 0,
        .pair => pair.max_body_bytes,
        .intent, .state => unrouted_body_bytes,
    };
}

/// The returned slice points into `buffer` and lives as long as the caller's frame.
/// `readerExpectContinue` answers an `Expect` before anything else is written, which keeps a
/// rejection ahead of the upload it is meant to prevent.
fn readBody(request: *std.http.Server.Request, buffer: []u8) ![]const u8 {
    const length = request.head.content_length orelse 0;
    const reader = try request.readerExpectContinue(buffer);

    return if (length == 0) "" else reader.take(@intCast(length));
}

fn discardPending(stream: net.Stream) void {
    var scratch: [4 * 1024]u8 = undefined;
    var unbuffered: [0]u8 = .{};
    var reader: socket_reader.Reader = .init(stream.socket.handle, &unbuffered, 0);
    var remaining: usize = 64 * 1024;

    while (remaining > 0) {
        var data: [1][]u8 = .{&scratch};
        const read = reader.interface.readVec(&data) catch return;

        if (read == 0) return;

        remaining -|= read;
    }
}

/// `run` blocks, so the C ABI owns a thread for it. A handle rather than a singleton, so start
/// and stop can be tested in a loop.
const Hosted = struct {
    server: Server,
    thread: std.Thread,
};

export fn atolla_http_start(
    host: [*]const u8,
    host_len: usize,
    port: u16,
    dispatch: ?bridge.Dispatch,
    context: ?*anyopaque,
) ?*Hosted {
    const address = net.IpAddress.parseIp4(host[0..host_len], port) catch return null;
    const hosted = std.heap.c_allocator.create(Hosted) catch return null;

    hosted.server = Server.listen(
        std.Io.Threaded.global_single_threaded.io(),
        &address,
        .{ .handler = .{ .context = context, .dispatch = dispatch } },
    ) catch {
        std.heap.c_allocator.destroy(hosted);
        return null;
    };

    hosted.thread = std.Thread.spawn(.{}, Server.run, .{&hosted.server}) catch {
        hosted.server.deinit();
        std.heap.c_allocator.destroy(hosted);
        return null;
    };

    return hosted;
}

export fn atolla_http_set_log_level(level: u8) void {
    log.setLevel(log.Level.fromInt(level) orelse return);
}

export fn atolla_http_set_hello_body(bytes: [*]const u8, len: usize) bool {
    hello.set(bytes[0..len]) catch return false;

    return true;
}

export fn atolla_http_set_pairing_code_path(bytes: [*]const u8, len: usize) bool {
    pair.setCodePath(bytes[0..len]) catch return false;

    return true;
}

export fn atolla_http_port(hosted: *Hosted) u16 {
    return hosted.server.port();
}

export fn atolla_http_stop(hosted: *Hosted) void {
    hosted.server.stop();
    hosted.thread.join();
    hosted.server.deinit();

    std.heap.c_allocator.destroy(hosted);
}

fn clamped(buffer: []u8, text: []const u8) []const u8 {
    const length = @min(buffer.len, text.len);
    @memcpy(buffer[0..length], text[0..length]);

    return buffer[0..length];
}

/// The same JSON body as any other answer, with the status line and headers framed by hand because
/// these two have no parsed request to respond through: the head never arrived intact, or the
/// connection was refused before one was read at all.
fn writeProblem(out: *std.Io.Writer, value: problem.Problem) void {
    const status: std.http.Status = @enumFromInt(value.status);

    var body_buffer: [problem.max_bytes]u8 = undefined;
    const body = problem.render(&body_buffer, value);

    var retry_buffer: [32]u8 = undefined;
    const retry = if (value.retryAfterSeconds) |seconds|
        std.fmt.bufPrint(&retry_buffer, "retry-after: {d}\r\n", .{seconds}) catch ""
    else
        "";

    out.print(
        "HTTP/1.1 {d} {s}\r\ncontent-type: {s}\r\ncontent-length: {d}\r\n{s}connection: close\r\n\r\n{s}",
        .{ value.status, status.phrase() orelse "", problem.content_type.value, body.len, retry, body },
    ) catch return;

    out.flush() catch return;
}

fn oversizeReply(http: *std.http.Server, err: std.http.Server.ReceiveHeadError) void {
    if (err != error.HttpHeadersOversize) return;

    writeProblem(http.out, problem.headers_too_large);
}

fn setTimeout(stream: net.Stream, comptime direction: enum { receive, send }, milliseconds: i32) !void {
    const option = switch (direction) {
        .receive => std.posix.SO.RCVTIMEO,
        .send => std.posix.SO.SNDTIMEO,
    };

    const timeout: std.posix.timeval = .{
        .sec = @divTrunc(milliseconds, 1000),
        .usec = @rem(milliseconds, 1000) * 1000,
    };

    return std.posix.setsockopt(
        stream.socket.handle,
        std.posix.SOL.SOCKET,
        option,
        std.mem.asBytes(&timeout),
    );
}

fn waitReadable(stream: net.Stream, timeout_ms: i32) bool {
    var fds = [_]std.posix.pollfd{.{
        .fd = stream.socket.handle,
        .events = std.posix.POLL.IN,
        .revents = 0,
    }};

    const ready = std.posix.poll(&fds, timeout_ms) catch return false;

    return ready != 0;
}

const testing = std.testing;

const test_options: Options = .{
    .idle_timeout_ms = 1_000,
    .head_timeout_ms = 1_000,
    .write_timeout_ms = 1_000,
};

const Harness = struct {
    server: *Server,
    thread: std.Thread,

    fn start(server: *Server) !Harness {
        return .{ .server = server, .thread = try std.Thread.spawn(.{}, Server.run, .{server}) };
    }

    fn stop(self: *Harness) void {
        self.server.stop();
        self.thread.join();
    }
};

fn testIo() std.Io {
    return std.Io.Threaded.global_single_threaded.io();
}

fn testServer(server: *Server, options: Options) !void {
    const address: net.IpAddress = .{ .ip4 = .loopback(0) };
    server.* = try .listen(testIo(), &address, options);
}

const Connection = struct {
    io: std.Io,
    read_buffer: [4 * 1024]u8 = undefined,
    response: [4 * 1024]u8 = undefined,
    response_len: usize = 0,
    stream: net.Stream,
    write_buffer: [1024]u8 = undefined,

    fn open(port: u16) !*Connection {
        const connection = try testing.allocator.create(Connection);
        const address: net.IpAddress = .{ .ip4 = .loopback(port) };

        connection.* = .{
            .io = testIo(),
            .response_len = 0,
            .stream = try net.IpAddress.connect(&address, testIo(), .{ .mode = .stream }),
        };

        return connection;
    }

    fn close(self: *Connection) void {
        self.stream.close(self.io);
        testing.allocator.destroy(self);
    }

    fn send(self: *Connection, raw: []const u8) !void {
        var writer = self.stream.writer(self.io, &self.write_buffer);

        try writer.interface.writeAll(raw);
        try writer.interface.flush();
    }

    fn status(self: *Connection) !u16 {
        var reader = self.stream.reader(self.io, &self.read_buffer);
        const line = try reader.interface.takeDelimiterExclusive('\n');

        var parts = std.mem.splitScalar(u8, line, ' ');
        _ = parts.next();

        return std.fmt.parseInt(u16, parts.next() orelse return error.NoStatus, 10);
    }

    /// Searches the raw answer rather than parsing it, so a header and a body member match the same
    /// way. The answer is read once and kept, so asking twice does not find the stream drained.
    /// Cannot be mixed with `status`, which reads the same response.
    fn contains(self: *Connection, text: []const u8) !bool {
        if (self.response_len == 0) {
            var unbuffered: [0]u8 = .{};
            var reader = self.stream.reader(self.io, &unbuffered);
            var data: [1][]u8 = .{&self.response};

            self.response_len = try reader.interface.readVec(&data);
        }

        return std.mem.indexOf(u8, self.response[0..self.response_len], text) != null;
    }
};

const valid_pair_body =
    \\{"code":"19524002","controllerId":"p","controllerName":"Phone"}
;

/// No route will ever match this, so these tests keep asserting 404 as routes are added.
const unrouted = "/no-such-route";

const unrouted_request = "GET " ++ unrouted ++ " HTTP/1.1\r\nHost: t\r\n\r\n";

fn get(port: u16) !u16 {
    const connection = try Connection.open(port);
    defer connection.close();

    try connection.send(unrouted_request);

    return connection.status();
}

test "http_server: serves several requests on one connection" {
    var server: Server = undefined;
    try testServer(&server, test_options);
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    const connection = try Connection.open(server.port());
    defer connection.close();

    for (0..3) |_| {
        try connection.send(unrouted_request);
        try testing.expectEqual(404, try connection.status());
    }
}

test "http_server: rejects a head larger than the cap" {
    var server: Server = undefined;
    try testServer(&server, test_options);
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    const connection = try Connection.open(server.port());
    defer connection.close();

    var head: std.ArrayList(u8) = .empty;
    defer head.deinit(testing.allocator);

    try head.appendSlice(testing.allocator, "GET / HTTP/1.1\r\nHost: t\r\n");
    while (head.items.len <= head_buffer_bytes) {
        try head.appendSlice(testing.allocator, "x-pad: " ++ "p" ** 200 ++ "\r\n");
    }
    try head.appendSlice(testing.allocator, "\r\n");

    try connection.send(head.items);

    try testing.expectEqual(431, try connection.status());
}

test "http_server: rejects a body larger than the cap" {
    var server: Server = undefined;
    try testServer(&server, test_options);
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    const connection = try Connection.open(server.port());
    defer connection.close();

    try connection.send("POST / HTTP/1.1\r\nHost: t\r\ncontent-length: 1048577\r\n\r\n");

    try testing.expectEqual(413, try connection.status());
}

test "http_server: holds a silent connection for the head timeout, not the keep-alive" {
    var server: Server = undefined;
    try testServer(&server, .{ .head_timeout_ms = 50, .idle_timeout_ms = 10_000 });
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    const connection = try Connection.open(server.port());
    defer connection.close();

    try testing.expectError(error.EndOfStream, connection.status());
}

// A head that arrives in pieces and then stops: the poll before `receiveHead` is satisfied, so the
// deadline has to hold inside the read as well, and the connection slot has to come back.
test "http_server: gives up on a head that stops half way through" {
    var server: Server = undefined;
    try testServer(&server, .{ .max_connections = 1, .head_timeout_ms = 50, .idle_timeout_ms = 50 });
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    const stalled = try Connection.open(server.port());
    defer stalled.close();

    try stalled.send("GET /hel");

    try testing.expectError(error.EndOfStream, stalled.status());
    try testing.expectEqual(404, try get(server.port()));
}

test "http_server: survives a client that vanishes before reading the response" {
    var server: Server = undefined;
    try testServer(&server, test_options);
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    const connection = try Connection.open(server.port());
    try connection.send(unrouted_request);
    connection.close();

    try testing.expectEqual(404, try get(server.port()));
}

test "http_server: answers 503 once the connection cap is reached" {
    var server: Server = undefined;
    try testServer(&server, .{ .max_connections = 2, .idle_timeout_ms = 1_000, .head_timeout_ms = 1_000 });
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    var held: [2]*Connection = undefined;
    for (&held) |*connection| {
        connection.* = try Connection.open(server.port());
        try connection.*.send(unrouted_request);
        try testing.expectEqual(404, try connection.*.status());
    }
    defer for (held) |connection| connection.close();

    try testing.expectEqual(503, try get(server.port()));
}

test "http_server: serves the hello body it was given" {
    var server: Server = undefined;
    try testServer(&server, test_options);
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    try hello.set("{\"id\":\"kitchen\"}");

    const connection = try Connection.open(server.port());
    defer connection.close();

    try connection.send("GET /hello HTTP/1.1\r\nHost: t\r\n\r\n");

    try testing.expectEqual(200, try connection.status());
}

test "http_server: answers 405 for a route reached with the wrong method" {
    var server: Server = undefined;
    try testServer(&server, test_options);
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    const connection = try Connection.open(server.port());
    defer connection.close();

    try connection.send("POST /hello HTTP/1.1\r\nHost: t\r\ncontent-length: 0\r\n\r\n");

    try testing.expectEqual(405, try connection.status());
}

// A panic in a connection thread aborts the process, so every shape reachable from the LAN has
// to be answerable.
test "http_server: survives request shapes that carry no length header" {
    var server: Server = undefined;
    try testServer(&server, test_options);
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    const hostile = [_][]const u8{
        "POST /hello HTTP/1.1\r\nHost: t\r\n\r\n",
        "POST /nope HTTP/1.1\r\nHost: t\r\n\r\n",
        "PUT /hello HTTP/1.1\r\nHost: t\r\n\r\n",
        "PATCH /nope HTTP/1.1\r\nHost: t\r\n\r\n",
        "DELETE /hello HTTP/1.1\r\nHost: t\r\n\r\n",
        "POST /hello HTTP/1.1\r\nHost: t\r\nExpect: 100-continue\r\n\r\n",
        "POST /hello HTTP/1.1\r\nHost: t\r\nExpect: something-else\r\n\r\n",
        "HEAD /hello HTTP/1.1\r\nHost: t\r\n\r\n",
        "OPTIONS /hello HTTP/1.1\r\nHost: t\r\n\r\n",
    };

    for (hostile) |raw| {
        const connection = try Connection.open(server.port());
        defer connection.close();

        try connection.send(raw);
        _ = connection.status() catch {};
    }

    try testing.expectEqual(404, try get(server.port()));
}

test "http_server: answers 417 for an expectation it cannot meet" {
    var server: Server = undefined;
    try testServer(&server, test_options);
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    const connection = try Connection.open(server.port());
    defer connection.close();

    try connection.send("GET /hello HTTP/1.1\r\nHost: t\r\nExpect: nonsense\r\n\r\n");

    try testing.expectEqual(417, try connection.status());
}

test "http_server: answers a body-bearing method that declares no length" {
    var server: Server = undefined;
    try testServer(&server, test_options);
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    const connection = try Connection.open(server.port());
    defer connection.close();

    try connection.send("POST /hello HTTP/1.1\r\nHost: t\r\n\r\n");

    try testing.expectEqual(405, try connection.status());
}

/// Answers on another thread, like the bridge does, so the wait is not skipped.
const StubHandler = struct {
    status: u16,
    body: []const u8,
    seen: [64]u8 = undefined,
    seen_len: usize = 0,

    fn dispatch(
        context: ?*anyopaque,
        request_id: u64,
        route: u32,
        target: [*]const u8,
        target_len: usize,
        body: [*]const u8,
        body_len: usize,
    ) callconv(.c) void {
        _ = route;
        _ = target;
        _ = target_len;

        const self: *StubHandler = @ptrCast(@alignCast(context.?));

        // Copied: the slice dies with the request the connection thread is holding.
        self.seen_len = @min(self.seen.len, body_len);
        @memcpy(self.seen[0..self.seen_len], body[0..self.seen_len]);

        const thread = std.Thread.spawn(.{}, answer, .{ self, request_id }) catch return;

        thread.detach();
    }

    fn answer(self: *StubHandler, request_id: u64) void {
        _ = bridge.atolla_http_respond(request_id, self.status, self.body.ptr, self.body.len);
    }

    fn handler(self: *StubHandler) bridge.Handler {
        return .{ .context = self, .dispatch = dispatch };
    }
};

test "http_server: carries a handler's answer back to the client" {
    var stub: StubHandler = .{ .status = 501, .body = "{\"error\":\"notImplemented\"}" };

    var server: Server = undefined;
    try testServer(&server, .{ .handler = stub.handler(), .head_timeout_ms = 1_000 });
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    const connection = try Connection.open(server.port());
    defer connection.close();

    try connection.send("POST /intent HTTP/1.1\r\nHost: t\r\ncontent-length: 0\r\n\r\n");

    try testing.expectEqual(501, try connection.status());
}

test "http_server: hands the handler the body it was sent" {
    var stub: StubHandler = .{ .status = 200, .body = "{}" };

    var server: Server = undefined;
    try testServer(&server, .{ .handler = stub.handler(), .head_timeout_ms = 1_000 });
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    const connection = try Connection.open(server.port());
    defer connection.close();

    try connection.send("POST /intent HTTP/1.1\r\nHost: t\r\ncontent-length: 13\r\n\r\n{\"code\":\"12\"}");

    try testing.expectEqual(200, try connection.status());
    try testing.expectEqualStrings("{\"code\":\"12\"}", stub.seen[0..stub.seen_len]);
}

test "http_server: hands the handler an empty body when the request carries none" {
    var stub: StubHandler = .{ .status = 200, .body = "{}", .seen_len = 99 };

    var server: Server = undefined;
    try testServer(&server, .{ .handler = stub.handler(), .head_timeout_ms = 1_000 });
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    const connection = try Connection.open(server.port());
    defer connection.close();

    try connection.send("POST /intent HTTP/1.1\r\nHost: t\r\ncontent-length: 0\r\n\r\n");

    try testing.expectEqual(200, try connection.status());
    try testing.expectEqual(0, stub.seen_len);
}

// libcurl sends this for bodies over ~1KB, and Valdi's HTTP stack is libcurl.
test "http_server: hands the handler a body that was announced with an expectation" {
    var stub: StubHandler = .{ .status = 200, .body = "{}" };

    var server: Server = undefined;
    try testServer(&server, .{ .handler = stub.handler(), .head_timeout_ms = 1_000 });
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    const connection = try Connection.open(server.port());
    defer connection.close();

    try connection.send(
        "POST /intent HTTP/1.1\r\nHost: t\r\ncontent-length: 4\r\nExpect: 100-continue\r\n\r\nabcd",
    );

    try testing.expectEqual(100, try connection.status());
    try testing.expectEqual(200, try connection.status());
    try testing.expectEqualStrings("abcd", stub.seen[0..stub.seen_len]);
}

test "http_server: refuses a bridged body larger than it can hold" {
    var stub: StubHandler = .{ .status = 200, .body = "{}" };

    var server: Server = undefined;
    try testServer(&server, .{ .handler = stub.handler(), .head_timeout_ms = 1_000 });
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    const connection = try Connection.open(server.port());
    defer connection.close();

    try connection.send(std.fmt.comptimePrint(
        "POST /intent HTTP/1.1\r\nHost: t\r\ncontent-length: {d}\r\n\r\n",
        .{unrouted_body_bytes + 1},
    ));

    try testing.expectEqual(413, try connection.status());
}

test "http_server: answers 400 for a body that stops short of its length" {
    var stub: StubHandler = .{ .status = 200, .body = "{}" };

    var server: Server = undefined;
    try testServer(&server, .{ .handler = stub.handler(), .head_timeout_ms = 1_000 });
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    const connection = try Connection.open(server.port());
    defer connection.close();

    try connection.send("POST /intent HTTP/1.1\r\nHost: t\r\ncontent-length: 20\r\n\r\nshort");

    try testing.expectEqual(400, try connection.status());
}

test "http_server: refuses a version it does not speak, before reading the body" {
    var stub: StubHandler = .{ .status = 200, .body = "{}" };

    var server: Server = undefined;
    try testServer(&server, .{ .handler = stub.handler(), .head_timeout_ms = 1_000 });
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    const connection = try Connection.open(server.port());
    defer connection.close();

    try connection.send(
        "POST /pair HTTP/1.1\r\nHost: t\r\nAtolla-API-Version: 9\r\ncontent-length: 2\r\n\r\n{}",
    );

    try testing.expectEqual(400, try connection.status());
    try testing.expectEqual(0, stub.seen_len);
}

test "http_server: takes a request that names no version as the current one" {
    var stub: StubHandler = .{ .status = 200, .body = "{}" };

    var server: Server = undefined;
    try testServer(&server, .{ .handler = stub.handler(), .head_timeout_ms = 1_000 });
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    const connection = try Connection.open(server.port());
    defer connection.close();

    try connection.send("POST /intent HTTP/1.1\r\nHost: t\r\ncontent-length: 2\r\n\r\n{}");

    try testing.expectEqual(200, try connection.status());
}

test "http_server: crosses a pair request carrying the provisioned code" {
    var stub: StubHandler = .{ .status = 200, .body = "{\"token\":\"t\"}" };

    var server: Server = undefined;
    try testServer(&server, .{ .handler = stub.handler(), .head_timeout_ms = 1_000 });
    defer server.deinit();

    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();
    try tmp.dir.writeFile(testing.io, .{ .sub_path = "pairing", .data = "19524002" });

    var path_buffer: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const path = try std.fmt.bufPrint(&path_buffer, ".zig-cache/tmp/{s}/pairing", .{tmp.sub_path});

    try testing.expect(atolla_http_set_pairing_code_path(path.ptr, path.len));

    var harness = try Harness.start(&server);
    defer harness.stop();

    const connection = try Connection.open(server.port());
    defer connection.close();

    try connection.send(std.fmt.comptimePrint(
        "POST /pair HTTP/1.1\r\nHost: t\r\ncontent-length: {d}\r\n\r\n{s}",
        .{ valid_pair_body.len, valid_pair_body },
    ));

    try testing.expectEqual(200, try connection.status());
    try testing.expectEqualStrings(valid_pair_body, stub.seen[0..stub.seen_len]);
}

test "http_server: an unprovisioned daemon refuses to pair rather than crossing" {
    var stub: StubHandler = .{ .status = 200, .body = "{}" };

    var server: Server = undefined;
    try testServer(&server, .{ .handler = stub.handler(), .head_timeout_ms = 1_000 });
    defer server.deinit();

    try pair.setCodePath("/nonexistent/atolla/pairing");

    var harness = try Harness.start(&server);
    defer harness.stop();

    const connection = try Connection.open(server.port());
    defer connection.close();

    try connection.send(std.fmt.comptimePrint(
        "POST /pair HTTP/1.1\r\nHost: t\r\ncontent-length: {d}\r\n\r\n{s}",
        .{ valid_pair_body.len, valid_pair_body },
    ));

    try testing.expectEqual(401, try connection.status());
    try testing.expectEqual(0, stub.seen_len);
}

test "http_server: answers /hello whatever version was asked for" {
    var server: Server = undefined;
    try testServer(&server, test_options);
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    try hello.set("{}");

    for ([_][]const u8{ "1", "9", "banana" }) |version| {
        const connection = try Connection.open(server.port());
        defer connection.close();

        var request_buffer: [128]u8 = undefined;
        const request = try std.fmt.bufPrint(
            &request_buffer,
            "GET /hello HTTP/1.1\r\nHost: t\r\nAtolla-API-Version: {s}\r\n\r\n",
            .{version},
        );

        try connection.send(request);
        try testing.expectEqual(200, try connection.status());
    }
}

test "http_server: refuses a pair body it cannot parse, without crossing" {
    var stub: StubHandler = .{ .status = 200, .body = "{}" };

    var server: Server = undefined;
    try testServer(&server, .{ .handler = stub.handler(), .head_timeout_ms = 1_000 });
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    const connection = try Connection.open(server.port());
    defer connection.close();

    try connection.send("POST /pair HTTP/1.1\r\nHost: t\r\ncontent-length: 7\r\n\r\nnot me!");

    try testing.expectEqual(400, try connection.status());
    try testing.expectEqual(0, stub.seen_len);
}

test "http_server: refuses a pair body over the route's own cap" {
    var server: Server = undefined;
    try testServer(&server, test_options);
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    const connection = try Connection.open(server.port());
    defer connection.close();

    try connection.send(std.fmt.comptimePrint(
        "POST /pair HTTP/1.1\r\nHost: t\r\ncontent-length: {d}\r\n\r\n",
        .{pair.max_body_bytes + 1},
    ));

    try testing.expectEqual(413, try connection.status());
}

test "http_server: answers every refusal with a problem, whatever refused it" {
    var server: Server = undefined;
    try testServer(&server, .{ .head_timeout_ms = 1_000 });
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    const refusals = [_]struct { request: []const u8, code: []const u8 }{
        .{ .request = "GET /no-such-route HTTP/1.1\r\nHost: t\r\n\r\n", .code = "not_found" },
        .{ .request = "GET /pair HTTP/1.1\r\nHost: t\r\n\r\n", .code = "method_not_allowed" },
        .{
            .request = "POST /pair HTTP/1.1\r\nHost: t\r\ntransfer-encoding: chunked\r\n\r\n",
            .code = "length_required",
        },
        .{
            .request = "POST /pair HTTP/1.1\r\nHost: t\r\nAtolla-API-Version: 9\r\ncontent-length: 2\r\n\r\n{}",
            .code = "unsupported_api_version",
        },
        .{
            .request = "POST /pair HTTP/1.1\r\nHost: t\r\ncontent-length: 7\r\n\r\nnope!!!",
            .code = "malformed_body",
        },
        // Nothing is attached to answer a routed request in this server.
        .{
            .request = "POST /intent HTTP/1.1\r\nHost: t\r\ncontent-length: 0\r\n\r\n",
            .code = "unavailable",
        },
        .{ .request = "GET /hello HTTP/1.1\r\nHost: t\r\nExpect: nonsense\r\n\r\n", .code = "expectation_failed" },
    };

    for (refusals) |refusal| {
        const connection = try Connection.open(server.port());
        defer connection.close();

        try connection.send(refusal.request);

        try testing.expect(try connection.contains("content-type: application/problem+json"));
        try testing.expect(try connection.contains(refusal.code));
    }
}

test "http_server: answers 504 when the handler never does" {
    const silent = struct {
        fn dispatch(_: ?*anyopaque, _: u64, _: u32, _: [*]const u8, _: usize, _: [*]const u8, _: usize) callconv(.c) void {}
    };

    var server: Server = undefined;
    try testServer(&server, .{
        .handler = .{ .dispatch = silent.dispatch },
        .handler_timeout_ms = 50,
        .head_timeout_ms = 1_000,
    });
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    const connection = try Connection.open(server.port());
    defer connection.close();

    try connection.send("POST /intent HTTP/1.1\r\nHost: t\r\ncontent-length: 0\r\n\r\n");

    try testing.expectEqual(504, try connection.status());
}

test "http_server: answers 503 when nothing is attached to answer" {
    var server: Server = undefined;
    try testServer(&server, test_options);
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    const connection = try Connection.open(server.port());
    defer connection.close();

    try connection.send("POST /intent HTTP/1.1\r\nHost: t\r\ncontent-length: 0\r\n\r\n");

    try testing.expectEqual(503, try connection.status());
}

test "http_server: answers /hello without reaching the handler" {
    const refuses = struct {
        fn dispatch(_: ?*anyopaque, _: u64, _: u32, _: [*]const u8, _: usize, _: [*]const u8, _: usize) callconv(.c) void {
            unreachable;
        }
    };

    var server: Server = undefined;
    try testServer(&server, .{ .handler = .{ .dispatch = refuses.dispatch }, .head_timeout_ms = 1_000 });
    defer server.deinit();

    var harness = try Harness.start(&server);
    defer harness.stop();

    try hello.set("{}");

    const connection = try Connection.open(server.port());
    defer connection.close();

    try connection.send("GET /hello HTTP/1.1\r\nHost: t\r\n\r\n");

    try testing.expectEqual(200, try connection.status());
}

test "http_server: serves and shuts down through the C ABI" {
    const host = "127.0.0.1";
    const hosted = atolla_http_start(host, host.len, 0, null, null) orelse return error.StartFailed;

    try testing.expectEqual(404, try get(atolla_http_port(hosted)));

    atolla_http_stop(hosted);
}

test "http_server: a second server can be hosted after the first is stopped" {
    const host = "127.0.0.1";

    const first = atolla_http_start(host, host.len, 0, null, null) orelse return error.StartFailed;
    const port = atolla_http_port(first);
    atolla_http_stop(first);

    const second = atolla_http_start(host, host.len, 0, null, null) orelse return error.StartFailed;
    defer atolla_http_stop(second);

    try testing.expect(atolla_http_port(second) != 0);
    try testing.expectEqual(404, try get(atolla_http_port(second)));
    try testing.expect(port != 0);
}

const peer: net.Ip4Address = .{ .bytes = .{ 10, 0, 0, 1 }, .port = 51_000 };

test "http_server: keys a connection on the peer it came from" {
    try testing.expectEqual(0x0a00_0001, limiterKey(.{ .ip4 = peer }));
}

test "http_server: keys the same peer whatever port it dialled from" {
    const redialled: net.Ip4Address = .{ .bytes = peer.bytes, .port = 62_000 };

    try testing.expectEqual(limiterKey(.{ .ip4 = peer }), limiterKey(.{ .ip4 = redialled }));
}

test "http_server: keys a v4-mapped address the same as the bare one" {
    try testing.expectEqual(
        limiterKey(.{ .ip4 = peer }),
        limiterKey(.{ .ip6 = .fromIp4(peer) }),
    );
}

test "http_server: keys two peers separately" {
    const neighbour: net.Ip4Address = .{ .bytes = .{ 10, 0, 0, 2 }, .port = peer.port };

    try testing.expect(limiterKey(.{ .ip4 = peer }) != limiterKey(.{ .ip4 = neighbour }));
}

test "http_server: refuses a host it cannot parse rather than binding something else" {
    const host = "not-an-address";

    try testing.expectEqual(null, atolla_http_start(host, host.len, 0, null, null));
}
