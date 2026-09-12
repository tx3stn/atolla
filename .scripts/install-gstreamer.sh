#!/usr/bin/env bash

set -euo pipefail

VERSION="1.28.7"
SHA256="529fdf4a4027d942e59b5b3564f6400adaa008f63ce5f3fed4ffe35d73911994"

DYLIB="/Library/Frameworks/GStreamer.framework/Versions/1.0/lib/libgstreamer-1.0.0.dylib"

# Debian splits the sinks across packages: alsasink is gstreamer1.0-alsa, autoaudiosink lives in
# -good, and fakesink ships inside the core library itself.
PACKAGES=(
	gstreamer1.0-alsa
	gstreamer1.0-plugins-bad
	gstreamer1.0-plugins-base
	gstreamer1.0-plugins-good
	libgstreamer1.0-0
)

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

install_macos() {
	if [ -f "$DYLIB" ] && [ -z "${ATOLLA_GSTREAMER_FORCE:-}" ]; then
		echo "gstreamer already installed at $DYLIB (ATOLLA_GSTREAMER_FORCE=1 to reinstall)"
		return
	fi

	local pkg="gstreamer-1.0-${VERSION}-universal.pkg"

	echo "downloading $pkg"
	curl -fsSL --retry 3 --retry-delay 2 -o "$work/$pkg" \
		"https://gstreamer.freedesktop.org/data/pkg/osx/${VERSION}/${pkg}"

	if ! echo "$SHA256  $work/$pkg" | shasum -a 256 --check --status; then
		echo "checksum mismatch for $pkg" >&2
		exit 1
	fi

	sudo installer -pkg "$work/$pkg" -target /

	if [ ! -f "$DYLIB" ]; then
		echo "installer reported success but $DYLIB is missing" >&2
		exit 1
	fi
}

install_linux() {
	local sudo=""
	[ "$(id -u)" -eq 0 ] || sudo="sudo"

	DEBIAN_FRONTEND=noninteractive $sudo apt-get update
	DEBIAN_FRONTEND=noninteractive $sudo apt-get install -y --no-install-recommends "${PACKAGES[@]}"

	if ! ldconfig -p | grep -q "libgstreamer-1.0.so.0"; then
		echo "apt reported success but libgstreamer-1.0.so.0 is not on the library path" >&2
		exit 1
	fi
}

case "$(uname -s)" in
Darwin) install_macos ;;
Linux) install_linux ;;
*)
	echo "unsupported platform $(uname -s)" >&2
	exit 1
	;;
esac

echo "gstreamer runtime ready"
