#!/bin/sh
TARGET=$(zig env | grep 'target' | sed 's/.*"\([^"]*\)".*/\1/' | cut -d'.' -f1)
ATOLLA_HEADLESS=atolla_headless/native/zig/atolla_headless.zig

case "$1" in
"")
	"$0" app && "$0" cli
	;;
app)
	# -lc: the algorithms call malloc/free directly; macOS always links libSystem
	# but linux needs libc linked explicitly
	zig test -target "$TARGET" -lc \
		--dep daemon \
		-Mroot=atolla_app/native/zig/atolla_algorithms.zig \
		-Mdaemon=atolla_headless/native/zig/http_server.zig
	;;
cli)
	zig test "$ATOLLA_HEADLESS" -target "$TARGET" -lc
	;;
cli:audio_player)
	zig test "$ATOLLA_HEADLESS" -target "$TARGET" -lc \
		--test-filter "audio_player.test."
	;;
cli:audio_stream)
	zig test "$ATOLLA_HEADLESS" -target "$TARGET" -lc \
		--test-filter "audio_stream.test." \
		--test-filter "audio_wire.test."
	;;
cli:gst)
	zig test "$ATOLLA_HEADLESS" -target "$TARGET" -lc \
		--test-filter "gst.test." \
		--test-filter "gst_net.test." \
		--test-filter "clock.test." \
		--test-filter "wav.test."
	;;
cli:server)
	zig test "$ATOLLA_HEADLESS" -target "$TARGET" -lc \
		--test-filter "http_server.test." \
		--test-filter "router.test." \
		--test-filter "bridge.test." \
		--test-filter "problem.test." \
		--test-filter "api_version.test." \
		--test-filter "hello.test." \
		--test-filter "rate_limit.test." \
		--test-filter "log.test."
	;;
cli:control)
	zig test "$ATOLLA_HEADLESS" -target "$TARGET" -lc \
		--test-filter "command.test." \
		--test-filter "state.test." \
		--test-filter "pair.test." \
		--test-filter "credentials.test." \
		--test-filter "media_server.test." \
		--test-filter "random_bytes.test."
	;;
cli:media)
	zig test "$ATOLLA_HEADLESS" -target "$TARGET" -lc \
		--test-filter "media_fetcher.test." \
		--test-filter "media_store.test." \
		--test-filter "cache_window.test."
	;;
cli:network)
	zig test "$ATOLLA_HEADLESS" -target "$TARGET" -lc \
		--test-filter "socket_reader.test." \
		--test-filter "dscp.test." \
		--test-filter "local_address.test."
	;;
*)
	echo "unknown zig test group: $1" >&2
	exit 1
	;;
esac
