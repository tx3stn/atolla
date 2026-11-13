const std = @import("std");

pub const max_track_id_bytes = 128;

pub const max_window_tracks = 35;

const temp_prefix = ".";

const max_temp_name_bytes = temp_prefix.len + max_track_id_bytes + 1 + 20;

pub const Outcome = enum { created, replaced };

pub const SweepError = std.Io.Dir.Iterator.Error || std.Io.Dir.DeleteFileError;

pub const ReserveError = error{ CacheFull, LargerThanCache, NotInWindow } ||
    SweepError ||
    std.Io.File.OpenError;

pub fn isTrackId(id: []const u8) bool {
    if (id.len == 0 or id.len > max_track_id_bytes) return false;

    for (id) |byte| {
        if (!std.ascii.isAlphanumeric(byte) and byte != '-' and byte != '_') return false;
    }

    return true;
}

const TrackId = struct {
    bytes: [max_track_id_bytes]u8,
    len: usize,

    fn init(id: []const u8) TrackId {
        var track: TrackId = .{ .bytes = undefined, .len = id.len };
        @memcpy(track.bytes[0..id.len], id);

        return track;
    }

    fn slice(self: *const TrackId) []const u8 {
        return self.bytes[0..self.len];
    }
};

pub const Store = struct {
    capacity: u64,
    dir: std.Io.Dir,
    io: std.Io,
    mutex: std.Io.Mutex = .init,
    next_temp: u64 = 0,
    reserved: u64 = 0,
    window: [max_window_tracks]TrackId = undefined,
    window_len: usize = 0,

    pub fn open(io: std.Io, path: []const u8, capacity: u64) !Store {
        const dir = try std.Io.Dir.cwd().openDir(io, path, .{ .iterate = true });
        errdefer dir.close(io);

        try deleteLeftovers(io, dir);

        return .{ .capacity = capacity, .dir = dir, .io = io };
    }

    pub fn close(self: *Store) void {
        self.dir.close(self.io);
    }

    pub fn holds(self: *Store, id: []const u8) bool {
        if (!isTrackId(id)) return false;

        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);

        _ = self.dir.statFile(self.io, id, .{}) catch return false;

        return true;
    }

    pub fn reserve(self: *Store, id: []const u8, length: u64) ReserveError!Upload {
        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);

        const rank = self.rankOf(id) orelse return error.NotInWindow;
        if (length > self.capacity) return error.LargerThanCache;

        try self.makeRoom(rank, length);

        var upload: Upload = .{
            .file = undefined,
            .id = .init(id),
            .length = length,
            .store = self,
            .temp = undefined,
            .temp_len = 0,
        };

        const temp = std.fmt.bufPrint(&upload.temp, temp_prefix ++ "{s}.{d}", .{ id, self.next_temp }) catch unreachable;
        upload.temp_len = temp.len;
        self.next_temp += 1;

        upload.file = try self.dir.createFile(self.io, temp, .{ .exclusive = true });
        self.reserved += length;

        return upload;
    }

    pub fn setWindow(
        self: *Store,
        ids: []const []const u8,
        held: *[max_window_tracks][]const u8,
    ) SweepError![]const []const u8 {
        self.mutex.lockUncancelable(self.io);
        defer self.mutex.unlock(self.io);

        for (ids, 0..) |id, rank| self.window[rank] = .init(id);
        self.window_len = ids.len;

        const sizes = try self.sweep();

        var count: usize = 0;
        for (ids, 0..) |id, rank| {
            if (sizes[rank] == null) continue;

            held[count] = id;
            count += 1;
        }

        return held[0..count];
    }

    fn deleteTrack(self: *Store, id: []const u8) std.Io.Dir.DeleteFileError!void {
        self.dir.deleteFile(self.io, id) catch |err| switch (err) {
            error.FileNotFound => {},
            else => return err,
        };
    }

    fn makeRoom(self: *Store, rank: usize, length: u64) ReserveError!void {
        const sizes = try self.sweep();

        var held: u64 = 0;
        var farther: u64 = 0;

        for (sizes[0..self.window_len], 0..) |size, other| {
            held += size orelse 0;
            if (other > rank) farther += size orelse 0;
        }

        if (held - farther + self.reserved + length > self.capacity) return error.CacheFull;

        var farthest = self.window_len;
        while (held + self.reserved + length > self.capacity) {
            farthest -= 1;

            const size = sizes[farthest] orelse continue;
            try self.deleteTrack(self.window[farthest].slice());
            held -= size;
        }
    }

    fn rankOf(self: *const Store, id: []const u8) ?usize {
        for (self.window[0..self.window_len], 0..) |listed, rank| {
            if (std.mem.eql(u8, listed.slice(), id)) return rank;
        }

        return null;
    }

    fn sweep(self: *Store) SweepError![max_window_tracks]?u64 {
        var sizes: [max_window_tracks]?u64 = @splat(null);
        var entries = self.dir.iterate();

        while (try entries.next(self.io)) |entry| {
            if (!isTrackId(entry.name)) continue;

            const rank = self.rankOf(entry.name) orelse {
                try self.deleteTrack(entry.name);
                continue;
            };

            const stat = self.dir.statFile(self.io, entry.name, .{}) catch continue;
            sizes[rank] = stat.size;
        }

        return sizes;
    }
};

