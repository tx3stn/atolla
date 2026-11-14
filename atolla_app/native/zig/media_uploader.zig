const std = @import("std");
const builtin = @import("builtin");

// The uploader gives up on a source that stops answering after 15 + 5 × 3 = 30s, the stall limit the daemon gives uploads.
const keepalive_idle_seconds = 15;
const keepalive_interval_seconds = 5;
const keepalive_probes = 3;

// macOS and iOS call the idle time TCP_KEEPALIVE (usr/include/netinet/tcp.h in MacOSX.sdk and iPhoneOS.sdk).
const keepalive_idle_option = switch (builtin.os.tag) {
    .ios, .macos => std.posix.TCP.KEEPALIVE,
    else => std.posix.TCP.KEEPIDLE,
};

pub const Track = struct {
    id: []const u8,
    path: ?[]const u8 = null,
};

// std.json also reads a []const u8 from an array of numbers, and that code goes through f128, which needs
// compiler-rt helpers Apple's arm64 runtime doesn't have. Reading these strings as Values keeps those helpers
// out of the iOS link.
const WireTrack = struct {
    id: std.json.Value,
    path: std.json.Value = .null,
};

const Window = struct {
    sendFiles: bool,
    tracks: []const WireTrack,
};

const Held = struct {
    held: []const std.json.Value,
};

const Target = struct {
    host: []const u8,
    port: u16,
    token: []const u8,
};

const Snapshot = struct {
    authorization: []const u8,
    host: []const u8,
    port: u16,
    send_files: bool,
    tracks: []const Track,
};

const Halt = enum { none, until_target, until_window };

const Outcome = enum { cache_full, failed, skipped, stored, unauthorized };

