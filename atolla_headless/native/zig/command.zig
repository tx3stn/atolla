// POST /command

const std = @import("std");

/// The whole queue travels in a `setQueue`, so this is the one route that takes the global cap.
pub const max_body_bytes = 1024 * 1024;

/// Only the primitives are parsed here, so the scratch holds a handful of numbers and the
/// scanner's own stack. It bounds nesting too: a body nested deeply enough to exhaust it is
/// refused rather than allowed to grow the stack.
pub const parse_bytes = 4 * 1024;

const max_id_bytes = 64;

/// Above what the body cap lets a `setQueue` deliver, so it is a sanity bound rather than a queue
/// length. Whether the index is inside the queue the player holds is TypeScript's to answer.
const max_track_index = 100_000;

/// A day. No track reaches it, and a position past the end of the real track is settled after the
/// request crosses the bridge.
const max_position_ms = 86_400_000;

/// The closed vocabulary. `std.json` refuses a name that is not here, so an unknown command is a
/// parse error and never reaches the bridge.
pub const Name = enum {
    addToQueue,
    jumpToIndex,
    move,
    next,
    pause,
    play,
    playNext,
    previous,
    removeAt,
    seek,
    setLoopMode,
    setQueue,
    shuffle,
};

pub const LoopMode = enum { none, queue, track };

/// `tracks` and `album` are deliberately absent: they are domain shapes with one source of truth
/// in TypeScript, and leaving them undeclared means the scanner skips them without building a
/// value tree, so a 1 MiB queue is not parsed twice. Their presence is TypeScript's to enforce.
pub const Body = struct {
    command: Name,
    fromIndex: ?u32 = null,
    loopMode: ?LoopMode = null,
    positionMs: ?u64 = null,
    toIndex: ?u32 = null,
    trackId: ?[]const u8 = null,
    trackIndex: ?u32 = null,
};

/// The names arrive as text, and `std.json` would otherwise also take a number and select an enum
/// by its ordinal: `{"command":7}` would mean `previous`, turning a client's type error into a
/// silently different command. So the wire shape carries strings and the enums are resolved here.
const Wire = struct {
    command: []const u8,
    fromIndex: ?u32 = null,
    loopMode: ?[]const u8 = null,
    positionMs: ?u64 = null,
    toIndex: ?u32 = null,
    trackId: ?[]const u8 = null,
    trackIndex: ?u32 = null,
};

pub const ParseError = error{Malformed};

/// The returned strings point into `body`, or into `scratch` for one that had to be unescaped, and
/// live as long as those buffers do.
pub fn parse(scratch: []u8, body: []const u8) ParseError!Body {
    var fixed: std.heap.FixedBufferAllocator = .init(scratch);

    // A member belonging to no command is ignored, so a v1 daemon keeps accepting a body that a
    // later controller added a field to.
    const wire = std.json.parseFromSliceLeaky(Wire, fixed.allocator(), body, .{
        .allocate = .alloc_if_needed,
        .ignore_unknown_fields = true,
    }) catch return error.Malformed;

    const parsed: Body = .{
        .command = std.meta.stringToEnum(Name, wire.command) orelse return error.Malformed,
        .fromIndex = wire.fromIndex,
        .loopMode = if (wire.loopMode) |mode|
            std.meta.stringToEnum(LoopMode, mode) orelse return error.Malformed
        else
            null,
        .positionMs = wire.positionMs,
        .toIndex = wire.toIndex,
        .trackId = wire.trackId,
        .trackIndex = wire.trackIndex,
    };

    if (parsed.trackId) |id| {
        if (id.len == 0 or id.len > max_id_bytes) return error.Malformed;
    }

    if (parsed.positionMs) |position| {
        if (position > max_position_ms) return error.Malformed;
    }

    for ([_]?u32{ parsed.fromIndex, parsed.toIndex, parsed.trackIndex }) |index| {
        if (index != null and index.? > max_track_index) return error.Malformed;
    }

    switch (parsed.command) {
        .next, .pause, .play, .previous, .shuffle => {},
        .addToQueue, .playNext, .setQueue => {},
        .seek => if (parsed.positionMs == null) return error.Malformed,
        .jumpToIndex, .removeAt => if (parsed.trackIndex == null) return error.Malformed,
        .move => if (parsed.fromIndex == null or parsed.toIndex == null) return error.Malformed,
        .setLoopMode => if (parsed.loopMode == null) return error.Malformed,
    }

    return parsed;
}

