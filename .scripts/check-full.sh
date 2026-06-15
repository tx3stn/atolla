#!/usr/bin/env bash
# Full check: starts e2e devices, runs all checks, builds apps, runs e2e tests.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Start devices in the background so they boot while other checks run.
"$SCRIPT_DIR/start-e2e-devices.sh" &
DEVICES_PID=$!

echo ""
echo "=== Running checks ==="
bun run check

echo ""
echo "=== Running component tests ==="
bun run test:components

# Wait for devices to be ready now that we actually need them.
echo ""
echo "=== Waiting for e2e devices ==="
wait $DEVICES_PID
# shellcheck source=/dev/null
source /tmp/atolla-e2e-devices.env

# Build once against the first device of each platform, then install that same artifact
# on every other device. The tests run across all devices, and Appium skips reinstalling
# when the dev version number is unchanged, so without this the extra devices would run a
# stale build left over from a previous run.
FIRST_ANDROID_SERIAL=$(echo "$E2E_ANDROID_SERIALS" | cut -d',' -f1)
FIRST_IOS_UDID=$(echo "$E2E_IOS_UDIDS" | cut -d',' -f1)

echo ""
echo "=== Building and installing Android app ==="
ANDROID_DEVICE_ID="$FIRST_ANDROID_SERIAL" "$SCRIPT_DIR/start-android-emulator.sh"
for serial in $(echo "$E2E_ANDROID_SERIALS" | tr ',' ' '); do
	if [[ "$serial" != "$FIRST_ANDROID_SERIAL" ]]; then
		echo "Installing freshly built apk on $serial..."
		adb -s "$serial" install -r "$PWD/build/atolla_android.apk"
	fi
done

echo ""
echo "=== Building and installing iOS app ==="
SIMULATOR_ID="$FIRST_IOS_UDID" "$SCRIPT_DIR/start-ios-simulator.sh"
for udid in $(echo "$E2E_IOS_UDIDS" | tr ',' ' '); do
	if [[ "$udid" != "$FIRST_IOS_UDID" ]]; then
		echo "Installing freshly built ipa on $udid..."
		xcrun simctl install "$udid" "$PWD/build/atolla_ios.ipa"
	fi
done

echo ""
echo "=== Running e2e tests ==="
exec env \
	E2E_ANDROID_APP_PATH="$PWD/build/atolla_android.apk" \
	E2E_IOS_APP_PATH="$PWD/build/atolla_ios.ipa" \
	E2E_ANDROID_INSTANCES="$E2E_ANDROID_INSTANCES" \
	E2E_IOS_INSTANCES="$E2E_IOS_INSTANCES" \
	E2E_ANDROID_SERIALS="$E2E_ANDROID_SERIALS" \
	E2E_IOS_UDIDS="$E2E_IOS_UDIDS" \
	E2E_ANDROID_DEVICE_NAMES="$E2E_ANDROID_DEVICE_NAMES" \
	E2E_IOS_DEVICE_NAMES="$E2E_IOS_DEVICE_NAMES" \
	wdio run ./e2e/wdio.conf.parallel.ts
