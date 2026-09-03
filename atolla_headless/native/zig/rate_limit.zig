const std = @import("std");

pub const Key = u128;

pub const Outcome = enum { failure, success };

pub const Decision = union(enum) {
    allow,
    deny_seconds: u32,
};

const backoff_base_ms: i64 = 1000;
const backoff_cap_ms: i64 = 60_000;
const backoff_max_steps: u32 = std.math.log2_int_ceil(u64, @intCast(@divTrunc(backoff_cap_ms, backoff_base_ms)));
const global_free_failures: u32 = 10;
const global_quiet_ms: i64 = backoff_cap_ms;
const key_free_failures: u32 = 3;
const max_entries: usize = 256;

const Entry = struct {
    failures: u32,
    key: Key,
    last_failure_ms: i64,

    fn blockedUntil(self: Entry) i64 {
        return self.last_failure_ms + delayMs(self.failures, key_free_failures);
    }
};

pub const Limiter = struct {
    entries: [max_entries]Entry,
    global_failures: u32,
    global_last_failure_ms: i64,
    used: usize,

    pub const empty: Limiter = .{
        .entries = undefined,
        .global_failures = 0,
        .global_last_failure_ms = 0,
        .used = 0,
    };

    pub fn check(self: *const Limiter, now_ms: i64, key: Key) Decision {
        var until = self.global_last_failure_ms + delayMs(self.global_failures, global_free_failures);

        if (self.indexOf(key)) |index| {
            until = @max(until, self.entries[index].blockedUntil());
        }

        if (now_ms >= until) return .allow;

        return .{ .deny_seconds = retryAfterSeconds(until - now_ms) };
    }

    pub fn record(self: *Limiter, now_ms: i64, key: Key, outcome: Outcome) void {
        if (outcome == .success) {
            self.global_failures = 0;
            self.global_last_failure_ms = 0;
            self.forget(key);
            return;
        }

        if (now_ms - self.global_last_failure_ms >= global_quiet_ms) self.global_failures = 0;

        self.global_failures +|= 1;
        self.global_last_failure_ms = now_ms;

        if (self.indexOf(key)) |index| {
            self.entries[index].failures +|= 1;
            self.entries[index].last_failure_ms = now_ms;
            return;
        }

        if (self.slotFor(now_ms)) |entry| {
            entry.* = .{ .failures = 1, .key = key, .last_failure_ms = now_ms };
        }
    }

    fn forget(self: *Limiter, key: Key) void {
        const index = self.indexOf(key) orelse return;

        self.used -= 1;
        self.entries[index] = self.entries[self.used];
    }

    fn indexOf(self: *const Limiter, key: Key) ?usize {
        for (self.entries[0..self.used], 0..) |entry, index| {
            if (entry.key == key) return index;
        }

        return null;
    }

    fn slotFor(self: *Limiter, now_ms: i64) ?*Entry {
        if (self.used < max_entries) {
            self.used += 1;
            return &self.entries[self.used - 1];
        }

        var oldest: ?usize = null;
        for (self.entries[0..self.used], 0..) |entry, index| {
            if (now_ms < entry.blockedUntil()) continue;
            if (oldest == null or entry.last_failure_ms < self.entries[oldest.?].last_failure_ms) {
                oldest = index;
            }
        }

        return if (oldest) |index| &self.entries[index] else null;
    }
};

fn delayMs(failures: u32, free: u32) i64 {
    if (failures < free) return 0;

    const steps = failures - free;
    if (steps >= backoff_max_steps) return backoff_cap_ms;

    return backoff_base_ms << @intCast(steps);
}

fn retryAfterSeconds(remaining_ms: i64) u32 {
    return @intCast(@divTrunc(remaining_ms + backoff_base_ms - 1, backoff_base_ms));
}

const testing = std.testing;

const key_a: Key = 0x0a00_0001;
const key_b: Key = 0x0a00_0002;

fn failTimes(limiter: *Limiter, now_ms: i64, key: Key, times: u32) void {
    for (0..times) |_| limiter.record(now_ms, key, .failure);
}

test "rate_limit: allows an attempt from a key that has never failed" {
    var limiter: Limiter = .empty;

    try testing.expectEqual(Decision.allow, limiter.check(0, key_a));
}

