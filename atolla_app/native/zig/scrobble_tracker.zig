// scrobble "played?" decision, shared by both native audio engines so iOS and Android decide
// identically. a track counts as played when it reaches its natural end (auto-advance /
// end-of-queue), or when it is left after passing a fraction of its duration. pure and stateless:
// the engine calls it at the discrete points a track ends or is left, so there is no polling.

const std = @import("std");

// returns true when the track should be scrobbled. a natural end always counts (the track was
// played to completion); otherwise it counts only when the leave position reached
// threshold_ratio of the duration.
export fn atolla_scrobble_should_count(
    position_ms: i64,
    duration_ms: i64,
    threshold_ratio: f32,
    is_natural_end: bool,
) bool {
    if (is_natural_end) return true;
    if (duration_ms <= 0 or position_ms < 0) return false;
    const threshold: i64 = @intFromFloat(
        @as(f64, @floatFromInt(duration_ms)) * @as(f64, threshold_ratio),
    );
    return position_ms >= threshold;
}

const testing = std.testing;
const test_ratio: f32 = 0.8;

test "should_count: a natural end always counts, even at position zero" {
    try testing.expect(atolla_scrobble_should_count(0, 200_000, test_ratio, true));
}

test "should_count: counts when the leave position reaches the threshold" {
    try testing.expect(atolla_scrobble_should_count(160_000, 200_000, test_ratio, false));
}

test "should_count: exactly at the threshold counts" {
    try testing.expect(atolla_scrobble_should_count(160_000, 200_000, test_ratio, false));
}

test "should_count: below the threshold does not count" {
    try testing.expect(!atolla_scrobble_should_count(159_999, 200_000, test_ratio, false));
}

test "should_count: an early leave does not count" {
    try testing.expect(!atolla_scrobble_should_count(20_000, 200_000, test_ratio, false));
}

test "should_count: unknown duration does not count unless natural end" {
    try testing.expect(!atolla_scrobble_should_count(100_000, 0, test_ratio, false));
    try testing.expect(atolla_scrobble_should_count(0, 0, test_ratio, true));
}

test "should_count: a negative position does not count" {
    try testing.expect(!atolla_scrobble_should_count(-1, 200_000, test_ratio, false));
}
