const std = @import("std");
const builtin = @import("builtin");

// std's macOS values are private (lib/std/c/darwin.zig), so these are copied from Apple's macOS SDK headers.
const ip_tos = switch (builtin.os.tag) {
    .macos => 3, // IP_TOS in MacOSX.sdk/usr/include/netinet/in.h
    else => std.posix.IP.TOS,
};

const ipv6_tclass = switch (builtin.os.tag) {
    .macos => 36, // IPV6_TCLASS in MacOSX.sdk/usr/include/netinet6/in6.h
    else => std.posix.IPV6.TCLASS,
};

pub const Class = enum(u6) {
    cs1 = 8,
};

pub fn mark(stream: std.Io.net.Stream, class: Class) std.posix.SetSockOptError!void {
    const traffic_class: c_int = @as(c_int, @intFromEnum(class)) << 2;
    const bytes = std.mem.asBytes(&traffic_class);

    switch (stream.socket.address) {
        .ip4 => try std.posix.setsockopt(stream.socket.handle, std.posix.IPPROTO.IP, ip_tos, bytes),
        .ip6 => try std.posix.setsockopt(stream.socket.handle, std.posix.IPPROTO.IPV6, ipv6_tclass, bytes),
    }
}

const testing = std.testing;

test "dscp: marks a connection's traffic with the class it's given" {
    const io = std.Io.Threaded.global_single_threaded.io();
    const address: std.Io.net.IpAddress = .{ .ip4 = .loopback(0) };

    var listener = try std.Io.net.IpAddress.listen(&address, io, .{ .mode = .stream });
    defer listener.deinit(io);

    const stream = try std.Io.net.IpAddress.connect(&listener.socket.address, io, .{ .mode = .stream });
    defer stream.close(io);

    try mark(stream, .cs1);

    var traffic_class: c_int = 0;
    var length: std.c.socklen_t = @sizeOf(c_int);
    try testing.expectEqual(0, std.c.getsockopt(stream.socket.handle, std.posix.IPPROTO.IP, ip_tos, &traffic_class, &length));
    try testing.expectEqual(0x20, traffic_class);
}
