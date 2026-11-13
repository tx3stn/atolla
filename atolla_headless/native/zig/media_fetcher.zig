const std = @import("std");
const builtin = @import("builtin");
const dscp = @import("dscp.zig");
const log = @import("log.zig");
const media_store = @import("media_store.zig");

const log_name = "fetcher";

// The fetcher gives up on a vanished media server after 15 + 5 × 3 = 30s, the stall limit uploads get in http_server.zig.
const keepalive_idle_seconds = 15;
const keepalive_interval_seconds = 5;
const keepalive_probes = 3;

// macOS calls the idle time TCP_KEEPALIVE (MacOSX.sdk/usr/include/netinet/tcp.h).
const keepalive_idle_option = switch (builtin.os.tag) {
    .macos => std.posix.TCP.KEEPALIVE,
    else => std.posix.TCP.KEEPIDLE,
};

pub const Entry = struct {
    auth_header: []const u8,
    id: []const u8,
    url: []const u8,
};

const WireEntry = struct {
    authHeader: []const u8,
    id: []const u8,
    url: []const u8,
};

const Outcome = enum { failed, skipped, stored };

pub const Fetcher = struct {
    allocator: std.mem.Allocator,
    client: std.http.Client,
    condition: std.Io.Condition = .init,
    downloading: ?Download = null,
    entries: []const Entry = &.{},
    generation: u64 = 0,
    io: std.Io,
    list: std.heap.ArenaAllocator,
    mutex: std.Io.Mutex = .init,
    stopping: bool = false,
    store: *media_store.Store,
    thread: std.Thread = undefined,

    const Download = struct {
        id: []const u8,
        stream: std.Io.net.Stream,
    };

    pub fn setList(self: *Fetcher, entries: []const Entry) std.mem.Allocator.Error!void {
        var list: std.heap.ArenaAllocator = .init(self.allocator);
        errdefer list.deinit();

        const arena = list.allocator();
        const owned = try arena.alloc(Entry, entries.len);
        for (entries, owned) |entry, *kept| {
            kept.* = .{
                .auth_header = try arena.dupe(u8, entry.auth_header),
                .id = try arena.dupe(u8, entry.id),
                .url = try arena.dupe(u8, entry.url),
            };
        }

        self.mutex.lockUncancelable(self.io);

        const replaced = self.list;
        self.list = list;
        self.entries = owned;
        self.generation += 1;

        if (self.downloading) |download| {
            if (!listed(owned, download.id)) self.interrupt(download);
        }

        self.condition.signal(self.io);
        self.mutex.unlock(self.io);

        replaced.deinit();
    }

    pub fn setListFromJson(self: *Fetcher, json: []const u8) (error{Malformed} || std.mem.Allocator.Error)!void {
        const parsed = std.json.parseFromSlice([]const WireEntry, self.allocator, json, .{
            .ignore_unknown_fields = true,
        }) catch |err| switch (err) {
            error.OutOfMemory => return error.OutOfMemory,
            else => return error.Malformed,
        };
        defer parsed.deinit();

        const entries = try self.allocator.alloc(Entry, parsed.value.len);
        defer self.allocator.free(entries);

        for (parsed.value, entries) |wire, *entry| {
            entry.* = .{ .auth_header = wire.authHeader, .id = wire.id, .url = wire.url };
        }

        try self.setList(entries);
    }

    pub fn start(
        self: *Fetcher,
        allocator: std.mem.Allocator,
        io: std.Io,
        store: *media_store.Store,
    ) std.Thread.SpawnError!void {
        self.* = .{
            .allocator = allocator,
            .client = .{ .allocator = allocator, .io = io },
            .io = io,
            .list = .init(allocator),
            .store = store,
        };

        self.thread = try std.Thread.spawn(.{}, run, .{self});
    }

    pub fn stop(self: *Fetcher) void {
        self.mutex.lockUncancelable(self.io);
        self.stopping = true;
        if (self.downloading) |download| self.interrupt(download);
        self.condition.signal(self.io);
        self.mutex.unlock(self.io);

        self.thread.join();
        self.client.deinit();
        self.list.deinit();
    }

    fn begin(self: *Fetcher, id: []const u8, stream: std.Io.net.Stream) bool {
        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);

        if (self.stopping or !listed(self.entries, id)) return false;

        self.downloading = .{ .id = id, .stream = stream };

        return true;
    }

    fn copy(self: *Fetcher, entry: Entry) std.mem.Allocator.Error!Entry {
        const auth_header = try self.allocator.dupe(u8, entry.auth_header);
        errdefer self.allocator.free(auth_header);

        const id = try self.allocator.dupe(u8, entry.id);
        errdefer self.allocator.free(id);

        const url = try self.allocator.dupe(u8, entry.url);

        return .{ .auth_header = auth_header, .id = id, .url = url };
    }

    fn end(self: *Fetcher) void {
        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);

        self.downloading = null;
    }

    fn failed(self: *Fetcher, entry: Entry, err: anyerror) Outcome {
        if (!self.wanted(entry.id)) {
            log.info(log_name, "stopped a download the list dropped {f}", .{log.fields(.{ .id = entry.id })});
            return .skipped;
        }

        log.warn(log_name, "could not fetch a track {f}", .{log.fields(.{ .err = @errorName(err), .id = entry.id })});

        return .failed;
    }

    fn fetch(self: *Fetcher, entry: Entry) Outcome {
        const uri = std.Uri.parse(entry.url) catch {
            log.warn(log_name, "skipped a track whose url doesn't parse {f}", .{log.fields(.{ .id = entry.id })});
            return .skipped;
        };

        // Zig 0.16 never sends `privileged_headers` (sendHead in std/http/Client.zig), and the
        // `authorization` slot it does send is kept on a redirect to any host, so redirects aren't followed.
        var request = self.client.request(.GET, uri, .{
            .headers = .{
                .accept_encoding = .omit,
                .authorization = if (entry.auth_header.len == 0) .omit else .{ .override = entry.auth_header },
            },
            .keep_alive = false,
            .redirect_behavior = .unhandled,
        }) catch |err| return self.failed(entry, err);
        defer request.deinit();

        const stream = request.connection.?.stream_reader.stream;
        if (!self.begin(entry.id, stream)) return .skipped;
        defer self.end();

        markBackground(stream);

        request.sendBodiless() catch |err| return self.failed(entry, err);

        var redirect_buffer: [8 * 1024]u8 = undefined;
        var response = request.receiveHead(&redirect_buffer) catch |err| return self.failed(entry, err);

        const status = response.head.status;
        if (status != .ok) {
            log.warn(log_name, "the media server didn't send a track {f}", .{log.fields(.{ .id = entry.id, .status = @intFromEnum(status) })});
            return if (status.class() == .client_error) .skipped else .failed;
        }

        const length = response.head.content_length orelse 0;
        if (length == 0) {
            log.warn(log_name, "the media server didn't say how long a track is {f}", .{log.fields(.{ .id = entry.id })});
            return .failed;
        }

        var upload = self.store.reserve(entry.id, length) catch |err| switch (err) {
            error.NotInWindow, error.LargerThanCache => {
                log.info(log_name, "skipped a track the cache can't take {f}", .{log.fields(.{ .err = @errorName(err), .id = entry.id })});
                return .skipped;
            },
            else => return self.failed(entry, err),
        };

        var transfer_buffer: [64 * 1024]u8 = undefined;
        const body = response.reader(&transfer_buffer);

        var file_buffer: [64 * 1024]u8 = undefined;
        var file_writer = upload.file.writer(self.io, &file_buffer);

        body.streamExact64(&file_writer.interface, length) catch |err| {
            upload.abandon();
            return self.failed(entry, err);
        };

        file_writer.interface.flush() catch |err| {
            upload.abandon();
            return self.failed(entry, err);
        };

        _ = upload.commit() catch |err| return self.failed(entry, err);

        log.info(log_name, "stored a track {f}", .{log.fields(.{ .bytes = length, .id = entry.id })});

        return .stored;
    }

    fn interrupt(self: *Fetcher, download: Download) void {
        download.stream.shutdown(self.io, .both) catch {};
    }

    fn nextList(self: *Fetcher, done: u64) ?u64 {
        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);

        while (!self.stopping and self.generation == done) {
            self.condition.waitUncancelable(self.io, &self.mutex);
        }

        return if (self.stopping) null else self.generation;
    }

    fn pass(self: *Fetcher, generation: u64) void {
        var index: usize = 0;

        while (self.take(generation, index)) |entry| : (index += 1) {
            defer self.release(entry);

            if (self.store.holds(entry.id)) continue;

            switch (self.fetch(entry)) {
                .skipped, .stored => {},
                .failed => return,
            }
        }
    }

    fn release(self: *Fetcher, entry: Entry) void {
        self.allocator.free(entry.auth_header);
        self.allocator.free(entry.id);
        self.allocator.free(entry.url);
    }

    fn run(self: *Fetcher) void {
        var done: u64 = 0;

        while (self.nextList(done)) |generation| {
            done = generation;
            self.pass(generation);
        }
    }

    fn take(self: *Fetcher, generation: u64, index: usize) ?Entry {
        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);

        if (self.stopping or self.generation != generation or index >= self.entries.len) return null;

        return self.copy(self.entries[index]) catch null;
    }

    fn wanted(self: *Fetcher, id: []const u8) bool {
        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);

        return !self.stopping and listed(self.entries, id);
    }
};

