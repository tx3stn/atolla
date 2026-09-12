const std = @import("std");
const builtin = @import("builtin");
const log = @import("log.zig");

pub const Error = error{ LibraryNotFound, SymbolNotFound };

pub const Object = opaque {};

pub const Version = struct {
    major: u32,
    minor: u32,
    micro: u32,
    nano: u32,
};

const candidates = switch (builtin.os.tag) {
    .macos => &[_][]const u8{
        "/Library/Frameworks/GStreamer.framework/Versions/1.0/lib/libgstreamer-1.0.0.dylib",
        "libgstreamer-1.0.0.dylib",
    },
    else => &[_][]const u8{
        "libgstreamer-1.0.so.0",
        "libgstreamer-1.0.so",
    },
};

const candidate_names = blk: {
    var names: []const u8 = "";

    for (candidates, 0..) |path, index| {
        names = names ++ (if (index == 0) "" else ", ") ++ path;
    }

    break :blk names;
};

pub const Gst = struct {
    library: std.DynLib,

    gst_init: *const fn (?*c_int, ?*?[*][*:0]u8) callconv(.c) void,
    gst_version: *const fn (*c_uint, *c_uint, *c_uint, *c_uint) callconv(.c) void,
    gst_element_factory_find: *const fn ([*:0]const u8) callconv(.c) ?*Object,
    gst_object_unref: *const fn (*Object) callconv(.c) void,

    pub fn close(self: *Gst) void {
        self.library.close();
    }

    pub fn initialise(self: *const Gst) void {
        self.gst_init(null, null);
    }

    pub fn version(self: *const Gst) Version {
        var major: c_uint = 0;
        var minor: c_uint = 0;
        var micro: c_uint = 0;
        var nano: c_uint = 0;

        self.gst_version(&major, &minor, &micro, &nano);

        return .{ .major = major, .minor = minor, .micro = micro, .nano = nano };
    }

    pub fn hasElement(self: *const Gst, name: [:0]const u8) bool {
        const factory = self.gst_element_factory_find(name.ptr) orelse return false;
        self.gst_object_unref(factory);

        return true;
    }
};

pub fn load() Error!Gst {
    var library = open(candidates) catch |failure| {
        log.err("audio", "gstreamer is not installed: tried {s}", .{candidate_names});

        return failure;
    };
    errdefer library.close();

    return .{
        .library = library,
        .gst_init = try lookup(&library, @FieldType(Gst, "gst_init"), "gst_init"),
        .gst_version = try lookup(&library, @FieldType(Gst, "gst_version"), "gst_version"),
        .gst_element_factory_find = try lookup(
            &library,
            @FieldType(Gst, "gst_element_factory_find"),
            "gst_element_factory_find",
        ),
        .gst_object_unref = try lookup(&library, @FieldType(Gst, "gst_object_unref"), "gst_object_unref"),
    };
}

fn open(paths: []const []const u8) Error!std.DynLib {
    for (paths) |path| {
        return std.DynLib.open(path) catch continue;
    }

    return error.LibraryNotFound;
}

fn lookup(library: *std.DynLib, comptime T: type, comptime name: [:0]const u8) Error!T {
    return library.lookup(T, name) orelse {
        log.err("audio", "gstreamer is missing the symbol {s}", .{name});

        return error.SymbolNotFound;
    };
}

const testing = std.testing;

fn loaded() !Gst {
    return load() catch |failure| switch (failure) {
        error.LibraryNotFound => error.SkipZigTest,
        else => failure,
    };
}

test "gst: loads the runtime and reports its version" {
    var gst = try loaded();
    defer gst.close();

    try testing.expectEqual(1, gst.version().major);
}

test "gst: resolving a symbol the library does not have names it rather than crashing" {
    var gst = try loaded();
    defer gst.close();

    try testing.expectError(
        error.SymbolNotFound,
        lookup(&gst.library, *const fn () callconv(.c) void, "gst_not_a_real_symbol"),
    );
}

test "gst: a library that is not there fails without panicking" {
    try testing.expectError(error.LibraryNotFound, open(&.{"libgstreamer-not-installed.so.0"}));
    try testing.expectError(error.LibraryNotFound, open(&.{}));
}

test "gst: the plugin registry resolves the elements the daemon builds pipelines from" {
    var gst = try loaded();
    defer gst.close();

    gst.initialise();

    try testing.expect(gst.hasElement("fakesink"));
    try testing.expect(gst.hasElement("playbin"));
    try testing.expect(gst.hasElement("autoaudiosink"));
    try testing.expect(!gst.hasElement("atolla_not_an_element"));
}
