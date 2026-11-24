const std = @import("std");

const max_bytes = 300 * @sizeOf(f32);
const temp_suffix = ".tmp";

var next_temp_id = std.atomic.Value(u64).init(0);

export fn atolla_waveform_store_clear(dir: [*]const u8, dir_len: usize) void {
    clear(dir[0..dir_len]);
}

export fn atolla_waveform_store_count(dir: [*]const u8, dir_len: usize) u32 {
    return count(dir[0..dir_len]);
}

export fn atolla_waveform_store_has(dir: [*]const u8, dir_len: usize, track_id: [*]const u8, track_id_len: usize) bool {
    return has(dir[0..dir_len], track_id[0..track_id_len]);
}

// TODO(waveform-migration): remove once it's been long enough that all uses of old waveform cache have been replaced
export fn atolla_waveform_store_migrate(
    dir: [*]const u8,
    dir_len: usize,
    records_json: [*]const u8,
    records_json_len: usize,
) u32 {
    return migrate(dir[0..dir_len], records_json[0..records_json_len]);
}

export fn atolla_waveform_store_read(
    dir: [*]const u8,
    dir_len: usize,
    track_id: [*]const u8,
    track_id_len: usize,
    out: *[max_bytes]u8,
    out_len: *usize,
) bool {
    out_len.* = read(dir[0..dir_len], track_id[0..track_id_len], out) orelse return false;

    return true;
}

export fn atolla_waveform_store_write(
    dir: [*]const u8,
    dir_len: usize,
    track_id: [*]const u8,
    track_id_len: usize,
    amps: [*]const u8,
    amps_len: usize,
) bool {
    return write(dir[0..dir_len], track_id[0..track_id_len], amps[0..amps_len]);
}

fn clear(dir_path: []const u8) void {
    std.Io.Dir.cwd().deleteTree(io(), dir_path) catch {};
    std.Io.Dir.cwd().createDirPath(io(), dir_path) catch {};
}

fn count(dir_path: []const u8) u32 {
    const dir = std.Io.Dir.cwd().openDir(io(), dir_path, .{ .iterate = true }) catch return 0;
    defer dir.close(io());

    var waveforms: u32 = 0;
    var entries = dir.iterate();
    while (entries.next(io()) catch null) |entry| {
        if (entry.kind == .file and !std.mem.endsWith(u8, entry.name, temp_suffix)) waveforms += 1;
    }

    return waveforms;
}

fn has(dir_path: []const u8, track_id: []const u8) bool {
    var key_buffer: [std.Io.Dir.max_name_bytes]u8 = undefined;
    const key = safeKey(&key_buffer, track_id) orelse return false;

    const dir = std.Io.Dir.cwd().openDir(io(), dir_path, .{}) catch return false;
    defer dir.close(io());

    const stat = dir.statFile(io(), key, .{}) catch return false;

    return stat.kind == .file;
}

fn io() std.Io {
    return std.Io.Threaded.global_single_threaded.io();
}

// TODO(waveform-migration): remove once it's been long enough that all uses of old waveform cache have been replaced
fn migrate(dir_path: []const u8, records_json: []const u8) u32 {
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();

    const records = std.json.parseFromSliceLeaky(std.json.Value, arena.allocator(), records_json, .{}) catch return 0;
    if (records != .object) return 0;

    var migrated: u32 = 0;
    var amps: [max_bytes]u8 = undefined;
    for (records.object.values()) |record| {
        if (record != .object) continue;
        const status = record.object.get("status") orelse continue;
        const track_id = record.object.get("trackId") orelse continue;
        const amps_base64 = record.object.get("amps") orelse continue;
        if (status != .string or track_id != .string or amps_base64 != .string) continue;
        if (!std.mem.eql(u8, status.string, "ready")) continue;

        const amps_len = std.base64.standard.Decoder.calcSizeForSlice(amps_base64.string) catch continue;
        if (amps_len > amps.len) continue;
        std.base64.standard.Decoder.decode(amps[0..amps_len], amps_base64.string) catch continue;

        if (write(dir_path, track_id.string, amps[0..amps_len])) migrated += 1;
    }

    return migrated;
}

fn read(dir_path: []const u8, track_id: []const u8, out: *[max_bytes]u8) ?usize {
    var key_buffer: [std.Io.Dir.max_name_bytes]u8 = undefined;
    const key = safeKey(&key_buffer, track_id) orelse return null;

    const dir = std.Io.Dir.cwd().openDir(io(), dir_path, .{}) catch return null;
    defer dir.close(io());

    const amps = dir.readFile(io(), key, out) catch return null;

    return amps.len;
}

