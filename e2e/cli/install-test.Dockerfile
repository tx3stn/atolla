FROM debian:bookworm@sha256:268fb24c39bca92d326dd83ea3abebe4a3f7751c804ffef23bb6d857dd343ff8

ENV container=docker

RUN apt-get update \
	&& DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
	bats \
	bats-assert \
	bats-support \
	ca-certificates \
	curl \
	gstreamer1.0-alsa \
	gstreamer1.0-plugins-base \
	gstreamer1.0-plugins-good \
	libgstreamer1.0-0 \
	sudo \
	systemd \
	systemd-sysv \
	util-linux \
	&& rm -rf /var/lib/apt/lists/* \
	&& useradd --create-home --shell /bin/bash tester \
	&& echo 'tester ALL=(ALL) NOPASSWD:ALL' >/etc/sudoers.d/tester

STOPSIGNAL SIGRTMIN+3

CMD ["/sbin/init"]
