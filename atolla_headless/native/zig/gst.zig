const std = @import("std");
const builtin = @import("builtin");
const log = @import("log.zig");
const wav = @import("wav.zig");

pub const Error = error{ LibraryNotFound, SymbolNotFound };

pub const Object = opaque {};

pub const State = enum(c_uint) {
    void_pending = 0,
    null = 1,
    ready = 2,
    paused = 3,
    playing = 4,
};

pub const StateChange = enum(c_int) {
    failure = 0,
    success = 1,
    async = 2,
    no_preroll = 3,
    _,
};

pub const MessageType = enum(c_uint) {
    eos = 1,
    @"error" = 2,
    _,
};

pub const Format = enum(c_uint) {
    time = 3,
};

pub const seek_flush_to_keyframe: c_uint = 1 | 2;

pub const GError = extern struct {
    domain: u32,
    code: c_int,
    message: ?[*:0]u8,
};

pub const MiniObject = extern struct {
    type: usize,
    refcount: c_int,
    lockstate: c_int,
    flags: c_uint,
    copy: ?*const anyopaque,
    dispose: ?*const anyopaque,
    free: ?*const anyopaque,
    n_qdata: c_uint,
    qdata: ?*anyopaque,
};

pub const Message = extern struct {
    mini_object: MiniObject,
    type: MessageType,
    timestamp: u64,
    src: ?*Object,
    seqnum: u32,
};

pub const second: u64 = 1_000_000_000;

const Gstreamer = struct {
    gst_bus_timed_pop_filtered: *const fn (*Object, u64, c_uint) callconv(.c) ?*Message,
    gst_element_factory_find: *const fn ([*:0]const u8) callconv(.c) ?*Object,
    gst_element_get_bus: *const fn (*Object) callconv(.c) ?*Object,
    gst_element_query_position: *const fn (*Object, Format, *i64) callconv(.c) c_int,
    gst_element_seek_simple: *const fn (*Object, Format, c_uint, i64) callconv(.c) c_int,
    gst_element_set_state: *const fn (*Object, State) callconv(.c) StateChange,
    gst_filename_to_uri: *const fn ([*:0]const u8, ?*?*GError) callconv(.c) ?[*:0]u8,
    gst_init: *const fn (?*c_int, ?*?[*][*:0]u8) callconv(.c) void,
    gst_message_parse_error: *const fn (*Message, *?*GError, *?[*:0]u8) callconv(.c) void,
    gst_mini_object_unref: *const fn (*Message) callconv(.c) void,
    gst_object_unref: *const fn (*Object) callconv(.c) void,
    gst_parse_launch: *const fn ([*:0]const u8, ?*?*GError) callconv(.c) ?*Object,
    gst_util_set_object_arg: *const fn (*Object, [*:0]const u8, [*:0]const u8) callconv(.c) void,
};

const Glib = struct {
    g_error_free: *const fn (*GError) callconv(.c) void,
    g_free: *const fn (?*anyopaque) callconv(.c) void,
};

const gstreamer_candidates = switch (builtin.os.tag) {
    .macos => &[_][]const u8{
        "/Library/Frameworks/GStreamer.framework/Versions/1.0/lib/libgstreamer-1.0.0.dylib",
        "libgstreamer-1.0.0.dylib",
    },
    else => &[_][]const u8{
        "libgstreamer-1.0.so.0",
        "libgstreamer-1.0.so",
    },
};

const glib_candidates = switch (builtin.os.tag) {
    .macos => &[_][]const u8{
        "/Library/Frameworks/GStreamer.framework/Versions/1.0/lib/libglib-2.0.0.dylib",
        "libglib-2.0.0.dylib",
    },
    else => &[_][]const u8{
        "libglib-2.0.so.0",
        "libglib-2.0.so",
    },
};

fn names(comptime paths: []const []const u8) []const u8 {
    comptime var joined: []const u8 = "";

    inline for (paths, 0..) |path, index| {
        joined = joined ++ (if (index == 0) "" else ", ") ++ path;
    }

    return joined;
}

