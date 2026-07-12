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

"$SCRIPT_DIR/build-android-apk.sh"

echo "Installing on device..."
adb -s "$ANDROID_DEVICE_ID" install -r build/atolla_android.apk

echo "Done."
