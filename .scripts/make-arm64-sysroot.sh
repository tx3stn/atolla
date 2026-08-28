#!/usr/bin/env bash
# Builds the linux-arm64 sysroot the cross build compiles against (see .bazelrc's linux-arm64
# config). Downloads arm64 .debs and unpacks them into a directory — no emulation and no container,
# so it runs on any linux host including a CI runner, whatever suite that runner is.
#
# jammy rather than the host's suite, for two reasons. apt.llvm.org ships libc++ **16** for jammy,
# matching the clang the toolchain uses; noble only offers 17+, and pairing those headers with
# clang 16 is a fight. And glibc 2.35 is older than any live Pi OS, so the binary is not pinned to
# whatever the builder happens to run. boost and zlib are built from source by bazel, so they are
# deliberately absent here.
set -euo pipefail

SYSROOT="${1:-/opt/sysroot-arm64}"

PACKAGES=(
	libc++-16-dev
	libc++1-16
	libc++abi-16-dev
	libc++abi1-16
	libc6
	libc6-dev
	libgcc-11-dev
	libgcc-s1
	libstdc++-11-dev
	libstdc++6
	libunwind-16
	libunwind-16-dev
	linux-libc-dev
)

# Later entries win, so -updates overrides the release pocket.
INDEXES=(
	"http://ports.ubuntu.com/ubuntu-ports dists/jammy/main/binary-arm64/Packages.gz"
	"http://ports.ubuntu.com/ubuntu-ports dists/jammy/universe/binary-arm64/Packages.gz"
	"http://ports.ubuntu.com/ubuntu-ports dists/jammy-updates/main/binary-arm64/Packages.gz"
	"http://apt.llvm.org/jammy dists/llvm-toolchain-jammy-16/main/binary-arm64/Packages.gz"
)

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

: >"$work/index"
for entry in "${INDEXES[@]}"; do
	read -r base path <<<"$entry"
	echo "reading $base/$path"
	curl -fsSL --retry 3 --retry-delay 2 "$base/$path" | gzip -dc | awk -v base="$base" '
		/^Package: / { pkg = $2 }
		/^Filename: / { print pkg "\t" base "/" $2 }
	' >>"$work/index"
done

mkdir -p "$SYSROOT"
for pkg in "${PACKAGES[@]}"; do
	url="$(awk -v p="$pkg" -F'\t' '$1 == p { u = $2 } END { print u }' "$work/index")"
	if [ -z "$url" ]; then
		echo "no arm64 package found for $pkg" >&2
		exit 1
	fi
	echo "unpacking $pkg"
	curl -fsSL --retry 3 --retry-delay 2 -o "$work/pkg.deb" "$url"
	dpkg-deb -x "$work/pkg.deb" "$SYSROOT"
done

# Packages still ship runtime libraries into /lib, while a real ubuntu root has /lib -> usr/lib
# (usrmerge) so both spellings resolve. Linker scripts and symlinks use each of them, so merge.
if [ -d "$SYSROOT/lib" ] && [ ! -L "$SYSROOT/lib" ]; then
	mkdir -p "$SYSROOT/usr/lib"
	cp -a "${SYSROOT:?}/lib/." "${SYSROOT:?}/usr/lib/"
	rm -rf "${SYSROOT:?}/lib"
	ln -s usr/lib "${SYSROOT:?}/lib"
fi

# Absolute symlinks (libm.so -> /lib/aarch64-linux-gnu/libm.so.6 and friends) resolve against the
# builder's root, where they dangle. The linker then silently falls back to the static libm.a,
# which references glibc-private symbols it cannot satisfy — so repoint them inside the sysroot.
find "$SYSROOT" -type l | while read -r link; do
	target="$(readlink "$link")"
	case "$target" in /*) ln -sfn "$SYSROOT$target" "$link" ;; esac
done

# The toolchain asks the linker for `-l:c++.a` / `-l:c++abi.a` — exact filenames rather than the
# usual lib-prefixed form, so the shipped libc++.a does not match on its own.
ln -sf libc++.a "$SYSROOT/usr/lib/llvm-16/lib/c++.a"
ln -sf libc++abi.a "$SYSROOT/usr/lib/llvm-16/lib/c++abi.a"

echo "arm64 sysroot ready at $SYSROOT"
