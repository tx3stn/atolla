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

IOS_CPUS=sim_arm64 "$SCRIPT_DIR/build-ios-ipa.sh"

echo "Installing on simulator..."
xcrun simctl install "$SIMULATOR_ID" build/atolla_ios.ipa

echo "Done."
