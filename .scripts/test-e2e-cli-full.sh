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

# Runs the suite against a binary already in build/. node_modules is masked with an empty volume
# because the bind-mounted host copy is darwin-native; the suite only imports node builtins and
# bun:test, so it needs nothing from it.
run_suite_in_container() {
	local docker_platform="$1" binary="$2"
	local image="atolla-linux-test:${docker_platform##*/}"

	docker build --platform "$docker_platform" -t "$image" -f "$TEST_IMAGE_FILE" "$REPO_ROOT"

	docker run --rm \
		--platform "$docker_platform" \
		--volume "$REPO_ROOT:/workspace" \
		--volume /workspace/node_modules \
		--env "ATOLLA_CLI=/workspace/build/$binary" \
		"$image" bun run test:e2e:cli
}

# set -e does not reach inside a function called from `if`, so build and suite are chained with &&.
# Sequential lines would leave a failed build running the suite against a stale binary and
# reporting that as the result.
test_mac() {
	bun run build:headless &&
		ATOLLA_CLI="$REPO_ROOT/build/atolla" bun run test:e2e:cli
}

test_linux_amd64() {
	ATOLLA_LINUX_PLATFORM=linux/amd64 "$SCRIPT_DIR/run-headless.sh" \
		env ATOLLA_HEADLESS_OUTPUT=build/atolla_linux_amd64 ./.scripts/build-headless.sh &&
		run_suite_in_container linux/amd64 atolla_linux_amd64
}

test_linux_arm64() {
	ATOLLA_LINUX_PLATFORM=linux/amd64 "$SCRIPT_DIR/run-headless.sh" \
		./.scripts/build-headless.sh arm64 &&
		run_suite_in_container linux/arm64 atolla_arm64
}

failed=()
for platform in "${platforms[@]}"; do
	echo ""
	echo "=== $platform ==="

	case "$platform" in
	mac) runner=test_mac ;;
	linux-amd64) runner=test_linux_amd64 ;;
	linux-arm64) runner=test_linux_arm64 ;;
	esac

	if "$runner"; then
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
