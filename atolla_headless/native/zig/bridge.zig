//! The crossing between the server and whatever answers a request it cannot answer itself.
//!
//! The daemon puts JavaScript on the far side, `dev_serve` puts a stub there, and the server
//! cannot tell the difference. A connection thread waits here while the far side works.
//!
//! An id carries a generation above its slot, so an answer that arrives after its request gave up
//! is refused rather than delivered to whichever connection reused that slot.

const std = @import("std");

/// `target` lives only as long as the request. The connection thread blocks for that whole time,
/// so an implementation that answers later must copy it.
pub const Dispatch = *const fn (
    context: ?*anyopaque,
    request_id: u64,
    route: u32,
    target: [*]const u8,
    target_len: usize,
) callconv(.c) void;

pub const Handler = struct {
    context: ?*anyopaque = null,
    dispatch: ?Dispatch = null,
};

/// Process-wide because `atolla_http_respond` arrives from the far side with only an id.
pub var pending: Table = .{};

pub export fn atolla_http_respond(request_id: u64, status: u16, body: [*]const u8, len: usize) bool {
    return pending.complete(
        std.Io.Threaded.global_single_threaded.io(),
        request_id,
        status,
        body[0..len],
    );
}

/// When these run out a request is refused, not queued: it is already holding a connection.
pub const max_slots = 32;

/// Low bits are the slot, the rest is the generation.
const slot_bits = std.math.log2_int_ceil(u64, max_slots);
const slot_mask: u64 = (1 << slot_bits) - 1;

pub const max_body_bytes = 4 * 1024 * 1024;

pub const Response = struct {
    status: u16,
    /// Owned by the slot, and only valid until `release`.
    body: []const u8,
};

const Slot = struct {
    body: []u8,
    /// Zero when free.
    id: u64,
    ready: std.Io.Event,
    status: u16,

    const free: Slot = .{ .body = &.{}, .id = 0, .ready = .unset, .status = 0 };
};

pub const Table = struct {
    generation: u64 = 1,
    mutex: std.Io.Mutex = .init,
    slots: [max_slots]Slot = @splat(.free),

    pub fn claim(self: *Table, io: std.Io) ?u64 {
        self.mutex.lockUncancelable(io);
        defer self.mutex.unlock(io);

        for (&self.slots, 0..) |*slot, index| {
            if (slot.id != 0) continue;

            self.generation += 1;

            slot.* = .{
                .body = &.{},
                .id = (self.generation << slot_bits) | index,
                .ready = .unset,
                .status = 0,
            };

            return slot.id;
        }

        return null;
    }

    /// The caller still owns the slot afterwards and must `release` it.
    pub fn awaitResponse(self: *Table, io: std.Io, id: u64, timeout_ms: u64) ?Response {
        const slot = &self.slots[id & slot_mask];

        const limit: std.Io.Clock.Duration = .{
            .raw = .fromMilliseconds(@intCast(timeout_ms)),
            .clock = .awake,
        };

        slot.ready.waitTimeout(io, .{ .duration = limit }) catch return null;

        self.mutex.lockUncancelable(io);
        defer self.mutex.unlock(io);

        if (slot.id != id) return null;

        return .{ .status = slot.status, .body = slot.body };
    }

    pub fn complete(self: *Table, io: std.Io, id: u64, status: u16, body: []const u8) bool {
        if (id == 0 or body.len > max_body_bytes) return false;

        self.mutex.lockUncancelable(io);
        defer self.mutex.unlock(io);

        const slot = &self.slots[id & slot_mask];
        if (slot.id != id or slot.status != 0) return false;

        const copy = std.heap.c_allocator.alloc(u8, body.len) catch return false;
        @memcpy(copy, body);

        slot.body = copy;
        slot.status = status;
        slot.ready.set(io);

        return true;
    }

    pub fn release(self: *Table, io: std.Io, id: u64) void {
        self.mutex.lockUncancelable(io);
        defer self.mutex.unlock(io);

        const slot = &self.slots[id & slot_mask];
        if (slot.id != id) return;

        if (slot.body.len > 0) std.heap.c_allocator.free(slot.body);

        slot.* = .free;
    }
};

