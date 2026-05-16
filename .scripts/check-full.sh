#!/usr/bin/env bash
# Full check: starts e2e devices, runs all checks, builds apps, runs e2e tests.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Start devices first so they're booted and ready before the build steps.
"$SCRIPT_DIR/start-e2e-devices.sh"
# shellcheck source=/dev/null
source /tmp/atolla-e2e-devices.env

# Target the first device of each platform for the build/install step —
# android:fast and ios:fast only need one device each to validate the build.
FIRST_ANDROID_SERIAL=$(echo "$E2E_ANDROID_SERIALS" | cut -d',' -f1)
FIRST_IOS_UDID=$(echo "$E2E_IOS_UDIDS" | cut -d',' -f1)

echo ""
echo "=== Running checks ==="
bun run check

echo ""
echo "=== Running component tests ==="
bun run test:components

echo ""
echo "=== Building and installing Android app ==="
FAST_DEV_BUILD=1 ANDROID_DEVICE_ID="$FIRST_ANDROID_SERIAL" "$SCRIPT_DIR/start-android-emulator.sh"

echo ""
echo "=== Building and installing iOS app ==="
FAST_DEV_BUILD=1 SIMULATOR_ID="$FIRST_IOS_UDID" "$SCRIPT_DIR/start-ios-simulator.sh"

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
	wdio run ./test/wdio.conf.parallel.ts
