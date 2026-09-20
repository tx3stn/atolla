const std = @import("std");
const builtin = @import("builtin");
const net = std.Io.net;
const log = @import("log.zig");
const socket_reader = @import("socket_reader.zig");
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

pub const List = extern struct {
    data: ?*Object,
    next: ?*List,
    prev: ?*List,
};

/// `GType` plus two 8-byte union slots, which is what every `GValue` is on a 64-bit target.
pub const Value = extern struct {
    g_type: usize = 0,
    data: [2]u64 = .{ 0, 0 },
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
    gst_device_create_element: *const fn (*Object, ?[*:0]const u8) callconv(.c) ?*Object,
    gst_device_get_display_name: *const fn (*Object) callconv(.c) ?[*:0]u8,
    gst_device_monitor_add_filter: *const fn (*Object, [*:0]const u8, ?*Object) callconv(.c) c_uint,
    gst_device_monitor_get_devices: *const fn (*Object) callconv(.c) ?*List,
    gst_device_monitor_new: *const fn () callconv(.c) ?*Object,
    gst_device_monitor_start: *const fn (*Object) callconv(.c) c_int,
    gst_device_monitor_stop: *const fn (*Object) callconv(.c) void,
    gst_element_factory_find: *const fn ([*:0]const u8) callconv(.c) ?*Object,
    gst_element_get_type: *const fn () callconv(.c) usize,
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
    g_list_free: *const fn (?*List) callconv(.c) void,
};

