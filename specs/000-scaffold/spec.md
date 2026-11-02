# 000 · 工程搭建（scaffold）功能规格

> 模块：000-scaffold · 需求编号：000-scaffold · 状态：已实现（scaffold 级；技术方案见 [plan.md](./plan.md)，2026-11-02 as-built 补齐）
> 所属工程：aosp-node-cli · 规划基线：[`docs/000-工程规划.md`](../../docs/000-工程规划.md)
> （000-scaffold 曾把 pty 仓的 spec/plan/test-cases 四件套折叠为三件（验收场景并入本文件、
> plan 并入规划基线与 tasks.md）；2026-11-02 按 specs-as-built 方法补回 `plan.md`，本文件其余内容不变。）

## 1. 目的

`aosp-node-cli` 是以 AAR 形式发布的、与 Node.js 版本严格配对的 Android `node` 命令行
（exec 型 PIE）工程。000-scaffold 在不产出最终二进制的前提下，确立仓库结构、构建系统、
版本纪律、exec 门禁工具、投放工具与 CI（配置期），使 M1 的"交叉编译 libnode_cli.so"
只需在既定骨架内填充实现。

## 2. 范围

**在范围内（000）：**
- Gradle 多模块骨架：`settings.gradle.kts`、`gradle.properties`、`gradle/libs.versions.toml`、
  `publish.gradle.kts`、`:node-cli` Android library 模块（**exec 打包：useLegacyPackaging=true**）。
- 唯一事实源 `node-cli.lock.json`（draft：版本 + 配对 runtime + 门禁键 + 占位 sha）。
- `tools/provision.mjs`（**exec 型门禁**：PT_INTERP=系统 linker64、DT_NEEDED 白名单、
  ET_DYN、AArch64、16KB；投放 + META-INF 元数据）。
- 脚本骨架：`scripts/fetch-node-cli-source.mjs`、`scripts/build-node-cli-android.sh`
  （固化接口与差异纪律，实现属 M1）。
- CI：`.github/workflows/build-node-cli-android.yml`（配置期门禁 + 工具自检；真实编译 M1 接入）。
- 文档与许可：README（中英）、docs/000、THIRD-PARTY-NOTICES、.gitignore、LICENSE。

**不在范围内（000）：**
- 不本地产出/提交 `libnode_cli.so`（编译在 CI 的 M1 完成）。
- 不实现嵌入 API / Kotlin 桥 / pty 会话管理。
- 不发布 Maven Central（M3）。

## 3. 功能需求（摘要）

- FR-000-001：root 工程名 `aosp-node-cli`，仅 include `:node-cli`。
- FR-000-002：`:node-cli` 是 Android library，namespace `org.fellow99.nodecli`，
  `minSdk 24`、`compileSdk 36`，ABI 仅 arm64-v8a。
- FR-000-003：坐标 `io.github.fellow99:node-cli:<CLI_VERSION>`；`CLI_VERSION` 恒等于配对
  Node 版本；禁用 `NODE_` 前缀属性（Gradle 9.4 保留）。
- FR-000-004：**packaging.jniLibs.useLegacyPackaging = true**（exec 型硬要求，与 pty 相反）。
- FR-000-005：工程 MUST 能在不投放任何 `.so` 的情况下完成 Gradle 配置/任务求值。
- FR-000-010~013：lock 纪律（draft 不伪造哈希；gates 键含 `ptInterpSystemLinker` 与
  `neededWhitelist`，不含 `neededLibnode`/`undefinedNapiResolvable`）。
- FR-000-030~036：provision 门禁与投放（退出码 0/2/1；仅投放 `libnode_cli.so`；
  jniLibs 禁入 `libnode.so`/`libc++_shared.so`；写 META-INF/node-cli.properties）。
- FR-000-040~042：CI 配置期门禁（`gradle :node-cli:tasks` 无 .so 通过；provision `--check`
  未投放时退出码恰为 2；`node --check` / `bash -n` 语法门）。

## 4. 验收场景

### 场景：干净工程可配置
- Given 没有任何 `.so` 的全新检出；When `gradle :node-cli:tasks`；Then 配置期成功，
  模块存在，坐标版本解析为 `CLI_VERSION`。

### 场景：provision 退出码纪律
- Given 未投放产物；When `provision --check`；Then 退出码 = 2 且文案含"未投放"。

### 场景：exec 门禁拒绝 dlopen 形态产物
- Given 一个无 PT_INTERP 的 dlopen 库样本；When `provision --inspect <样本>`；
  Then ② 门禁失败，退出码 2。

### 场景：二进制不入库
- Given 投放后 `node-cli/src/main/jniLibs/arm64-v8a/libnode_cli.so` 存在；
  When `git status`；Then 该文件被忽略。

（对应逐条用例见 [test-cases.md](./test-cases.md)。）
