# shellcheck shell=bash
#
# Stamps a dev version onto a local build without disturbing the committed 0.0.0
# placeholders. Source this, do not execute it: the trap has to register in the
# caller's shell so the revert still runs on build failure or Ctrl-C.
#
#   source "$SCRIPT_DIR/stamp-dev-version.sh"
#   stamp_dev_version "$SCRIPT_DIR/.."
#
# Defaults to the latest release tag plus a -dev suffix and the short commit
# (e.g. 0.4.5-dev-a1b2c3d); override with DEV_VERSION=<x.y.z[-suffix]>. Requires
# vrsn; without it the build just uses the committed placeholder.

# The version the app and CLI display. The only one a dev build leaves stamped.
displayed_version_file=atolla_core/src/version.ts

# Packaging metadata vrsn rewrites too, reverted as soon as it has been written:
# CFBundleVersion has to stay numeric, moving android's versionCode blocks
# installing a release build over a local one, and the headless binary reads
# none of it — so stamping these only invalidates bazel analysis for nothing.
packaging_version_files=(
	BUILD.bazel
	atolla_app/native/android/AndroidManifest.prod.xml
	atolla_app_dev/BUILD.bazel
)

# Deliberately not local: the EXIT trap expands it after this function has
# returned, so it has to outlive the call.
stamp_repo_root=""

stamp_dev_version() {
	stamp_repo_root="$1"

	if ! command -v vrsn >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
		echo "vrsn not installed — building the committed placeholder version."
		return 0
	fi

	# A version that is not the placeholder was put there deliberately — a release
	# build unpacking CI's stamped version files, or a manual vrsn set. Leave it.
	if ! grep -q "version = '0.0.0'" "$stamp_repo_root/$displayed_version_file"; then
		echo "Version already set — building it rather than stamping a dev version."
		return 0
	fi

	local tag commit version
	tag="$(cd "$stamp_repo_root" && git describe --tags --abbrev=0 2>/dev/null || echo 0.0.0)"
	commit="$(cd "$stamp_repo_root" && git rev-parse --short HEAD)"
	version="${DEV_VERSION:-${tag}-dev-${commit}}"

	trap 'git -C "$stamp_repo_root" checkout -- "$displayed_version_file" "${packaging_version_files[@]}"' EXIT
	(cd "$stamp_repo_root" && vrsn set "$version")
	(cd "$stamp_repo_root" && git checkout -- "${packaging_version_files[@]}")
	echo "Stamped dev version ${version} (version files revert on exit)."
}