fn keepAlive(handle: std.posix.socket_t) std.posix.SetSockOptError!void {
    try setInt(handle, std.posix.SOL.SOCKET, std.posix.SO.KEEPALIVE, 1);
    try setInt(handle, std.posix.IPPROTO.TCP, keepalive_idle_option, keepalive_idle_seconds);
    try setInt(handle, std.posix.IPPROTO.TCP, std.posix.TCP.KEEPINTVL, keepalive_interval_seconds);
    try setInt(handle, std.posix.IPPROTO.TCP, std.posix.TCP.KEEPCNT, keepalive_probes);
}

fn listed(entries: []const Entry, id: []const u8) bool {
    for (entries) |entry| {
        if (std.mem.eql(u8, entry.id, id)) return true;
    }

    return false;
}

fn markBackground(stream: std.Io.net.Stream) void {
    dscp.mark(stream, .cs1) catch |err| {
        log.warn(log_name, "could not mark a download as background traffic {f}", .{log.fields(.{ .err = @errorName(err) })});
    };

    keepAlive(stream.socket.handle) catch |err| {
        log.warn(log_name, "could not turn on keepalive for a download {f}", .{log.fields(.{ .err = @errorName(err) })});
    };
}

fn setInt(handle: std.posix.socket_t, level: i32, option: u32, value: c_int) std.posix.SetSockOptError!void {
    try std.posix.setsockopt(handle, level, option, std.mem.asBytes(&value));
}

