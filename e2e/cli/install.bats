#!/usr/bin/env bats

bats_load_library bats-support
bats_load_library bats-assert

CONFIG="/etc/atolla/player.json"
HELLO="http://127.0.0.1:45889/hello"
INSTALLER="$BATS_TEST_DIRNAME/../../atolla_headless/install.sh"

assert_nothing_installed() {
	run id -u atolla
	assert_failure
	assert [ ! -e /etc/atolla ]
	assert [ ! -e /var/lib/atolla ]
	assert [ ! -e /usr/local/bin/atolla ]
	assert [ ! -e /usr/local/bin/atolla.new ]
	assert [ ! -e /etc/systemd/system/atolla.service ]
}

install_atolla() {
	run setsid --wait sudo "$INSTALLER" "$@" "$ATOLLA_CLI"
	assert_success
}

hello() {
	for _ in $(seq 1 20); do
		if curl -fsS "$HELLO" 2>/dev/null; then
			return 0
		fi
		sleep 0.5
	done

	return 1
}

pairing_code() {
	atolla --no-color pair | sed -n 's/^code: //p'
}

stub_machine() {
	mkdir -p "$BATS_TEST_TMPDIR/stubs"
	cat >"$BATS_TEST_TMPDIR/stubs/uname" <<EOF
#!/bin/sh
if [ "\$1" = "-m" ]; then
	echo "$1"
	exit 0
fi
exec /usr/bin/uname "\$@"
EOF
	chmod +x "$BATS_TEST_TMPDIR/stubs/uname"
}

setup_file() {
	sudo -n true 2>/dev/null || fail "the tests run the installer with sudo, so they need passwordless sudo"

	local state=""
	for _ in $(seq 1 60); do
		state="$(timeout 60 systemctl is-system-running --wait 2>/dev/null || true)"
		if [ -n "$state" ]; then
			break
		fi
		sleep 1
	done

	case "$state" in
	running | degraded) ;;
	*) fail "systemd didn't come up: ${state:-no answer after 60s}" ;;
	esac
}

setup() {
	assert_nothing_installed
}

teardown() {
	sudo systemctl disable --now atolla.service 2>/dev/null || true
	sudo rm -f /etc/systemd/system/atolla.service /usr/local/bin/atolla /usr/local/bin/atolla.new
	sudo systemctl daemon-reload
	sudo userdel atolla 2>/dev/null || true
	sudo groupdel atolla 2>/dev/null || true
	sudo rm -rf /etc/atolla /var/lib/atolla
}

@test "refuses to install without root" {
	run "$INSTALLER" "$ATOLLA_CLI"

	assert_failure
	assert_output --partial "install needs root, run with: sudo"
	assert_nothing_installed
}

@test "refuses a 32-bit OS" {
	stub_machine armv7l

	run sudo env PATH="$BATS_TEST_TMPDIR/stubs:$PATH" "$INSTALLER" "$ATOLLA_CLI"

	assert_failure
	assert_output --partial "armv7l is 32-bit, atolla requires a 64-bit OS"
	assert_nothing_installed
}

@test "refuses an architecture atolla has no build for" {
	stub_machine riscv64

	run sudo env PATH="$BATS_TEST_TMPDIR/stubs:$PATH" "$INSTALLER" "$ATOLLA_CLI"

	assert_failure
	assert_output --partial "atolla has no build for riscv64"
	assert_nothing_installed
}

@test "refuses a binary that doesn't run on this machine" {
	printf '\177ELF\002\001\001' >"$BATS_TEST_TMPDIR/atolla"

	run sudo "$INSTALLER" "$BATS_TEST_TMPDIR/atolla"

	assert_failure
	assert_output --partial "doesn't run here, check it was built for linux"
	assert_nothing_installed
}

@test "prints usage when no binary is given" {
	run "$INSTALLER"

	assert_failure
	assert_output --partial "usage: sudo"
	assert_nothing_installed
}

@test "asks for a player name when there is a terminal" {
	run script --quiet --return --command "sudo $INSTALLER $ATOLLA_CLI" /dev/null <<<"kitchen"

	assert_success
	run cat "$CONFIG"
	assert_output --partial '"name": "kitchen"'
}

@test "installs without a name when there is no terminal to ask on" {
	install_atolla

	assert_output --partial "no terminal to ask for a player name, continuing without one"
	run cat "$CONFIG"
	assert_output --partial '"name": ""'
}

@test "uses the name passed with --name" {
	install_atolla --name kitchen

	refute_output --partial "no terminal to ask for a player name"
	run cat "$CONFIG"
	assert_output --partial '"name": "kitchen"'
	run hello
	assert_output --partial '"name":"kitchen"'
}

@test "runs the service enabled and active, as the atolla user" {
	install_atolla --name kitchen
	run hello
	assert_success

	run systemctl is-enabled atolla.service
	assert_output "enabled"
	run systemctl is-active atolla.service
	assert_output "active"
	run stat -c %U "/proc/$(systemctl show --property MainPID --value atolla.service)"
	assert_output "atolla"
}

@test "creates an atolla user that can't log in, in the audio group" {
	install_atolla --name kitchen

	run getent passwd atolla
	assert_output --regexp ':/usr/sbin/nologin$'
	run id -nG atolla
	assert_output --regexp '(^| )audio( |$)'
}

@test "gives the atolla user its config and data folders" {
	install_atolla --name kitchen

	run stat -c %U:%G /etc/atolla /var/lib/atolla

	assert_output "atolla:atolla
atolla:atolla"
}

@test "shows the pairing code to a user without sudo" {
	install_atolla --name kitchen

	run atolla --no-color pair

	assert_success
	assert_output --regexp 'code: [0-9]{4} [0-9]{4}'
}

@test "the atolla user renames the player, and the service uses it after a restart" {
	install_atolla --name kitchen

	run sudo -u atolla atolla --no-color config --name lounge
	assert_success
	sudo systemctl restart atolla.service

	run hello
	assert_output --partial '"name":"lounge"'
}

@test "the atolla user resets pairing to a new code" {
	install_atolla --name kitchen
	before="$(pairing_code)"

	run sudo -u atolla atolla --no-color pair --reset

	assert_success
	refute_output --partial "code: $before"
	assert_output --regexp 'code: [0-9]{4} [0-9]{4}'
}

@test "reinstalling keeps the config and the pairing code" {
	install_atolla --name kitchen
	before="$(pairing_code)"

	install_atolla --name lounge

	assert_output --partial "keeping the existing config"
	run cat "$CONFIG"
	assert_output --partial '"name": "kitchen"'
	run pairing_code
	assert_output "$before"
	run hello
	assert_output --partial '"name":"kitchen"'
}
