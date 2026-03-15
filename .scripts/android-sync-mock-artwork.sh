#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ID="${PACKAGE_ID:-com.snap.valdi.app_shell_app}"
ARTWORK_CACHE_RELATIVE_DIR="files/artwork-cache"
LOCAL_ARTWORK_DIR="modules/app_shell/src/fixtures/jellyfin/library/artwork"

if ! command -v adb >/dev/null 2>&1; then
	echo "Skipping mock artwork sync: adb not found."
	exit 0
fi

if [[ ! -d "$LOCAL_ARTWORK_DIR" ]]; then
	echo "Skipping mock artwork sync: source artwork directory missing ($LOCAL_ARTWORK_DIR)."
	exit 0
fi

echo "Syncing mock artwork into app cache..."

adb shell "run-as $PACKAGE_ID mkdir -p $ARTWORK_CACHE_RELATIVE_DIR" >/dev/null

for source_path in "$LOCAL_ARTWORK_DIR"/*; do
	if [[ ! -f "$source_path" ]]; then
		continue
	fi

	target_name="$(basename "$source_path")"
	adb shell "run-as $PACKAGE_ID sh -c 'cat > $ARTWORK_CACHE_RELATIVE_DIR/$target_name'" <"$source_path"
done

echo "Mock artwork sync complete."
