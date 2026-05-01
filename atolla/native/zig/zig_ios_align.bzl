"""Repack a Zig static archive with 8-byte Mach-O alignment for the Apple linker.

rules_zig uses llvm-ar, which writes 2-byte-aligned archives. Apple's 64-bit
Mach-O linker requires 8-byte alignment.

Two problems compound:
  1. The Zig archiver stores archive members with mode=0 in the ar header, so
     ar-extracted objects have no read permissions.
  2. xcrun libtool -static cannot repack a misaligned archive because it hits
     the same 8-byte alignment constraint trying to READ the input.

Fix: extract with system ar (which understands 2-byte-aligned archives), fix
permissions, then pack individual .o files with xcrun libtool -static. Packing
from loose .o files always writes a fresh archive with correct alignment.

A Starlark rule (not genrule) is critical here: it receives zig_static_library
as a dep, so Bazel's Apple platform transition propagates correctly and the
archive is built for the right target (iOS/macOS), not the exec host.
"""

load("@rules_cc//cc:find_cc_toolchain.bzl", "find_cc_toolchain", "use_cc_toolchain")
load("@rules_cc//cc/common:cc_common.bzl", "cc_common")
load("@rules_cc//cc/common:cc_info.bzl", "CcInfo")

def _zig_ios_align_impl(ctx):
    files = ctx.attr.zig_lib[DefaultInfo].files.to_list()
    archives = [f for f in files if f.extension == "a"]
    if len(archives) != 1:
        fail("Expected exactly one .a in zig_static_library output, got: {}".format(archives))

    input_archive = archives[0]
    output_archive = ctx.actions.declare_file("lib" + ctx.label.name + ".a")

    # Extract with system ar (reads 2-byte-aligned archives fine), fix the
    # mode=0 permissions Zig stores in archive headers, then repack with
    # xcrun libtool -static which writes a fresh 8-byte-aligned archive.
    ctx.actions.run_shell(
        inputs = [input_archive],
        outputs = [output_archive],
        command = """\
set -euo pipefail
EXECROOT=$(pwd)
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT
cd "$TMPDIR"
ar x "$EXECROOT/$1"
chmod 644 *.o
xcrun libtool -static -o "$EXECROOT/$2" *.o
""",
        arguments = [input_archive.path, output_archive.path],
        mnemonic = "ZigArchiveAlign",
        progress_message = "Aligning Zig archive for Apple linker: %{label}",
    )

    cc_toolchain = find_cc_toolchain(ctx, mandatory = True)
    feature_configuration = cc_common.configure_features(
        ctx = ctx,
        cc_toolchain = cc_toolchain,
        requested_features = ctx.features,
        unsupported_features = ctx.disabled_features,
    )
    library_to_link = cc_common.create_library_to_link(
        actions = ctx.actions,
        feature_configuration = feature_configuration,
        cc_toolchain = cc_toolchain,
        static_library = output_archive,
    )
    linking_context = cc_common.create_linking_context(
        linker_inputs = depset([
            cc_common.create_linker_input(
                owner = ctx.label,
                libraries = depset([library_to_link]),
            ),
        ]),
    )

    return [
        DefaultInfo(files = depset([output_archive])),
        CcInfo(linking_context = linking_context),
    ]

zig_ios_align = rule(
    implementation = _zig_ios_align_impl,
    attrs = {
        "zig_lib": attr.label(
            mandatory = True,
            providers = [DefaultInfo, CcInfo],
            doc = "A zig_static_library target whose archive to repack with 8-byte alignment.",
        ),
    },
    toolchains = use_cc_toolchain(mandatory = True),
    fragments = ["cpp"],
    doc = "Repacks a Zig static archive with 8-byte Mach-O alignment for the Apple linker.",
)