test "rate_limit: answers the first three failures without a delay" {
    var limiter: Limiter = .empty;

    for (0..3) |_| {
        try testing.expectEqual(Decision.allow, limiter.check(0, key_a));
        limiter.record(0, key_a, .failure);
    }

    try testing.expectEqual(Decision{ .deny_seconds = 1 }, limiter.check(0, key_a));
}

test "rate_limit: doubles the delay with each further failure" {
    var limiter: Limiter = .empty;
    const expected = [_]u32{ 1, 2, 4, 8, 16, 32 };

    failTimes(&limiter, 0, key_a, key_free_failures);

    for (expected) |seconds| {
        try testing.expectEqual(Decision{ .deny_seconds = seconds }, limiter.check(0, key_a));
        limiter.record(0, key_a, .failure);
    }
}

test "rate_limit: caps the delay at sixty seconds" {
    var limiter: Limiter = .empty;

    failTimes(&limiter, 0, key_a, 40);
    limiter.record(backoff_cap_ms, key_a, .failure);

    try testing.expectEqual(Decision{ .deny_seconds = 60 }, limiter.check(backoff_cap_ms, key_a));
}

test "rate_limit: allows an attempt once the delay has elapsed" {
    var limiter: Limiter = .empty;

    failTimes(&limiter, 0, key_a, key_free_failures);

    try testing.expectEqual(Decision{ .deny_seconds = 1 }, limiter.check(999, key_a));
    try testing.expectEqual(Decision.allow, limiter.check(1000, key_a));
}

test "rate_limit: never locks a key out permanently" {
    var limiter: Limiter = .empty;

    failTimes(&limiter, 0, key_a, 1000);
    limiter.record(backoff_cap_ms, key_a, .failure);

    try testing.expectEqual(Decision{ .deny_seconds = 60 }, limiter.check(backoff_cap_ms, key_a));
    try testing.expectEqual(Decision.allow, limiter.check(backoff_cap_ms * 2, key_a));
}

test "rate_limit: rounds a partial second of remaining delay up" {
    var limiter: Limiter = .empty;

    failTimes(&limiter, 0, key_a, key_free_failures + 1);

    try testing.expectEqual(Decision{ .deny_seconds = 2 }, limiter.check(1, key_a));
    try testing.expectEqual(Decision{ .deny_seconds = 1 }, limiter.check(1001, key_a));
}

test "rate_limit: a key's failures are not forgotten by waiting" {
    var limiter: Limiter = .empty;

    failTimes(&limiter, 0, key_a, key_free_failures + backoff_max_steps);

    try testing.expectEqual(Decision.allow, limiter.check(backoff_cap_ms, key_a));
    limiter.record(backoff_cap_ms, key_a, .failure);

    try testing.expectEqual(Decision{ .deny_seconds = 60 }, limiter.check(backoff_cap_ms, key_a));
}

test "rate_limit: a success clears the failures behind it" {
    var limiter: Limiter = .empty;

    failTimes(&limiter, 0, key_a, key_free_failures);
    limiter.record(0, key_a, .success);

    try testing.expectEqual(Decision.allow, limiter.check(0, key_a));
}

test "rate_limit: a success frees the table slot it held" {
    var limiter: Limiter = .empty;

    limiter.record(0, key_a, .failure);
    limiter.record(0, key_a, .success);

    try testing.expectEqual(@as(usize, 0), limiter.used);
}

test "rate_limit: a success leaves the other keys in the table" {
    var limiter: Limiter = .empty;

    failTimes(&limiter, 0, key_a, key_free_failures);
    failTimes(&limiter, 0, key_b, key_free_failures);

    limiter.record(0, key_a, .success);

    try testing.expectEqual(@as(usize, 1), limiter.used);
    try testing.expectEqual(Decision.allow, limiter.check(0, key_a));
    try testing.expectEqual(Decision{ .deny_seconds = 1 }, limiter.check(0, key_b));
}

test "rate_limit: a success clears the global counter too" {
    var limiter: Limiter = .empty;

    for (0..global_free_failures) |index| {
        limiter.record(0, @intCast(index), .failure);
    }
    limiter.record(0, key_a, .success);

    try testing.expectEqual(Decision.allow, limiter.check(0, key_b));
}

test "rate_limit: one key's failures do not block another" {
    var limiter: Limiter = .empty;

    failTimes(&limiter, 0, key_a, key_free_failures);

    try testing.expectEqual(Decision.allow, limiter.check(0, key_b));
}

