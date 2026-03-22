#!/usr/bin/env bash
set -euo pipefail

require_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo "Missing required command: $1"
		exit 1
	fi
}

require_cmd valdi
require_cmd xcrun
require_cmd lsof
require_cmd bazel

MACOS_SDK_VERSION="$(xcrun --sdk macosx --show-sdk-version)"
MACOS_SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"

HOTRELOAD_BAZEL_ARGS="${HOTRELOAD_BAZEL_ARGS:-}"
HOTRELOAD_BAZEL_ARGS="${HOTRELOAD_BAZEL_ARGS} --snap_flavor=platform_development"
HOTRELOAD_BAZEL_ARGS="${HOTRELOAD_BAZEL_ARGS} --repo_env=VALDI_PLATFORM_DEPENDENCIES=android"
HOTRELOAD_BAZEL_ARGS="${HOTRELOAD_BAZEL_ARGS} --macos_sdk_version=${MACOS_SDK_VERSION}"
HOTRELOAD_BAZEL_ARGS="${HOTRELOAD_BAZEL_ARGS} --host_macos_minimum_os=12.0 --macos_minimum_os=12.0"
HOTRELOAD_BAZEL_ARGS="${HOTRELOAD_BAZEL_ARGS} --java_runtime_version=remotejdk_21 --tool_java_runtime_version=remotejdk_21"
HOTRELOAD_BAZEL_ARGS="${HOTRELOAD_BAZEL_ARGS} --cxxopt=-std=gnu++20 --host_cxxopt=-std=gnu++20"
HOTRELOAD_BAZEL_ARGS="${HOTRELOAD_BAZEL_ARGS} --spawn_strategy=local --strategy=ValdiCompile=local --compilation_mode=fastbuild"
HOTRELOAD_BAZEL_ARGS="${HOTRELOAD_BAZEL_ARGS} --remote_download_outputs=all"

mkdir -p "$HOME/.valdi/logs"

# Valdi's debugging proxy binds to 9010; stale processes can crash companion startup.
if pids="$(lsof -ti tcp:9010 2>/dev/null)" && [[ -n "$pids" ]]; then
	echo "Freeing occupied debug-proxy port 9010..."
	for pid in $pids; do
		kill "$pid" 2>/dev/null || true
	done
fi

echo "Running Valdi hotreload (macOS SDK ${MACOS_SDK_VERSION})..."
for companion_cache in bazel-out/*/bin/.valdi_build/hotreload/caches/companion; do
	if [[ -d "$companion_cache" ]]; then
		rm -rf "$companion_cache"
	fi
done

env -u MACOSX_DEPLOYMENT_TARGET -u IPHONEOS_DEPLOYMENT_TARGET SDKROOT="$MACOS_SDK_PATH" \
	bazel build //:atolla_hotreload ${HOTRELOAD_BAZEL_ARGS}

EXECUTION_ROOT="$(bazel info execution_root)"
HOTRELOADER_CMD="$(tail -n 1 bazel-bin/run_hotreloader.sh)"

if [[ "$HOTRELOADER_CMD" != *"--no-debugging-proxy"* ]]; then
	HOTRELOADER_CMD="$HOTRELOADER_CMD --no-debugging-proxy"
fi

(
	cd "$(dirname "$0")/.." || exit 1
	export BAZEL_EXECROOT="$EXECUTION_ROOT"
	export BAZEL_BINDIR="."
	eval "$HOTRELOADER_CMD"
)