const socket_reader = @import("socket_reader.zig");
const testing = std.testing;

const test_auth_header =
    \\MediaBrowser Client="atolla-headless", Device="Kitchen", DeviceId="atolla-1-2", Version="0.0.0", Token="abc"
;

const max_test_tracks = 8;

fn testIo() std.Io {
    return std.Io.Threaded.global_single_threaded.io();
}

fn sleep(milliseconds: i64) void {
    testIo().sleep(.fromMilliseconds(milliseconds), .awake) catch {};
}

const Length = union(enum) {
    actual,
    declared: u64,
    omitted,
};

const Route = struct {
    body: []const u8 = "",
    hold: bool = false,
    length: Length = .actual,
    location: ?[]const u8 = null,
    path: []const u8,
    status: u16 = 200,
};

const FakeMediaServer = struct {
    authorization: [256]u8 = undefined,
    authorization_len: usize = 0,
    listener: std.Io.net.Server,
    mutex: std.Io.Mutex = .init,
    request_count: usize = 0,
    requests: [256]u8 = undefined,
    requests_len: usize = 0,
    routes: []const Route,
    running: std.atomic.Value(bool) = .init(true),
    thread: std.Thread = undefined,

    fn start(self: *FakeMediaServer, routes: []const Route) !void {
        const address: std.Io.net.IpAddress = .{ .ip4 = .loopback(0) };

        self.* = .{
            .listener = try std.Io.net.IpAddress.listen(&address, testIo(), .{
                .mode = .stream,
                .reuse_address = true,
            }),
            .routes = routes,
        };

        self.thread = try std.Thread.spawn(.{}, run, .{self});
    }

    fn stop(self: *FakeMediaServer) void {
        self.running.store(false, .release);

        if (std.Io.net.IpAddress.connect(&self.listener.socket.address, testIo(), .{ .mode = .stream })) |stream| {
            stream.close(testIo());
        } else |_| {}

        self.thread.join();
        self.listener.deinit(testIo());
    }

    fn count(self: *FakeMediaServer) usize {
        self.mutex.lockUncancelable(testIo());
        defer self.mutex.unlock(testIo());

        return self.request_count;
    }

    fn find(self: *const FakeMediaServer, path: []const u8) Route {
        for (self.routes) |route| {
            if (std.mem.eql(u8, route.path, path)) return route;
        }

        return .{ .path = "", .status = 404 };
    }

    fn lastAuthorization(self: *FakeMediaServer, buffer: []u8) []const u8 {
        self.mutex.lockUncancelable(testIo());
        defer self.mutex.unlock(testIo());

        @memcpy(buffer[0..self.authorization_len], self.authorization[0..self.authorization_len]);

        return buffer[0..self.authorization_len];
    }

    fn port(self: *const FakeMediaServer) u16 {
        return self.listener.socket.address.getPort();
    }

    fn record(self: *FakeMediaServer, path: []const u8, authorization: []const u8) void {
        self.mutex.lockUncancelable(testIo());
        defer self.mutex.unlock(testIo());

        var writer: std.Io.Writer = .fixed(self.requests[self.requests_len..]);
        writer.print("{s}{s}", .{ if (self.request_count == 0) "" else " ", path }) catch return;
        self.requests_len += writer.end;
        self.request_count += 1;

        const kept = @min(authorization.len, self.authorization.len);
        @memcpy(self.authorization[0..kept], authorization[0..kept]);
        self.authorization_len = kept;
    }

    fn requested(self: *FakeMediaServer, buffer: []u8) []const u8 {
        self.mutex.lockUncancelable(testIo());
        defer self.mutex.unlock(testIo());

        @memcpy(buffer[0..self.requests_len], self.requests[0..self.requests_len]);

        return buffer[0..self.requests_len];
    }

    fn run(self: *FakeMediaServer) void {
        while (true) {
            const stream = self.listener.accept(testIo()) catch return;
            defer stream.close(testIo());

            if (!self.running.load(.acquire)) return;

            self.serve(stream);
        }
    }

    fn serve(self: *FakeMediaServer, stream: std.Io.net.Stream) void {
        var read_buffer: [4 * 1024]u8 = undefined;
        var write_buffer: [4 * 1024]u8 = undefined;
        var reader = stream.reader(testIo(), &read_buffer);
        var writer = stream.writer(testIo(), &write_buffer);
        var http: std.http.Server = .init(&reader.interface, &writer.interface);

        var request = http.receiveHead() catch return;

        var authorization: []const u8 = "";
        var headers = request.iterateHeaders();
        while (headers.next()) |header| {
            if (std.ascii.eqlIgnoreCase(header.name, "authorization")) authorization = header.value;
        }

        self.record(request.head.target, authorization);

        const route = self.find(request.head.target);
        const status: std.http.Status = @enumFromInt(route.status);
        const out = &writer.interface;

        out.print("HTTP/1.1 {d} {s}\r\nconnection: close\r\n", .{ route.status, status.phrase() orelse "" }) catch return;
        if (route.location) |location| out.print("location: {s}\r\n", .{location}) catch return;
        switch (route.length) {
            .actual => out.print("content-length: {d}\r\n", .{route.body.len}) catch return,
            .declared => |declared| out.print("content-length: {d}\r\n", .{declared}) catch return,
            .omitted => {},
        }
        out.print("\r\n{s}", .{route.body}) catch return;
        out.flush() catch return;

        while (route.hold and self.running.load(.acquire)) {
            if (socket_reader.waitReadable(stream.socket.handle, 10)) return;
        }
    }
};

