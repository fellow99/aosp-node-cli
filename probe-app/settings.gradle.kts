pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "node-cli-probe-app"
include(":app")
// probe-app —— M2-T1 探针载体（specs/003-cli tasks T4.1 / 101-npm-integration tasks T4.1）
// 独立 Gradle 工程（不在 aosp-node-cli settings.gradle 内——000 的单模块红线不动）。
// 依赖本仓 Release 归档 AAR：把 node-cli-release.aar 放到 app/libs/ 后构建。
plugins {
    id("com.android.application") version "9.2.1" apply false
}
