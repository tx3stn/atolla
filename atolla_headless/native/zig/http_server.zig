const std = @import("std");
const net = std.Io.net;
const bridge = @import("bridge.zig");
const hello = @import("hello.zig");
const log = @import("log.zig");
const router = @import("router.zig");

/// `std.http.Server` caps the head at the reader buffer's size, so this is the header limit and
/// not just an allocation.
const head_buffer_bytes = 8 * 1024;

const reject_timeout_ms = 1_000;

const max_logged_target_bytes = 128;

const log_name = "server";

const over_capacity_response =
    "HTTP/1.1 503 Service Unavailable\r\n" ++
    "content-length: 0\r\n" ++
    "retry-after: 1\r\n" ++
    "connection: close\r\n\r\n";

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

    fn crossBridge(self: *Server, request: *std.http.Server.Request, route: router.Route, target: []const u8) !u16 {
        const dispatch = self.options.handler.dispatch orelse {
            log.err(log_name, "no handler attached {f}", .{log.fields(.{ .route = @tagName(route) })});
            try request.respond("", .{ .status = .service_unavailable, .keep_alive = false });
            return 503;
        };

        const id = bridge.pending.claim(self.io) orelse {
            log.warn(log_name, "no free slot to answer in {f}", .{log.fields(.{ .route = @tagName(route) })});
            try request.respond("", .{ .status = .service_unavailable, .keep_alive = false });
            return 503;
        };
        defer bridge.pending.release(self.io, id);

        dispatch(self.options.handler.context, id, @intFromEnum(route), target.ptr, target.len);

        const answer = bridge.pending.awaitResponse(self.io, id, self.options.handler_timeout_ms) orelse {
            log.warn(log_name, "handler did not answer {f}", .{log.fields(.{ .route = @tagName(route) })});
            try request.respond("", .{ .status = .gateway_timeout, .keep_alive = false });
            return 504;
        };

        try request.respond(answer.body, .{ .status = @enumFromInt(answer.status) });

        return answer.status;
    }

    fn reject(self: *Server, stream: net.Stream) void {
        defer stream.close(self.io);

        setTimeout(stream, .send, reject_timeout_ms) catch return;

        var out_buffer: [128]u8 = undefined;
        var writer = stream.writer(self.io, &out_buffer);

        writer.interface.writeAll(over_capacity_response) catch return;
        writer.interface.flush() catch return;
    }

    fn respond(self: *Server, request: *std.http.Server.Request, target: []const u8) !u16 {
        if (request.head.transfer_encoding == .chunked) {
            try request.respond("", .{ .status = .length_required, .keep_alive = false });
            return 411;
        }

        if ((request.head.content_length orelse 0) > self.options.max_body_bytes) {
            try request.respond("", .{ .status = .payload_too_large, .keep_alive = false });
            return 413;
        }

        switch (router.resolve(request.head.method, request.head.target)) {
            .route => |route| switch (route) {
                .hello => {
                    try hello.respond(request);
                    return 200;
                },
                else => return self.crossBridge(request, route, target),
            },
            .method_not_allowed => {
                try request.respond("", .{ .status = .method_not_allowed });
                return 405;
            },
            .not_found => {
                try request.respond("", .{ .status = .not_found });
                return 404;
            },
        }
    }

    fn serve(self: *Server, stream: net.Stream) void {
        defer {
            discardPending(self.io, stream);
            stream.close(self.io);
            _ = self.active.fetchSub(1, .acq_rel);
        }

        setTimeout(stream, .send, self.options.write_timeout_ms) catch return;
        setTimeout(stream, .receive, self.options.head_timeout_ms) catch return;

        var head_buffer: [head_buffer_bytes]u8 = undefined;
        var out_buffer: [4 * 1024]u8 = undefined;
        var reader = stream.reader(self.io, &head_buffer);
        var writer = stream.writer(self.io, &out_buffer);

        var http: std.http.Server = .init(&reader.interface, &writer.interface);
        var head_wait_ms = self.options.head_timeout_ms;

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
            // still owed an answer rather than a silent close.
            const status = self.respond(&request, target) catch |err| {
                if (err == error.HttpExpectationFailed) {
                    rawReply(&http, "HTTP/1.1 417 Expectation Failed\r\ncontent-length: 0\r\nconnection: close\r\n\r\n");
                    log.info(log_name, "{s} {s} {f}", .{ method, target, log.fields(.{ .status = 417 }) });
                }

                return;
            };

            log.info(log_name, "{s} {s} {f}", .{ method, target, log.fields(.{ .status = status }) });

            if (!request.head.keep_alive) return;

            head_wait_ms = self.options.idle_timeout_ms;
        }
    }
};