const Bench = struct {
    fetcher: Fetcher,
    server: FakeMediaServer,
    store: media_store.Store,
    tmp: testing.TmpDir,

    fn start(self: *Bench, routes: []const Route, window: []const []const u8) !void {
        self.tmp = testing.tmpDir(.{});
        errdefer self.tmp.cleanup();

        var buffer: [std.Io.Dir.max_path_bytes]u8 = undefined;
        const path = try std.fmt.bufPrint(&buffer, ".zig-cache/tmp/{s}", .{self.tmp.sub_path});

        self.store = try .open(testIo(), path, 1024);
        errdefer self.store.close();

        var held: [media_store.max_window_tracks][]const u8 = undefined;
        _ = try self.store.setWindow(window, &held);

        try self.server.start(routes);
        errdefer self.server.stop();

        try self.fetcher.start(testing.allocator, testIo(), &self.store);
    }

    fn close(self: *Bench) void {
        self.server.stop();
        self.store.close();
        self.tmp.cleanup();
    }

    fn stop(self: *Bench) void {
        self.fetcher.stop();
        self.close();
    }

    fn give(self: *Bench, ids: []const []const u8) !void {
        var urls: [max_test_tracks][64]u8 = undefined;
        var entries: [max_test_tracks]Entry = undefined;

        for (ids, 0..) |id, index| {
            entries[index] = .{
                .auth_header = test_auth_header,
                .id = id,
                .url = try std.fmt.bufPrint(&urls[index], "http://127.0.0.1:{d}/{s}", .{ self.server.port(), id }),
            };
        }

        try self.fetcher.setList(entries[0..ids.len]);
    }

    fn hasFile(self: *Bench, name: []const u8) bool {
        _ = self.tmp.dir.statFile(testing.io, name, .{}) catch return false;

        return true;
    }

    fn hasPartial(self: *Bench) !bool {
        var entries = self.tmp.dir.iterate();

        while (try entries.next(testing.io)) |entry| {
            if (std.mem.startsWith(u8, entry.name, ".")) return true;
        }

        return false;
    }

    fn isEmpty(self: *Bench) !bool {
        var entries = self.tmp.dir.iterate();

        return try entries.next(testing.io) == null;
    }
};

