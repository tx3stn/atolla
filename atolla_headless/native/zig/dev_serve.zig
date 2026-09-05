const std = @import("std");
const hello = @import("hello.zig");
const http_server = @import("http_server.zig");

const default_port = 45889;

// stands in for the body the daemon builds from its real identity
const dev_hello =
    \\{"id":"0000000000000000","name":"dev_serve","protocolVersions":[1],"tier":"tight","v":1,"version":"dev"}
;

pub fn main(init: std.process.Init.Minimal) !void {
    var args: std.process.Args.Iterator = .init(init.args);
    _ = args.skip();

    const port = if (args.next()) |given|
        std.fmt.parseInt(u16, given, 10) catch {
            std.debug.print("not a port number: {s}\n", .{given});
            return error.InvalidPort;
        }
    else
        default_port;

    const io = std.Io.Threaded.global_single_threaded.io();
    const address: std.Io.net.IpAddress = .{ .ip4 = .unspecified(port) };

    try hello.set(dev_hello);

    var server = try http_server.Server.listen(io, &address, .{});
    defer server.deinit();

    std.debug.print("listening on http://127.0.0.1:{d}\n", .{server.port()});

    server.run();
}
