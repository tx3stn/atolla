const std = @import("std");

// init_single_threaded rather than Threaded.init: init installs process-wide SIGIO and SIGPIPE
// handlers, which a random-number call has no business doing inside a process that already has its
// own. The static instance takes a failing allocator and spawns nothing, and randomSecure needs
// neither.
export fn atolla_random_bytes(out: [*]u8, len: usize) bool {
    var threaded: std.Io.Threaded = .init_single_threaded;
    threaded.io().randomSecure(out[0..len]) catch return false;

    return true;
}

const testing = std.testing;

test "random_bytes: fills the whole buffer" {
    var buffer = [_]u8{0} ** 32;
    try testing.expect(atolla_random_bytes(&buffer, buffer.len));
    try testing.expect(!std.mem.allEqual(u8, &buffer, 0));
}

test "random_bytes: a zero length request succeeds and touches nothing" {
    var buffer = [_]u8{7} ** 4;
    try testing.expect(atolla_random_bytes(&buffer, 0));
    try testing.expectEqual([_]u8{7} ** 4, buffer);
}

test "random_bytes: two draws differ" {
    var first = [_]u8{0} ** 32;
    var second = [_]u8{0} ** 32;

    try testing.expect(atolla_random_bytes(&first, first.len));
    try testing.expect(atolla_random_bytes(&second, second.len));

    try testing.expect(!std.mem.eql(u8, &first, &second));
}

test "random_bytes: fills a buffer larger than one entropy call" {
    var buffer = [_]u8{0} ** 4096;
    try testing.expect(atolla_random_bytes(&buffer, buffer.len));
    try testing.expect(!std.mem.allEqual(u8, buffer[2048..], 0));
}