fn discardPending(io: std.Io, stream: net.Stream) void {
    var scratch: [4 * 1024]u8 = undefined;
    var unbuffered: [0]u8 = .{};
    var reader = stream.reader(io, &unbuffered);
    var remaining: usize = 64 * 1024;

    while (remaining > 0 and waitReadable(stream, 0)) {
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

export fn atolla_http_start(port: u16, dispatch: ?bridge.Dispatch, context: ?*anyopaque) ?*Hosted {
    const hosted = std.heap.smp_allocator.create(Hosted) catch return null;
    const address: net.IpAddress = .{ .ip4 = .unspecified(port) };

    hosted.server = Server.listen(
        std.Io.Threaded.global_single_threaded.io(),
        &address,
        .{ .handler = .{ .context = context, .dispatch = dispatch } },
    ) catch {
        std.heap.smp_allocator.destroy(hosted);
        return null;
    };

    hosted.thread = std.Thread.spawn(.{}, Server.run, .{&hosted.server}) catch {
        hosted.server.deinit();
        std.heap.smp_allocator.destroy(hosted);
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

export fn atolla_http_port(hosted: *Hosted) u16 {
    return hosted.server.port();
}

export fn atolla_http_stop(hosted: *Hosted) void {
    hosted.server.stop();
    hosted.thread.join();
    hosted.server.deinit();

    std.heap.smp_allocator.destroy(hosted);
}

fn clamped(buffer: []u8, text: []const u8) []const u8 {
    const length = @min(buffer.len, text.len);
    @memcpy(buffer[0..length], text[0..length]);

    return buffer[0..length];
}

/// For answers that cannot go through `Request.respond`, either because there is no usable
/// `Request` or because responding is what failed.
fn rawReply(http: *std.http.Server, response: []const u8) void {
    http.out.writeAll(response) catch return;
    http.out.flush() catch return;
}

fn oversizeReply(http: *std.http.Server, err: std.http.Server.ReceiveHeadError) void {
    if (err != error.HttpHeadersOversize) return;

    rawReply(http, "HTTP/1.1 431 Request Header Fields Too Large\r\ncontent-length: 0\r\nconnection: close\r\n\r\n");
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
    stream: net.Stream,
    write_buffer: [1024]u8 = undefined,

    fn open(port: u16) !*Connection {
        const connection = try testing.allocator.create(Connection);
        const address: net.IpAddress = .{ .ip4 = .loopback(port) };

        connection.* = .{
            .io = testIo(),
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
};

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

    fn dispatch(context: ?*anyopaque, request_id: u64, route: u32, target: [*]const u8, target_len: usize) callconv(.c) void {
        _ = route;
        _ = target;
        _ = target_len;

        const self: *StubHandler = @ptrCast(@alignCast(context.?));
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

    try connection.send("POST /pair HTTP/1.1\r\nHost: t\r\ncontent-length: 0\r\n\r\n");

    try testing.expectEqual(501, try connection.status());
}

test "http_server: answers 504 when the handler never does" {
    const silent = struct {
        fn dispatch(_: ?*anyopaque, _: u64, _: u32, _: [*]const u8, _: usize) callconv(.c) void {}
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

    try connection.send("POST /pair HTTP/1.1\r\nHost: t\r\ncontent-length: 0\r\n\r\n");

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

    try connection.send("POST /pair HTTP/1.1\r\nHost: t\r\ncontent-length: 0\r\n\r\n");

    try testing.expectEqual(503, try connection.status());
}

test "http_server: answers /hello without reaching the handler" {
    const refuses = struct {
        fn dispatch(_: ?*anyopaque, _: u64, _: u32, _: [*]const u8, _: usize) callconv(.c) void {
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
    const hosted = atolla_http_start(0, null, null) orelse return error.StartFailed;

    try testing.expectEqual(404, try get(atolla_http_port(hosted)));

    atolla_http_stop(hosted);
}

test "http_server: a second server can be hosted after the first is stopped" {
    const first = atolla_http_start(0, null, null) orelse return error.StartFailed;
    const port = atolla_http_port(first);
    atolla_http_stop(first);

    const second = atolla_http_start(0, null, null) orelse return error.StartFailed;
    defer atolla_http_stop(second);

    try testing.expect(atolla_http_port(second) != 0);
    try testing.expectEqual(404, try get(atolla_http_port(second)));
    try testing.expect(port != 0);
}
