//! A `std.Io.Reader` over a socket, with the read deadline enforced by `poll` rather than
//! `SO_RCVTIMEO`.
//!
//! `std.Io.net.Stream.Reader` reads through `std.Io.Threaded`, whose errno table treats `EAGAIN`
//! as a programmer bug: it panics on one in Debug and returns `error.Unexpected` otherwise.
//! `SO_RCVTIMEO` expiry *is* `EAGAIN`, so the one socket option that bounds a read is the one that
//! path cannot express — a stalled client aborts `zig test` and reaches the daemon as an error
//! indistinguishable from a bug. Waiting for readiness instead keeps the deadline and leaves a
//! stall as an ordinary `error.Timeout` in every optimization mode.
//!
//! **The writer deliberately stays on `std.Io.net.Stream.Writer`.** Its `sendmsg` carries
//! `MSG_NOSIGNAL`, and nothing else in this daemon does — a hand-rolled writer would hand back the
//! SIGPIPE that kills a process writing to a peer that has gone away.

const std = @import("std");
const posix = std.posix;

/// What `std.Io.net` allows itself, and readv is bounded the same way.
const max_vectors = 8;

pub const Error = error{
    ConnectionResetByPeer,
    NetworkDown,
    SocketUnconnected,
    SystemResources,
    Timeout,
    Unexpected,
};

pub const Reader = struct {
    /// Why `readVec` failed, which the interface flattens to `error.ReadFailed`.
    err: ?Error = null,
    handle: posix.fd_t,
    interface: std.Io.Reader,
    timeout_ms: i32,

    pub fn init(handle: posix.fd_t, buffer: []u8, timeout_ms: i32) Reader {
        return .{
            .handle = handle,
            .interface = .{
                .vtable = &.{ .readVec = readVec, .stream = stream },
                .buffer = buffer,
                .seek = 0,
                .end = 0,
            },
            .timeout_ms = timeout_ms,
        };
    }

    fn stream(
        io_r: *std.Io.Reader,
        io_w: *std.Io.Writer,
        limit: std.Io.Limit,
    ) std.Io.Reader.StreamError!usize {
        const destination = limit.slice(try io_w.writableSliceGreedy(1));
        var data: [1][]u8 = .{destination};

        const count = try readVec(io_r, &data);
        io_w.advance(count);

        return count;
    }

    fn readVec(io_r: *std.Io.Reader, data: [][]u8) std.Io.Reader.Error!usize {
        const self: *Reader = @alignCast(@fieldParentPtr("interface", io_r));

        var slices: [max_vectors][]u8 = undefined;
        const slice_count, const data_size = try io_r.writableVector(&slices, data);

        var vectors: [max_vectors]posix.iovec = undefined;
        for (slices[0..slice_count], vectors[0..slice_count]) |slice, *vector| {
            vector.* = .{ .base = slice.ptr, .len = slice.len };
        }

        const count = self.receive(vectors[0..slice_count]) catch |err| {
            self.err = err;
            return error.ReadFailed;
        };

        if (count == 0) return error.EndOfStream;

        // More arrived than the caller asked for, so the surplus stays in `buffer` for next time.
        if (count > data_size) {
            io_r.end += count - data_size;
            return data_size;
        }

        return count;
    }

    fn receive(self: *Reader, vectors: []posix.iovec) Error!usize {
        while (true) {
            if (!try self.ready()) return error.Timeout;

            const result = posix.system.readv(self.handle, vectors.ptr, @intCast(vectors.len));

            switch (posix.errno(result)) {
                .SUCCESS => return @intCast(result),
                .INTR => continue,
                // Readiness is not a promise — a segment can fail its checksum between the poll
                // and the read — so this waits again rather than reporting a stall that is not one.
                .AGAIN => continue,
                .CONNRESET => return error.ConnectionResetByPeer,
                .NETDOWN => return error.NetworkDown,
                .NOBUFS, .NOMEM => return error.SystemResources,
                .NOTCONN, .PIPE => return error.SocketUnconnected,
                .TIMEDOUT => return error.Timeout,
                else => return error.Unexpected,
            }
        }
    }

    fn ready(self: *Reader) Error!bool {
        var fds = [_]posix.pollfd{.{
            .fd = self.handle,
            .events = posix.POLL.IN,
            .revents = 0,
        }};

        // poix.poll retries EINTR itself, so anything left is a real failure.
        const count = posix.poll(&fds, self.timeout_ms) catch return error.Unexpected;

        return count != 0;
    }
};

