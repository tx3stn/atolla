#!/usr/bin/env bash
set -euo pipefail

HOST="${E2E_APPIUM_HOST:-127.0.0.1}"
PORT="${E2E_APPIUM_PORT:-4723}"
STATUS_URL="http://${HOST}:${PORT}/status"
APP_PATH="${E2E_APP_PATH:-$PWD/bazel-bin/app_shell_app_android.apk}"
PLATFORM_NAME="${E2E_PLATFORM_NAME:-Android}"
AUTOMATION_NAME="${E2E_AUTOMATION_NAME:-UiAutomator2}"
DEVICE_NAME="${E2E_DEVICE_NAME:-Android Emulator}"
NEW_COMMAND_TIMEOUT="${E2E_NEW_COMMAND_TIMEOUT_S:-600}"

DEFAULT_CAPABILITIES="$(
	cat <<EOF
{
  "platformName": "${PLATFORM_NAME}",
  "appium:automationName": "${AUTOMATION_NAME}",
  "appium:deviceName": "${DEVICE_NAME}",
  "appium:app": "${APP_PATH}",
  "appium:newCommandTimeout": ${NEW_COMMAND_TIMEOUT},
	"appium:enforceAppInstall": true
}
EOF
)"

if curl --silent --show-error --fail "$STATUS_URL" >/dev/null 2>&1; then
	echo "Appium already running at $STATUS_URL, stopping existing process..."

	mapfile -t LISTENING_PIDS < <(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true)
	if [[ ${#LISTENING_PIDS[@]} -eq 0 ]]; then
		echo "Could not determine running process on port $PORT"
		exit 1
	fi

	for pid in "${LISTENING_PIDS[@]}"; do
		cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
		if [[ "$cmd" == *appium* ]]; then
			kill "$pid" 2>/dev/null || true
		fi
	done

	for _ in {1..40}; do
		if ! curl --silent --show-error --fail "$STATUS_URL" >/dev/null 2>&1; then
			break
		fi
		sleep 0.25
	done

	if curl --silent --show-error --fail "$STATUS_URL" >/dev/null 2>&1; then
		echo "Failed to stop existing Appium at $STATUS_URL"
		exit 1
	fi
fi

echo "Starting Appium Inspector server at http://${HOST}:${PORT}/inspector"
npx appium --use-plugins=inspector --allow-cors --allow-insecure='*:session_discovery' --address "$HOST" --port "$PORT" --default-capabilities "$DEFAULT_CAPABILITIES" &
APPIUM_PID=$!

cleanup() {
	if kill -0 "$APPIUM_PID" >/dev/null 2>&1; then
		kill "$APPIUM_PID" >/dev/null 2>&1 || true
	fi
}

trap cleanup INT TERM

for _ in {1..80}; do
	if curl --silent --show-error --fail "$STATUS_URL" >/dev/null 2>&1; then
		break
	fi
	sleep 0.25
done

if ! curl --silent --show-error --fail "$STATUS_URL" >/dev/null 2>&1; then
	echo "Appium did not become ready at $STATUS_URL"
	exit 1
fi

SESSION_RESPONSE="$(curl --silent --show-error --fail -X POST "http://${HOST}:${PORT}/session" -H "Content-Type: application/json" -d '{"capabilities":{"alwaysMatch":{},"firstMatch":[{}]}}')"
SESSION_ID="$(node -e 'const raw = process.argv[1] ?? ""; try { const parsed = JSON.parse(raw); process.stdout.write(parsed?.value?.sessionId ?? parsed?.sessionId ?? ""); } catch { process.stdout.write(""); }' "$SESSION_RESPONSE")"

if [[ -n "$SESSION_ID" ]]; then
	echo "Bootstrapped sessionId: $SESSION_ID"
else
	echo "Could not parse sessionId from bootstrap response"
	echo "$SESSION_RESPONSE"
fi

wait "$APPIUM_PID"
