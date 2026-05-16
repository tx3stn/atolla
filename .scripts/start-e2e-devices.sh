#!/usr/bin/env bash
# Starts Android emulators + iOS simulators for parallel e2e tests.
# Writes device serials/UDIDs to /tmp/atolla-e2e-devices.env so callers
# can source it to get E2E_ANDROID_SERIALS and E2E_IOS_UDIDS.
set -euo pipefail

ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_SDK_ROOT/emulator:$ANDROID_SDK_ROOT/platform-tools:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$PATH"

AVD_NAME="${AVD_NAME:-gsd-api34}"
AVD_API_LEVEL="${AVD_API_LEVEL:-34}"
AVD_ABI="${AVD_ABI:-arm64-v8a}"
AVD_DEVICE="${AVD_DEVICE:-pixel_7}"
IOS_DEVICE_NAME="${IOS_DEVICE_NAME:-iPhone 17}"
ANDROID_INSTANCES="${E2E_ANDROID_INSTANCES:-2}"
IOS_INSTANCES="${E2E_IOS_INSTANCES:-2}"

# ── Android ──────────────────────────────────────────────────────────────────

running_android_serials() {
	adb devices 2>/dev/null |
		awk 'NR>1 && $2=="device" && $1~/^emulator-/ {print $1}' |
		sort
}

ensure_avd() {
	local name=$1
	if emulator -list-avds 2>/dev/null | grep -qx "$name"; then
		return
	fi
	echo "Creating AVD '$name'..." >&2
	echo "no" | avdmanager create avd -n "$name" \
		-k "system-images;android-${AVD_API_LEVEL};google_apis;${AVD_ABI}" \
		-d "$AVD_DEVICE" --tag "google_apis" --abi "$AVD_ABI"
}