pub const Uploader = struct {
    allocator: std.mem.Allocator,
    client: std.http.Client,
    condition: std.Io.Condition = .init,
    connection: ?Connection = null,
    generation: u64 = 0,
    halted: Halt = .none,
    io: std.Io,
    mutex: std.Io.Mutex = .init,
    send_files: bool = false,
    stopping: bool = false,
    target: ?Target = null,
    target_memory: std.heap.ArenaAllocator,
    tracks: ?[]Track = null,
    window_memory: std.heap.ArenaAllocator,

    const Connection = struct {
        stream: std.Io.net.Stream,
        track_id: ?[]const u8,
    };

    pub fn deinit(self: *Uploader) void {
        self.client.deinit();
        self.target_memory.deinit();
        self.window_memory.deinit();
    }

    pub fn init(allocator: std.mem.Allocator, io: std.Io) Uploader {
        return .{
            .allocator = allocator,
            .client = .{ .allocator = allocator, .io = io },
            .io = io,
            .target_memory = .init(allocator),
            .window_memory = .init(allocator),
        };
    }

    pub fn run(self: *Uploader) void {
        var done: u64 = 0;

        while (self.nextPass(done)) |generation| {
            done = generation;
            self.pass(generation);
        }
    }

    pub fn setTarget(self: *Uploader, host: []const u8, port: u16, token: []const u8) std.mem.Allocator.Error!void {
        var memory: std.heap.ArenaAllocator = .init(self.allocator);
        errdefer memory.deinit();

        const arena = memory.allocator();
        const target: ?Target = if (host.len == 0) null else .{
            .host = try arena.dupe(u8, host),
            .port = port,
            .token = try arena.dupe(u8, token),
        };

        self.mutex.lockUncancelable(self.io);

        if (sameTarget(self.target, target)) {
            self.mutex.unlock(self.io);
            memory.deinit();
            return;
        }

        const replaced = self.target_memory;
        self.target_memory = memory;
        self.target = target;
        self.generation += 1;
        self.halted = .none;

        if (self.connection) |connection| self.interrupt(connection);

        self.condition.signal(self.io);
        self.mutex.unlock(self.io);

        replaced.deinit();
    }

    pub fn setWindow(self: *Uploader, tracks: []const Track, send_files: bool) std.mem.Allocator.Error!void {
        var memory: std.heap.ArenaAllocator = .init(self.allocator);
        errdefer memory.deinit();

        const arena = memory.allocator();
        const owned = try arena.alloc(Track, tracks.len);
        for (tracks, owned) |track, *kept| {
            kept.* = .{
                .id = try arena.dupe(u8, track.id),
                .path = if (track.path) |path| try arena.dupe(u8, path) else null,
            };
        }

        self.mutex.lockUncancelable(self.io);

        const replaced = self.window_memory;
        self.window_memory = memory;
        self.tracks = owned;
        self.send_files = send_files;
        self.generation += 1;
        if (self.halted == .until_window) self.halted = .none;

        if (self.connection) |connection| {
            if (connection.track_id) |id| {
                if (!send_files or find(owned, id) == null) self.interrupt(connection);
            }
        }

        self.condition.signal(self.io);
        self.mutex.unlock(self.io);

        replaced.deinit();
    }

    pub fn setWindowFromJson(self: *Uploader, json: []const u8) (error{Malformed} || std.mem.Allocator.Error)!void {
        const parsed = std.json.parseFromSlice(Window, self.allocator, json, .{
            .ignore_unknown_fields = true,
        }) catch |err| switch (err) {
            error.OutOfMemory => return error.OutOfMemory,
            else => return error.Malformed,
        };
        defer parsed.deinit();

        const tracks = try parsed.arena.allocator().alloc(Track, parsed.value.tracks.len);
        for (parsed.value.tracks, tracks) |wire, *track| {
            track.* = .{
                .id = string(wire.id) orelse return error.Malformed,
                .path = switch (wire.path) {
                    .null => null,
                    .string => |path| path,
                    else => return error.Malformed,
                },
            };
        }

        try self.setWindow(tracks, parsed.value.sendFiles);
    }

    pub fn stop(self: *Uploader) void {
        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);

        self.stopping = true;
        if (self.connection) |connection| self.interrupt(connection);
        self.condition.signal(self.io);
    }

    fn begin(self: *Uploader, stream: std.Io.net.Stream, track_id: ?[]const u8) bool {
        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);

        if (self.stopping) return false;

        if (track_id) |id| {
            if (!self.send_files or find(self.tracks, id) == null) return false;
        }

        self.connection = .{ .stream = stream, .track_id = track_id };

        return true;
    }

    fn capture(self: *Uploader, arena: std.mem.Allocator, generation: u64) ?Snapshot {
        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);

        if (self.stopping or self.generation != generation) return null;

        const target = self.target orelse return null;
        const tracks = self.tracks orelse return null;

        return copy(arena, target, tracks, self.send_files) catch null;
    }

    fn current(self: *Uploader, generation: u64) bool {
        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);

        return !self.stopping and self.generation == generation;
    }

    fn end(self: *Uploader) void {
        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);

        self.connection = null;
    }

    fn failed(self: *Uploader, id: []const u8) Outcome {
        return if (self.wanted(id)) .failed else .skipped;
    }

    fn haltUntil(self: *Uploader, generation: u64, halt: Halt) void {
        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);

        if (self.generation == generation) self.halted = halt;
    }

    fn interrupt(self: *Uploader, connection: Connection) void {
        connection.stream.shutdown(self.io, .both) catch {};
    }

    fn missing(self: *Uploader, id: []const u8, path: []const u8) Outcome {
        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);

        const track = find(self.tracks, id) orelse return .skipped;
        const known = track.path orelse return .skipped;

        if (std.mem.eql(u8, known, path)) track.path = null;

        return .skipped;
    }

    fn nextPass(self: *Uploader, done: u64) ?u64 {
        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);

        while (!self.stopping and (self.generation == done or self.halted != .none or self.target == null or self.tracks == null)) {
            self.condition.waitUncancelable(self.io, &self.mutex);
        }

        return if (self.stopping) null else self.generation;
    }

    fn pass(self: *Uploader, generation: u64) void {
        var memory: std.heap.ArenaAllocator = .init(self.allocator);
        defer memory.deinit();

        const arena = memory.allocator();
        const snapshot = self.capture(arena, generation) orelse return;

        const held = self.sendWindow(arena, snapshot) catch |err| switch (err) {
            error.Failed => return,
            error.Unauthorized => return self.haltUntil(generation, .until_target),
        };

        if (!snapshot.send_files) return;

        for (snapshot.tracks) |track| {
            if (!self.current(generation)) return;
            if (listed(held, track.id)) continue;

            const path = track.path orelse continue;

            switch (self.upload(arena, snapshot, track.id, path)) {
                .skipped, .stored => {},
                .failed => return,
                .cache_full => return self.haltUntil(generation, .until_window),
                .unauthorized => return self.haltUntil(generation, .until_target),
            }
        }
    }

    fn sendWindow(self: *Uploader, arena: std.mem.Allocator, snapshot: Snapshot) error{ Failed, Unauthorized }![]const []const u8 {
        const uri = mediaUri(arena, snapshot, null) catch return error.Failed;

        const ids = arena.alloc([]const u8, snapshot.tracks.len) catch return error.Failed;
        for (snapshot.tracks, ids) |track, *id| id.* = track.id;

        const body = std.json.Stringify.valueAlloc(arena, .{ .trackIds = ids }, .{}) catch return error.Failed;

        var request = self.client.request(.PUT, uri, .{
            .headers = .{
                .accept_encoding = .omit,
                .authorization = .{ .override = snapshot.authorization },
                .content_type = .{ .override = "application/json" },
            },
            .keep_alive = false,
            .redirect_behavior = .unhandled,
        }) catch return error.Failed;
        defer request.deinit();

        const stream = request.connection.?.stream_reader.stream;
        if (!self.begin(stream, null)) return error.Failed;
        defer self.end();

        keepAlive(stream.socket.handle) catch {};

        request.sendBodyComplete(body) catch return error.Failed;

        var head_buffer: [1024]u8 = undefined;
        var response = request.receiveHead(&head_buffer) catch return error.Failed;

        switch (response.head.status) {
            .ok => {},
            .unauthorized => return error.Unauthorized,
            else => return error.Failed,
        }

        var transfer_buffer: [4 * 1024]u8 = undefined;
        const text = response.reader(&transfer_buffer).allocRemaining(arena, .unlimited) catch return error.Failed;
        const answer = std.json.parseFromSliceLeaky(Held, arena, text, .{
            .ignore_unknown_fields = true,
        }) catch return error.Failed;

        const held = arena.alloc([]const u8, answer.held.len) catch return error.Failed;
        for (answer.held, held) |value, *id| id.* = string(value) orelse return error.Failed;

        return held;
    }

    fn upload(self: *Uploader, arena: std.mem.Allocator, snapshot: Snapshot, id: []const u8, path: []const u8) Outcome {
        const file = std.Io.Dir.cwd().openFile(self.io, path, .{}) catch return self.missing(id, path);
        defer file.close(self.io);

        const size = (file.stat(self.io) catch return self.missing(id, path)).size;
        if (size == 0) return self.missing(id, path);

        const uri = mediaUri(arena, snapshot, id) catch return .failed;

        var request = self.client.request(.PUT, uri, .{
            .extra_headers = &.{.{ .name = "expect", .value = "100-continue" }},
            .handle_continue = false,
            .headers = .{
                .accept_encoding = .omit,
                .authorization = .{ .override = snapshot.authorization },
                .content_type = .{ .override = "application/octet-stream" },
            },
            .keep_alive = false,
            .redirect_behavior = .unhandled,
        }) catch return self.failed(id);
        defer request.deinit();

        const stream = request.connection.?.stream_reader.stream;
        if (!self.begin(stream, id)) return .skipped;
        defer self.end();

        keepAlive(stream.socket.handle) catch {};

        request.transfer_encoding = .{ .content_length = size };

        var body_buffer: [16 * 1024]u8 = undefined;
        var body = request.sendBody(&body_buffer) catch return self.failed(id);

        var head_buffer: [1024]u8 = undefined;
        const invited = request.receiveHead(&head_buffer) catch return self.failed(id);
        if (invited.head.status != .@"continue") return answered(invited.head.status);

        var file_buffer: [16 * 1024]u8 = undefined;
        var file_reader = file.reader(self.io, &file_buffer);

        file_reader.interface.streamExact64(&body.writer, size) catch |err| switch (err) {
            error.WriteFailed => return self.failed(id),
            error.EndOfStream, error.ReadFailed => return self.missing(id, path),
        };

        body.end() catch return self.failed(id);

        const answer = request.receiveHead(&head_buffer) catch return self.failed(id);

        return answered(answer.head.status);
    }

    fn wanted(self: *Uploader, id: []const u8) bool {
        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);

        return !self.stopping and self.send_files and find(self.tracks, id) != null;
    }
};

