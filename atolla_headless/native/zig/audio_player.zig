const std = @import("std");
const gst = @import("gst.zig");
const log = @import("log.zig");
const wav = @import("wav.zig");

pub const max_track_id_bytes = 128;
pub const max_event_bytes = 512;
pub const max_events = 32;

const default_device = "default";
const silent_device = "none";
const poll_interval_ns = gst.second / 10;

/// Part of the vocabulary `NativeAudioPlaybackEventSync.ts` parses. The fourth member,
/// `unsupported`, stays with the mobile engines: nothing here can separate a bad container from
/// any other decode failure.
const Kind = enum { network, unknown };

fn isRemote(source: []const u8) bool {
    const scheme_end = std.mem.indexOf(u8, source, "://") orelse return false;
    const scheme = source[0..scheme_end];

    return std.ascii.eqlIgnoreCase(scheme, "http") or std.ascii.eqlIgnoreCase(scheme, "https");
}

pub const Error =
    gst.PipelineError || std.Thread.SpawnError || error{ OutputNotFound, TrackIdTooLong };

pub fn sinkFor(device: []const u8) ?[:0]const u8 {
    if (std.mem.eql(u8, device, silent_device)) return "fakesink sync=true";
    if (std.mem.eql(u8, device, default_device)) return "autoaudiosink";

    return null;
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
    source_setup: gst.SourceSetup,

    /// Read by the bus thread to tell a network failure from a missing file.
    remote: std.atomic.Value(bool) = .init(false),

    mutex: std.Io.Mutex = .init,
    events: Events = .{},

    track_id: [max_track_id_bytes]u8 = undefined,
    track_id_len: usize = 0,

    pump: ?std.Thread = null,
    stopping: std.atomic.Value(bool) = .init(false),

    pub fn init(self: *Player, runtime: *const gst.Gst, device: []const u8) Error!void {
        var description: [128]u8 = undefined;
        const text = if (sinkFor(device)) |sink|
            std.fmt.bufPrintZ(&description, "playbin audio-sink=\"{s}\"", .{sink}) catch {
                return error.LaunchFailed;
            }
        else
            "playbin";

        self.* = .{
            .gst = runtime,
            .pipeline = try gst.Pipeline.launch(runtime, text),
            .source_setup = .{ .gst = runtime },
        };

        // After the assignment, because the handler is handed the field's final address.
        self.pipeline.connectSourceSetup(&self.source_setup);

        if (sinkFor(device) == null) {
            const sink = runtime.sinkNamed(device) orelse {
                log.err("audio", "no output named {s}", .{device});
                self.pipeline.deinit();

                return error.OutputNotFound;
            };

            // The element arrives floating and the property sinks it, so it is not ours to unref.
            self.pipeline.setElement("audio-sink", sink);
        }

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

    /// A local path or a URI, the same either-or the app's `resolveTrackSource` hands its engine.
    /// `auth_header` is ignored unless that URI is remote.
    pub fn configure(
        self: *Player,
        source: [:0]const u8,
        track_id: []const u8,
        auth_header: []const u8,
    ) Error!void {
        if (track_id.len > max_track_id_bytes) return error.TrackIdTooLong;

        const remote = isRemote(source);

        var uri_buffer: [std.Io.Dir.max_path_bytes]u8 = undefined;
        const uri = if (std.mem.indexOf(u8, source, "://") != null)
            source
        else
            try self.gst.fileUri(&uri_buffer, source);

        _ = self.pipeline.setState(.null);

        // Both have to be set before the state change below, which is what builds the source.
        self.source_setup.setHeader(if (remote) auth_header else "");
        self.remote.store(remote, .release);

        self.pipeline.set("uri", uri);

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
        var message: [max_event_bytes]u8 = undefined;
        var id: [max_track_id_bytes]u8 = undefined;

        while (!self.stopping.load(.acquire)) {
            switch (self.pipeline.wait(poll_interval_ns, &message)) {
                .timeout => continue,
                .ended => self.events.push("completed:{s}", .{self.currentTrackId(&id)}),
                .failed => |text| self.events.push("error:{s}:{s}:{s}", .{
                    @tagName(self.kind()),
                    self.currentTrackId(&id),
                    text,
                }),
            }
        }
    }

    /// The `GError` domain looks like the signal to use here and is the wrong way round. Playbin
    /// reports a refused connection as a stream error from typefind, swallowing the resource error
    /// souphttpsrc raised, while a missing *local* file arrives as a resource error. A 401 is the
    /// exception: that one keeps its domain and its code.
    fn kind(self: *const Player) Kind {
        return if (self.remote.load(.acquire)) .network else .unknown;
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

/// Loads its own runtime rather than the hosted one: listing is a one-shot command in a process
/// that is not the daemon, and dlopen refcounts so a running engine is unaffected.
export fn atolla_audio_devices(out: [*]u8, len: usize) usize {
    var runtime = gst.load() catch return 0;
    defer runtime.close();

    runtime.initialise();

    return runtime.audioSinks(out[0..len]).len;
}

export fn atolla_audio_configure(
    source: [*:0]const u8,
    track_id: [*:0]const u8,
    auth_header: [*:0]const u8,
) bool {
    if (!hosted.started) return false;

    hosted.player.configure(
        std.mem.span(source),
        std.mem.span(track_id),
        std.mem.span(auth_header),
    ) catch return false;

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
    for (0..300) |_| {
        if (reached(player)) return;

        io_context().sleep(.fromMilliseconds(50), .awake) catch {};
    }

    return error.TestExpectedState;
}

fn nextEvent(player: *Player, buffer: []u8) ![]const u8 {
    for (0..300) |_| {
        const event = player.consumeEvent(buffer);
        if (event.len != 0) return event;

        io_context().sleep(.fromMilliseconds(50), .awake) catch {};
    }

    return error.TestExpectedEvent;
}

test "audio_player: a machine with no output gets a sink that keeps time" {
    try testing.expectEqualStrings("fakesink sync=true", sinkFor("none").?);
    try testing.expectEqualStrings("autoaudiosink", sinkFor("default").?);
    try testing.expectEqual(null, sinkFor("MacBook Pro Speakers"));
}

test "audio_player: refuses to start on an output this machine does not have" {
    var runtime = try loaded();
    defer runtime.close();

    var player: Player = undefined;

    try testing.expectError(error.OutputNotFound, player.init(&runtime, "atolla not an output"));
}

test "audio_player: starts on an output the machine does list" {
    var runtime = try loaded();
    defer runtime.close();

    var listing: [4096]u8 = undefined;
    const sinks = runtime.audioSinks(&listing);

    // A runner or a container has no outputs at all, and nothing here can be asserted without one.
    if (sinks.len == 0) return error.SkipZigTest;

    const first = sinks[0..std.mem.indexOfScalar(u8, sinks, '\n').?];

    var player: Player = undefined;
    try player.init(&runtime, first);
    defer player.deinit();

    var buffer: [max_track_id_bytes]u8 = undefined;
    try testing.expectEqualStrings("", player.currentTrackId(&buffer));
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

    try player.configure("file:///atolla/nothing.wav", "track-1", "");

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

    var player: Player = undefined;
    try silentPlayer(&runtime, &player);
    defer player.deinit();

    try player.configure(path, "track-finished", "");
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

    try player.configure("file:///atolla/not/a/real/file.wav", "track-missing", "");
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

    try player.configure(uri, "track-seek", "");
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

test "audio_player: only an http source counts as remote" {
    try testing.expect(isRemote("http://jellyfin.local:8096/Audio/1/stream.mp3"));
    try testing.expect(isRemote("HTTPS://jellyfin.local/Audio/1/stream.mp3"));

    try testing.expect(!isRemote("file:///var/lib/atolla/media/track-1"));
    try testing.expect(!isRemote("/var/lib/atolla/media/track-1"));
    try testing.expect(!isRemote(""));
}

test "audio_player: a local track carries no credential, whatever it was handed" {
    var runtime = try loaded();
    defer runtime.close();

    var player: Player = undefined;
    try silentPlayer(&runtime, &player);
    defer player.deinit();

    try player.configure("file:///atolla/nothing.wav", "track-local", "MediaBrowser Token=\"x\"");

    try testing.expectEqual(0, player.source_setup.header_len);

    try player.configure("http://127.0.0.1:1/x.wav", "track-remote", "MediaBrowser Token=\"x\"");

    try testing.expectEqualStrings(
        "MediaBrowser Token=\"x\"",
        player.source_setup.header[0..player.source_setup.header_len],
    );
}

test "audio_player: blames the network for a remote track it could not reach" {
    var runtime = try loaded();
    defer runtime.close();

    var player: Player = undefined;
    try silentPlayer(&runtime, &player);
    defer player.deinit();

    // Nothing listens on port 1, so the source never opens.
    try player.configure("http://127.0.0.1:1/missing.wav", "track-unreachable", "");
    player.setPlaying(true);

    var buffer: [max_event_bytes]u8 = undefined;
    const event = try nextEvent(&player, &buffer);

    try testing.expect(std.mem.startsWith(u8, event, "error:network:track-unreachable:"));
}

test "audio_player: refuses a track id it cannot hold" {
    var runtime = try loaded();
    defer runtime.close();

    var player: Player = undefined;
    try silentPlayer(&runtime, &player);
    defer player.deinit();

    const oversized = "x" ** (max_track_id_bytes + 1);

    try testing.expectError(
        error.TrackIdTooLong,
        player.configure("file:///a.wav", oversized, ""),
    );
}
