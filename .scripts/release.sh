#!/usr/bin/env bash
set -euo pipefail

require_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo "Missing required command: $1"
		exit 1
	fi
}

require_cmd vrsn
require_cmd git
require_cmd bun

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
	echo "Releases must be cut from main (currently on '$BRANCH')."
	exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
	echo "Working tree is not clean. Commit or stash changes before releasing."
	exit 1
fi

git fetch origin main
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
	echo "Local main is not up to date with origin/main. Pull or push first."
	exit 1
fi

vrsn bump

VERSION="$(bun -p "require('./package.json').version")"
TAG="v$VERSION"

if git rev-parse "$TAG" >/dev/null 2>&1; then
	echo "Tag $TAG already exists."
	exit 1
fi

# Keep the bazel app version and the in-app version constant in sync with package.json.
sed -i '' "s/^    version = \".*\",$/    version = \"$VERSION\",/" BUILD.bazel
sed -i '' "s/^export const appVersion = '.*';$/export const appVersion = '$VERSION';/" atolla/src/version.ts

git add package.json BUILD.bazel atolla/src/version.ts
git commit -m "Release $VERSION"
git tag "$TAG"
git push origin main "$TAG"

echo "Released $TAG — the release workflow will build and publish it."