var shared: Uploader = undefined;

export fn atolla_media_uploader_init() void {
    shared = .init(std.heap.page_allocator, std.Io.Threaded.global_single_threaded.io());
}

export fn atolla_media_uploader_run() void {
    shared.run();
}

export fn atolla_media_uploader_set_target(host: [*]const u8, host_len: usize, port: u16, token: [*]const u8, token_len: usize) bool {
    shared.setTarget(host[0..host_len], port, token[0..token_len]) catch return false;

    return true;
}

export fn atolla_media_uploader_set_window(json: [*]const u8, json_len: usize) bool {
    shared.setWindowFromJson(json[0..json_len]) catch return false;

    return true;
}

fn answered(status: std.http.Status) Outcome {
    return switch (status) {
        .created, .no_content => .stored,
        .conflict, .not_found, .payload_too_large => .skipped,
        .insufficient_storage => .cache_full,
        .unauthorized => .unauthorized,
        else => .failed,
    };
}

fn copy(arena: std.mem.Allocator, target: Target, tracks: []const Track, send_files: bool) std.mem.Allocator.Error!Snapshot {
    const kept = try arena.alloc(Track, tracks.len);
    for (tracks, kept) |track, *into| {
        into.* = .{
            .id = try arena.dupe(u8, track.id),
            .path = if (track.path) |path| try arena.dupe(u8, path) else null,
        };
    }

    return .{
        .authorization = try std.fmt.allocPrint(arena, "Bearer {s}", .{target.token}),
        .host = try arena.dupe(u8, target.host),
        .port = target.port,
        .send_files = send_files,
        .tracks = kept,
    };
}

fn find(tracks: ?[]Track, id: []const u8) ?*Track {
    for (tracks orelse return null) |*track| {
        if (std.mem.eql(u8, track.id, id)) return track;
    }

    return null;
}

fn keepAlive(handle: std.posix.socket_t) std.posix.SetSockOptError!void {
    try setInt(handle, std.posix.SOL.SOCKET, std.posix.SO.KEEPALIVE, 1);
    try setInt(handle, std.posix.IPPROTO.TCP, keepalive_idle_option, keepalive_idle_seconds);
    try setInt(handle, std.posix.IPPROTO.TCP, std.posix.TCP.KEEPINTVL, keepalive_interval_seconds);
    try setInt(handle, std.posix.IPPROTO.TCP, std.posix.TCP.KEEPCNT, keepalive_probes);
}

fn listed(ids: []const []const u8, id: []const u8) bool {
    for (ids) |held| {
        if (std.mem.eql(u8, held, id)) return true;
    }

    return false;
}

