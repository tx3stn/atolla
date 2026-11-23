#!/usr/bin/env bash

set -euo pipefail

BINARY="/usr/local/bin/atolla"
CONFIG_DIR="/etc/atolla"
CONFIG="$CONFIG_DIR/player.json"
DATA_DIR="/var/lib/atolla"
SERVICE="/etc/systemd/system/atolla.service"
SERVICE_USER="atolla"
STAGED="$BINARY.new"
PREFIX="atolla install:"

PACKAGES=(
	gstreamer1.0-alsa
	gstreamer1.0-plugins-base
	gstreamer1.0-plugins-good
	libgstreamer1.0-0
)

log() {
	echo "$PREFIX $1"
}

fail() {
	echo "$PREFIX $1" >&2
	exit 1
}

usage() {
	fail "usage: sudo $0 [--name <player name>] <path to atolla binary>"
}

check_platform() {
	log "checking system"
	[ "$(uname -s)" = "Linux" ] || fail "unsupported install platform: $(uname -s)"

	case "$(uname -m)" in
	aarch64 | x86_64) ;;
	armv6l | armv7l) fail "$(uname -m) is 32-bit, atolla requires a 64-bit OS" ;;
	*) fail "atolla has no build for $(uname -m)" ;;
	esac

	command -v apt-get >/dev/null || fail "apt-get not found, unable to install required dependencies"
	[ -d /run/systemd/system ] || fail "systemd not found, unable to run atolla as a service"
}

# TODO: download the binary from the github release once the CLI is published there, and call this
# in place of copying a local binary when no path is given
# download_binary() {
# 	log "downloading atolla cli"
# 	local arch
# 	case "$(uname -m)" in
# 	aarch64) arch="arm64" ;;
# 	x86_64) arch="amd64" ;;
# 	esac
#
# 	local url="https://github.com/tx3stn/atolla/releases/latest/download/atolla-linux-$arch"
# 	curl -fsSL --retry 3 --retry-delay 2 -o "$STAGED" "$url"
# 	curl -fsSL --retry 3 --retry-delay 2 -o "$STAGED.sha256" "$url.sha256"
#
# 	log "verifying checksum"
# 	echo "$(cut -d ' ' -f 1 "$STAGED.sha256")  $STAGED" | sha256sum --check --status || fail "checksum mismatch for $url"
# 	rm "$STAGED.sha256"
# 	chmod 0755 "$STAGED"
# 	log "installed"
# }

prompt_name() {
	if ! { true </dev/tty; } 2>/dev/null; then
		log "no terminal to ask for a player name, continuing without one"
		return
	fi

	while [ -z "$name" ]; do
		read -r -p "player name: " name </dev/tty
	done
}

install_packages() {
	log "installing dependencies"
	DEBIAN_FRONTEND=noninteractive apt-get update
	DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${PACKAGES[@]}"
}

create_user() {
	if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
		log "creating atolla user"
		useradd --system --user-group --home-dir "$DATA_DIR" --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
	fi
	usermod --append --groups audio "$SERVICE_USER"

	install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0755 "$CONFIG_DIR" "$DATA_DIR"
	log "atolla user configured"
}

write_service() {
	log "creating systemd service"
	cat >"$SERVICE" <<EOF
[Unit]
Description=atolla player
Wants=network-online.target
After=network-online.target sound.target

[Service]
User=$SERVICE_USER
Group=$SERVICE_USER
ExecStart=$BINARY --no-color run
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
}

as_service_user() {
	runuser -u "$SERVICE_USER" -- "$BINARY" --no-color "$@"
}

name=""
source_binary=""

while [ $# -gt 0 ]; do
	case "$1" in
	--name)
		[ $# -ge 2 ] || usage
		name="$2"
		shift 2
		;;
	-*) usage ;;
	*)
		[ -z "$source_binary" ] || usage
		source_binary="$1"
		shift
		;;
	esac
done

[ -n "$source_binary" ] || usage
[ -f "$source_binary" ] || fail "no file at $source_binary"
[ "$(id -u)" -eq 0 ] || fail "install needs root, run with: sudo $0"

check_platform

trap 'rm -f "$STAGED"' EXIT
install -m 0755 "$source_binary" "$STAGED"
version="$("$STAGED" --version)" || fail "$source_binary doesn't run here, check it was built for linux $(uname -m)"

if [ ! -f "$CONFIG" ]; then
	prompt_name
fi

install_packages
create_user
mv -f "$STAGED" "$BINARY"

if [ -f "$CONFIG" ]; then
	log "keeping the existing config at $CONFIG"
else
	log "initialising..."
	as_service_user init --name "$name"
fi

pairing="$(as_service_user pair)"

write_service
systemctl daemon-reload
systemctl enable --quiet atolla.service
systemctl restart atolla.service

cat <<EOF

atolla $version is running

$pairing

status:         systemctl status atolla
logs:           journalctl -u atolla -f
pairing code:   atolla pair
reset pairing:  sudo -u $SERVICE_USER atolla pair --reset
audio output:   "default" (list the available options with: atolla outputs)
player name:    "$name"
config:         $CONFIG

restart after making changes to your config with: sudo systemctl restart atolla
EOF
