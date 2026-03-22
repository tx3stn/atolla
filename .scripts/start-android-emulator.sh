#!/usr/bin/env bash
set -euo pipefail

AVD_NAME="${AVD_NAME:-gsd-api34}"
EMULATOR_LOG="${EMULATOR_LOG:-/tmp/${AVD_NAME}-emulator.log}"
ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}"
FAST_DEV_BUILD="${FAST_DEV_BUILD:-0}"
export ANDROID_SDK_ROOT
export ANDROID_HOME="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"

resolve_java17_home() {
	is_java17_home() {
		local candidate="$1"
		if [[ ! -x "$candidate/bin/java" ]]; then
			return 1
		fi
		local version_line
		version_line="$($candidate/bin/java -version 2>&1 | awk 'NR==1 {print $0}')"
		[[ "$version_line" == *'"17.'* || "$version_line" == *'"17"'* ]]
	}

	if command -v brew >/dev/null 2>&1; then
		brew_java17="$(brew --prefix openjdk@17 2>/dev/null || true)/libexec/openjdk.jdk/Contents/Home"
		if is_java17_home "$brew_java17"; then
			printf "%s\n" "$brew_java17"
			return
		fi
	fi

	if java17_home="$(/usr/libexec/java_home -v 17 2>/dev/null)"; then
		if is_java17_home "$java17_home"; then
			printf "%s\n" "$java17_home"
			return
		fi
	fi

	printf "\n"
}

JAVA_HOME="$(resolve_java17_home)"
if [[ -z "$JAVA_HOME" ]]; then
	echo "Java 17 is required for Valdi CompilerCompanion, but it was not found."
	echo "Run: ./.scripts/install-android-emulator-cli.sh"
	exit 1
fi

export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"
echo "Using JAVA_HOME=$JAVA_HOME"

if [[ -z "${ANDROID_NDK_HOME:-}" && -d "$ANDROID_SDK_ROOT/ndk" ]]; then
	latest_ndk="$(ls "$ANDROID_SDK_ROOT/ndk" 2>/dev/null | sort -V | tail -n 1 || true)"
	if [[ -n "$latest_ndk" ]]; then
		export ANDROID_NDK_HOME="$ANDROID_SDK_ROOT/ndk/$latest_ndk"
	fi
fi

if [[ -n "${ANDROID_NDK_HOME:-}" ]]; then
	echo "Using ANDROID_NDK_HOME=$ANDROID_NDK_HOME"
else
	echo "ANDROID_NDK_HOME is not set and no NDK found under $ANDROID_SDK_ROOT/ndk"
	echo "Run: npm run android:emulator:install"
	exit 1
fi

echo "Using ANDROID_HOME=$ANDROID_HOME"

require_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo "Missing required command: $1"
		exit 1
	fi
}

require_cmd emulator
require_cmd adb
require_cmd valdi
require_cmd xcrun

unset MACOSX_DEPLOYMENT_TARGET
unset IPHONEOS_DEPLOYMENT_TARGET

MACOS_SDK_VERSION="$(xcrun --sdk macosx --show-sdk-version)"
VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS:-} --macos_sdk_version=${MACOS_SDK_VERSION} --host_macos_minimum_os=12.0 --macos_minimum_os=12.0"
VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS} --java_runtime_version=remotejdk_21 --tool_java_runtime_version=remotejdk_21"
VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS} --cxxopt=-std=gnu++20 --host_cxxopt=-std=gnu++20"
VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS} --remote_download_outputs=toplevel"

if [[ "$FAST_DEV_BUILD" == "1" ]]; then
	VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS} --spawn_strategy=local --strategy=ValdiCompile=local --compilation_mode=fastbuild --keep_going"
	echo "Using fast local dev Bazel flags."
fi

echo "Using macOS SDK version: $MACOS_SDK_VERSION"

if adb devices | grep -q "emulator-"; then
	echo "Android emulator already running."
else
	echo "Starting Android emulator '$AVD_NAME' in background..."
	emulator -avd "$AVD_NAME" -no-audio -no-boot-anim -gpu swiftshader_indirect -no-snapshot >"$EMULATOR_LOG" 2>&1 &
	echo "Emulator log: $EMULATOR_LOG"
fi

echo "Waiting for emulator device..."
adb wait-for-device
adb devices

ANDROID_DEVICE_ID="${ANDROID_DEVICE_ID:-$(adb devices | awk '/\tdevice$/ {print $1; exit}')}"
if [[ -z "$ANDROID_DEVICE_ID" ]]; then
	echo "No Android device detected after adb wait-for-device."
	exit 1
fi

VALDI_APPLICATION_TARGET="${VALDI_APPLICATION_TARGET:-//:atolla_android}"
echo "Using Android device: $ANDROID_DEVICE_ID"
echo "Using application target: $VALDI_APPLICATION_TARGET"

echo "Installing app with Valdi..."
valdi install android \
	--application="$VALDI_APPLICATION_TARGET" \
	--device_id="$ANDROID_DEVICE_ID" \
	--bazel_args="$VALDI_BAZEL_ARGS"

echo "Done."