const testing = std.testing;

fn decoded(body: []const u8) ParseError!Body {
    var scratch: [parse_bytes]u8 = undefined;

    return parse(&scratch, body);
}

test "command: reads a command carrying nothing but its name" {
    try testing.expectEqual(Name.pause, (try decoded(
        \\{"command":"pause"}
    )).command);
    try testing.expectEqual(Name.play, (try decoded(
        \\{"command":"play"}
    )).command);
    try testing.expectEqual(Name.next, (try decoded(
        \\{"command":"next"}
    )).command);
    try testing.expectEqual(Name.previous, (try decoded(
        \\{"command":"previous"}
    )).command);
    try testing.expectEqual(Name.shuffle, (try decoded(
        \\{"command":"shuffle"}
    )).command);
}

test "command: reads where a seek is going" {
    const body = try decoded(
        \\{"command":"seek","positionMs":91234}
    );

    try testing.expectEqual(Name.seek, body.command);
    try testing.expectEqual(91234, body.positionMs);
}

test "command: reads the position a queue command names" {
    try testing.expectEqual(3, (try decoded(
        \\{"command":"jumpToIndex","trackIndex":3}
    )).trackIndex);
    try testing.expectEqual(3, (try decoded(
        \\{"command":"removeAt","trackIndex":3}
    )).trackIndex);
}

test "command: reads the guard a queue command may carry" {
    const body = try decoded(
        \\{"command":"removeAt","trackIndex":3,"trackId":"3c4d5e6f708192a3"}
    );

    try testing.expectEqualStrings("3c4d5e6f708192a3", body.trackId.?);
}

test "command: a queue command without a guard is legal" {
    try testing.expectEqual(null, (try decoded(
        \\{"command":"removeAt","trackIndex":3}
    )).trackId);
}

test "command: reads both ends of a move" {
    const body = try decoded(
        \\{"command":"move","fromIndex":1,"toIndex":4}
    );

    try testing.expectEqual(1, body.fromIndex);
    try testing.expectEqual(4, body.toIndex);
}

test "command: reads the loop mode that was asked for" {
    try testing.expectEqual(LoopMode.none, (try decoded(
        \\{"command":"setLoopMode","loopMode":"none"}
    )).loopMode);
    try testing.expectEqual(LoopMode.queue, (try decoded(
        \\{"command":"setLoopMode","loopMode":"queue"}
    )).loopMode);
    try testing.expectEqual(LoopMode.track, (try decoded(
        \\{"command":"setLoopMode","loopMode":"track"}
    )).loopMode);
}

test "command: refuses a body that is not JSON at all" {
    try testing.expectError(error.Malformed, decoded(""));
    try testing.expectError(error.Malformed, decoded("{"));
    try testing.expectError(error.Malformed, decoded("not json"));
    try testing.expectError(error.Malformed, decoded("[]"));
    try testing.expectError(error.Malformed, decoded("null"));
}

test "command: refuses a body naming no command" {
    try testing.expectError(error.Malformed, decoded("{}"));
    try testing.expectError(error.Malformed, decoded(
        \\{"positionMs":91234}
    ));
}

test "command: refuses a name it does not know" {
    try testing.expectError(error.Malformed, decoded(
        \\{"command":"selfDestruct"}
    ));
    try testing.expectError(error.Malformed, decoded(
        \\{"command":""}
    ));
    try testing.expectError(error.Malformed, decoded(
        \\{"command":"PAUSE"}
    ));
}

