# 000-scaffold 任务拆解

> 对应：[spec.md](./spec.md)；plan 内容并入 [`docs/000-工程规划.md`](../../docs/000-工程规划.md)。
> 原则：骨架完整、简单编译通过；不本地产出 `.so`；真实交叉编译属 M1。

## T1 Gradle 工程骨架
- [x] T1.1 `settings.gradle.kts`（rootName=aosp-node-cli，include :node-cli，pluginManagement 0.37.0）— FR-000-001
- [x] T1.2 `gradle/libs.versions.toml`（AGP 9.2.1）— FR-000-002
- [x] T1.3 `gradle.properties`（GROUP、CLI_VERSION=26.13.0 draft、POM_*、RELEASE=false）— FR-000-003
- [x] T1.4 `gradle.properties.local.example`
- [x] T1.5 `publish.gradle.kts`（移植 pty 发布面，url 改为 aosp-node-cli，版本源 CLI_VERSION）
- [x] T1.6 `node-cli/build.gradle.kts`（android library，namespace，minSdk24，
      **useLegacyPackaging=true**，版本覆盖）— FR-000-002/004
- [x] T1.7 验收：无 `.so` 下 `gradle :node-cli:assembleDebug` 成功

## T2 唯一事实源
- [x] T2.1 `node-cli.lock.json`：active=26.13.0/arm64-v8a，draft release
      （pairedRuntime=node-runtime:26.13.0，exec gates 键，占位 sha）— FR-000-010~013

## T3 投放与门禁工具
- [x] T3.1 `tools/provision.mjs`：ELF 解析（含 PT_INTERP 内容）+
      `--check/--inspect/--out/--version/--abi`；exec 门禁 ET_DYN/**INTERP=系统 linker64**/
      AArch64/**DT_NEEDED 白名单**/16K/sha/size — FR-000-030~033
- [x] T3.2 仅投放 libnode_cli.so；jniLibs 禁入 libnode.so / libc++_shared.so；
      写 META-INF/node-cli.properties — FR-000-034~036
- [x] T3.3 退出码 0/2/1
- [x] T3.4 `node --check tools/provision.mjs`

## T4 构建脚本（骨架）
- [x] T4.1 `scripts/fetch-node-cli-source.mjs`（接口 + SCAFFOLD 退出码 2，实现属 M1）
- [x] T4.2 `scripts/build-node-cli-android.sh`（接口 + 五条差异纪律注释，实现属 M1）
- [x] T4.3 `node --check` / `bash -n` 语法校验

## T5 GitHub Actions（scaffold CI）
- [x] T5.1 `.github/workflows/build-node-cli-android.yml`：配置期门禁
      （`gradle :node-cli:tasks`）+ provision 自检（未投放=2）+ 脚本语法门 — FR-000-040~042

## T6 卫生 / 许可 / 文档
- [x] T6.1 重写 `.gitignore`（jniLibs .so、assets 树、.dist、构建目录）
- [x] T6.2 `node-cli/THIRD-PARTY-NOTICES.md`
- [x] T6.3 `README.md` + `README_zh.md`（定位/坐标/配对/exec 打包要点/构建/门禁）

## T7 规格文档
- [x] T7.1 `specs/000-scaffold/{spec,tasks,test-cases}.md`（pty 四件套折叠为三件）

## T8 验证
- [x] T8.1 `gradle :node-cli:assembleDebug` 通过（AAR 容器产出）
- [x] T8.2 provision `--check` 未投放退出码 2；`node --check`；`bash -n`
- [x] T8.3 提交（Conventional Commits 前缀；父工程不提交）
