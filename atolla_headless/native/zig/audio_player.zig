const std = @import("std");
const gst = @import("gst.zig");
const log = @import("log.zig");
const wav = @import("wav.zig");

pub const max_track_id_bytes = 128;
pub const max_event_bytes = 512;
pub const max_events = 32;

const silent_device = "none";
const poll_interval_ns = gst.second / 10;

pub const Error = gst.PipelineError || std.Thread.SpawnError || error{TrackIdTooLong};

/// `none` is the device a machine with no audio output is given.
pub fn sinkFor(device: []const u8) [:0]const u8 {
    if (std.mem.eql(u8, device, silent_device)) return "fakesink sync=true";

    return "autoaudiosink";
}

const Event = struct {
    bytes: [max_event_bytes]u8,
    len: usize,
};

/// Written by the bus thread and drained by the JavaScript thread, so every read and write takes
/// the lock. A full queue drops rather than blocks: the bus thread must never wait on a consumer.
const Events = struct {
    mutex: std.Io.Mutex = .init,
    items: [max_events]Event = undefined,
    first: usize = 0,
    queued: usize = 0,

    fn push(self: *Events, comptime format: []const u8, args: anytype) void {
        const io = io_context();

        self.mutex.lockUncancelable(io);
        defer self.mutex.unlock(io);

        if (self.queued == max_events) {
            log.err("audio", "dropping an event nobody drained", .{});

            return;
        }

        const slot = &self.items[(self.first + self.queued) % max_events];
        var writer = std.Io.Writer.fixed(&slot.bytes);

        writer.print(format, args) catch {};

        slot.len = writer.buffered().len;
        self.queued += 1;
    }

    fn pop(self: *Events, buffer: []u8) []const u8 {
        const io = io_context();

        self.mutex.lockUncancelable(io);
        defer self.mutex.unlock(io);

        if (self.queued == 0) return "";

        const event = &self.items[self.first];
        const length = @min(event.len, buffer.len);

        @memcpy(buffer[0..length], event.bytes[0..length]);

        self.first = (self.first + 1) % max_events;
        self.queued -= 1;

        return buffer[0..length];
    }
};

/// The same wire vocabulary the ExoPlayer and AVQueuePlayer engines emit.
pub const Player = struct {
    gst: *const gst.Gst,
    pipeline: gst.Pipeline,

    mutex: std.Io.Mutex = .init,
    events: Events = .{},

    track_id: [max_track_id_bytes]u8 = undefined,
    track_id_len: usize = 0,

    pump: ?std.Thread = null,
    stopping: std.atomic.Value(bool) = .init(false),

    pub fn init(self: *Player, runtime: *const gst.Gst, device: []const u8) Error!void {
        var description: [128]u8 = undefined;
        const sink = sinkFor(device);
        const text = std.fmt.bufPrintZ(&description, "playbin audio-sink=\"{s}\"", .{sink}) catch {
            return error.LaunchFailed;
        };

        self.* = .{ .gst = runtime, .pipeline = try gst.Pipeline.launch(runtime, text) };
        self.pump = std.Thread.spawn(.{}, drain, .{self}) catch |failure| {
            self.pipeline.deinit();

            return failure;
        };
    }

    pub fn deinit(self: *Player) void {
        self.stopping.store(true, .release);

        if (self.pump) |thread| thread.join();

        self.pipeline.deinit();
    }

    pub fn clear(self: *Player) void {
        _ = self.pipeline.setState(.null);

        const io = io_context();

        self.mutex.lockUncancelable(io);
        defer self.mutex.unlock(io);

        self.track_id_len = 0;
    }

    pub fn configure(self: *Player, source: [:0]const u8, track_id: []const u8) Error!void {
        if (track_id.len > max_track_id_bytes) return error.TrackIdTooLong;

        _ = self.pipeline.setState(.null);
        self.pipeline.set("uri", source);

        const io = io_context();

        {
            self.mutex.lockUncancelable(io);
            defer self.mutex.unlock(io);

            @memcpy(self.track_id[0..track_id.len], track_id);
            self.track_id_len = track_id.len;
        }

        _ = self.pipeline.setState(.paused);
    }

    /// Empty when nothing is queued, so a caller drains until it gets an empty answer.
    pub fn consumeEvent(self: *Player, buffer: []u8) []const u8 {
        return self.events.pop(buffer);
    }

    pub fn currentTrackId(self: *Player, buffer: []u8) []const u8 {
        const io = io_context();

        self.mutex.lockUncancelable(io);
        defer self.mutex.unlock(io);

        const length = @min(self.track_id_len, buffer.len);
        @memcpy(buffer[0..length], self.track_id[0..length]);

        return buffer[0..length];
    }

    pub fn positionMs(self: *const Player) i64 {
        const nanoseconds = self.pipeline.position() orelse return 0;

        return @divTrunc(nanoseconds, std.time.ns_per_ms);
    }

    pub fn seekToMs(self: *const Player, position_ms: i64) bool {
        return self.pipeline.seek(position_ms * std.time.ns_per_ms);
    }

    pub fn setPlaying(self: *const Player, playing: bool) void {
        _ = self.pipeline.setState(if (playing) .playing else .paused);
    }

    fn drain(self: *Player) void {
        var failure: [max_event_bytes]u8 = undefined;
        var id: [max_track_id_bytes]u8 = undefined;

        while (!self.stopping.load(.acquire)) {
            switch (self.pipeline.wait(poll_interval_ns, &failure)) {
                .timeout => continue,
                .ended => self.events.push("completed:{s}", .{self.currentTrackId(&id)}),
                .failed => |text| self.events.push(
                    "error:unknown:{s}:{s}",
                    .{ self.currentTrackId(&id), text },
                ),
            }
        }
    }
};

