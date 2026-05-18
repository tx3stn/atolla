workspace(name = "atolla")

load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_archive")

http_archive(
    name = "valdi",
    strip_prefix = "Valdi-beta-0.0.3",
    url = "https://github.com/Snapchat/Valdi/archive/beta-0.0.3.tar.gz",
    patches = ["//:patches/valdi_rules_apple_maybe.patch"],
    patch_args = ["-p1"],
)

# Override Valdi's pinned rules_apple 4.0.0 with 4.1.0, which adds .icon support
# for iOS 26 Liquid Glass icons. 4.1.0 is the minimum version with .icon support
# and is still compatible with Valdi's pinned rules_cc 0.0.12. Valdi's
# dependencies.bzl is patched above to use maybe() so this pre-definition wins.
http_archive(
    name = "build_bazel_rules_apple",
    sha256 = "20152b14d9a420afc15ace905c02fd6425ddceb084630f3f043b287adf0fcdbd",
    url = "https://github.com/bazelbuild/rules_apple/releases/download/4.1.0/rules_apple.4.1.0.tar.gz",
)

http_archive(
    name = "valdi_widgets",
    strip_prefix = "Valdi_Widgets-beta-0.0.3",
    url = "https://github.com/Snapchat/Valdi_Widgets/archive/beta-0.0.3.tar.gz",
)

load("@valdi//bzl:workspace_prepare.bzl", "valdi_prepare_workspace")

valdi_prepare_workspace()

load("@valdi//bzl:workspace_preinit.bzl", "valdi_preinitialize_workspace")

valdi_preinitialize_workspace()

load("@rules_jvm_external//:defs.bzl", "maven_install")

maven_install(
    name = "media3_mvn",
    artifacts = [
        "androidx.core:core:1.13.1",
        "androidx.media3:media3-exoplayer:1.3.1",
    ],
    repositories = [
        "https://maven.google.com",
        "https://repo1.maven.org/maven2",
    ],
)

maven_install(
    name = "test_mvn",
    artifacts = [
        "junit:junit:4.13.2",
    ],
    repositories = [
        "https://repo1.maven.org/maven2",
    ],
)

load("@aspect_bazel_lib//lib:repositories.bzl", "aspect_bazel_lib_dependencies", "aspect_bazel_lib_register_toolchains", "register_yq_toolchains")

register_yq_toolchains()

aspect_bazel_lib_dependencies()

load("@rules_shell//shell:repositories.bzl", "rules_shell_dependencies", "rules_shell_toolchains")

rules_shell_dependencies()

rules_shell_toolchains()

aspect_bazel_lib_register_toolchains()

load("@bazel_tools//tools/build_defs/repo:utils.bzl", "maybe")
load("@platforms//host:extension.bzl", "host_platform_repo")

maybe(
    host_platform_repo,
    name = "host_platform",
)

load("@valdi//bzl:workspace_init.bzl", "valdi_initialize_workspace")

valdi_initialize_workspace()

load("@valdi_npm//:repositories.bzl", "npm_repositories")

npm_repositories()

load("@valdi//bzl:workspace_postinit.bzl", "valdi_post_initialize_workspace")

valdi_post_initialize_workspace()
