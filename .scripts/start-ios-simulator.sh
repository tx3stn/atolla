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

unset MACOSX_DEPLOYMENT_TARGET
unset IPHONEOS_DEPLOYMENT_TARGET

MACOS_SDK_VERSION="$(xcrun --sdk macosx --show-sdk-version)"
VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS:-} --ios_multi_cpus=sim_arm64"
VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS} --macos_sdk_version=${MACOS_SDK_VERSION}"
VALDI_BAZEL_ARGS="${VALDI_BAZEL_ARGS} --config=ios"

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

IPA_TARGET="${VALDI_APPLICATION_TARGET%.ipa}.ipa"
echo "Building app..."
read -r -a BAZEL_ARGS_ARRAY <<<"$VALDI_BAZEL_ARGS"
bazel build "$IPA_TARGET" "${BAZEL_ARGS_ARRAY[@]}"

# Use cquery to locate the IPA — rules_apple outputs land in an iOS-specific
# config transition directory that bazel info bazel-bin doesn't reflect.
IPA_SRC="$(bazel cquery --output=files "$IPA_TARGET" "${BAZEL_ARGS_ARRAY[@]}" 2>/dev/null \
	| grep '\.ipa$' | grep -v '/runfiles/' | head -1)"
if [[ ! -f "$IPA_SRC" ]]; then
	echo "Error: could not locate atolla_ios.ipa (cquery returned: '${IPA_SRC}')" >&2
	exit 1
fi

mkdir -p build
cp -f "$IPA_SRC" build/atolla_ios.ipa
echo "IPA copied to build/atolla_ios.ipa"

echo "Installing on simulator..."
xcrun simctl install "$SIMULATOR_ID" "$IPA_SRC"

echo "Done."
