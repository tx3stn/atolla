#!/usr/bin/env bash
# Runs a command inside a linux container, for developing on a machine that isn't linux. The two
# containers do the two halves of building for a Pi, so with no arguments each does its half:
#
#   bun run linux                                     amd64: cross-build the arm64 binary
#   ATOLLA_LINUX_PLATFORM=linux/arm64 bun run linux   arm64: run the binary that produced
#
# Pass any command to override — `bash` for a shell. arm64 is native on Apple Silicon, so running
# the binary there is real execution rather than emulation; it cannot *build*, because Valdi's
# prebuilt host tools have no arm64 version (see .scripts/build-headless.sh).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PLATFORM="${ATOLLA_LINUX_PLATFORM:-linux/amd64}"
IMAGE="atolla-linux-build:${PLATFORM##*/}"
# a named volume, not a bind mount: it holds the output base, the disk cache and the repository
# cache, none of which may be shared with the darwin build on the host
CACHE_VOLUME="atolla-linux-bazel-cache-${PLATFORM##*/}"

# repo root as the context: the image builds its sysroot with the same .scripts/ script CI uses,
# so the COPY has to reach outside the module. .dockerignore keeps that context to the one file.
docker build --platform "$PLATFORM" -t "$IMAGE" \
	-f "$REPO_ROOT/atolla_headless/builder.Dockerfile" "$REPO_ROOT"

if [ "$#" -eq 0 ]; then
	case "$PLATFORM" in
	*/arm64) set -- ./build/atolla_headless_cli_arm64 ;;
	*) set -- ./.scripts/build-headless.sh arm64 ;;
	esac
fi

tty_flags=()
if [ -t 1 ]; then
	tty_flags=(--tty --interactive)
fi

docker run --rm "${tty_flags[@]}" \
	--platform "$PLATFORM" \
	--volume "$REPO_ROOT:/workspace" \
	--volume "$CACHE_VOLUME:/root/.cache" \
	"$IMAGE" "$@"
