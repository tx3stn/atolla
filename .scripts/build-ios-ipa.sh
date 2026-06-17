#!/usr/bin/env bash
set -euo pipefail

# sim_arm64 for simulator builds (local dev), arm64 for device builds (release)
IOS_CPUS="${IOS_CPUS:-sim_arm64}"

require_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo "Missing required command: $1"
		exit 1
	fi
}

require_cmd xcrun

unset MACOSX_DEPLOYMENT_TARGET
unset IPHONEOS_DEPLOYMENT_TARGET

MACOS_SDK_VERSION="$(xcrun --sdk macosx --show-sdk-version)"
VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS:-} --ios_multi_cpus=${IOS_CPUS}"
VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS} --macos_sdk_version=${MACOS_SDK_VERSION}"
VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS} --config=ios"

echo "Using macOS SDK version: $MACOS_SDK_VERSION"
echo "Using iOS CPUs: $IOS_CPUS"

VALDI_APPLICATION_TARGET="${VALDI_APPLICATION_TARGET:-//:atolla_ios}"
echo "Using application target: $VALDI_APPLICATION_TARGET"

IPA_TARGET="${VALDI_APPLICATION_TARGET%.ipa}.ipa"
echo "Building app..."
read -r -a BAZEL_ARGS_ARRAY <<<"$VALDI_BAZEL_ARGS"
bazel build "$IPA_TARGET" "${BAZEL_ARGS_ARRAY[@]}"

# Use cquery to locate the IPA — rules_apple outputs land in an iOS-specific
# config transition directory that bazel info bazel-bin doesn't reflect.
IPA_SRC="$(bazel cquery --output=files "$IPA_TARGET" "${BAZEL_ARGS_ARRAY[@]}" 2>/dev/null |
	grep '\.ipa$' | grep -v '/runfiles/' | head -1)"
if [[ ! -f "$IPA_SRC" ]]; then
	echo "Error: could not locate atolla_ios.ipa (cquery returned: '${IPA_SRC}')" >&2
	exit 1
fi

mkdir -p build
cp -f "$IPA_SRC" build/atolla_ios.ipa
echo "IPA copied to build/atolla_ios.ipa"