test "command: refuses a name that is not even a string" {
    try testing.expectError(error.Malformed, decoded(
        \\{"command":7}
    ));
    try testing.expectError(error.Malformed, decoded(
        \\{"command":null}
    ));
}

test "command: refuses a command missing the member it needs" {
    try testing.expectError(error.Malformed, decoded(
        \\{"command":"seek"}
    ));
    try testing.expectError(error.Malformed, decoded(
        \\{"command":"jumpToIndex"}
    ));
    try testing.expectError(error.Malformed, decoded(
        \\{"command":"removeAt"}
    ));
    try testing.expectError(error.Malformed, decoded(
        \\{"command":"setLoopMode"}
    ));
}

test "command: refuses a move missing either end" {
    try testing.expectError(error.Malformed, decoded(
        \\{"command":"move","fromIndex":1}
    ));
    try testing.expectError(error.Malformed, decoded(
        \\{"command":"move","toIndex":4}
    ));
}

test "command: refuses a loop mode it does not have" {
    try testing.expectError(error.Malformed, decoded(
        \\{"command":"setLoopMode","loopMode":"forever"}
    ));
}

test "command: refuses a member whose value is not the kind the command needs" {
    try testing.expectError(error.Malformed, decoded(
        \\{"command":"removeAt","trackIndex":3.5}
    ));
    try testing.expectError(error.Malformed, decoded(
        \\{"command":"removeAt","trackIndex":-1}
    ));
    try testing.expectError(error.Malformed, decoded(
        \\{"command":"setLoopMode","loopMode":3}
    ));
}

test "command: refuses a position no track could hold" {
    try testing.expectError(error.Malformed, decoded(
        \\{"command":"seek","positionMs":86400001}
    ));
}

test "command: refuses an index no queue could hold" {
    try testing.expectError(error.Malformed, decoded(
        \\{"command":"removeAt","trackIndex":100001}
    ));
    try testing.expectError(error.Malformed, decoded(
        \\{"command":"move","fromIndex":0,"toIndex":100001}
    ));
}

test "command: refuses a guard that cannot be a track id" {
    try testing.expectError(error.Malformed, decoded(
        \\{"command":"removeAt","trackIndex":3,"trackId":""}
    ));
    try testing.expectError(error.Malformed, decoded(
        \\{"command":"removeAt","trackIndex":3,"trackId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
    ));
}

test "command: ignores a member belonging to no command" {
    try testing.expectEqual(Name.pause, (try decoded(
        \\{"command":"pause","futureThing":{"a":[1,2]}}
    )).command);
}

test "command: ignores a member belonging to another command" {
    try testing.expectEqual(Name.pause, (try decoded(
        \\{"command":"pause","positionMs":91234}
    )).command);
}

test "command: hands the tracks through without parsing them" {
    var scratch: [parse_bytes]u8 = undefined;
    var buffer: [64 * 1024]u8 = undefined;
    var writer = std.Io.Writer.fixed(&buffer);

    try writer.writeAll(
        \\{"command":"setQueue","trackIndex":0,"tracks":[
    );

    for (0..256) |index| {
        if (index != 0) try writer.writeByte(',');
        try writer.print(
            \\{{"id":"{d:0>16}","name":"a track with a name","album":{{"id":"x"}}}}
        , .{index});
    }

    try writer.writeAll("]}");

    const body = try parse(&scratch, writer.buffered());

    try testing.expectEqual(Name.setQueue, body.command);
    try testing.expectEqual(0, body.trackIndex);
}

test "command: refuses a body nested deeply enough to exhaust its scratch" {
    var scratch: [parse_bytes]u8 = undefined;
    var buffer: [parse_bytes * 8]u8 = undefined;
    @memset(&buffer, '[');
    buffer[0] = '{';

    try testing.expectError(error.Malformed, parse(&scratch, &buffer));
}