pub const Upload = struct {
    file: std.Io.File,
    id: TrackId,
    length: u64,
    store: *Store,
    temp: [max_temp_name_bytes]u8,
    temp_len: usize,

    pub fn abandon(self: *Upload) void {
        const store = self.store;

        self.file.close(store.io);
        store.dir.deleteFile(store.io, self.tempName()) catch {};

        store.mutex.lockUncancelable(store.io);
        defer store.mutex.unlock(store.io);

        store.reserved -= self.length;
    }

    pub fn commit(self: *Upload) !Outcome {
        const store = self.store;

        self.file.sync(store.io) catch |err| {
            self.abandon();
            return err;
        };
        self.file.close(store.io);

        store.mutex.lockUncancelable(store.io);
        defer store.mutex.unlock(store.io);

        store.reserved -= self.length;

        const outcome: Outcome = if (store.dir.statFile(store.io, self.trackId(), .{})) |_|
            .replaced
        else |_|
            .created;

        store.dir.rename(self.tempName(), store.dir, self.trackId(), store.io) catch |err| {
            store.dir.deleteFile(store.io, self.tempName()) catch {};
            return err;
        };

        return outcome;
    }

    pub fn trackId(self: *const Upload) []const u8 {
        return self.id.slice();
    }

    fn tempName(self: *const Upload) []const u8 {
        return self.temp[0..self.temp_len];
    }
};

fn deleteLeftovers(io: std.Io, dir: std.Io.Dir) std.Io.Dir.Iterator.Error!void {
    var entries = dir.iterate();

    while (try entries.next(io)) |entry| {
        if (!std.mem.startsWith(u8, entry.name, temp_prefix)) continue;

        dir.deleteFile(io, entry.name) catch {};
    }
}

const testing = std.testing;

fn openIn(tmp: *testing.TmpDir, capacity: u64) !Store {
    var buffer: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const path = try std.fmt.bufPrint(&buffer, ".zig-cache/tmp/{s}", .{tmp.sub_path});

    return Store.open(testing.io, path, capacity);
}

fn put(store: *Store, id: []const u8, bytes: []const u8) !Outcome {
    var upload = try store.reserve(id, bytes.len);
    try upload.file.writeStreamingAll(testing.io, bytes);

    return upload.commit();
}

fn exists(tmp: *testing.TmpDir, name: []const u8) bool {
    _ = tmp.dir.statFile(testing.io, name, .{}) catch return false;

    return true;
}

test "media_store: a track id is letters, digits, dashes and underscores, up to 128 bytes" {
    try testing.expect(isTrackId("a1b2c3d4e5f60718293a4b5c6d7e8f90"));
    try testing.expect(isTrackId("track_1-a"));
    try testing.expect(isTrackId("x" ** max_track_id_bytes));

    try testing.expect(!isTrackId(""));
    try testing.expect(!isTrackId("x" ** (max_track_id_bytes + 1)));
    try testing.expect(!isTrackId("../secrets"));
    try testing.expect(!isTrackId(".hidden"));
    try testing.expect(!isTrackId("a/b"));
    try testing.expect(!isTrackId("a b"));
}

test "media_store: deletes partial uploads left by a previous run when the daemon starts" {
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();

    try tmp.dir.writeFile(testing.io, .{ .sub_path = ".track.0", .data = "half" });
    try tmp.dir.writeFile(testing.io, .{ .sub_path = "track", .data = "whole" });

    var store = try openIn(&tmp, 100);
    defer store.close();

    try testing.expect(!exists(&tmp, ".track.0"));
    try testing.expect(exists(&tmp, "track"));
}

test "media_store: an upload appears under its id only once it commits" {
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();

    var store = try openIn(&tmp, 100);
    defer store.close();

    var held: [max_window_tracks][]const u8 = undefined;
    _ = try store.setWindow(&.{"track"}, &held);

    var upload = try store.reserve("track", 3);
    try upload.file.writeStreamingAll(testing.io, "abc");

    try testing.expect(!exists(&tmp, "track"));
    try testing.expectEqual(Outcome.created, try upload.commit());

    var buffer: [8]u8 = undefined;
    try testing.expectEqualStrings("abc", try tmp.dir.readFile(testing.io, "track", &buffer));
}

