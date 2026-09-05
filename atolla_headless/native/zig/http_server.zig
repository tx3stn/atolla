const std = @import("std");
const net = std.Io.net;

/// `std.http.Server` caps the head at the size of the reader's buffer, so this
/// constant is the 8 KiB header limit rather than merely sizing an allocation.
const head_buffer_bytes = 8 * 1024;

/// Sent from the accept thread, so its timeout is short: a client that will not
/// read its own rejection must not hold up the next connection.
const reject_timeout_ms = 1_000;

const over_capacity_response =
    "HTTP/1.1 503 Service Unavailable\r\n" ++
    "content-length: 0\r\n" ++
    "retry-after: 1\r\n" ++
    "connection: close\r\n\r\n";

pub const Options = struct {
    /// Reached in normal use rather than only under attack, since each
    /// long-poll holds a connection, so exceeding it is answered not dropped.
    max_connections: usize = 32,
    max_body_bytes: u64 = 1024 * 1024,
    /// Granted only once a connection has completed a request. Until then a
    /// silent client gets `head_timeout_ms`, so it cannot squat a slot for
    /// thirty seconds without ever reaching the rate limiter.
    idle_timeout_ms: i32 = 30_000,
    head_timeout_ms: i32 = 5_000,
    write_timeout_ms: i32 = 30_000,
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
            // reuse_address: a restarted daemon must rebind immediately. Without it the
            // sockets left in TIME_WAIT by the previous run refuse the port for a minute
            // or so, which turns systemd's Restart=always into a minute of silence.
            .listener = try net.IpAddress.listen(address, io, .{
                .mode = .stream,
                .reuse_address = true,
            }),
            .options = options,
            .running = .init(true),
        };
    }

    /// Waits for the connection threads, which are detached and hold `self`
    /// until they decrement `active` as their last act. Without this, tearing
    /// down after `stop` frees the listener under a thread still using it.
    pub fn deinit(self: *Server) void {
        while (self.active.load(.acquire) != 0) std.Thread.yield() catch {};

        self.listener.deinit(self.io);
    }

    pub fn port(self: *const Server) u16 {
        return self.listener.socket.address.getPort();
    }

    /// Blocks until `stop` is called.
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

    /// Safe to call from another thread; unblocks `run`.
    ///
    /// Connects to our own listener to wake it: `shutdown` on a listening
    /// socket unblocks `accept` on Linux but is a no-op on Darwin, and
    /// `socketpair` needs a unix family `std.Io.net` cannot express.
    pub fn stop(self: *Server) void {
        self.running.store(false, .release);

        const stream = net.IpAddress.connect(
            &self.listener.socket.address,
            self.io,
            .{ .mode = .stream },
        ) catch return;

        stream.close(self.io);
    }

    fn reject(self: *Server, stream: net.Stream) void {
        defer stream.close(self.io);

        setTimeout(stream, .send, reject_timeout_ms) catch return;

        var out_buffer: [128]u8 = undefined;
        var writer = stream.writer(self.io, &out_buffer);

        writer.interface.writeAll(over_capacity_response) catch return;
        writer.interface.flush() catch return;
    }

    fn serve(self: *Server, stream: net.Stream) void {
        defer {
            discardPending(stream);
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

            respond(&request, self.options.max_body_bytes) catch return;

            if (!request.head.keep_alive) return;

            head_wait_ms = self.options.idle_timeout_ms;
        }
    }
};

/// Closing a socket with data still unread makes the kernel send RST, and an
/// RST discards whatever the peer has not yet read — including the error
/// response explaining why it was refused. Bounded, because the peer that
/// overran a limit is exactly the one that might keep talking forever.
fn discardPending(stream: net.Stream) void {
    var scratch: [4 * 1024]u8 = undefined;
    var remaining: usize = 64 * 1024;

    while (remaining > 0 and waitReadable(stream, 0)) {
        const read = std.posix.read(stream.socket.handle, &scratch) catch return;

        if (read == 0) return;

        remaining -|= read;
    }
}

/// `run` blocks, so the C ABI owns a thread for it and hands C++ back an opaque
/// handle rather than a singleton: nothing about the transport needs there to
/// be only one, and a handle keeps start/stop testable in a loop.
const Hosted = struct {
    server: Server,
    thread: std.Thread,
};

export fn atolla_http_start(port: u16) ?*Hosted {
    const hosted = std.heap.c_allocator.create(Hosted) catch return null;
    const address: net.IpAddress = .{ .ip4 = .unspecified(port) };

    hosted.server = Server.listen(
        std.Io.Threaded.global_single_threaded.io(),
        &address,
        .{},
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

export fn atolla_http_port(hosted: *Hosted) u16 {
    return hosted.server.port();
}

export fn atolla_http_stop(hosted: *Hosted) void {
    hosted.server.stop();
    hosted.thread.join();
    hosted.server.deinit();

    std.heap.c_allocator.destroy(hosted);
}

fn oversizeReply(http: *std.http.Server, err: std.http.Server.ReceiveHeadError) void {
    if (err != error.HttpHeadersOversize) return;

    http.out.writeAll("HTTP/1.1 431 Request Header Fields Too Large\r\ncontent-length: 0\r\nconnection: close\r\n\r\n") catch return;
    http.out.flush() catch return;
}

fn respond(request: *std.http.Server.Request, max_body_bytes: u64) !void {
    if (request.head.transfer_encoding == .chunked) {
        return request.respond("", .{ .status = .length_required, .keep_alive = false });
    }

    if ((request.head.content_length orelse 0) > max_body_bytes) {
        return request.respond("", .{ .status = .payload_too_large, .keep_alive = false });
    }

    return request.respond("", .{ .status = .not_found });
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

/// A target no route will ever claim, so these transport tests keep asserting
/// 404 once slice E starts routing.
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

test "http_server: serves and shuts down through the C ABI" {
    const hosted = atolla_http_start(0) orelse return error.StartFailed;

    try testing.expectEqual(404, try get(atolla_http_port(hosted)));

    atolla_http_stop(hosted);
}

test "http_server: a second server can be hosted after the first is stopped" {
    const first = atolla_http_start(0) orelse return error.StartFailed;
    const port = atolla_http_port(first);
    atolla_http_stop(first);

    const second = atolla_http_start(0) orelse return error.StartFailed;
    defer atolla_http_stop(second);

    try testing.expect(atolla_http_port(second) != 0);
    try testing.expectEqual(404, try get(atolla_http_port(second)));
    try testing.expect(port != 0);
}