fn safeKey(buffer: *[std.Io.Dir.max_name_bytes]u8, track_id: []const u8) ?[]const u8 {
    const trimmed = std.mem.trim(u8, track_id, &std.ascii.whitespace);
    if (trimmed.len == 0) return "track";
    if (trimmed.len > buffer.len) return null;

    for (trimmed, buffer[0..trimmed.len]) |char, *safe| {
        safe.* = switch (char) {
            'a'...'z', 'A'...'Z', '0'...'9', '.', '_', '-' => char,
            else => '_',
        };
    }

    return buffer[0..trimmed.len];
}

fn write(dir_path: []const u8, track_id: []const u8, amps: []const u8) bool {
    if (amps.len > max_bytes) return false;

    var key_buffer: [std.Io.Dir.max_name_bytes]u8 = undefined;
    const key = safeKey(&key_buffer, track_id) orelse return false;

    var temp_buffer: [std.Io.Dir.max_name_bytes]u8 = undefined;
    const temp = std.fmt.bufPrint(
        &temp_buffer,
        "{s}.{d}" ++ temp_suffix,
        .{ key, next_temp_id.fetchAdd(1, .monotonic) },
    ) catch return false;

    const dir = std.Io.Dir.cwd().openDir(io(), dir_path, .{}) catch return false;
    defer dir.close(io());

    const written = written: {
        dir.writeFile(io(), .{ .sub_path = temp, .data = amps }) catch break :written false;
        dir.rename(temp, dir, key, io()) catch break :written false;
        break :written true;
    };
    if (!written) dir.deleteFile(io(), temp) catch {};

    return written;
}

const testing = std.testing;

const test_amps = [_]u8{ 1, 2, 3, 4 };

const TestDir = struct {
    path: []const u8,
    path_buffer: [std.Io.Dir.max_path_bytes]u8,
    tmp: testing.TmpDir,

    fn create(self: *TestDir) !void {
        self.tmp = testing.tmpDir(.{ .iterate = true });
        self.path = try std.fmt.bufPrint(&self.path_buffer, ".zig-cache/tmp/{s}", .{self.tmp.sub_path});
    }

    fn cleanup(self: *TestDir) void {
        self.tmp.cleanup();
    }

    fn entries(self: *TestDir) !usize {
        var total: usize = 0;
        var iterator = self.tmp.dir.iterate();
        while (try iterator.next(testing.io)) |_| total += 1;

        return total;
    }

    fn exists(self: *TestDir, name: []const u8) bool {
        _ = self.tmp.dir.statFile(testing.io, name, .{}) catch return false;

        return true;
    }

    fn writeUnfinished(self: *TestDir, name: []const u8) !void {
        try self.tmp.dir.writeFile(testing.io, .{ .sub_path = name, .data = &test_amps });
    }
};

fn expectSafeKey(expected: []const u8, track_id: []const u8) !void {
    var buffer: [std.Io.Dir.max_name_bytes]u8 = undefined;
    try testing.expectEqualStrings(expected, safeKey(&buffer, track_id).?);
}

test "waveform_store: the safe key keeps letters, digits, dots, underscores and dashes" {
    try expectSafeKey("Ab9._-", "Ab9._-");
}

test "waveform_store: the safe key replaces any other character with an underscore" {
    try expectSafeKey("a_b_c", "a/b:c");
}

test "waveform_store: the safe key trims surrounding whitespace" {
    try expectSafeKey("abc", "  abc\t");
}

test "waveform_store: the safe key of a blank id is track" {
    try expectSafeKey("track", "   ");
}

test "waveform_store: clear removes waveforms and unfinished writes, leaving an empty folder" {
    var dir: TestDir = undefined;
    try dir.create();
    defer dir.cleanup();

    try testing.expect(write(dir.path, "track-1", &test_amps));
    try dir.writeUnfinished("track-2.0.tmp");

    clear(dir.path);

    const emptied = try std.Io.Dir.cwd().openDir(testing.io, dir.path, .{});
    emptied.close(testing.io);
    try testing.expectEqual(0, count(dir.path));
    try testing.expect(!has(dir.path, "track-1"));
}

test "waveform_store: count ignores unfinished writes" {
    var dir: TestDir = undefined;
    try dir.create();
    defer dir.cleanup();

    try testing.expect(write(dir.path, "track-1", &test_amps));
    try testing.expect(write(dir.path, "track-2", &test_amps));
    try dir.writeUnfinished("track-3.0.tmp");

    try testing.expectEqual(2, count(dir.path));
}

test "waveform_store: count is zero when the folder is missing" {
    try testing.expectEqual(0, count(".zig-cache/tmp/atolla-waveform-store-missing"));
}