fn mediaUri(arena: std.mem.Allocator, snapshot: Snapshot, track_id: ?[]const u8) !std.Uri {
    const text = if (track_id) |id|
        try std.fmt.allocPrint(arena, "http://{s}:{d}/media/{s}", .{ snapshot.host, snapshot.port, id })
    else
        try std.fmt.allocPrint(arena, "http://{s}:{d}/media", .{ snapshot.host, snapshot.port });

    return std.Uri.parse(text);
}

fn sameTarget(current: ?Target, next: ?Target) bool {
    const held = current orelse return next == null;
    const given = next orelse return false;

    return held.port == given.port and
        std.mem.eql(u8, held.host, given.host) and
        std.mem.eql(u8, held.token, given.token);
}

fn setInt(handle: std.posix.socket_t, level: i32, option: u32, value: c_int) std.posix.SetSockOptError!void {
    try std.posix.setsockopt(handle, level, option, std.mem.asBytes(&value));
}

fn string(value: std.json.Value) ?[]const u8 {
    return switch (value) {
        .string => |text| text,
        else => null,
    };
}

const testing = std.testing;

const test_token = "7c1e5a9b3d8f204617ca0be9352d8f7461a0c3d95e28b7f4016cad3928bf5e7d";

const unknown_token = "0000000000000000000000000000000000000000000000000000000000000000";