pub const Gst = struct {
    gstreamer_library: std.DynLib,
    glib_library: std.DynLib,

    gstreamer: Gstreamer,
    glib: Glib,

    pub fn close(self: *Gst) void {
        self.gstreamer_library.close();
        self.glib_library.close();
    }

    pub fn initialise(self: *const Gst) void {
        self.gstreamer.gst_init(null, null);
    }

    pub fn hasElement(self: *const Gst, name: [:0]const u8) bool {
        const factory = self.gstreamer.gst_element_factory_find(name.ptr) orelse return false;
        self.gstreamer.gst_object_unref(factory);

        return true;
    }

    /// The caller owns the returned slice, which is written into `buffer`.
    pub fn fileUri(self: *const Gst, buffer: []u8, path: [:0]const u8) PipelineError![:0]const u8 {
        var failure: ?*GError = null;
        const uri = self.gstreamer.gst_filename_to_uri(path.ptr, &failure) orelse {
            if (failure) |given| self.glib.g_error_free(given);

            return error.UnreadablePath;
        };
        defer self.glib.g_free(uri);

        const text = std.mem.span(uri);
        if (text.len + 1 > buffer.len) return error.UriTooLong;

        @memcpy(buffer[0..text.len], text);
        buffer[text.len] = 0;

        return buffer[0..text.len :0];
    }
};

pub const PipelineError = error{ UnreadablePath, UriTooLong, LaunchFailed, NoBus };

pub const Outcome = union(enum) {
    ended,
    failed: []const u8,
    timeout,
};

pub const Pipeline = struct {
    gst: *const Gst,
    element: *Object,
    bus: *Object,

    pub fn launch(gst: *const Gst, description: [:0]const u8) PipelineError!Pipeline {
        var failure: ?*GError = null;
        const element = gst.gstreamer.gst_parse_launch(description.ptr, &failure) orelse {
            if (failure) |given| {
                if (given.message) |text| log.err("audio", "{s}", .{std.mem.span(text)});
                gst.glib.g_error_free(given);
            }

            return error.LaunchFailed;
        };
        errdefer gst.gstreamer.gst_object_unref(element);

        const bus = gst.gstreamer.gst_element_get_bus(element) orelse return error.NoBus;

        return .{ .gst = gst, .element = element, .bus = bus };
    }

    pub fn deinit(self: *Pipeline) void {
        _ = self.setState(.null);
        self.gst.gstreamer.gst_object_unref(self.bus);
        self.gst.gstreamer.gst_object_unref(self.element);
    }

    /// Null when the pipeline has not prerolled far enough to know.
    pub fn position(self: *const Pipeline) ?i64 {
        var nanoseconds: i64 = 0;

        if (self.gst.gstreamer.gst_element_query_position(self.element, .time, &nanoseconds) == 0) {
            return null;
        }

        return nanoseconds;
    }

    pub fn seek(self: *const Pipeline, position_ns: i64) bool {
        const element = self.element;
        const flags = seek_flush_to_keyframe;

        return self.gst.gstreamer.gst_element_seek_simple(element, .time, flags, position_ns) != 0;
    }

    pub fn set(self: *const Pipeline, name: [:0]const u8, value: [:0]const u8) void {
        self.gst.gstreamer.gst_util_set_object_arg(self.element, name.ptr, value.ptr);
    }

    pub fn setState(self: *const Pipeline, state: State) StateChange {
        return self.gst.gstreamer.gst_element_set_state(self.element, state);
    }

    /// `failed` borrows `buffer`, so it stays valid only until the next call. A state change that
    /// fails outright still posts its reason here, so this is the only place an error is read from.
    pub fn wait(self: *const Pipeline, timeout_ns: u64, buffer: []u8) Outcome {
        const mask = @intFromEnum(MessageType.eos) | @intFromEnum(MessageType.@"error");
        const message = self.gst.gstreamer.gst_bus_timed_pop_filtered(self.bus, timeout_ns, mask) orelse {
            return .timeout;
        };
        defer self.gst.gstreamer.gst_mini_object_unref(message);

        if (message.type == .eos) return .ended;

        var failure: ?*GError = null;
        var debug: ?[*:0]u8 = null;

        self.gst.gstreamer.gst_message_parse_error(message, &failure, &debug);
        defer if (debug) |text| self.gst.glib.g_free(text);

        const given = failure orelse return .{ .failed = "" };
        defer self.gst.glib.g_error_free(given);

        const text = if (given.message) |message_text| std.mem.span(message_text) else "";
        const length = @min(text.len, buffer.len);

        @memcpy(buffer[0..length], text[0..length]);

        return .{ .failed = buffer[0..length] };
    }
};

