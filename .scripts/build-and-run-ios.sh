#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SIMULATOR_NAME="${SIMULATOR_NAME:-iPhone 17}"

require_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo "Missing required command: $1"
		exit 1
	fi
}

require_cmd xcrun

SIMULATOR_ID="${SIMULATOR_ID:-$(xcrun simctl list devices available --json |
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
" 2>/dev/null || true)}"

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

# Install the dev variant (com.tx3stn.atolla.dev) so it sits alongside a released
# build; override VALDI_APPLICATION_TARGET=//:atolla_ios to run the release id.
export VALDI_APPLICATION_TARGET="${VALDI_APPLICATION_TARGET:-//atolla_dev:atolla_ios}"

# Stamp a dev version onto this local build without disturbing the committed
# 0.0.0 placeholders. version.ts keeps the -dev suffix so the app shows it, but
# the bazel version fields are reverted to the committed 0.0.0 after stamping,
# because iOS CFBundleVersion must be numeric period-separated integers (no
# -dev). Defaults to the latest release tag plus -dev; override with
# DEV_VERSION=<x.y.z[-suffix]>. Requires vrsn; without it the build uses the
# committed placeholder. The trap restores all version files on exit, even on
# build failure or Ctrl-C.
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
	commit=$(git rev-parse --short HEAD)
	version="${tag}-dev-${commit}"
	trap 'git -C "$repo_root" checkout -- "${version_files[@]}"' EXIT
	(cd "$repo_root" && vrsn set "${DEV_VERSION:-${version}}")
	# Keep CFBundleVersion numeric: revert the bazel version fields, leaving
	# version.ts (the app-visible version) on the -dev version.
	(cd "$repo_root" && git checkout -- BUILD.bazel atolla_dev/BUILD.bazel)
	echo "Stamped dev version ${DEV_VERSION:-${version}} (version files revert on exit)."
else
	echo "vrsn not installed — building the committed placeholder version."
fi

IOS_CPUS=sim_arm64 "$SCRIPT_DIR/build-ios-ipa.sh"

echo "Installing on simulator..."
xcrun simctl install "$SIMULATOR_ID" build/atolla_ios.ipa

echo "Done."