const testing = std.testing;

const net = std.Io.net;

fn testIo() std.Io {
    return std.Io.Threaded.global_single_threaded.io();
}

/// A connected loopback pair, so a test can hold one end silent.
const Pair = struct {
    client: net.Stream,
    client_open: bool = true,
    io: std.Io,
    server: net.Server,
    accepted: net.Stream,

    fn open() !Pair {
        const io = testIo();
        const address: net.IpAddress = .{ .ip4 = .loopback(0) };

        var server = try net.IpAddress.listen(&address, io, .{ .mode = .stream });
        errdefer server.deinit(io);

        const peer: net.IpAddress = .{ .ip4 = .loopback(server.socket.address.getPort()) };
        const client = try net.IpAddress.connect(&peer, io, .{ .mode = .stream });
        errdefer client.close(io);

        return .{ .accepted = try server.accept(io), .client = client, .io = io, .server = server };
    }

    fn close(self: *Pair) void {
        self.accepted.close(self.io);
        self.closeClient();
        self.server.deinit(self.io);
    }

    fn closeClient(self: *Pair) void {
        if (!self.client_open) return;

        self.client.close(self.io);
        self.client_open = false;
    }

    fn send(self: *Pair, bytes: []const u8) !void {
        var buffer: [256]u8 = undefined;
        var writer = self.client.writer(self.io, &buffer);

        try writer.interface.writeAll(bytes);
        try writer.interface.flush();
    }
};

test "socket_reader: reads what the peer sent" {
    var pair = try Pair.open();
    defer pair.close();

    try pair.send("hello");

    var buffer: [64]u8 = undefined;
    var reader: Reader = .init(pair.accepted.socket.handle, &buffer, 1_000);

    try testing.expectEqualStrings("hello", try reader.interface.take(5));
}

// The case that panics through std.Io.net.Stream.Reader, and the reason this file exists.
test "socket_reader: reports a peer that goes quiet as a timeout, not a panic" {
    var pair = try Pair.open();
    defer pair.close();

    try pair.send("GET /hel");

    var buffer: [64]u8 = undefined;
    var reader: Reader = .init(pair.accepted.socket.handle, &buffer, 50);

    try testing.expectError(error.ReadFailed, reader.interface.take(16));
    try testing.expectEqual(Error.Timeout, reader.err.?);
}

test "socket_reader: reports a peer that never speaks as a timeout" {
    var pair = try Pair.open();
    defer pair.close();

    var buffer: [64]u8 = undefined;
    var reader: Reader = .init(pair.accepted.socket.handle, &buffer, 50);

    try testing.expectError(error.ReadFailed, reader.interface.take(1));
    try testing.expectEqual(Error.Timeout, reader.err.?);
}

test "socket_reader: reports a closed peer as the end of the stream" {
    var pair = try Pair.open();
    defer pair.close();

    pair.closeClient();

    var buffer: [64]u8 = undefined;
    var reader: Reader = .init(pair.accepted.socket.handle, &buffer, 1_000);

    try testing.expectError(error.EndOfStream, reader.interface.take(1));
}

test "socket_reader: keeps the surplus a short read left behind" {
    var pair = try Pair.open();
    defer pair.close();

    try pair.send("abcdef");

    var buffer: [64]u8 = undefined;
    var reader: Reader = .init(pair.accepted.socket.handle, &buffer, 1_000);

    try testing.expectEqualStrings("ab", try reader.interface.take(2));
    try testing.expectEqualStrings("cdef", try reader.interface.take(4));
}
