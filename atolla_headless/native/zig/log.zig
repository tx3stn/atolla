//! The server's own log. Written straight to stdout in the daemon's log format, rather than
//! through its JavaScript logger.
//!
//! Routing it through the bridge would block the js thread and not all commands
//! actually want to do that.

const std = @import("std");
const epoch = std.time.epoch;

/// A line longer than this is truncated rather than dropped.
const max_line_bytes = 1024;

pub const Level = enum(u8) {
    debug = 0,
    info = 1,
    warn = 2,
    @"error" = 3,

    pub fn fromInt(value: u8) ?Level {
        return switch (value) {
            0 => .debug,
            1 => .info,
            2 => .warn,
            3 => .@"error",
            else => null,
        };
    }

    pub fn label(self: Level) []const u8 {
        return switch (self) {
            .debug => "DEBUG",
            .info => "INFO",
            .warn => "WARN",
            .@"error" => "ERROR",
        };
    }
};

var minimum: Level = .info;

pub fn setLevel(level: Level) void {
    minimum = level;
}

pub fn enabled(level: Level) bool {
    return @intFromEnum(level) >= @intFromEnum(minimum);
}

pub fn debug(scope: []const u8, comptime format: []const u8, args: anytype) void {
    write(.debug, scope, format, args);
}

pub fn info(scope: []const u8, comptime format: []const u8, args: anytype) void {
    write(.info, scope, format, args);
}

pub fn warn(scope: []const u8, comptime format: []const u8, args: anytype) void {
    write(.warn, scope, format, args);
}

/// `error` is a keyword, so this follows `std.log` in shortening it.
pub fn err(scope: []const u8, comptime format: []const u8, args: anytype) void {
    write(.@"error", scope, format, args);
}

pub fn fields(value: anytype) std.json.Formatter(@TypeOf(value)) {
    return std.json.fmt(value, .{});
}

/// The line is composed in full before it is written, so lines from connection threads cannot
/// interleave.
fn write(level: Level, scope: []const u8, comptime format: []const u8, args: anytype) void {
    if (!enabled(level)) return;

    const io = std.Io.Threaded.global_single_threaded.io();
    const now: std.Io.Timestamp = .now(io, .real);

    var buffer: [max_line_bytes]u8 = undefined;
    const line = compose(&buffer, now.toMilliseconds(), level, scope, format, args);

    std.Io.File.stdout().writeStreamingAll(io, line) catch {};
}

/// Split from `write` so the format is testable without capturing stdout.
fn compose(
    buffer: []u8,
    now_ms: i64,
    level: Level,
    scope: []const u8,
    comptime format: []const u8,
    args: anytype,
) []const u8 {
    var writer = std.Io.Writer.fixed(buffer[0 .. buffer.len - 1]);

    writeTimestamp(&writer, now_ms) catch {};
    writer.print(" [{s}] [{s}] ", .{ level.label(), scope }) catch {};
    writer.print(format, args) catch {};

    const length = writer.buffered().len;
    buffer[length] = '\n';

    return buffer[0 .. length + 1];
}

fn writeTimestamp(writer: *std.Io.Writer, now_ms: i64) !void {
    const seconds: u64 = @intCast(@divFloor(now_ms, 1000));
    const milliseconds: u64 = @intCast(@mod(now_ms, 1000));

    const stamp: epoch.EpochSeconds = .{ .secs = seconds };
    const day = stamp.getEpochDay();
    const time = stamp.getDaySeconds();
    const year_day = day.calculateYearDay();
    const month_day = year_day.calculateMonthDay();

    return writer.print("{d:0>4}-{d:0>2}-{d:0>2}T{d:0>2}:{d:0>2}:{d:0>2}.{d:0>3}Z", .{
        year_day.year,
        month_day.month.numeric(),
        month_day.day_index + 1,
        time.getHoursIntoDay(),
        time.getMinutesIntoHour(),
        time.getSecondsIntoMinute(),
        milliseconds,
    });
}

const testing = std.testing;

var test_buffer: [max_line_bytes]u8 = undefined;

fn composed(now_ms: i64, level: Level, comptime format: []const u8, args: anytype) []const u8 {
    return compose(&test_buffer, now_ms, level, "server", format, args);
}

test "log: writes the same line shape as the JavaScript logger" {
    try testing.expectEqualStrings(
        "2026-09-05T22:28:40.274Z [INFO] [server] GET /hello\n",
        composed(1_788_647_320_274, .info, "{s} {s}", .{ "GET", "/hello" }),
    );
}

test "log: renders structured fields as the JSON suffix" {
    try testing.expectEqualStrings(
        "1970-01-01T00:00:00.000Z [WARN] [server] refused {\"status\":405}\n",
        composed(0, .warn, "refused {f}", .{fields(.{ .status = 405 })}),
    );
}

test "log: labels every level" {
    try testing.expectEqualStrings("DEBUG", Level.debug.label());
    try testing.expectEqualStrings("INFO", Level.info.label());
    try testing.expectEqualStrings("WARN", Level.warn.label());
    try testing.expectEqualStrings("ERROR", Level.@"error".label());
}

test "log: formats the epoch itself" {
    try testing.expectEqualStrings(
        "1970-01-01T00:00:00.000Z [INFO] [server] x\n",
        composed(0, .info, "x", .{}),
    );
}

test "log: keeps the milliseconds padded" {
    try testing.expectEqualStrings(
        "1970-01-01T00:00:00.007Z [INFO] [server] x\n",
        composed(7, .info, "x", .{}),
    );
}

test "log: truncates a line too long to hold, keeping the newline" {
    const line = composed(0, .info, "{s}", .{"y" ** (max_line_bytes * 2)});

    try testing.expectEqual(max_line_bytes, line.len);
    try testing.expectEqual('\n', line[line.len - 1]);
}

test "log: reads the levels the bridge can send" {
    try testing.expectEqual(Level.debug, Level.fromInt(0));
    try testing.expectEqual(Level.@"error", Level.fromInt(3));
    try testing.expectEqual(null, Level.fromInt(4));
    try testing.expectEqual(null, Level.fromInt(255));
}

test "log: a level at or above the minimum is written" {
    setLevel(.warn);
    defer setLevel(.info);

    try testing.expect(!enabled(.debug));
    try testing.expect(!enabled(.info));
    try testing.expect(enabled(.warn));
    try testing.expect(enabled(.@"error"));
}
