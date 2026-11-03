plugins {
    id("com.android.application")
}

android {
    namespace = "org.fellow99.nodeprobe"
    compileSdk = 36

    defaultConfig {
        applicationId = "org.fellow99.nodeprobe"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        // 探针 app 不发布，版本即目标 node 版本便于对应
        versionName = (providers.gradleProperty("PROBE_APP_VERSION").orNull ?: "0.1.0-probe")
        // 仅 arm64：验证 exec 型产物（x86_64 模拟器经 ndk_translation 可装可跑，abilist 含 arm64-v8a；
        // 但用例纪律要求 arm64 真机/arm64 模拟器——见 003 test-cases 禁止判据 3）
        ndk { abiFilters += "arm64-v8a" }
    }

    // 与容器 AAR 同口径：exec 要求物理落盘 nativeLibraryDir（D1）
    packaging {
        jniLibs { useLegacyPackaging = true }
    }

    androidResources {
        // 消费方契约（容器同款覆写，2026-11-03）：npm 树含 dot 文件（npm/.npmrc 等 5 件），
        // aapt 默认 ignoreAssetsPattern 的 `.*` token 会丢弃——覆写去掉该 token；
        // 否则物化树缺件且与 manifest.json 校验不符
        ignoreAssetsPattern = "!.svn:!.git:!.ds_store:!*.scc:!CVS:!thumbs.db:!picasa.ini:!*~"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        getByName("debug") {
            isDebuggable = true
        }
    }
}

dependencies {
    // CI 产物 AAR（jni/arm64-v8a 四件 + assets/node-bridge-tools 全树随 APK 合并）
    implementation(files("libs/node-cli-release.aar"))
}
