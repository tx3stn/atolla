const std = @import("std");
const media_store = @import("media_store.zig");

pub const max_body_bytes = 8 * 1024;

pub const ParseError = error{Malformed};

const Wire = struct {
    trackIds: []const []const u8,
};

pub fn parse(scratch: []u8, body: []const u8) ParseError![]const []const u8 {
    var fixed: std.heap.FixedBufferAllocator = .init(scratch);

    const wire = std.json.parseFromSliceLeaky(Wire, fixed.allocator(), body, .{
        .allocate = .alloc_if_needed,
        .ignore_unknown_fields = true,
    }) catch return error.Malformed;

    if (wire.trackIds.len > media_store.max_window_tracks) return error.Malformed;

    for (wire.trackIds, 0..) |id, index| {
        if (!media_store.isTrackId(id)) return error.Malformed;

        for (wire.trackIds[0..index]) |earlier| {
            if (std.mem.eql(u8, earlier, id)) return error.Malformed;
        }
    }

    return wire.trackIds;
}

const testing = std.testing;

test "cache_window: reads the track ids in the order given" {
    var scratch: [max_body_bytes]u8 = undefined;
    const ids = try parse(&scratch,
        \\{"trackIds":["c","a","b"]}
    );

    try testing.expectEqual(3, ids.len);
    try testing.expectEqualStrings("c", ids[0]);
    try testing.expectEqualStrings("a", ids[1]);
    try testing.expectEqualStrings("b", ids[2]);
}

test "cache_window: reads an empty window" {
    var scratch: [max_body_bytes]u8 = undefined;

    try testing.expectEqual(0, (try parse(&scratch,
        \\{"trackIds":[]}
    )).len);
}

test "cache_window: refuses a body that isn't a list of track ids" {
    var scratch: [max_body_bytes]u8 = undefined;

    const refused = [_][]const u8{
        "",
        "not json",
        "[]",
        "{}",
        \\{"trackIds":"a"}
        ,
        \\{"trackIds":[1]}
        ,
    };

    for (refused) |body| try testing.expectError(error.Malformed, parse(&scratch, body));
}

test "cache_window: refuses an id that isn't letters, digits, dashes and underscores" {
    var scratch: [max_body_bytes]u8 = undefined;

    try testing.expectError(error.Malformed, parse(&scratch,
        \\{"trackIds":["a","../secrets"]}
    ));
    try testing.expectError(error.Malformed, parse(&scratch,
        \\{"trackIds":[""]}
    ));
}

test "cache_window: refuses a track listed twice" {
    var scratch: [max_body_bytes]u8 = undefined;

    try testing.expectError(error.Malformed, parse(&scratch,
        \\{"trackIds":["a","b","a"]}
    ));
}

test "cache_window: ignores a field it doesn't know" {
    var scratch: [max_body_bytes]u8 = undefined;
    const ids = try parse(&scratch,
        \\{"trackIds":["a"],"futureThing":{"b":[1,2]}}
    );

    try testing.expectEqualStrings("a", ids[0]);
}

test "cache_window: reads the largest window the phone can send, within the body cap" {
    var body: std.Io.Writer.Allocating = .init(testing.allocator);
    defer body.deinit();

    try body.writer.writeAll("{\"trackIds\":[");
    for (0..media_store.max_window_tracks) |index| {
        if (index > 0) try body.writer.writeByte(',');
        try body.writer.print("\"{d:0>128}\"", .{index});
    }
    try body.writer.writeAll("]}");

    try testing.expect(body.written().len <= max_body_bytes);

    var scratch: [max_body_bytes]u8 = undefined;
    try testing.expectEqual(media_store.max_window_tracks, (try parse(&scratch, body.written())).len);
}

test "cache_window: refuses more tracks than the phone's largest window" {
    var body: std.Io.Writer.Allocating = .init(testing.allocator);
    defer body.deinit();

    try body.writer.writeAll("{\"trackIds\":[");
    for (0..media_store.max_window_tracks + 1) |index| {
        if (index > 0) try body.writer.writeByte(',');
        try body.writer.print("\"{d}\"", .{index});
    }
    try body.writer.writeAll("]}");

    var scratch: [max_body_bytes]u8 = undefined;
    try testing.expectError(error.Malformed, parse(&scratch, body.written()));
}
