workspace(name = "music_app")

load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_archive")

http_archive(
    name = "valdi",
    strip_prefix = "Valdi-beta-0.0.3",
    url = "https://github.com/Snapchat/Valdi/archive/beta-0.0.3.tar.gz",
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
        "androidx.media3:media3-exoplayer:1.3.1",
    ],
    repositories = [
        "https://maven.google.com",
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