test "waveform_store: has reports whether a waveform was written" {
    var dir: TestDir = undefined;
    try dir.create();
    defer dir.cleanup();

    try testing.expect(write(dir.path, "track-1", &test_amps));

    try testing.expect(has(dir.path, "track-1"));
    try testing.expect(!has(dir.path, "track-2"));
}

test "waveform_store: read returns null when there is no waveform" {
    var dir: TestDir = undefined;
    try dir.create();
    defer dir.cleanup();

    var out: [max_bytes]u8 = undefined;
    try testing.expectEqual(null, read(dir.path, "track-1", &out));
}

test "waveform_store: reads back what was written" {
    var dir: TestDir = undefined;
    try dir.create();
    defer dir.cleanup();

    try testing.expect(write(dir.path, "track-1", &test_amps));

    var out: [max_bytes]u8 = undefined;
    const len = read(dir.path, "track-1", &out).?;
    try testing.expectEqualSlices(u8, &test_amps, out[0..len]);
}

test "waveform_store: a write leaves only the waveform file behind" {
    var dir: TestDir = undefined;
    try dir.create();
    defer dir.cleanup();

    try testing.expect(write(dir.path, "track-1", &test_amps));

    try testing.expectEqual(1, try dir.entries());
    try testing.expect(dir.exists("track-1"));
}

test "waveform_store: a write replaces the existing waveform" {
    var dir: TestDir = undefined;
    try dir.create();
    defer dir.cleanup();

    try testing.expect(write(dir.path, "track-1", &test_amps));
    try testing.expect(write(dir.path, "track-1", &.{9}));

    var out: [max_bytes]u8 = undefined;
    const len = read(dir.path, "track-1", &out).?;
    try testing.expectEqualSlices(u8, &.{9}, out[0..len]);
}

test "waveform_store: a write names the file by the safe track key" {
    var dir: TestDir = undefined;
    try dir.create();
    defer dir.cleanup();

    try testing.expect(write(dir.path, "a/b", &test_amps));

    try testing.expect(dir.exists("a_b"));
}

test "waveform_store: a write to a missing folder fails and creates nothing" {
    var dir: TestDir = undefined;
    try dir.create();
    defer dir.cleanup();

    var missing_buffer: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const missing = try std.fmt.bufPrint(&missing_buffer, "{s}/missing", .{dir.path});

    try testing.expect(!write(missing, "track-1", &test_amps));

    try testing.expect(!dir.exists("missing"));
}

test "waveform_store: a write larger than a waveform is refused" {
    var dir: TestDir = undefined;
    try dir.create();
    defer dir.cleanup();

    const too_large = [_]u8{0} ** (max_bytes + 1);

    try testing.expect(!write(dir.path, "track-1", &too_large));

    try testing.expectEqual(0, try dir.entries());
}

// TODO(waveform-migration): remove once it's been long enough that all uses of old waveform cache have been replaced
test "waveform_store: migrate writes the ready records and skips the rest" {
    var dir: TestDir = undefined;
    try dir.create();
    defer dir.cleanup();

    const records =
        \\{"track-1":{"trackId":"track-1","status":"ready","amps":"AQIDBA=="},
        \\"track-2":{"trackId":"track-2","status":"pending","amps":null},
        \\"track-3":{"trackId":"track-3","status":"failed","amps":null}}
    ;

    try testing.expectEqual(1, migrate(dir.path, records));

    var out: [max_bytes]u8 = undefined;
    const len = read(dir.path, "track-1", &out).?;
    try testing.expectEqualSlices(u8, &test_amps, out[0..len]);
    try testing.expect(!has(dir.path, "track-2"));
    try testing.expect(!has(dir.path, "track-3"));
}

// TODO(waveform-migration): remove once it's been long enough that all uses of old waveform cache have been replaced
test "waveform_store: migrate skips a record whose amps aren't base64 and carries on" {
    var dir: TestDir = undefined;
    try dir.create();
    defer dir.cleanup();

    const records =
        \\{"track-1":{"trackId":"track-1","status":"ready","amps":"not base64!"},
        \\"track-2":{"trackId":"track-2","status":"ready","amps":"AQIDBA=="}}
    ;

    try testing.expectEqual(1, migrate(dir.path, records));

    try testing.expect(!has(dir.path, "track-1"));
    try testing.expect(has(dir.path, "track-2"));
}

// TODO(waveform-migration): remove once it's been long enough that all uses of old waveform cache have been replaced
test "waveform_store: migrate writes nothing from JSON that doesn't parse" {
    var dir: TestDir = undefined;
    try dir.create();
    defer dir.cleanup();

    try testing.expectEqual(0, migrate(dir.path, "{"));

    try testing.expectEqual(0, try dir.entries());
}
