#!/bin/sh
TARGET=$(zig env | grep 'target' | sed 's/.*"\([^"]*\)".*/\1/' | cut -d'.' -f1)
# -lc: the algorithms call malloc/free directly; macOS always links libSystem
# but linux needs libc linked explicitly
zig test -target "$TARGET" -lc \
	--dep daemon \
	-Mroot=atolla_app/native/zig/atolla_algorithms.zig \
	-Mdaemon=atolla_headless/native/zig/http_server.zig || exit 1
zig test atolla_headless/native/zig/atolla_headless.zig -target "$TARGET" -lc || exit 1
