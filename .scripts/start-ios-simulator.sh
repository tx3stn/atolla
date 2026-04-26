set -euo pipefail

SIMULATOR_NAME="${SIMULATOR_NAME:-iPhone 17}"
FAST_DEV_BUILD="${FAST_DEV_BUILD:-0}"

require_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo "Missing required command: $1"
		exit 1
	fi
}

require_cmd xcrun
require_cmd valdi

unset MACOSX_DEPLOYMENT_TARGET
unset IPHONEOS_DEPLOYMENT_TARGET

MACOS_SDK_VERSION="$(xcrun --sdk macosx --show-sdk-version)"
# Omitting --simulator (NOT passing --simulator=true) is intentional: valdi has inverted logic
# where --simulator=true sets forDevice=true and injects --ios_multi_cpus=arm64 (device).
# Without --simulator, forDevice=false and no ios_multi_cpus flag is added, so our
# --ios_multi_cpus=sim_arm64 below is the only one and correctly targets the simulator.
VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS:-} --ios_multi_cpus=sim_arm64"
VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS} --macos_sdk_version=${MACOS_SDK_VERSION} --host_macos_minimum_os=12.0 --macos_minimum_os=12.0"
VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS} --cxxopt=-std=gnu++20 --host_cxxopt=-std=gnu++20"
VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS} --remote_download_outputs=toplevel"
# .bazelrc sets --copt=-DANDROID_WITH_JNI globally (for Android builds). On iOS this causes
# android/log.h not found in JvmUtils.cpp. --copt applies to all configs so --copt=-U overrides it;
# --host_copt alone is insufficient because the define comes via --copt, not --host_copt.
VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS} --copt=-UANDROID_WITH_JNI"
# Clang 26 (SDK 26+) promotes several warnings to errors in third-party deps (abseil, Hermes, Yoga)
VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS} --host_copt=-Wno-deprecated-builtins --copt=-Wno-deprecated-builtins"
VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS} --host_copt=-Wno-nontrivial-memcall --copt=-Wno-nontrivial-memcall"
VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS} --host_copt=-Wno-deprecated-literal-operator --copt=-Wno-deprecated-literal-operator"
VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS} --host_copt=-Wno-deprecated --copt=-Wno-deprecated"

if [[ "$FAST_DEV_BUILD" == "1" ]]; then
	VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS} --spawn_strategy=local --strategy=ValdiCompile=local --compilation_mode=fastbuild --keep_going"
	echo "Using fast local dev Bazel flags."
fi

echo "Using macOS SDK version: $MACOS_SDK_VERSION"

SIMULATOR_ID="$(xcrun simctl list devices available --json |
	python3 -c "
import json, sys
data = json.load(sys.stdin)
name = '$SIMULATOR_NAME'
for runtime, devices in data.get('devices', {}).items():
    for d in devices:
        if d.get('name') == name and d.get('state') == 'Booted':
            print(d['udid'])
            sys.exit(0)
for runtime, devices in data.get('devices', {}).items():
    for d in devices:
        if d.get('name') == name:
            print(d['udid'])
            sys.exit(0)
sys.exit(1)
" 2>/dev/null || true)"

if [[ -z "$SIMULATOR_ID" ]]; then
	echo "No simulator found matching '$SIMULATOR_NAME'."
	echo "Available simulators:"
	xcrun simctl list devices available | grep "iPhone\|iPad" | head -20
	echo ""
	echo "Set SIMULATOR_NAME to one of the above names, e.g.:"
	echo "  SIMULATOR_NAME='iPhone 15' bun run ios"
	exit 1
fi

SIMULATOR_STATE="$(xcrun simctl list devices --json |
	python3 -c "
import json, sys
data = json.load(sys.stdin)
for runtime, devices in data.get('devices', {}).items():
    for d in devices:
        if d.get('udid') == '$SIMULATOR_ID':
            print(d.get('state', ''))
            sys.exit(0)
")"

if [[ "$SIMULATOR_STATE" != "Booted" ]]; then
	echo "Booting simulator '$SIMULATOR_NAME' ($SIMULATOR_ID)..."
	xcrun simctl boot "$SIMULATOR_ID"
	open -a Simulator
fi

echo "Using simulator: $SIMULATOR_NAME ($SIMULATOR_ID)"

VALDI_APPLICATION_TARGET="${VALDI_APPLICATION_TARGET:-//:atolla_ios}"
echo "Using application target: $VALDI_APPLICATION_TARGET"

echo "Installing app with Valdi..."
valdi install ios \
	--application="$VALDI_APPLICATION_TARGET" \
	--device_id="$SIMULATOR_ID" \
	--bazel_args="$VALDI_BAZEL_ARGS"

echo "Done."
