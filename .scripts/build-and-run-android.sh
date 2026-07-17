#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

AVD_NAME="${AVD_NAME:-gsd-api34}"
EMULATOR_LOG="${EMULATOR_LOG:-/tmp/${AVD_NAME}-emulator.log}"

require_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo "Missing required command: $1"
		exit 1
	fi
}

require_cmd emulator
require_cmd adb
require_cmd xcrun

if adb devices | awk '/\tdevice$/ {print $1; exit}' | grep -q .; then
	echo "Physical device or emulator already connected, skipping emulator launch."
elif adb devices | grep -q "emulator-"; then
	echo "Android emulator already running."
else
	echo "Starting Android emulator '$AVD_NAME' in background..."
	emulator -avd "$AVD_NAME" -no-boot-anim -gpu swiftshader_indirect -no-snapshot -dns-server 8.8.8.8 >"$EMULATOR_LOG" 2>&1 &
	echo "Emulator log: $EMULATOR_LOG"
fi

ANDROID_DEVICE_ID="${ANDROID_DEVICE_ID:-$(adb devices | awk '/\tdevice$/ {print $1; exit}')}"

echo "Waiting for device..."
adb -s "$ANDROID_DEVICE_ID" wait-for-device
adb devices
if [[ -z "$ANDROID_DEVICE_ID" ]]; then
	echo "No Android device detected after adb wait-for-device."
	exit 1
fi

echo "Using Android device: $ANDROID_DEVICE_ID"

# Install the dev variant (com.tx3stn.atolla.dev) so it sits alongside a released
# build; override VALDI_APPLICATION_TARGET=//:atolla_android to run the release id.
export VALDI_APPLICATION_TARGET="${VALDI_APPLICATION_TARGET:-//atolla_dev:atolla_android}"

# Stamp a dev version onto this local build without disturbing the committed
# 0.0.0 placeholders. Defaults to the latest release tag plus a -dev suffix
# (e.g. 0.4.5-dev); override with DEV_VERSION=<x.y.z[-suffix]>. Requires vrsn; if
# it isn't installed the build just uses the committed placeholder. The trap
# restores the version files on exit, even on build failure or Ctrl-C.
if command -v vrsn >/dev/null 2>&1; then
	require_cmd git
	repo_root="$SCRIPT_DIR/.."
	tag="$(cd "$repo_root" && git describe --tags --abbrev=0 2>/dev/null || echo 0.0.0)"
	version_files=(
		atolla/src/version.ts
		BUILD.bazel
		atolla/native/android/AndroidManifest.prod.xml
		atolla_dev/BUILD.bazel
	)
	trap 'git -C "$repo_root" checkout -- "${version_files[@]}"' EXIT
	(cd "$repo_root" && vrsn set "${DEV_VERSION:-${tag}-dev}")
	echo "Stamped dev version ${DEV_VERSION:-${tag}-dev} (version files revert on exit)."
else
	echo "vrsn not installed — building the committed placeholder version."
fi

"$SCRIPT_DIR/build-android-apk.sh"

echo "Installing on device..."
adb -s "$ANDROID_DEVICE_ID" install -r build/atolla_android.apk

echo "Done."
