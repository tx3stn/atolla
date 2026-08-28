# Linux build environment for the headless player, for developing on a machine that isn't linux.
# CI needs none of this — its runners are already linux and build directly.
#
# jammy on purpose: libtinfo5, which valdi's hermetic LLVM 16 clang links, is a plain apt install
# here and gone from 24.04.
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
	ca-certificates \
	curl \
	git \
	libc6-dev \
	libstdc++-11-dev \
	libtinfo5 \
	libxml2 \
	python3 \
	unzip \
	xz-utils \
	zip \
	&& rm -rf /var/lib/apt/lists/*

# bazelisk rather than a pinned bazel so the container tracks .bazelversion like every other host
ARG BAZELISK_VERSION=v1.29.0
RUN arch="$(dpkg --print-architecture)" \
	&& curl -fsSL -o /usr/local/bin/bazel \
	"https://github.com/bazelbuild/bazelisk/releases/download/${BAZELISK_VERSION}/bazelisk-linux-${arch}" \
	&& chmod +x /usr/local/bin/bazel

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# symlink_prefix keeps the container from replacing the host's bazel-* convenience symlinks in the
# bind-mounted workspace, which point at darwin output. watchfs needs inotify, which does not
# survive a macOS bind mount.
RUN printf 'build --symlink_prefix=/\nbuild --nowatchfs\n' >/root/.bazelrc

# The same script CI runs, so the sysroot has one definition rather than two.
COPY .scripts/make-arm64-sysroot.sh /tmp/make-arm64-sysroot.sh
RUN /tmp/make-arm64-sysroot.sh /opt/sysroot-arm64 && rm /tmp/make-arm64-sysroot.sh

WORKDIR /workspace

CMD ["bash"]