fn waitForEmpty(bench: *Bench) !void {
    for (0..500) |_| {
        if (try bench.isEmpty()) return;
        sleep(10);
    }

    return error.TestExpectedEmpty;
}

fn waitForFile(bench: *Bench, name: []const u8) !void {
    for (0..500) |_| {
        if (bench.hasFile(name)) return;
        sleep(10);
    }

    return error.TestExpectedFile;
}

fn waitForPartial(bench: *Bench) !void {
    for (0..500) |_| {
        if (try bench.hasPartial()) return;
        sleep(10);
    }

    return error.TestExpectedPartial;
}

fn waitForRequests(bench: *Bench, wanted: usize) !void {
    for (0..500) |_| {
        if (bench.server.count() >= wanted) return;
        sleep(10);
    }

    return error.TestExpectedRequest;
}

test "media_fetcher: downloads each listed track the cache doesn't hold, nearest first" {
    var bench: Bench = undefined;
    try bench.start(&.{
        .{ .path = "/a", .body = "aaa" },
        .{ .path = "/b", .body = "bbb" },
        .{ .path = "/c", .body = "ccc" },
    }, &.{ "a", "b", "c" });
    defer bench.stop();

    try bench.tmp.dir.writeFile(testing.io, .{ .sub_path = "b", .data = "held" });
    try bench.give(&.{ "a", "b", "c" });
    try waitForFile(&bench, "c");

    var buffer: [64]u8 = undefined;
    try testing.expectEqualStrings("/a /c", bench.server.requested(&buffer));
    try testing.expectEqualStrings("aaa", try bench.tmp.dir.readFile(testing.io, "a", &buffer));
    try testing.expectEqualStrings("held", try bench.tmp.dir.readFile(testing.io, "b", &buffer));
    try testing.expectEqualStrings("ccc", try bench.tmp.dir.readFile(testing.io, "c", &buffer));
}