start_android_emulators() {
	local target=$1
	local avd=$2

	local running
	running=$(running_android_serials || true)
	local current=0
	[[ -n "$running" ]] && current=$(echo "$running" | wc -l | tr -d ' ')

	if [[ $current -ge $target ]]; then
		echo "Android: $current emulator(s) already running, reusing." >&2
		echo "$running" | head -n "$target" | tr '\n' ',' | sed 's/,$//'
		return
	fi

	local to_start=$((target - current))

	for i in $(seq 1 $to_start); do
		local idx=$((current + i))
		local avd_name
		if [[ $idx -eq 1 ]]; then
			avd_name="$avd"
		else
			avd_name="${avd}-${idx}"
		fi
		ensure_avd "$avd_name"
		local log="/tmp/android-emulator-${idx}.log"
		echo "Starting Android emulator '$avd_name' (instance $idx)..." >&2
		emulator -avd "$avd_name" -no-boot-anim -gpu swiftshader_indirect \
			-no-snapshot -dns-server 8.8.8.8 >"$log" 2>&1 &
		sleep 2
	done

	echo "Waiting for $target Android emulator(s) to appear in adb..." >&2
	local elapsed=0
	while true; do
		local ready=0
		local serials
		serials=$(running_android_serials || true)
		[[ -n "$serials" ]] && ready=$(echo "$serials" | wc -l | tr -d ' ')
		[[ $ready -ge $target ]] && break
		[[ $elapsed -ge 120 ]] && {
			echo "Error: timed out waiting for Android emulators." >&2
			exit 1
		}
		sleep 3
		elapsed=$((elapsed + 3))
	done

	local final_serials
	final_serials=$(running_android_serials | head -n "$target")

	while IFS= read -r serial; do
		[[ -z "$serial" ]] && continue
		echo "Waiting for $serial to finish booting..." >&2
		local boot_elapsed=0
		while true; do
			local prop
			prop=$(adb -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r\n' || true)
			if [[ "$prop" == "1" ]]; then
				# sys.boot_completed=1 isn't enough — wait for the package manager too.
				# "Loading local repository..." in adb output means pm is still initialising;
				# Appium's adb client parses that as a broken device identifier.
				if adb -s "$serial" shell pm list packages >/dev/null 2>&1; then
					echo "$serial is ready." >&2
					break
				fi
			fi
			[[ $boot_elapsed -ge 180 ]] && {
				echo "Error: $serial did not finish booting." >&2
				exit 1
			}
			sleep 3
			boot_elapsed=$((boot_elapsed + 3))
		done
	done <<<"$final_serials"

	echo "$final_serials" | tr '\n' ',' | sed 's/,$//'
}

# ── iOS ──────────────────────────────────────────────────────────────────────

find_ios_udids() {
	local name=$1
	xcrun simctl list devices available --json | python3 -c "
import json, sys
data = json.load(sys.stdin)
name = sys.argv[1]
seen = set()
for runtime, devices in sorted(data.get('devices', {}).items(), reverse=True):
    for d in devices:
        if d.get('name') == name and d['udid'] not in seen:
            seen.add(d['udid'])
            print(d['udid'])
" "$name" 2>/dev/null || true
}

sim_state() {
	local udid=$1
	xcrun simctl list devices --json | python3 -c "
import json, sys
for rt, devs in json.load(sys.stdin)['devices'].items():
    for d in devs:
        if d.get('udid') == sys.argv[1]:
            print(d.get('state', ''))
            sys.exit(0)
print('')
" "$udid" 2>/dev/null || true
}

start_ios_simulators() {
	local target=$1
	local name=$2

	local udids
	udids=$(find_ios_udids "$name")
	local count=0
	[[ -n "$udids" ]] && count=$(echo "$udids" | grep -c . || echo 0)

	if [[ $count -lt $target ]]; then
		local source_udid
		source_udid=$(echo "$udids" | head -1)
		if [[ -z "$source_udid" ]]; then
			echo "Error: no '$name' simulator found to clone from." >&2
			exit 1
		fi
		local needed=$((target - count))
		echo "Cloning '$name' simulator $needed time(s)..." >&2
		for i in $(seq 1 $needed); do
			local new_udid
			new_udid=$(xcrun simctl clone "$source_udid" "$name")
			echo "Created clone: $new_udid" >&2
		done
		udids=$(find_ios_udids "$name")
	fi

	local to_boot
	to_boot=$(echo "$udids" | head -n "$target")

	while IFS= read -r udid; do
		[[ -z "$udid" ]] && continue
		local state
		state=$(sim_state "$udid")
		if [[ "$state" != "Booted" ]]; then
			echo "Booting iOS simulator $udid..." >&2
			xcrun simctl boot "$udid" 2>/dev/null || true
		else
			echo "iOS simulator $udid already booted." >&2
		fi
	done <<<"$to_boot"

	echo "$to_boot" | tr '\n' ',' | sed 's/,$//'
}

# ── Main ─────────────────────────────────────────────────────────────────────

echo "=== Starting e2e devices ==="

# Pre-warm adb server so its "Loading local repository..." startup output is
# already past before Appium connects — otherwise its adb client may parse the
# message as a device identifier and fail with "was not in the list of connected
# devices".
adb start-server >/dev/null 2>&1 || true

ANDROID_SERIALS=$(start_android_emulators "$ANDROID_INSTANCES" "$AVD_NAME")
echo "Android: $ANDROID_SERIALS"

IOS_UDIDS=$(start_ios_simulators "$IOS_INSTANCES" "$IOS_DEVICE_NAME")
echo "iOS: $IOS_UDIDS"

cat >/tmp/atolla-e2e-devices.env <<EOF
export E2E_ANDROID_SERIALS="$ANDROID_SERIALS"
export E2E_IOS_UDIDS="$IOS_UDIDS"
export E2E_ANDROID_INSTANCES="$ANDROID_INSTANCES"
export E2E_IOS_INSTANCES="$IOS_INSTANCES"
export E2E_ANDROID_DEVICE_NAMES="$AVD_NAME"
export E2E_IOS_DEVICE_NAMES="$IOS_DEVICE_NAME"
EOF