const GObject = struct {
    g_object_set_property: *const fn (*Object, [*:0]const u8, *const Value) callconv(.c) void,
    /// `g_signal_connect` is a macro over this one, and this one takes no varargs.
    g_signal_connect_data: *const fn (
        *Object,
        [*:0]const u8,
        *const anyopaque,
        ?*anyopaque,
        ?*const anyopaque,
        c_uint,
    ) callconv(.c) c_ulong,
    g_value_init: *const fn (*Value, usize) callconv(.c) *Value,
    g_value_set_object: *const fn (*Value, ?*Object) callconv(.c) void,
    g_value_unset: *const fn (*Value) callconv(.c) void,
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

const gobject_candidates = switch (builtin.os.tag) {
    .macos => &[_][]const u8{
        "/Library/Frameworks/GStreamer.framework/Versions/1.0/lib/libgobject-2.0.0.dylib",
        "libgobject-2.0.0.dylib",
    },
    else => &[_][]const u8{
        "libgobject-2.0.so.0",
        "libgobject-2.0.so",
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
    gobject_library: std.DynLib,

    gstreamer: Gstreamer,
    glib: Glib,
    gobject: GObject,

    pub fn close(self: *Gst) void {
        self.gstreamer_library.close();
        self.glib_library.close();
        self.gobject_library.close();
    }

    pub fn initialise(self: *const Gst) void {
        self.gstreamer.gst_init(null, null);
    }

    pub fn hasElement(self: *const Gst, name: [:0]const u8) bool {
        const factory = self.gstreamer.gst_element_factory_find(name.ptr) orelse return false;
        self.gstreamer.gst_object_unref(factory);

        return true;
    }

    pub fn sinkNamed(self: *const Gst, wanted: []const u8) ?*Object {
        const monitor = self.gstreamer.gst_device_monitor_new() orelse return null;
        defer self.gstreamer.gst_object_unref(monitor);

        _ = self.gstreamer.gst_device_monitor_add_filter(monitor, "Audio/Sink", null);

        if (self.gstreamer.gst_device_monitor_start(monitor) == 0) return null;
        defer self.gstreamer.gst_device_monitor_stop(monitor);

        const devices = self.gstreamer.gst_device_monitor_get_devices(monitor);
        defer self.glib.g_list_free(devices);

        var found: ?*Object = null;
        var node = devices;

        while (node) |current| : (node = current.next) {
            const device = current.data orelse continue;
            defer self.gstreamer.gst_object_unref(device);

            const name = self.gstreamer.gst_device_get_display_name(device) orelse continue;
            defer self.glib.g_free(name);

            if (found == null and std.mem.eql(u8, std.mem.span(name), wanted)) {
                found = self.gstreamer.gst_device_create_element(device, null);
            }
        }

        return found;
    }

    /// Every audio output this machine offers, one name per line, truncated to what fits.
    pub fn audioSinks(self: *const Gst, buffer: []u8) []const u8 {
        const monitor = self.gstreamer.gst_device_monitor_new() orelse return "";
        defer self.gstreamer.gst_object_unref(monitor);

        _ = self.gstreamer.gst_device_monitor_add_filter(monitor, "Audio/Sink", null);

        if (self.gstreamer.gst_device_monitor_start(monitor) == 0) return "";
        defer self.gstreamer.gst_device_monitor_stop(monitor);

        const devices = self.gstreamer.gst_device_monitor_get_devices(monitor);
        defer self.glib.g_list_free(devices);

        var writer = std.Io.Writer.fixed(buffer);
        var node = devices;

        while (node) |current| : (node = current.next) {
            const device = current.data orelse continue;
            defer self.gstreamer.gst_object_unref(device);

            const name = self.gstreamer.gst_device_get_display_name(device) orelse continue;
            defer self.glib.g_free(name);

            writer.print("{s}\n", .{std.mem.span(name)}) catch break;
        }

        // A print that ran out of room may have written part of a name, so keep whole lines only.
        const written = writer.buffered();
        const last = std.mem.lastIndexOfScalar(u8, written, '\n') orelse return "";

        return written[0 .. last + 1];
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

/// A 512-byte token and a 64-byte device id, plus the client, device name and version around them.
pub const max_auth_header_bytes = 1024;

/// Escaping can double the header, and the structure wraps it.
const max_extra_headers_bytes = max_auth_header_bytes * 2 + 64;

/// The header the auto-plugged HTTP source should send. `configure` writes it, and the
/// `source-setup` handler reads whatever is set when playbin builds a source.
pub const SourceSetup = struct {
    gst: *const Gst,
    header: [max_auth_header_bytes]u8 = undefined,
    header_len: usize = 0,

    /// Too long is dropped, not truncated. Half a credential authenticates nothing.
    pub fn setHeader(self: *SourceSetup, header: []const u8) void {
        if (header.len > self.header.len) {
            log.err("audio", "authorization header is {d} bytes, too long to send", .{header.len});
            self.header_len = 0;

            return;
        }

        @memcpy(self.header[0..header.len], header);
        self.header_len = header.len;
    }
};

/// `extra-headers` is a `GstStructure`, and its syntax is quotes and commas, which is what an
/// `Authorization` header is made of. Wrapped and escaped as `gst_string_wrap` does it.
fn extraHeaders(buffer: []u8, header: []const u8) ?[:0]const u8 {
    var writer = std.Io.Writer.fixed(buffer);

    writer.writeAll("headers, Authorization=(string)\"") catch return null;

    for (header) |byte| {
        switch (byte) {
            '"', '\\' => writer.writeByte('\\') catch return null,
            // Escaping a control byte would still leave it able to split the request itself.
            0...31, 127 => return null,
            else => {},
        }

        writer.writeByte(byte) catch return null;
    }

    writer.writeAll("\"") catch return null;
    writer.writeByte(0) catch return null;

    const written = writer.buffered();

    return written[0 .. written.len - 1 :0];
}

fn onSourceSetup(_: *Object, source: *Object, user_data: ?*anyopaque) callconv(.c) void {
    const context: *SourceSetup = @ptrCast(@alignCast(user_data orelse return));

    if (context.header_len == 0) return;

    var buffer: [max_extra_headers_bytes]u8 = undefined;
    const text = extraHeaders(&buffer, context.header[0..context.header_len]) orelse {
        log.err("audio", "the authorization header cannot be sent to the source", .{});

        return;
    };

    context.gst.gstreamer.gst_util_set_object_arg(source, "extra-headers", text.ptr);
}

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

    /// `context` must outlive the pipeline: the signal fires every time playbin builds a source.
    pub fn connectSourceSetup(self: *const Pipeline, context: *SourceSetup) void {
        _ = self.gst.gobject.g_signal_connect_data(
            self.element,
            "source-setup",
            @ptrCast(&onSourceSetup),
            context,
            null,
            0,
        );
    }

    pub fn set(self: *const Pipeline, name: [:0]const u8, value: [:0]const u8) void {
        self.gst.gstreamer.gst_util_set_object_arg(self.element, name.ptr, value.ptr);
    }

    pub fn setElement(self: *const Pipeline, name: [:0]const u8, element: *Object) void {
        var value: Value = .{};

        _ = self.gst.gobject.g_value_init(&value, self.gst.gstreamer.gst_element_get_type());
        defer self.gst.gobject.g_value_unset(&value);

        self.gst.gobject.g_value_set_object(&value, element);
        self.gst.gobject.g_object_set_property(self.element, name.ptr, &value);
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

    var gobject_library = open(gobject_candidates) catch |failure| {
        log.err("audio", "gobject is not installed: tried {s}", .{names(gobject_candidates)});

        return failure;
    };
    errdefer gobject_library.close();

    return .{
        .gstreamer_library = gstreamer_library,
        .glib_library = glib_library,
        .gobject_library = gobject_library,
        .gobject = try resolve(GObject, &gobject_library),
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

fn testIo() std.Io {
    return std.Io.Threaded.global_single_threaded.io();
}

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

test "gst: lists the audio outputs the machine offers" {
    var gst = try loaded();
    defer gst.close();

    gst.initialise();

    var buffer: [4096]u8 = undefined;
    const sinks = gst.audioSinks(&buffer);

    // A runner or a container has none, so the list may be empty; what it may never be is garbage.
    if (sinks.len != 0) {
        try testing.expectEqual('\n', sinks[sinks.len - 1]);
        try testing.expect(std.mem.indexOfScalar(u8, sinks, 0) == null);
    }
}

test "gst: wraps an authorization header so the structure syntax cannot swallow it" {
    var buffer: [max_extra_headers_bytes]u8 = undefined;

    // Quotes around every parameter and commas between them, which is also GstStructure syntax.
    const rendered =
        \\MediaBrowser Client="atolla", Device="Kitchen", DeviceId="atolla-1-2", Token="abc"
    ;

    try testing.expectEqualStrings(
        \\headers, Authorization=(string)"MediaBrowser Client=\"atolla\", Device=\"Kitchen\", DeviceId=\"atolla-1-2\", Token=\"abc\""
    ,
        extraHeaders(&buffer, rendered).?,
    );

    try testing.expectEqualStrings(
        \\headers, Authorization=(string)"a\\b"
    ,
        extraHeaders(&buffer, "a\\b").?,
    );

    try testing.expectEqual(null, extraHeaders(&buffer, "one\r\ntwo"));
    try testing.expectEqual(null, extraHeaders(buffer[0..8], rendered));
}

test "gst: the plugin registry has the http source a remote track needs" {
    var gst = try loaded();
    defer gst.close();

    gst.initialise();

    try testing.expect(gst.hasElement("souphttpsrc"));
}

/// Serves one generated WAV over HTTP and remembers the `Authorization` it was asked with, so a
/// test can see what reached the wire.
const AuthCapture = struct {
    audio: []const u8,
    io: std.Io,
    listener: net.Server,
    running: std.atomic.Value(bool) = .init(true),
    seen: [max_auth_header_bytes]u8 = undefined,
    seen_len: usize = 0,

    fn start(audio: []const u8) !AuthCapture {
        const address: net.IpAddress = .{ .ip4 = .loopback(0) };

        return .{
            .audio = audio,
            .io = testIo(),
            .listener = try net.IpAddress.listen(&address, testIo(), .{
                .mode = .stream,
                .reuse_address = true,
            }),
        };
    }

    fn authorization(self: *const AuthCapture) []const u8 {
        return self.seen[0..self.seen_len];
    }

    fn port(self: *const AuthCapture) u16 {
        return self.listener.socket.address.getPort();
    }

    /// Wakes `accept` by connecting to ourselves, as `http_server.zig` does. `shutdown` on a
    /// listening socket is a no-op on Darwin.
    fn stop(self: *AuthCapture) void {
        self.running.store(false, .release);

        const stream = net.IpAddress.connect(
            &self.listener.socket.address,
            self.io,
            .{ .mode = .stream },
        ) catch {
            self.listener.deinit(self.io);

            return;
        };

        stream.close(self.io);
    }

    fn deinit(self: *AuthCapture) void {
        self.listener.deinit(self.io);
    }

    fn run(self: *AuthCapture) void {
        while (self.running.load(.acquire)) {
            const stream = self.listener.accept(self.io) catch return;
            defer stream.close(self.io);

            if (!self.running.load(.acquire)) return;

            self.answer(stream);
        }
    }

    fn answer(self: *AuthCapture, stream: net.Stream) void {
        var head_buffer: [8 * 1024]u8 = undefined;
        var out_buffer: [4 * 1024]u8 = undefined;
        var reader: socket_reader.Reader = .init(stream.socket.handle, &head_buffer, 2_000);
        var writer = stream.writer(self.io, &out_buffer);
        var http: std.http.Server = .init(&reader.interface, &writer.interface);

        var request = http.receiveHead() catch return;
        var headers = request.iterateHeaders();

        while (headers.next()) |header| {
            if (!std.ascii.eqlIgnoreCase(header.name, "authorization")) continue;

            const length = @min(header.value.len, self.seen.len);
            @memcpy(self.seen[0..length], header.value[0..length]);
            self.seen_len = length;
        }

        request.respond(self.audio, .{ .extra_headers = &.{
            .{ .name = "content-type", .value = "audio/x-wav" },
        } }) catch return;
    }
};

test "gst: sends the authorization header it was given to an http source" {
    var gst = try loaded();
    defer gst.close();

    gst.initialise();

    if (!gst.hasElement("souphttpsrc")) return error.SkipZigTest;

    var audio: [wav.tone_bytes]u8 = undefined;

    var upstream = try AuthCapture.start(wav.tone(&audio));
    defer upstream.deinit();

    const thread = try std.Thread.spawn(.{}, AuthCapture.run, .{&upstream});

    var uri_buffer: [256]u8 = undefined;
    const uri = try std.fmt.bufPrintZ(
        &uri_buffer,
        "http://127.0.0.1:{d}/tone.wav",
        .{upstream.port()},
    );

    const rendered =
        \\MediaBrowser Client="atolla", Device="Kitchen", Token="abc"
    ;

    var setup: SourceSetup = .{ .gst = &gst };
    setup.setHeader(rendered);

    var pipeline = try Pipeline.launch(&gst, "playbin audio-sink=\"fakesink sync=true\"");
    defer pipeline.deinit();

    pipeline.connectSourceSetup(&setup);
    pipeline.set("uri", uri);

    _ = pipeline.setState(.playing);

    var message: [256]u8 = undefined;
    const outcome = pipeline.wait(20 * second, &message);

    upstream.stop();
    thread.join();

    switch (outcome) {
        .ended => {},
        .failed => |text| {
            std.debug.print("pipeline failed: {s}\n", .{text});

            return error.TestUnexpectedResult;
        },
        .timeout => return error.TestUnexpectedResult,
    }

    try testing.expectEqualStrings(rendered, upstream.authorization());
}

test "gst: turns a path into a uri it can play" {
    var gst = try loaded();
    defer gst.close();

    var buffer: [std.Io.Dir.max_path_bytes]u8 = undefined;

    try testing.expectEqualStrings("file:///tmp/a%20b.wav", try gst.fileUri(&buffer, "/tmp/a b.wav"));
    try testing.expectError(error.UriTooLong, gst.fileUri(buffer[0..4], "/tmp/a.wav"));
}