test "media_fetcher: takes its list as the JSON the daemon sends" {
    var bench: Bench = undefined;
    try bench.start(&.{.{ .path = "/a", .body = "aaa" }}, &.{"a"});
    defer bench.stop();

    var buffer: [256]u8 = undefined;
    const json = try std.fmt.bufPrint(
        &buffer,
        "[{{\"authHeader\":\"\",\"id\":\"a\",\"url\":\"http://127.0.0.1:{d}/a\"}}]",
        .{bench.server.port()},
    );

    try bench.fetcher.setListFromJson(json);
    try waitForFile(&bench, "a");
}

test "media_fetcher: refuses a list that isn't JSON" {
    var bench: Bench = undefined;
    try bench.start(&.{}, &.{});
    defer bench.stop();

    try testing.expectError(error.Malformed, bench.fetcher.setListFromJson("not json"));
}

test "media_fetcher: sends the media server the auth header it was given" {
    var bench: Bench = undefined;
    try bench.start(&.{.{ .path = "/a", .body = "aaa" }}, &.{"a"});
    defer bench.stop();

    try bench.give(&.{"a"});
    try waitForFile(&bench, "a");

    var buffer: [256]u8 = undefined;
    try testing.expectEqualStrings(test_auth_header, bench.server.lastAuthorization(&buffer));
}

test "media_fetcher: skips a track the media server refuses and carries on with the next" {
    var bench: Bench = undefined;
    try bench.start(&.{
        .{ .path = "/a", .status = 404 },
        .{ .path = "/b", .body = "bbb" },
    }, &.{ "a", "b" });
    defer bench.stop();

    try bench.give(&.{ "a", "b" });
    try waitForFile(&bench, "b");

    var buffer: [64]u8 = undefined;
    try testing.expectEqualStrings("/a /b", bench.server.requested(&buffer));
    try testing.expect(!bench.hasFile("a"));
}

test "media_fetcher: a media server error ends the pass, and the next list starts again from the nearest" {
    var bench: Bench = undefined;
    try bench.start(&.{
        .{ .path = "/a", .status = 500 },
        .{ .path = "/b", .body = "bbb" },
    }, &.{ "a", "b" });
    defer bench.stop();

    var buffer: [64]u8 = undefined;

    try bench.give(&.{ "a", "b" });
    try waitForRequests(&bench, 1);
    sleep(200);
    try testing.expectEqualStrings("/a", bench.server.requested(&buffer));

    try bench.give(&.{ "a", "b" });
    try waitForRequests(&bench, 2);
    sleep(200);
    try testing.expectEqualStrings("/a /a", bench.server.requested(&buffer));
}

