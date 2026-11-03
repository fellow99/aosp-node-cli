plugins {
    alias(libs.plugins.android.library)
    id("com.vanniktech.maven.publish.base")
}

// node-cli：exec 型 node 命令行（libnode_cli.so，arm64-v8a PIE）+ npm/corepack JS 树（assets）。
// 版本号 = 配对 Node 版本号（由 node-cli.lock.json 锁定，恒等于 aosp-node-runtime 版本）。
// 二进制/随包树不入库：src/main/jniLibs/ 与 src/main/assets/ 由 tools/provision.mjs 投放。
// 本模块不含任何 Kotlin/Java 源——它只是 AAR 容器。

apply(from = rootProject.file("publish.gradle.kts"))

// 不能用 NODE_* 前缀：Gradle 9.4 把所有 NODE_ 前缀属性保留给内置 Node 工具链。
// 多版本发布：gradle publishToMavenCentral -PCLI_VERSION=26.13.0 -PRELEASE=true
version = (providers.gradleProperty("CLI_VERSION").orNull
    ?: error("node-cli 需要 CLI_VERSION（= 配对 Node 版本）；当前未设置"))

afterEvaluate {
    val publishing = extensions.getByType(org.gradle.api.publish.PublishingExtension::class.java)
    publishing.publications.forEach { pub ->
        (pub as Any).javaClass.methods
            .first { it.name == "setVersion" && it.parameterCount == 1 }
            .invoke(pub, version.toString())
    }
}

android {
    namespace = "org.fellow99.nodecli"
    compileSdk = 36
    defaultConfig {
        minSdk = 24
        ndk {
            abiFilters += "arm64-v8a"
        }
    }
    androidResources {
        // npm 树固有 dot 文件（npm/.npmrc、node-gyp/.release-please-manifest.json 等 5 件）
        // 被 aapt 默认 ignoreAssetsPattern 的 `.*` token 丢弃——CI Release AAR 实证 2003<预期
        // （2026-11-03 探针实现期发现）。覆写去掉 `.*`（与 `_<dir>` 同理）；消费方 App 须同样
        // 覆写（见 docs §7 契约）。
        ignoreAssetsPattern = "!.svn:!.git:!.ds_store:!*.scc:!CVS:!thumbs.db:!picasa.ini:!*~"
    }
    packaging {
        jniLibs {
            // exec 型工具与 dlopen 库（node-pty）相反：必须物理落盘（extractNativeLibs=true）。
            // targetSdk≥29 的 SELinux 禁止从可写数据目录 exec，nativeLibraryDir 是唯一合规
            // 执行位；useLegacyPackaging=false 时库直接从 APK mmap、不落盘，execve 会 ENOENT。
            useLegacyPackaging = true
        }
    }
}