fn io_context() std.Io {
    return std.Io.Threaded.global_single_threaded.io();
}

/// A singleton rather than the handle `http_server.zig` hands back, because the daemon has one
/// output and never stops the engine: there is nothing for a second instance to be.
const Hosted = struct {
    runtime: gst.Gst,
    player: Player,
    started: bool,
};

var hosted: Hosted = .{ .runtime = undefined, .player = undefined, .started = false };

export fn atolla_audio_start(device: [*:0]const u8) bool {
    if (hosted.started) return true;

    hosted.runtime = gst.load() catch return false;
    hosted.runtime.initialise();

    hosted.player.init(&hosted.runtime, std.mem.span(device)) catch {
        hosted.runtime.close();

        return false;
    };

    hosted.started = true;

    return true;
}

export fn atolla_audio_configure(source: [*:0]const u8, track_id: [*:0]const u8) bool {
    if (!hosted.started) return false;

    hosted.player.configure(std.mem.span(source), std.mem.span(track_id)) catch return false;

    return true;
}

export fn atolla_audio_set_playing(playing: bool) void {
    if (hosted.started) hosted.player.setPlaying(playing);
}

export fn atolla_audio_seek_to_ms(position_ms: i64) bool {
    return hosted.started and hosted.player.seekToMs(position_ms);
}

export fn atolla_audio_position_ms() i64 {
    return if (hosted.started) hosted.player.positionMs() else 0;
}

export fn atolla_audio_clear() void {
    if (hosted.started) hosted.player.clear();
}

export fn atolla_audio_current_track_id(out: [*]u8, len: usize) usize {
    if (!hosted.started) return 0;

    return hosted.player.currentTrackId(out[0..len]).len;
}

export fn atolla_audio_consume_event(out: [*]u8, len: usize) usize {
    if (!hosted.started) return 0;

    return hosted.player.consumeEvent(out[0..len]).len;
}

const testing = std.testing;

fn silentPlayer(runtime: *const gst.Gst, player: *Player) !void {
    player.init(runtime, silent_device) catch |failure| switch (failure) {
        error.LaunchFailed => return error.SkipZigTest,
        else => return failure,
    };
}

fn loaded() !gst.Gst {
    var runtime = gst.load() catch |failure| switch (failure) {
        error.LibraryNotFound => return error.SkipZigTest,
        else => return failure,
    };

    runtime.initialise();

    return runtime;
}

fn until(player: *Player, reached: *const fn (*Player) bool) !void {
    for (0..100) |_| {
        if (reached(player)) return;

        io_context().sleep(.fromMilliseconds(50), .awake) catch {};
    }

    return error.TestExpectedState;
}

fn nextEvent(player: *Player, buffer: []u8) ![]const u8 {
    for (0..100) |_| {
        const event = player.consumeEvent(buffer);
        if (event.len != 0) return event;

        io_context().sleep(.fromMilliseconds(50), .awake) catch {};
    }

    return error.TestExpectedEvent;
}

test "audio_player: a machine with no output gets a sink that keeps time" {
    try testing.expectEqualStrings("fakesink sync=true", sinkFor("none"));
    try testing.expectEqualStrings("autoaudiosink", sinkFor("default"));
}

test "audio_player: events come back in the order they happened" {
    var events: Events = .{};
    var buffer: [max_event_bytes]u8 = undefined;

    try testing.expectEqualStrings("", events.pop(&buffer));

    events.push("completed:{s}", .{"first"});
    events.push("completed:{s}", .{"second"});

    try testing.expectEqualStrings("completed:first", events.pop(&buffer));
    try testing.expectEqualStrings("completed:second", events.pop(&buffer));
    try testing.expectEqualStrings("", events.pop(&buffer));
}