pub fn load() Error!Gst {
    var gstreamer_library = open(gstreamer_candidates) catch |failure| {
        log.err("audio", "gstreamer is not installed: tried {s}", .{names(gstreamer_candidates)});

        return failure;
    };
    errdefer gstreamer_library.close();

    var glib_library = open(glib_candidates) catch |failure| {
        log.err("audio", "glib is not installed: tried {s}", .{names(glib_candidates)});

        return failure;
    };
    errdefer glib_library.close();

    return .{
        .gstreamer_library = gstreamer_library,
        .glib_library = glib_library,
        .gstreamer = try resolve(Gstreamer, &gstreamer_library),
        .glib = try resolve(Glib, &glib_library),
    };
}

fn resolve(comptime Symbols: type, library: *std.DynLib) Error!Symbols {
    var symbols: Symbols = undefined;

    inline for (@typeInfo(Symbols).@"struct".fields) |field| {
        @field(symbols, field.name) = try lookup(library, field.type, field.name);
    }

    return symbols;
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

fn silentPipeline(gst: *const Gst, uri: [:0]const u8) !Pipeline {
    const pipeline = try Pipeline.launch(gst, "playbin audio-sink=\"fakesink sync=true\"");
    pipeline.set("uri", uri);

    return pipeline;
}

test "gst: resolves every symbol it declares" {
    var gst = try loaded();
    defer gst.close();
}

test "gst: resolving a symbol the library does not have names it rather than crashing" {
    var gst = try loaded();
    defer gst.close();

    try testing.expectError(
        error.SymbolNotFound,
        lookup(&gst.gstreamer_library, *const fn () callconv(.c) void, "gst_not_a_real_symbol"),
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

test "gst: plays a file to the end" {
    var gst = try loaded();
    defer gst.close();

    gst.initialise();

    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();

    var audio: [wav.tone_bytes]u8 = undefined;
    try tmp.dir.writeFile(testing.io, .{ .sub_path = "tone.wav", .data = wav.tone(&audio) });

    var path_buffer: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const path = try std.fmt.bufPrintZ(&path_buffer, ".zig-cache/tmp/{s}/tone.wav", .{tmp.sub_path});

    var uri_buffer: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const uri = try gst.fileUri(&uri_buffer, path);

    var pipeline = try silentPipeline(&gst, uri);
    defer pipeline.deinit();

    _ = pipeline.setState(.playing);

    var message: [256]u8 = undefined;

    switch (pipeline.wait(10 * second, &message)) {
        .ended => {},
        .failed => |text| {
            std.debug.print("pipeline failed: {s}\n", .{text});

            return error.TestUnexpectedResult;
        },
        .timeout => return error.TestUnexpectedResult,
    }
}

test "gst: reports a source it cannot read rather than hanging" {
    var gst = try loaded();
    defer gst.close();

    gst.initialise();

    var pipeline = try silentPipeline(&gst, "file:///atolla/not/a/real/file.wav");
    defer pipeline.deinit();

    try testing.expectEqual(StateChange.failure, pipeline.setState(.playing));

    var message: [256]u8 = undefined;
    const outcome = pipeline.wait(5 * second, &message);

    try testing.expect(outcome == .failed);
    try testing.expect(outcome.failed.len > 0);
}

test "gst: turns a path into a uri it can play" {
    var gst = try loaded();
    defer gst.close();

    var buffer: [std.Io.Dir.max_path_bytes]u8 = undefined;

    try testing.expectEqualStrings("file:///tmp/a%20b.wav", try gst.fileUri(&buffer, "/tmp/a b.wav"));
    try testing.expectError(error.UriTooLong, gst.fileUri(buffer[0..4], "/tmp/a.wav"));
}