test "rate_limit: the global counter engages once enough keys have failed" {
    var limiter: Limiter = .empty;

    for (0..global_free_failures) |index| {
        limiter.record(0, @intCast(index), .failure);
    }

    try testing.expectEqual(Decision{ .deny_seconds = 1 }, limiter.check(0, key_b));
}

test "rate_limit: the global delay follows the same curve" {
    var limiter: Limiter = .empty;

    for (0..global_free_failures + 3) |index| {
        limiter.record(0, @intCast(index), .failure);
    }

    try testing.expectEqual(Decision{ .deny_seconds = 8 }, limiter.check(0, key_b));
}

test "rate_limit: a slow attacker cannot hold the global gate shut" {
    var limiter: Limiter = .empty;

    failTimes(&limiter, 0, key_a, global_free_failures + 10);

    var now: i64 = backoff_cap_ms;
    for (0..5) |_| {
        limiter.record(now, key_a, .failure);

        try testing.expectEqual(Decision.allow, limiter.check(now, key_b));
        now += backoff_cap_ms;
    }
}

test "rate_limit: the global counter forgets a burst that has gone quiet" {
    var limiter: Limiter = .empty;

    for (0..global_free_failures + backoff_max_steps) |index| {
        limiter.record(0, @intCast(index), .failure);
    }

    try testing.expectEqual(Decision{ .deny_seconds = 60 }, limiter.check(0, key_b));
    try testing.expectEqual(Decision.allow, limiter.check(backoff_cap_ms, key_b));

    limiter.record(backoff_cap_ms, key_a, .failure);

    try testing.expectEqual(Decision.allow, limiter.check(backoff_cap_ms, key_b));
}

test "rate_limit: holds the full table before evicting anything" {
    var limiter: Limiter = .empty;

    for (0..max_entries) |index| {
        limiter.record(0, @intCast(index), .failure);
    }

    try testing.expectEqual(max_entries, limiter.used);
    try testing.expectEqual(@as(u32, 1), limiter.entries[0].failures);
}

test "rate_limit: evicts an entry that has stopped blocking to admit a new key" {
    var limiter: Limiter = .empty;

    for (0..max_entries) |index| {
        failTimes(&limiter, 0, @intCast(index), key_free_failures);
    }
    limiter.record(backoff_cap_ms, key_b, .failure);

    try testing.expectEqual(max_entries, limiter.used);
    try testing.expect(limiter.indexOf(key_b) != null);
}

test "rate_limit: an evicted key starts its curve again" {
    var limiter: Limiter = .empty;
    const victim: Key = 0;
    const survivor: Key = max_entries - 1;

    for (0..max_entries) |index| {
        failTimes(&limiter, 0, @intCast(index), key_free_failures);
    }
    limiter.record(backoff_cap_ms, key_b, .failure);

    limiter.record(backoff_cap_ms, victim, .failure);
    limiter.record(backoff_cap_ms, survivor, .failure);

    try testing.expectEqual(Decision.allow, limiter.check(backoff_cap_ms, victim));
    try testing.expectEqual(Decision{ .deny_seconds = 2 }, limiter.check(backoff_cap_ms, survivor));
}

test "rate_limit: refuses to evict an entry that is still blocking" {
    var limiter: Limiter = .empty;

    for (0..max_entries) |index| {
        failTimes(&limiter, 0, @intCast(index), key_free_failures);
    }
    limiter.record(0, key_b, .failure);

    try testing.expect(limiter.indexOf(key_b) == null);
}

test "rate_limit: a key the full table could not admit is still blocked globally" {
    var limiter: Limiter = .empty;

    for (0..max_entries) |index| {
        failTimes(&limiter, 0, @intCast(index), key_free_failures);
    }
    limiter.record(0, key_b, .failure);

    try testing.expectEqual(Decision{ .deny_seconds = 60 }, limiter.check(0, key_b));
}

test "rate_limit: evicting the oldest entry keeps the newer ones counting" {
    var limiter: Limiter = .empty;

    for (0..max_entries) |index| {
        failTimes(&limiter, @intCast(index), @intCast(index), key_free_failures);
    }
    limiter.record(backoff_cap_ms * 2, key_b, .failure);

    try testing.expect(limiter.indexOf(0) == null);
    try testing.expect(limiter.indexOf(max_entries - 1) != null);
}