test "media_fetcher: doesn't follow a redirect, so the auth header goes nowhere else" {
    var bench: Bench = undefined;
    try bench.start(&.{
        .{ .path = "/a", .status = 302, .location = "/elsewhere" },
        .{ .path = "/elsewhere", .body = "aaa" },
    }, &.{"a"});
    defer bench.stop();

    try bench.give(&.{"a"});
    try waitForRequests(&bench, 1);
    sleep(200);

    var buffer: [64]u8 = undefined;
    try testing.expectEqualStrings("/a", bench.server.requested(&buffer));
    try testing.expect(try bench.isEmpty());
}

test "media_fetcher: a download that stops short leaves no file behind" {
    var bench: Bench = undefined;
    try bench.start(&.{.{ .path = "/a", .body = "short", .length = .{ .declared = 10 } }}, &.{"a"});
    defer bench.stop();

    try bench.give(&.{"a"});
    try waitForRequests(&bench, 1);
    sleep(200);

    try testing.expect(try bench.isEmpty());
}

test "media_fetcher: refuses a track whose length the media server doesn't give, ending the pass" {
    var bench: Bench = undefined;
    try bench.start(&.{
        .{ .path = "/a", .body = "aaa", .length = .omitted },
        .{ .path = "/b", .body = "bbb" },
    }, &.{ "a", "b" });
    defer bench.stop();

    try bench.give(&.{ "a", "b" });
    try waitForRequests(&bench, 1);
    sleep(200);

    var buffer: [64]u8 = undefined;
    try testing.expectEqualStrings("/a", bench.server.requested(&buffer));
    try testing.expect(try bench.isEmpty());
}

test "media_fetcher: an empty list stops a download midway and deletes its partial file" {
    var bench: Bench = undefined;
    try bench.start(&.{.{ .path = "/a", .body = "half", .hold = true, .length = .{ .declared = 10 } }}, &.{"a"});
    defer bench.stop();

    try bench.give(&.{"a"});
    try waitForPartial(&bench);
    try bench.give(&.{});

    try waitForEmpty(&bench);
}

test "media_fetcher: a list that drops the track being downloaded stops it and moves on" {
    var bench: Bench = undefined;
    try bench.start(&.{
        .{ .path = "/a", .body = "half", .hold = true, .length = .{ .declared = 10 } },
        .{ .path = "/b", .body = "bbb" },
    }, &.{ "a", "b" });
    defer bench.stop();

    try bench.give(&.{ "a", "b" });
    try waitForPartial(&bench);
    try bench.give(&.{"b"});
    try waitForFile(&bench, "b");

    try testing.expect(!bench.hasFile("a"));
    try testing.expect(!try bench.hasPartial());
}

test "media_fetcher: stopping ends a download the media server is holding, and deletes its partial file" {
    var bench: Bench = undefined;
    try bench.start(&.{.{ .path = "/a", .body = "half", .hold = true, .length = .{ .declared = 10 } }}, &.{"a"});
    defer bench.close();

    try bench.give(&.{"a"});
    try waitForPartial(&bench);
    bench.fetcher.stop();

    try testing.expect(!try bench.hasPartial());
}

test "media_fetcher: probes an idle download, so a media server that vanishes ends it" {
    const address: std.Io.net.IpAddress = .{ .ip4 = .loopback(0) };

    var listener = try std.Io.net.IpAddress.listen(&address, testIo(), .{ .mode = .stream });
    defer listener.deinit(testIo());

    const stream = try std.Io.net.IpAddress.connect(&listener.socket.address, testIo(), .{ .mode = .stream });
    defer stream.close(testIo());

    try keepAlive(stream.socket.handle);

    var value: c_int = 0;
    var length: std.c.socklen_t = @sizeOf(c_int);

    try testing.expectEqual(0, std.c.getsockopt(stream.socket.handle, std.posix.SOL.SOCKET, std.posix.SO.KEEPALIVE, &value, &length));
    try testing.expect(value != 0);

    try testing.expectEqual(0, std.c.getsockopt(stream.socket.handle, std.posix.IPPROTO.TCP, keepalive_idle_option, &value, &length));
    try testing.expectEqual(keepalive_idle_seconds, value);
}
