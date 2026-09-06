#!/usr/bin/env bash
# Builds the headless CLI and runs the e2e suite against it, on every platform it ships to.
#
#   test-e2e-cli-full.sh                     all three
#   test-e2e-cli-full.sh mac linux-amd64     just those
#
# Both linux builds happen in the amd64 container as Valdi can't BUILD in arm.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

TEST_IMAGE_FILE="$REPO_ROOT/atolla_headless/test.Dockerfile"

platforms=("$@")
if [ "${#platforms[@]}" -eq 0 ]; then
	platforms=(mac linux-amd64 linux-arm64)
fi

for platform in "${platforms[@]}"; do
	case "$platform" in
	mac | linux-amd64 | linux-arm64) ;;
	*)
		echo "usage: $(basename "$0") [mac|linux-amd64|linux-arm64]..." >&2
		exit 1
		;;
	esac
done

wants() {
	local wanted="$1" platform
	for platform in "${platforms[@]}"; do
		[ "$platform" = "$wanted" ] && return 0
	done
	return 1
}

# --tty only when there is one: docker refuses it otherwise, which would break every piped or
# scripted run. The same guard run-headless.sh uses.
tty_flags=()
if [ -t 1 ]; then
	tty_flags=(--tty --interactive)
fi

# Both linux binaries come out of one container. A second `docker run` starts a second bazel
# server, and re-loading the package graph costs more than the build itself under emulation.
build_linux() {
	local steps=()
	wants linux-amd64 &&
		steps+=("env ATOLLA_HEADLESS_OUTPUT=build/atolla_linux_amd64 ./.scripts/build-headless.sh")
	wants linux-arm64 && steps+=("./.scripts/build-headless.sh arm64")

	local script
	printf -v script '%s && ' ${steps[@]+"${steps[@]}"}

	ATOLLA_LINUX_PLATFORM=linux/amd64 "$SCRIPT_DIR/run-headless.sh" sh -c "${script}true"
}

# Runs the suite against a binary already in build/. node_modules is masked with an empty volume
# because the bind-mounted host copy is darwin-native; the suite only imports node builtins and
# bun:test, so it needs nothing from it.
run_suite_in_container() {
	local docker_platform="$1" binary="$2"

	docker run --rm "${tty_flags[@]+"${tty_flags[@]}"}" \
		--platform "$docker_platform" \
		--volume "$REPO_ROOT:/workspace" \
		--volume /workspace/node_modules \
		--env "ATOLLA_CLI=/workspace/build/$binary" \
		"atolla-linux-test:${docker_platform##*/}" bun run test:e2e:cli
}

test_mac() {
	ATOLLA_CLI="$REPO_ROOT/build/atolla" bun run test:e2e:cli
}

test_linux_amd64() {
	run_suite_in_container linux/amd64 atolla_linux_amd64
}

test_linux_arm64() {
	run_suite_in_container linux/arm64 atolla_arm64
}

echo "=== building ==="

# The mac build uses the host's bazel and the linux builds the container's, so they share nothing
# and overlap for free. Its output is held back rather than interleaved, and printed if it fails.
mac_log="$(mktemp)"
trap 'rm -f "$mac_log"' EXIT

mac_pid=""
mac_status=0
if wants mac; then
	bun run build:headless >"$mac_log" 2>&1 &
	mac_pid=$!
fi

for arch in amd64 arm64; do
	wants "linux-$arch" || continue
	docker build --quiet --platform "linux/$arch" -t "atolla-linux-test:$arch" \
		-f "$TEST_IMAGE_FILE" "$REPO_ROOT" >/dev/null
done

linux_status=0
if wants linux-amd64 || wants linux-arm64; then
	build_linux || linux_status=$?
fi

if [ -n "$mac_pid" ]; then
	wait "$mac_pid" || mac_status=$?
	[ "$mac_status" = 0 ] || cat "$mac_log" >&2
fi

failed=()
for platform in "${platforms[@]}"; do
	echo ""
	echo "=== $platform ==="

	case "$platform" in
	mac) status="$mac_status" ;;
	*) status="$linux_status" ;;
	esac

	# A failed build must not leave the suite running against a stale binary and reporting that as
	# the result.
	if [ "$status" != 0 ]; then
		echo "=== $platform FAILED (build) ===" >&2
		failed+=("$platform")
	elif "test_${platform//-/_}"; then
		echo "=== $platform passed ==="
	else
		echo "=== $platform FAILED ===" >&2
		failed+=("$platform")
	fi
done

echo ""
if [ "${#failed[@]}" -gt 0 ]; then
	echo "failed: ${failed[*]}" >&2
	exit 1
fi

echo "passed: ${platforms[*]}"
