# Runs the CLI e2e suite against a linux binary, for developing on a machine that isn't linux.
# Separate from builder.Dockerfile on purpose: that image builds and has no bun, and the suite runs
# and needs no bazel, sysroot or toolchain.

# Copied rather than installed: bun.sh/install fetches whatever is current at build time, which
# defeats pinning the image by digest. The binary needs no more than glibc 2.17, so trixie's bun
# runs on jammy. The digest is the multi-arch index, so amd64 and arm64 both resolve from it.
FROM oven/bun:1.4.2@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895 AS bun

FROM ubuntu:22.04@sha256:2edbbc5dc405e9612ba3584ce95480277e3eb374407b5505fe26f17df77c7dbc

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /workspace

CMD ["bash"]
