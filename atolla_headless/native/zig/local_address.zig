const std = @import("std");
const net = std.Io.net;

const unroutable_probe_target: net.IpAddress = .{
    .ip4 = .{ .bytes = .{ 203, 0, 113, 1 }, .port = 9 },
};

export fn atolla_local_address(out: [*]u8, len: usize) usize {
    var threaded: std.Io.Threaded = .init_single_threaded;
    const io = threaded.io();

    const stream = net.IpAddress.connect(&unroutable_probe_target, io, .{ .mode = .dgram }) catch
        return 0;
    defer stream.close(io);

    const ip4 = switch (stream.socket.address) {
        .ip4 => |address| address,
        else => return 0,
    };

    const written = std.fmt.bufPrint(out[0..len], "{d}.{d}.{d}.{d}", .{
        ip4.bytes[0],
        ip4.bytes[1],
        ip4.bytes[2],
        ip4.bytes[3],
    }) catch return 0;

    return written.len;
}

const testing = std.testing;

fn lookup(buffer: []u8) []const u8 {
    return buffer[0..atolla_local_address(buffer.ptr, buffer.len)];
}

test "local_address: answers a parseable ipv4 address or nothing at all" {
    var buffer = [_]u8{0} ** 16;
    const address = lookup(&buffer);

    if (address.len == 0) return;

    _ = try net.Ip4Address.parse(address, 0);
}

test "local_address: never reports the unspecified address" {
    var buffer = [_]u8{0} ** 16;
    const address = lookup(&buffer);

    if (address.len == 0) return;

    try testing.expect(!std.mem.eql(u8, address, "0.0.0.0"));
}

test "local_address: a buffer too small for an address answers nothing" {
    var buffer = [_]u8{0} ** 3;

    try testing.expectEqual(@as(usize, 0), atolla_local_address(&buffer, buffer.len));
}

test "local_address: two lookups agree" {
    var first_buffer = [_]u8{0} ** 16;
    var second_buffer = [_]u8{0} ** 16;

    try testing.expectEqualStrings(lookup(&first_buffer), lookup(&second_buffer));
}