test "media_store: a second upload of a track replaces the first" {
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();

    var store = try openIn(&tmp, 100);
    defer store.close();

    var held: [max_window_tracks][]const u8 = undefined;
    _ = try store.setWindow(&.{"track"}, &held);

    try testing.expectEqual(Outcome.created, try put(&store, "track", "old"));
    try testing.expectEqual(Outcome.replaced, try put(&store, "track", "new"));

    var buffer: [8]u8 = undefined;
    try testing.expectEqualStrings("new", try tmp.dir.readFile(testing.io, "track", &buffer));
}

test "media_store: an abandoned upload deletes its partial file and frees the space it reserved" {
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();

    var store = try openIn(&tmp, 4);
    defer store.close();

    var held: [max_window_tracks][]const u8 = undefined;
    _ = try store.setWindow(&.{"track"}, &held);

    var upload = try store.reserve("track", 4);
    try upload.file.writeStreamingAll(testing.io, "ab");
    upload.abandon();

    var entries = tmp.dir.iterate();
    try testing.expectEqual(null, try entries.next(testing.io));

    var again = try store.reserve("track", 4);
    again.abandon();
}

test "media_store: refuses a file larger than the whole cache" {
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();

    var store = try openIn(&tmp, 4);
    defer store.close();

    var held: [max_window_tracks][]const u8 = undefined;
    _ = try store.setWindow(&.{"track"}, &held);

    try testing.expectError(error.LargerThanCache, store.reserve("track", 5));
}

test "media_store: an upload in progress reserves its full size, so a second upload can't use that space" {
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();

    var store = try openIn(&tmp, 10);
    defer store.close();

    var held: [max_window_tracks][]const u8 = undefined;
    _ = try store.setWindow(&.{ "first", "second" }, &held);

    var first = try store.reserve("first", 6);
    defer first.abandon();

    try testing.expectError(error.CacheFull, store.reserve("second", 5));
}

test "media_store: a window deletes the tracks it doesn't list and answers which of its own are held, in its order" {
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();

    try tmp.dir.writeFile(testing.io, .{ .sub_path = "dropped", .data = "x" });
    try tmp.dir.writeFile(testing.io, .{ .sub_path = "first", .data = "x" });
    try tmp.dir.writeFile(testing.io, .{ .sub_path = "third", .data = "x" });

    var store = try openIn(&tmp, 100);
    defer store.close();

    var held: [max_window_tracks][]const u8 = undefined;
    const answer = try store.setWindow(&.{ "third", "second", "first" }, &held);

    try testing.expectEqual(2, answer.len);
    try testing.expectEqualStrings("third", answer[0]);
    try testing.expectEqualStrings("first", answer[1]);
    try testing.expect(!exists(&tmp, "dropped"));
}

test "media_store: refuses an upload of a track the window doesn't list" {
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();

    var store = try openIn(&tmp, 100);
    defer store.close();

    var held: [max_window_tracks][]const u8 = undefined;
    _ = try store.setWindow(&.{"listed"}, &held);

    try testing.expectError(error.NotInWindow, store.reserve("unlisted", 1));
}

test "media_store: makes room by deleting the farthest tracks the window ranks after the upload" {
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();

    var store = try openIn(&tmp, 10);
    defer store.close();

    var held: [max_window_tracks][]const u8 = undefined;
    _ = try store.setWindow(&.{ "first", "second", "third", "fourth" }, &held);

    _ = try put(&store, "first", "abc");
    _ = try put(&store, "third", "abc");
    _ = try put(&store, "fourth", "abc");
    _ = try put(&store, "second", "abc");

    try testing.expect(exists(&tmp, "first"));
    try testing.expect(exists(&tmp, "second"));
    try testing.expect(exists(&tmp, "third"));
    try testing.expect(!exists(&tmp, "fourth"));
}

test "media_store: refuses an upload, deleting nothing, when the tracks ranked after it can't free enough" {
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();

    var store = try openIn(&tmp, 10);
    defer store.close();

    var held: [max_window_tracks][]const u8 = undefined;
    _ = try store.setWindow(&.{ "first", "second", "third" }, &held);

    _ = try put(&store, "first", "abcdef");
    _ = try put(&store, "third", "abc");

    try testing.expectError(error.CacheFull, store.reserve("second", 5));
    try testing.expect(exists(&tmp, "third"));
}
