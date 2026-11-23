#!/usr/bin/env bash
# Runs the installer tests in a container booted with systemd, against a linux binary in build/.
#
#   test-install.sh                 this machine's architecture
#   test-install.sh linux-amd64     build/atolla_linux_amd64
#   test-install.sh linux-arm64     build/atolla_arm64
#
# ATOLLA_CLI overrides the binary, as a path relative to the repo root.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

platform="${1:-}"
if [ -z "$platform" ]; then
	case "$(uname -m)" in
	arm64 | aarch64) platform="linux-arm64" ;;
	*) platform="linux-amd64" ;;
	esac
fi

case "$platform" in
linux-amd64)
	docker_platform="linux/amd64"
	binary="build/atolla_linux_amd64"
	;;
linux-arm64)
	docker_platform="linux/arm64"
	binary="build/atolla_arm64"
	;;
*)
	echo "usage: $(basename "$0") [linux-amd64|linux-arm64]" >&2
	exit 1
	;;
esac

binary="${ATOLLA_CLI:-$binary}"
if [ ! -f "$binary" ]; then
	echo "no atolla binary at $binary" >&2
	exit 1
fi

image="atolla-install-test:${docker_platform##*/}"
docker build --platform "$docker_platform" --tag "$image" - <e2e/cli/install-test.Dockerfile

container="$(docker run --detach --privileged --cgroupns=host --platform "$docker_platform" \
	--tmpfs /run --tmpfs /run/lock --volume "$REPO_ROOT:/workspace:ro" "$image")"
trap 'docker rm --force "$container" >/dev/null' EXIT

tty_flags=()
if [ -t 1 ]; then
	tty_flags=(--tty)
fi

docker exec "${tty_flags[@]+"${tty_flags[@]}"}" --user tester --workdir /workspace \
	--env "ATOLLA_CLI=/workspace/$binary" --env TMPDIR=/var/tmp "$container" bats e2e/cli/install.bats