test "audio_player: a queue nobody drains drops rather than blocking the bus" {
    var events: Events = .{};
    var buffer: [max_event_bytes]u8 = undefined;

    for (0..max_events + 8) |index| events.push("completed:{d}", .{index});

    try testing.expectEqualStrings("completed:0", events.pop(&buffer));

    for (1..max_events) |_| _ = events.pop(&buffer);

    try testing.expectEqualStrings("", events.pop(&buffer));
}

test "audio_player: an event longer than the buffer keeps its start" {
    var events: Events = .{};
    var buffer: [max_event_bytes]u8 = undefined;

    events.push("error:unknown:track:{s}", .{"m" ** (max_event_bytes * 2)});

    const event = events.pop(&buffer);

    try testing.expectEqual(max_event_bytes, event.len);
    try testing.expect(std.mem.startsWith(u8, event, "error:unknown:track:mmm"));
}

test "audio_player: reports the track it was given" {
    var runtime = try loaded();
    defer runtime.close();

    var player: Player = undefined;
    try silentPlayer(&runtime, &player);
    defer player.deinit();

    var buffer: [max_track_id_bytes]u8 = undefined;

    try testing.expectEqualStrings("", player.currentTrackId(&buffer));

    try player.configure("file:///atolla/nothing.wav", "track-1");

    try testing.expectEqualStrings("track-1", player.currentTrackId(&buffer));

    player.clear();

    try testing.expectEqualStrings("", player.currentTrackId(&buffer));
}

test "audio_player: announces the track it finished" {
    var runtime = try loaded();
    defer runtime.close();

    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();

    var audio: [wav.tone_bytes]u8 = undefined;
    try tmp.dir.writeFile(testing.io, .{ .sub_path = "tone.wav", .data = wav.tone(&audio) });

    var path_buffer: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const path = try std.fmt.bufPrintZ(&path_buffer, ".zig-cache/tmp/{s}/tone.wav", .{tmp.sub_path});

    var uri_buffer: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const uri = try runtime.fileUri(&uri_buffer, path);

    var player: Player = undefined;
    try silentPlayer(&runtime, &player);
    defer player.deinit();

    try player.configure(uri, "track-finished");
    player.setPlaying(true);

    var buffer: [max_event_bytes]u8 = undefined;

    try testing.expectEqualStrings("completed:track-finished", try nextEvent(&player, &buffer));
    try testing.expectEqualStrings("", player.consumeEvent(&buffer));
}

test "audio_player: announces a track it cannot play, naming it" {
    var runtime = try loaded();
    defer runtime.close();

    var player: Player = undefined;
    try silentPlayer(&runtime, &player);
    defer player.deinit();

    try player.configure("file:///atolla/not/a/real/file.wav", "track-missing");
    player.setPlaying(true);

    var buffer: [max_event_bytes]u8 = undefined;
    const event = try nextEvent(&player, &buffer);

    try testing.expect(std.mem.startsWith(u8, event, "error:unknown:track-missing:"));
    try testing.expect(event.len > "error:unknown:track-missing:".len);
}

test "audio_player: seeking moves the position it reports" {
    var runtime = try loaded();
    defer runtime.close();

    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();

    var audio: [wav.tone_bytes]u8 = undefined;
    try tmp.dir.writeFile(testing.io, .{ .sub_path = "tone.wav", .data = wav.tone(&audio) });

    var path_buffer: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const path = try std.fmt.bufPrintZ(&path_buffer, ".zig-cache/tmp/{s}/tone.wav", .{tmp.sub_path});

    var uri_buffer: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const uri = try runtime.fileUri(&uri_buffer, path);

    var player: Player = undefined;
    try silentPlayer(&runtime, &player);
    defer player.deinit();

    try player.configure(uri, "track-seek");
    player.setPlaying(true);

    try until(&player, struct {
        fn started(current: *Player) bool {
            return current.positionMs() > 0;
        }
    }.started);

    try testing.expect(player.seekToMs(1_200));

    try until(&player, struct {
        fn sought(current: *Player) bool {
            return current.positionMs() >= 1_100;
        }
    }.sought);
}

test "audio_player: refuses a track id it cannot hold" {
    var runtime = try loaded();
    defer runtime.close();

    var player: Player = undefined;
    try silentPlayer(&runtime, &player);
    defer player.deinit();

    const oversized = "x" ** (max_track_id_bytes + 1);

    try testing.expectError(error.TrackIdTooLong, player.configure("file:///a.wav", oversized));
}