const testing = std.testing;

fn testIo() std.Io {
    return std.Io.Threaded.global_single_threaded.io();
}

test "bridge: an answer reaches the request that is waiting for it" {
    var table: Table = .{};
    const io = testIo();

    const id = table.claim(io).?;
    defer table.release(io, id);

    try testing.expect(table.complete(io, id, 200, "hello"));

    const response = table.awaitResponse(io, id, 1_000).?;

    try testing.expectEqual(200, response.status);
    try testing.expectEqualStrings("hello", response.body);
}

test "bridge: waiting gives up when nothing answers" {
    var table: Table = .{};
    const io = testIo();

    const id = table.claim(io).?;
    defer table.release(io, id);

    try testing.expectEqual(null, table.awaitResponse(io, id, 10));
}

test "bridge: an answer for a released request is refused" {
    var table: Table = .{};
    const io = testIo();

    const id = table.claim(io).?;
    table.release(io, id);

    try testing.expect(!table.complete(io, id, 200, "late"));
}

test "bridge: a late answer cannot reach the connection that reused the slot" {
    var table: Table = .{};
    const io = testIo();

    const first = table.claim(io).?;
    table.release(io, first);

    const second = table.claim(io).?;
    defer table.release(io, second);

    try testing.expect(first != second);
    try testing.expect(!table.complete(io, first, 500, "stale"));
    try testing.expectEqual(null, table.awaitResponse(io, second, 10));
}

test "bridge: only the first answer counts" {
    var table: Table = .{};
    const io = testIo();

    const id = table.claim(io).?;
    defer table.release(io, id);

    try testing.expect(table.complete(io, id, 200, "first"));
    try testing.expect(!table.complete(io, id, 500, "second"));

    try testing.expectEqualStrings("first", table.awaitResponse(io, id, 1_000).?.body);
}

test "bridge: refuses a request once every slot is taken" {
    var table: Table = .{};
    const io = testIo();

    var ids: [max_slots]u64 = undefined;
    for (&ids) |*id| id.* = table.claim(io).?;
    defer for (ids) |id| table.release(io, id);

    try testing.expectEqual(null, table.claim(io));
}

test "bridge: a released slot can be claimed again" {
    var table: Table = .{};
    const io = testIo();

    var ids: [max_slots]u64 = undefined;
    for (&ids) |*id| id.* = table.claim(io).?;

    table.release(io, ids[3]);

    const reclaimed = table.claim(io).?;
    defer for (ids, 0..) |id, index| if (index != 3) table.release(io, id);
    defer table.release(io, reclaimed);

    try testing.expectEqual(3, reclaimed & slot_mask);
}

test "bridge: refuses a body too large to hold" {
    var table: Table = .{};
    const io = testIo();

    const id = table.claim(io).?;
    defer table.release(io, id);

    const oversize = std.heap.c_allocator.alloc(u8, max_body_bytes + 1) catch unreachable;
    defer std.heap.c_allocator.free(oversize);

    try testing.expect(!table.complete(io, id, 200, oversize));
}

test "bridge: an answer from another thread wakes the waiter" {
    var table: Table = .{};
    const io = testIo();

    const id = table.claim(io).?;
    defer table.release(io, id);

    const responder = try std.Thread.spawn(.{}, struct {
        fn run(t: *Table, i: std.Io, request: u64) void {
            while (!t.complete(i, request, 201, "from a thread")) std.Thread.yield() catch {};
        }
    }.run, .{ &table, io, id });
    defer responder.join();

    const response = table.awaitResponse(io, id, 5_000).?;

    try testing.expectEqual(201, response.status);
    try testing.expectEqualStrings("from a thread", response.body);
}