const paired_controller =
    \\[{"controllerId":"p","controllerName":"Phone","pairedAt":1758000000000,"token":
++ "\"" ++ test_token ++ "\"}]";

const held_none = "{\"held\":[]}";

fn testIo() std.Io {
    return std.Io.Threaded.global_single_threaded.io();
}

fn sleep(milliseconds: i64) void {
    testIo().sleep(.fromMilliseconds(milliseconds), .awake) catch {};
}

const File = struct {
    data: []const u8,
    name: []const u8,
};

/// The real daemon, driven through the same C API the headless JS uses.
const Source = struct {
    controllers: testing.TmpDir,
    hosted: *anyopaque,
    media: testing.TmpDir,

    comptime {
        _ = @import("daemon");
    }

    extern fn atolla_http_port(hosted: *anyopaque) u16;
    extern fn atolla_http_set_controllers_path(bytes: [*]const u8, len: usize) bool;
    extern fn atolla_http_set_media(path: [*]const u8, path_len: usize, capacity: u64) bool;
    extern fn atolla_http_start(
        host: [*]const u8,
        host_len: usize,
        port: u16,
        dispatch: ?*const anyopaque,
        context: ?*anyopaque,
    ) ?*anyopaque;
    extern fn atolla_http_stop(hosted: *anyopaque) void;

    fn start(self: *Source, capacity: u64, held: []const File) !void {
        self.controllers = testing.tmpDir(.{});
        errdefer self.controllers.cleanup();

        self.media = testing.tmpDir(.{});
        errdefer self.media.cleanup();

        try self.controllers.dir.writeFile(testing.io, .{ .sub_path = "controllers", .data = paired_controller });
        for (held) |file| try self.media.dir.writeFile(testing.io, .{ .sub_path = file.name, .data = file.data });

        var buffer: [std.Io.Dir.max_path_bytes]u8 = undefined;

        const controllers = try std.fmt.bufPrint(&buffer, ".zig-cache/tmp/{s}/controllers", .{self.controllers.sub_path});
        if (!atolla_http_set_controllers_path(controllers.ptr, controllers.len)) return error.TestUnexpectedResult;

        const media = try std.fmt.bufPrint(&buffer, ".zig-cache/tmp/{s}", .{self.media.sub_path});
        if (!atolla_http_set_media(media.ptr, media.len, capacity)) return error.TestUnexpectedResult;

        const host = "127.0.0.1";
        self.hosted = atolla_http_start(host, host.len, 0, null, null) orelse return error.TestUnexpectedResult;
    }

    fn stop(self: *Source) void {
        atolla_http_stop(self.hosted);
        self.media.cleanup();
        self.controllers.cleanup();
    }

    fn holds(self: *Source, name: []const u8) bool {
        _ = self.media.dir.statFile(testing.io, name, .{}) catch return false;

        return true;
    }

    fn lacks(self: *Source, name: []const u8) bool {
        return !self.holds(name);
    }

    fn port(self: *Source) u16 {
        return atolla_http_port(self.hosted);
    }

    fn read(self: *Source, name: []const u8, buffer: []u8) ![]const u8 {
        return self.media.dir.readFile(testing.io, name, buffer);
    }
};

const Route = struct {
    body: []const u8 = "",
    hold: bool = false,
    path: []const u8,
    status: u16 = 200,
};

/// Stands in for the source where a test needs an upload held open midway or a failure on cue.
const StubSource = struct {
    listener: std.Io.net.Server,
    mutex: std.Io.Mutex = .init,
    request_count: usize = 0,
    requests: [512]u8 = undefined,
    requests_len: usize = 0,
    routes: []const Route,
    running: std.atomic.Value(bool) = .init(true),
    server_count: usize = 0,
    servers: [8]std.Thread = undefined,
    thread: std.Thread = undefined,

    fn start(self: *StubSource, routes: []const Route) !void {
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

    fn stop(self: *StubSource) void {
        self.running.store(false, .release);

        if (std.Io.net.IpAddress.connect(&self.listener.socket.address, testIo(), .{ .mode = .stream })) |stream| {
            stream.close(testIo());
        } else |_| {}

        self.thread.join();
        for (self.servers[0..self.server_count]) |server| server.join();
        self.listener.deinit(testIo());
    }

    fn count(self: *StubSource) usize {
        self.mutex.lockUncancelable(testIo());
        defer self.mutex.unlock(testIo());

        return self.request_count;
    }

    fn find(self: *const StubSource, path: []const u8) Route {
        for (self.routes) |route| {
            if (std.mem.eql(u8, route.path, path)) return route;
        }

        return .{ .path = "", .status = 404 };
    }

    fn port(self: *const StubSource) u16 {
        return self.listener.socket.address.getPort();
    }

    fn received(self: *StubSource, wanted: usize) bool {
        return self.count() >= wanted;
    }

    fn record(self: *StubSource, path: []const u8) void {
        self.mutex.lockUncancelable(testIo());
        defer self.mutex.unlock(testIo());

        var writer: std.Io.Writer = .fixed(self.requests[self.requests_len..]);
        writer.print("{s}{s}", .{ if (self.request_count == 0) "" else " ", path }) catch return;
        self.requests_len += writer.end;
        self.request_count += 1;
    }

    fn requested(self: *StubSource, buffer: []u8) []const u8 {
        self.mutex.lockUncancelable(testIo());
        defer self.mutex.unlock(testIo());

        @memcpy(buffer[0..self.requests_len], self.requests[0..self.requests_len]);

        return buffer[0..self.requests_len];
    }

    fn run(self: *StubSource) void {
        while (true) {
            const stream = self.listener.accept(testIo()) catch return;

            if (!self.running.load(.acquire) or self.server_count == self.servers.len) {
                stream.close(testIo());
                return;
            }

            self.servers[self.server_count] = std.Thread.spawn(.{}, serve, .{ self, stream }) catch {
                stream.close(testIo());
                return;
            };
            self.server_count += 1;
        }
    }

    fn serve(self: *StubSource, stream: std.Io.net.Stream) void {
        defer stream.close(testIo());

        var read_buffer: [4 * 1024]u8 = undefined;
        var write_buffer: [4 * 1024]u8 = undefined;
        var reader = stream.reader(testIo(), &read_buffer);
        var writer = stream.writer(testIo(), &write_buffer);
        var http: std.http.Server = .init(&reader.interface, &writer.interface);

        var request = http.receiveHead() catch return;
        self.record(request.head.target);

        const route = self.find(request.head.target);
        const out = &writer.interface;

        if (route.hold) {
            out.writeAll("HTTP/1.1 100 Continue\r\n\r\n") catch return;
            out.flush() catch return;

            while (self.running.load(.acquire)) sleep(10);

            return;
        }

        var body_buffer: [4 * 1024]u8 = undefined;
        const body = request.readerExpectContinue(&body_buffer) catch return;
        _ = body.discardRemaining() catch return;

        const status: std.http.Status = @enumFromInt(route.status);
        out.print(
            "HTTP/1.1 {d} {s}\r\ncontent-length: {d}\r\nconnection: close\r\n\r\n{s}",
            .{ route.status, status.phrase() orelse "", route.body.len, route.body },
        ) catch return;
        out.flush() catch return;
    }
};

const Phone = struct {
    files: testing.TmpDir,
    thread: std.Thread,
    uploader: Uploader,

    fn start(self: *Phone) !void {
        self.files = testing.tmpDir(.{});
        errdefer self.files.cleanup();

        self.uploader = .init(testing.allocator, testIo());
        self.thread = try std.Thread.spawn(.{}, Uploader.run, .{&self.uploader});
    }

    fn close(self: *Phone) void {
        self.uploader.deinit();
        self.files.cleanup();
    }

    fn stop(self: *Phone) void {
        self.uploader.stop();
        self.thread.join();
        self.close();
    }

    fn file(self: *Phone, name: []const u8, data: []const u8, buffer: []u8) ![]const u8 {
        try self.files.dir.writeFile(testing.io, .{ .sub_path = name, .data = data });

        return std.fmt.bufPrint(buffer, ".zig-cache/tmp/{s}/{s}", .{ self.files.sub_path, name });
    }
};

fn eventually(comptime reached: anytype, args: anytype) !void {
    for (0..500) |_| {
        if (@call(.auto, reached, args)) return;
        sleep(10);
    }

    return error.TestTimedOut;
}

fn large() ![]u8 {
    const bytes = try testing.allocator.alloc(u8, 4 * 1024 * 1024);
    @memset(bytes, 0);

    return bytes;
}

test "media_uploader: uploads each track in the window to the source" {
    var source: Source = undefined;
    try source.start(1024, &.{});
    defer source.stop();

    var phone: Phone = undefined;
    try phone.start();
    defer phone.stop();

    var paths: [3][256]u8 = undefined;
    try phone.uploader.setTarget("127.0.0.1", source.port(), test_token);
    try phone.uploader.setWindow(&.{
        .{ .id = "a", .path = try phone.file("a", "aaa", &paths[0]) },
        .{ .id = "b", .path = try phone.file("b", "bbb", &paths[1]) },
        .{ .id = "c", .path = try phone.file("c", "ccc", &paths[2]) },
    }, true);

    try eventually(Source.holds, .{ &source, "a" });
    try eventually(Source.holds, .{ &source, "b" });
    try eventually(Source.holds, .{ &source, "c" });

    var buffer: [16]u8 = undefined;
    try testing.expectEqualStrings("aaa", try source.read("a", &buffer));
    try testing.expectEqualStrings("bbb", try source.read("b", &buffer));
    try testing.expectEqualStrings("ccc", try source.read("c", &buffer));
}

test "media_uploader: online, sends the window and uploads nothing" {
    var source: Source = undefined;
    try source.start(1024, &.{.{ .name = "old", .data = "old" }});
    defer source.stop();

    var phone: Phone = undefined;
    try phone.start();
    defer phone.stop();

    var path: [256]u8 = undefined;
    try phone.uploader.setTarget("127.0.0.1", source.port(), test_token);
    try phone.uploader.setWindow(&.{.{ .id = "a", .path = try phone.file("a", "aaa", &path) }}, false);

    try eventually(Source.lacks, .{ &source, "old" });
    sleep(200);

    try testing.expect(!source.holds("a"));
}

test "media_uploader: doesn't send a track the source already holds" {
    var source: Source = undefined;
    try source.start(1024, &.{.{ .name = "a", .data = "held" }});
    defer source.stop();

    var phone: Phone = undefined;
    try phone.start();
    defer phone.stop();

    var paths: [2][256]u8 = undefined;
    try phone.uploader.setTarget("127.0.0.1", source.port(), test_token);
    try phone.uploader.setWindow(&.{
        .{ .id = "a", .path = try phone.file("a", "aaa", &paths[0]) },
        .{ .id = "b", .path = try phone.file("b", "bbb", &paths[1]) },
    }, true);

    try eventually(Source.holds, .{ &source, "b" });

    var buffer: [16]u8 = undefined;
    try testing.expectEqualStrings("held", try source.read("a", &buffer));
}

test "media_uploader: skips a track the phone has no file for and carries on" {
    var source: Source = undefined;
    try source.start(1024, &.{});
    defer source.stop();

    var phone: Phone = undefined;
    try phone.start();
    defer phone.stop();

    var path: [256]u8 = undefined;
    try phone.uploader.setTarget("127.0.0.1", source.port(), test_token);
    try phone.uploader.setWindow(&.{
        .{ .id = "a" },
        .{ .id = "b", .path = try phone.file("b", "bbb", &path) },
    }, true);

    try eventually(Source.holds, .{ &source, "b" });
    try testing.expect(!source.holds("a"));
}

test "media_uploader: uploads the nearest tracks that fit, then waits for the next window once the source is full" {
    var source: Source = undefined;
    try source.start(6, &.{});
    defer source.stop();

    var phone: Phone = undefined;
    try phone.start();
    defer phone.stop();

    var paths: [3][256]u8 = undefined;
    const a = try phone.file("a", "aaa", &paths[0]);
    const b = try phone.file("b", "bbb", &paths[1]);
    const c = try phone.file("c", "ccc", &paths[2]);

    try phone.uploader.setTarget("127.0.0.1", source.port(), test_token);
    try phone.uploader.setWindow(&.{ .{ .id = "a", .path = a }, .{ .id = "b", .path = b }, .{ .id = "c", .path = c } }, true);

    try eventually(Source.holds, .{ &source, "a" });
    try eventually(Source.holds, .{ &source, "b" });
    sleep(200);
    try testing.expect(!source.holds("c"));

    try phone.uploader.setWindow(&.{ .{ .id = "b", .path = b }, .{ .id = "c", .path = c } }, true);

    try eventually(Source.holds, .{ &source, "c" });
    try testing.expect(!source.holds("a"));
}

test "media_uploader: skips a track larger than the source's whole cache and carries on" {
    var source: Source = undefined;
    try source.start(4, &.{});
    defer source.stop();

    var phone: Phone = undefined;
    try phone.start();
    defer phone.stop();

    var paths: [2][256]u8 = undefined;
    try phone.uploader.setTarget("127.0.0.1", source.port(), test_token);
    try phone.uploader.setWindow(&.{
        .{ .id = "a", .path = try phone.file("a", "aaaaa", &paths[0]) },
        .{ .id = "b", .path = try phone.file("b", "bbb", &paths[1]) },
    }, true);

    try eventually(Source.holds, .{ &source, "b" });
    try testing.expect(!source.holds("a"));
}

test "media_uploader: a token the source refuses stops uploads until a new target" {
    var source: Source = undefined;
    try source.start(1024, &.{});
    defer source.stop();

    var phone: Phone = undefined;
    try phone.start();
    defer phone.stop();

    var path: [256]u8 = undefined;
    try phone.uploader.setTarget("127.0.0.1", source.port(), unknown_token);
    try phone.uploader.setWindow(&.{.{ .id = "a", .path = try phone.file("a", "aaa", &path) }}, true);

    sleep(200);
    try testing.expect(!source.holds("a"));

    try phone.uploader.setTarget("127.0.0.1", source.port(), test_token);

    try eventually(Source.holds, .{ &source, "a" });
}

test "media_uploader: skips a track whose file the phone no longer has" {
    var source: Source = undefined;
    try source.start(1024, &.{});
    defer source.stop();

    var phone: Phone = undefined;
    try phone.start();
    defer phone.stop();

    var paths: [2][256]u8 = undefined;
    const gone = try std.fmt.bufPrint(&paths[0], ".zig-cache/tmp/{s}/gone", .{phone.files.sub_path});

    try phone.uploader.setTarget("127.0.0.1", source.port(), test_token);
    try phone.uploader.setWindow(&.{
        .{ .id = "a", .path = gone },
        .{ .id = "b", .path = try phone.file("b", "bbb", &paths[1]) },
    }, true);

    try eventually(Source.holds, .{ &source, "b" });
    try testing.expect(!source.holds("a"));
}

test "media_uploader: takes its window as the JSON the app sends" {
    var source: Source = undefined;
    try source.start(1024, &.{});
    defer source.stop();

    var phone: Phone = undefined;
    try phone.start();
    defer phone.stop();

    var path: [256]u8 = undefined;
    var json: [512]u8 = undefined;
    const window = try std.fmt.bufPrint(
        &json,
        "{{\"sendFiles\":true,\"tracks\":[{{\"id\":\"a\",\"path\":\"{s}\"}},{{\"id\":\"b\",\"path\":null}}]}}",
        .{try phone.file("a", "aaa", &path)},
    );

    try phone.uploader.setTarget("127.0.0.1", source.port(), test_token);
    try phone.uploader.setWindowFromJson(window);

    try eventually(Source.holds, .{ &source, "a" });
}

test "media_uploader: refuses a window that isn't JSON" {
    var uploader: Uploader = .init(testing.allocator, testIo());
    defer uploader.deinit();

    try testing.expectError(error.Malformed, uploader.setWindowFromJson("not json"));
}

test "media_uploader: refuses a window whose track id isn't a string" {
    var uploader: Uploader = .init(testing.allocator, testIo());
    defer uploader.deinit();

    try testing.expectError(error.Malformed, uploader.setWindowFromJson(
        \\{"sendFiles":true,"tracks":[{"id":1}]}
    ));
}

test "media_uploader: the app drives it through its C API" {
    var source: Source = undefined;
    try source.start(1024, &.{});
    defer source.stop();

    var files = testing.tmpDir(.{});
    defer files.cleanup();

    try files.dir.writeFile(testing.io, .{ .sub_path = "a", .data = "aaa" });

    atolla_media_uploader_init();
    const thread = try std.Thread.spawn(.{}, atolla_media_uploader_run, .{});
    defer {
        shared.stop();
        thread.join();
        shared.deinit();
    }

    const host = "127.0.0.1";
    try testing.expect(atolla_media_uploader_set_target(host, host.len, source.port(), test_token, test_token.len));

    var json: [512]u8 = undefined;
    const window = try std.fmt.bufPrint(
        &json,
        "{{\"sendFiles\":true,\"tracks\":[{{\"id\":\"a\",\"path\":\".zig-cache/tmp/{s}/a\"}}]}}",
        .{files.sub_path},
    );
    try testing.expect(atolla_media_uploader_set_window(window.ptr, window.len));

    try eventually(Source.holds, .{ &source, "a" });
}

test "media_uploader: sends the source nothing until it has a window, so the source's cache is never emptied by mistake" {
    var stub: StubSource = undefined;
    try stub.start(&.{.{ .path = "/media", .body = held_none }});
    defer stub.stop();

    var phone: Phone = undefined;
    try phone.start();
    defer phone.stop();

    try phone.uploader.setTarget("127.0.0.1", stub.port(), test_token);
    sleep(200);
    try testing.expectEqual(0, stub.count());

    try phone.uploader.setWindow(&.{.{ .id = "a" }}, true);

    try eventually(StubSource.received, .{ &stub, 1 });
}

test "media_uploader: a window that drops the track being uploaded ends that upload and moves on" {
    var stub: StubSource = undefined;
    try stub.start(&.{
        .{ .path = "/media", .body = held_none },
        .{ .path = "/media/a", .hold = true },
        .{ .path = "/media/b", .status = 201 },
    });
    defer stub.stop();

    var phone: Phone = undefined;
    try phone.start();
    defer phone.stop();

    const bytes = try large();
    defer testing.allocator.free(bytes);

    var paths: [2][256]u8 = undefined;
    const b = try phone.file("b", "bbb", &paths[1]);

    try phone.uploader.setTarget("127.0.0.1", stub.port(), test_token);
    try phone.uploader.setWindow(&.{
        .{ .id = "a", .path = try phone.file("a", bytes, &paths[0]) },
        .{ .id = "b", .path = b },
    }, true);

    try eventually(StubSource.received, .{ &stub, 2 });
    try phone.uploader.setWindow(&.{.{ .id = "b", .path = b }}, true);
    try eventually(StubSource.received, .{ &stub, 4 });

    var buffer: [128]u8 = undefined;
    try testing.expectEqualStrings("/media /media/a /media /media/b", stub.requested(&buffer));
}

test "media_uploader: going online ends the upload in progress and only sends the window" {
    var stub: StubSource = undefined;
    try stub.start(&.{
        .{ .path = "/media", .body = held_none },
        .{ .path = "/media/a", .hold = true },
    });
    defer stub.stop();

    var phone: Phone = undefined;
    try phone.start();
    defer phone.stop();

    const bytes = try large();
    defer testing.allocator.free(bytes);

    var path: [256]u8 = undefined;
    const a = try phone.file("a", bytes, &path);

    try phone.uploader.setTarget("127.0.0.1", stub.port(), test_token);
    try phone.uploader.setWindow(&.{.{ .id = "a", .path = a }}, true);

    try eventually(StubSource.received, .{ &stub, 2 });
    try phone.uploader.setWindow(&.{.{ .id = "a", .path = a }}, false);
    try eventually(StubSource.received, .{ &stub, 3 });
    sleep(200);

    var buffer: [128]u8 = undefined;
    try testing.expectEqualStrings("/media /media/a /media", stub.requested(&buffer));
}

test "media_uploader: a new target ends the upload in progress and starts again with the new source" {
    var first: StubSource = undefined;
    try first.start(&.{
        .{ .path = "/media", .body = held_none },
        .{ .path = "/media/a", .hold = true },
    });
    defer first.stop();

    var second: StubSource = undefined;
    try second.start(&.{
        .{ .path = "/media", .body = held_none },
        .{ .path = "/media/a", .status = 201 },
    });
    defer second.stop();

    var phone: Phone = undefined;
    try phone.start();
    defer phone.stop();

    const bytes = try large();
    defer testing.allocator.free(bytes);

    var path: [256]u8 = undefined;

    try phone.uploader.setTarget("127.0.0.1", first.port(), test_token);
    try phone.uploader.setWindow(&.{.{ .id = "a", .path = try phone.file("a", bytes, &path) }}, true);

    try eventually(StubSource.received, .{ &first, 2 });
    try phone.uploader.setTarget("127.0.0.1", second.port(), test_token);
    try eventually(StubSource.received, .{ &second, 2 });

    var buffer: [128]u8 = undefined;
    try testing.expectEqualStrings("/media /media/a", second.requested(&buffer));
}

test "media_uploader: setting the same target again leaves the upload in progress running" {
    var stub: StubSource = undefined;
    try stub.start(&.{
        .{ .path = "/media", .body = held_none },
        .{ .path = "/media/a", .hold = true },
    });
    defer stub.stop();

    var phone: Phone = undefined;
    try phone.start();
    defer phone.stop();

    const bytes = try large();
    defer testing.allocator.free(bytes);

    var path: [256]u8 = undefined;

    try phone.uploader.setTarget("127.0.0.1", stub.port(), test_token);
    try phone.uploader.setWindow(&.{.{ .id = "a", .path = try phone.file("a", bytes, &path) }}, true);

    try eventually(StubSource.received, .{ &stub, 2 });
    try phone.uploader.setTarget("127.0.0.1", stub.port(), test_token);
    sleep(200);

    try testing.expectEqual(2, stub.count());
}

test "media_uploader: stopping ends the upload in progress" {
    var stub: StubSource = undefined;
    try stub.start(&.{
        .{ .path = "/media", .body = held_none },
        .{ .path = "/media/a", .hold = true },
    });
    defer stub.stop();

    var phone: Phone = undefined;
    try phone.start();
    defer phone.close();

    const bytes = try large();
    defer testing.allocator.free(bytes);

    var path: [256]u8 = undefined;

    try phone.uploader.setTarget("127.0.0.1", stub.port(), test_token);
    try phone.uploader.setWindow(&.{.{ .id = "a", .path = try phone.file("a", bytes, &path) }}, true);

    try eventually(StubSource.received, .{ &stub, 2 });
    phone.uploader.stop();
    phone.thread.join();
}

test "media_uploader: a failed pass is retried by the next window" {
    var stub: StubSource = undefined;
    try stub.start(&.{.{ .path = "/media", .status = 500 }});
    defer stub.stop();

    var phone: Phone = undefined;
    try phone.start();
    defer phone.stop();

    var buffer: [128]u8 = undefined;

    try phone.uploader.setTarget("127.0.0.1", stub.port(), test_token);
    try phone.uploader.setWindow(&.{.{ .id = "a" }}, true);

    try eventually(StubSource.received, .{ &stub, 1 });
    sleep(200);
    try testing.expectEqualStrings("/media", stub.requested(&buffer));

    try phone.uploader.setWindow(&.{.{ .id = "a" }}, true);

    try eventually(StubSource.received, .{ &stub, 2 });
    sleep(200);
    try testing.expectEqualStrings("/media /media", stub.requested(&buffer));
}

test "media_uploader: probes a connection waiting on an answer, so a source that vanishes ends it" {
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
