#!/usr/bin/env bash
# Starts 2 Android emulators + 2 iOS simulators then runs wdio in parallel.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$SCRIPT_DIR/start-e2e-devices.sh"
# shellcheck source=/dev/null
source /tmp/atolla-e2e-devices.env

echo ""
echo "=== Running e2e tests ==="

E2E_ANDROID_APP_PATH="${E2E_ANDROID_APP_PATH:-$PWD/build/atolla_android.apk}" \
	E2E_IOS_APP_PATH="${E2E_IOS_APP_PATH:-$PWD/build/atolla_ios.ipa}" \
	CHECK_FULL="true" \
	E2E_ANDROID_INSTANCES="$E2E_ANDROID_INSTANCES" \
	E2E_IOS_INSTANCES="$E2E_IOS_INSTANCES" \
	E2E_ANDROID_SERIALS="$E2E_ANDROID_SERIALS" \
	E2E_IOS_UDIDS="$E2E_IOS_UDIDS" \
	E2E_ANDROID_DEVICE_NAMES="$E2E_ANDROID_DEVICE_NAMES" \
	E2E_IOS_DEVICE_NAMES="$E2E_IOS_DEVICE_NAMES" \
	wdio run ./e2e/wdio.conf.parallel.ts "$@"
