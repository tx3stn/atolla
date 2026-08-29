#!/usr/bin/env bash
# Builds the headless player and drops the binary in build/. Runs bazel directly, so on a linux
# host — a CI runner included — no container is involved.
#
#   build-headless.sh          for this host
#   build-headless.sh arm64    cross-build for a Pi
#
# arm64 has to be a cross build: Valdi's prebuilt valdi_compiler and pngquant select on
# darwin / linux_x86_64 with no arm64 build, so a native arm64 build cannot finish analysis. Built
# from an amd64 host they stay in the exec configuration, where the selects resolve. It needs the
# sysroot from make-arm64-sysroot.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

TARGET=//atolla_headless:atolla_headless_cli
ARCH="${1:-host}"

case "$ARCH" in
host)
	config=()
	output=build/atolla_headless_cli
	;;
arm64)
	config=(--config=linux-arm64)
	output=build/atolla_headless_cli_arm64
	;;
*)
	echo "usage: $(basename "$0") [arm64]" >&2
	exit 1
	;;
esac

source "$SCRIPT_DIR/stamp-dev-version.sh"
stamp_dev_version "$SCRIPT_DIR/.."

bazel build "${config[@]}" "$TARGET"

# cquery prints a path relative to the execution root, and --symlink_prefix builds have no
# bazel-out symlink in the workspace to resolve it against.
root="$(bazel info "${config[@]}" execution_root)"
binary="$(bazel cquery "${config[@]}" --output=files "$TARGET" 2>/dev/null | head -1)"

mkdir -p build
cp -f "$root/$binary" "$output"

echo ""
echo "wrote $output"
