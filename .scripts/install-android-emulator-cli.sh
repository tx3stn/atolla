#!/usr/bin/env bash
set -euo pipefail

AVD_NAME="${AVD_NAME:-gsd-api34}"
API_LEVEL="${API_LEVEL:-34}"
ABI="${ABI:-arm64-v8a}"
DEVICE="${DEVICE:-pixel_7}"
NDK_VERSION="${NDK_VERSION:-27.0.12077973}"
BUILD_TOOLS_VERSION="${BUILD_TOOLS_VERSION:-34.0.0}"
VALDI_API_LEVEL="${VALDI_API_LEVEL:-36}"
VALDI_BUILD_TOOLS_VERSION="${VALDI_BUILD_TOOLS_VERSION:-36.0.0}"

ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}"
export ANDROID_SDK_ROOT

info() {
	printf "[android-emulator-setup] %s\n" "$1"
}

require_brew() {
	if ! command -v brew >/dev/null 2>&1; then
		info "Homebrew is required. Install from https://brew.sh and re-run."
		exit 1
	fi
}

install_brew_deps() {
	info "Installing Java + Android + hotreload tooling via Homebrew..."
	brew list openjdk@17 >/dev/null 2>&1 || brew install openjdk@17
	brew list --cask android-commandlinetools >/dev/null 2>&1 || brew install --cask android-commandlinetools
	brew list android-platform-tools >/dev/null 2>&1 || brew install android-platform-tools
	brew list watchman >/dev/null 2>&1 || brew install watchman
}

resolve_sdkmanager() {
	if command -v sdkmanager >/dev/null 2>&1; then
		command -v sdkmanager
		return
	fi

	for prefix in /opt/homebrew /usr/local; do
		if [[ -x "$prefix/share/android-commandlinetools/cmdline-tools/latest/bin/sdkmanager" ]]; then
			printf "%s\n" "$prefix/share/android-commandlinetools/cmdline-tools/latest/bin/sdkmanager"
			return
		fi
	done

	info "Could not find sdkmanager after installing android-commandlinetools."
	info "Open a new shell and re-run this script."
	exit 1
}

run_with_yes() {
	set +o pipefail
	yes | "$@"
	local cmd_status=${PIPESTATUS[1]}
	set -o pipefail
	return "$cmd_status"
}

install_android_packages() {
	local sdkmanager_bin="$1"
	local avdmanager_bin
	avdmanager_bin="$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/avdmanager"

	mkdir -p "$ANDROID_SDK_ROOT"

	info "Accepting Android SDK licenses..."
	if ! run_with_yes "$sdkmanager_bin" --sdk_root="$ANDROID_SDK_ROOT" --licenses; then
		info "Failed while accepting Android SDK licenses."
		exit 1
	fi

	info "Installing Android SDK packages..."
	if ! run_with_yes "$sdkmanager_bin" --sdk_root="$ANDROID_SDK_ROOT" "cmdline-tools;latest" "platform-tools" "build-tools;${BUILD_TOOLS_VERSION}" "emulator" "platforms;android-${API_LEVEL}" "system-images;android-${API_LEVEL};google_apis;${ABI}" "ndk;${NDK_VERSION}"; then
		info "Failed while installing Android SDK packages."
		exit 1
	fi

	info "Installing Valdi-required Android SDK level ${VALDI_API_LEVEL}..."
	if ! run_with_yes "$sdkmanager_bin" --sdk_root="$ANDROID_SDK_ROOT" "platforms;android-${VALDI_API_LEVEL}" "build-tools;${VALDI_BUILD_TOOLS_VERSION}"; then
		info "Failed while installing Valdi-required Android SDK packages."
		exit 1
	fi
	info "Android SDK packages installed."

	if [[ ! -x "$avdmanager_bin" ]]; then
		avdmanager_bin="${sdkmanager_bin%/sdkmanager}/avdmanager"
	fi

	info "Creating AVD '${AVD_NAME}' if needed..."
	if "$ANDROID_SDK_ROOT/emulator/emulator" -list-avds | grep -qx "$AVD_NAME"; then
		info "AVD '${AVD_NAME}' already exists."
		return
	fi

	if ! echo "no" | "$avdmanager_bin" create avd -n "$AVD_NAME" -k "system-images;android-${API_LEVEL};google_apis;${ABI}" -d "$DEVICE" --tag "google_apis" --abi "$ABI"; then
		info "Failed to create AVD. Installed system images are:"
		"$sdkmanager_bin" --sdk_root="$ANDROID_SDK_ROOT" --list_installed | grep "system-images;" || true
		exit 1
	fi
	info "Created AVD '${AVD_NAME}'."
}

print_next_steps() {
	cat <<EOF

Setup complete.

Set these environment variables manually in your shell/profile:

  export ANDROID_SDK_ROOT="$ANDROID_SDK_ROOT"
  export ANDROID_HOME="$ANDROID_SDK_ROOT"
  export ANDROID_NDK_HOME="$ANDROID_SDK_ROOT/ndk/$NDK_VERSION"
  export JAVA_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || printf /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home)"
  export PATH="\$PATH:\$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:\$ANDROID_SDK_ROOT/platform-tools:\$ANDROID_SDK_ROOT/emulator"

Then use:

Standard launch:
  emulator -avd ${AVD_NAME}

Headless-ish launch (lighter runtime):
  emulator -avd ${AVD_NAME} -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect -no-snapshot

Wait for device + install app:
  adb wait-for-device
  adb devices
  valdi install android
EOF
}

main() {
	require_brew
	install_brew_deps
	local sdkmanager_bin
	sdkmanager_bin="$(resolve_sdkmanager)"
	install_android_packages "$sdkmanager_bin"
	print_next_steps
}

main "$@"
