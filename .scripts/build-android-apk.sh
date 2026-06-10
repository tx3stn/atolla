#!/usr/bin/env bash
set -euo pipefail

ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}"
FAST_DEV_BUILD="${FAST_DEV_BUILD:-0}"
export ANDROID_SDK_ROOT
export ANDROID_HOME="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"

is_java17_home() {
	local candidate="$1"
	if [[ ! -x "$candidate/bin/java" ]]; then
		return 1
	fi
	local version_line
	version_line="$("$candidate/bin/java" -version 2>&1 | awk 'NR==1 {print $0}')"
	[[ "$version_line" == *'"17.'* || "$version_line" == *'"17"'* ]]
}

resolve_java17_home() {
	# Honor a pre-set JAVA_HOME (e.g. CI exports JAVA_HOME_17_arm64) before probing.
	if [[ -n "${JAVA_HOME:-}" ]] && is_java17_home "$JAVA_HOME"; then
		printf "%s\n" "$JAVA_HOME"
		return
	fi

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
	echo "Run: ./.scripts/install-android-emulator-cli.sh"
	exit 1
fi

echo "Using ANDROID_HOME=$ANDROID_HOME"

unset MACOSX_DEPLOYMENT_TARGET
unset IPHONEOS_DEPLOYMENT_TARGET

VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS:-}"
# Host tools build with Apple clang on macOS, which needs the SDK version pinned;
# on Linux the hermetic LLVM toolchain is used and xcrun does not exist.
if [[ "$(uname -s)" == "Darwin" ]]; then
	MACOS_SDK_VERSION="$(xcrun --sdk macosx --show-sdk-version)"
	VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS} --macos_sdk_version=${MACOS_SDK_VERSION}"
	echo "Using macOS SDK version: $MACOS_SDK_VERSION"
fi
VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS} --config=android"

if [[ "$FAST_DEV_BUILD" == "1" ]]; then
	VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS} --spawn_strategy=local --strategy=ValdiCompile=local --compilation_mode=fastbuild --keep_going"
	echo "Using fast local dev Bazel flags."
fi

VALDI_APPLICATION_TARGET="${VALDI_APPLICATION_TARGET:-//:atolla_android}"
echo "Using application target: $VALDI_APPLICATION_TARGET"

echo "Building app..."
read -r -a BAZEL_ARGS_ARRAY <<<"$VALDI_BAZEL_ARGS"
bazel build "$VALDI_APPLICATION_TARGET" "${BAZEL_ARGS_ARRAY[@]}"

BAZEL_BIN="$(bazel info bazel-bin "${BAZEL_ARGS_ARRAY[@]}" 2>/dev/null)"
APK_SRC="${BAZEL_BIN}/atolla_android.apk"
if [[ ! -f "$APK_SRC" ]]; then
	echo "Error: could not locate atolla_android.apk at ${APK_SRC}" >&2
	exit 1
fi

mkdir -p build
cp -f "$APK_SRC" build/atolla_android.apk
echo "APK copied to build/atolla_android.apk"
