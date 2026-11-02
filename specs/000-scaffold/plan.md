# 000-scaffold — 模块技术方案（plan.md，as-built）

> **模块**：000-scaffold 工程搭建（M0 骨架：Gradle 骨架 + exec 门禁 provision + draft lock + 骨架脚本 + 配置期 CI + 文档/许可）
> **性质**：**实现特定**的技术方案（真实路径、真实行数、数据模型、CLI 契约、测试考虑）；「要什么」见同目录 [spec.md](./spec.md)，需求全景见 [../overall-spec.md](../overall-spec.md)。
> **依据**：`specs/constitution.md`（C1–C8 / S1–S10）· `docs/000-工程规划.md`（唯一权威，下称「规划 §」：§3.1 决策 / §5 制品 / §6 门禁 / §8 lock / §9 CI / §10 里程碑）· 本仓库源码 ✅逐行实测（2026-11-02 快照，行号即当前行号）。
> **标记**：✅已实现 / 🔶沿用（aosp-node-runtime / aosp-node-pty 同型结论）/ ⬜规划未实现（标里程碑）/ ⚠️冲突或风险。
> **版本**：v1.0 · 2026-11-02 · 状态：**M0 已完成**；本文件补齐原「plan 并入规划」折叠口径下的 as-built 技术方案（spec.md 头注已同步更新）。

---

## 1. 技术上下文

### 1.1 运行环境与依赖

| 项 | 值 | 证据 |
|---|---|---|
| Gradle | **9.4.1**（CI 钉版；仓库无 wrapper） | `.github/workflows/build-node-cli-android.yml:29-32` ✅ |
| AGP | **9.2.1**（version catalog 唯一条目） | `gradle/libs.versions.toml:1-5` ✅ |
| JDK | Temurin **21** | workflow `:23-27` ✅ |
| 发布插件 | vanniktech **0.37.0**（id `com.vanniktech.maven.publish.base`，settings pluginManagement 加载） | `settings.gradle.kts:2-4` ✅ |
| 仓库依赖 | **0 个第三方库**（`node-cli/build.gradle.kts` 无 dependencies 块；`FAIL_ON_PROJECT_REPOS` 防私加仓库） | `settings.gradle.kts:12-18` ✅ |
| host 工具 | Node（provision/fetch，只用内置模块）+ bash（build 脚本/CI 语法门） | `provision.mjs:27-30` ✅ |
| 目标面 | `minSdk 24` · `compileSdk 36` · 仅 `arm64-v8a` | `node-cli/build.gradle.kts:29-34` ✅ |
| 配对 | `node-cli:26.13.0`（draft）↔ `node-runtime:26.13.0`（tag `v26.13.0`） | `node-cli.lock.json:3-18` ✅ |

### 1.2 零依赖选型（「一个 node 一个 bash 就能跑」）

`provision.mjs` 只 import `node:fs` / `node:path` / `node:crypto` / `node:url`（`provision.mjs:27-30`）；ELF 解析为**自研极简 ELF64 小端解析器**（`parseElf()`，`provision.mjs:58-130`：e_type/e_machine/PT 数量与内容/LOAD aligns/.dynamic 的 DT_NEEDED+SONAME）——不依赖 `llvm-readelf`/`file`/python，CI 与消费方机器零安装成本（🔶 与 aosp-node-pty/tools/provision.mjs 同一套解析纪律，`provision.mjs:8` 注释自述）。

---

## 2. 宪法合规检查（逐条）

| 原则 | 结论 | 依据 |
|---|---|---|
| **C1 fetch 不改源** | ✅ 接口层合规 | fetch 脚本头注「源码不改…只下载、解压、记录出处与 sha256」（`fetch-node-cli-source.mjs:8-9`）；实现 ⬜ M1-T1 |
| **C2 lock 唯一事实源** | ✅ 合规 | `LOCK_FILE='node-cli.lock.json'`（`provision.mjs:33`）；白名单从 lock 读（`:184`）；sha/size 期望值从 release 记录读（`:141-142`）；工具内无第二清单 |
| **C3 二进制不入库** | ✅ 合规 | `.gitignore:22-24` + 本机实测 TC-12（投放后 git status 干净） |
| **C4 门禁强制** | ✅ 合规 | 七项门禁硬失败（`:146-160`）；不过即拒绝投放（`:235-238`）；BANNED_IN_AAR 恒拒（`:38,246-250`）；`--allow-page-align-4k` 放行必须打印上架不合格警告（`:162-167`） |
| **C5 同版本配对** | ✅ 合规 | `CLI_VERSION` 三处同源（gradle.properties:9 → build.gradle.kts:15-16 → publish.gradle.kts:37-39）；lock `pairedRuntime` 记录坐标+tag；`NODE_*` 前缀显式规避（gradle.properties:5-6） |
| **C6 发布卫生** | ✅ 合规 | `RELEASE=false` 默认（gradle.properties:21）；sign/Central 任务被 `releaseEnabled && portalTokenReady` 门禁（`publish.gradle.kts:133-139`）；凭据仅用户级（`:13`） |
| **C7 未实测 ⬜** | ✅ 合规 | lock 保持 draft（size=0/sha256=""）；`builtFrom.ndk/flags` 如实 "TBD"；本 plan 一切产物级判据标 ⬜ |
| **C8 先改文档再改实现** | ✅ 合规 | 规划 v2.0 为唯一基线；本 specs 套件 + 本 plan 是其收敛层，未复制正文 |
| **S1–S10** | ✅（S10 为 M1 规划项除外） | 逐条见 `specs/constitution.md` §二；S10（随包树 manifest/壳白名单）⬜ M1-T4/T5 |

---

## 3. lock JSON 数据模型（`node-cli.lock.json`，56 行 ✅）

### 3.1 现行字段（as-built）

| 字段 | 类型 | 值（当前） | 消费方 | 说明 |
|---|---|---|---|---|
| `$comment` | string | draft 纪律说明 | 人 | 声明「二进制不入库 + draft 占位 + 回写时机」 |
| `active.version` / `active.abi` | string | `26.13.0` / `arm64-v8a` | provision `:185-186`（默认选择） | 未显式传 `--version/--abi` 时的目标 |
| `releases[].version` / `.abi` | string | `26.13.0` / `arm64-v8a` | provision `:187`（选择器） | 不存在的组合 ⇒ `exit 1` 并列出可用组合（`:188-193`） |
| `releases[].androidApi` | number | 24 | （记录） | 与 `matrix.minSdk`、`minSdk 24` 三处一致 |
| `releases[].name` | string | `libnode_cli.so` | provision `:194`（缺省回落 `DEFAULT_BINARY`） | 唯一原生件名（D3） |
| `releases[].size` | number | **0** | provision `:142`（>0 才作为期望值） | **draft 占位**，不伪造（FR-000-011） |
| `releases[].sha256` | string | **""** | provision `:141`（64 位才作为期望值） | 同上 |
| `releases[].pairedRuntime.coordinates` / `.releaseTag` | string | `io.github.fellow99:node-runtime:26.13.0` / `v26.13.0` | provision `:196`（打印）· properties `paired.runtime`（`:263`） | 配对纪律载体（FR-000-013） |
| `releases[].builtFrom.source` | string | 描述级（tar.xz 来源 + 无 --shared 说明） | 人 | M1-T6 升格为 `sourceTar` 字段 ⬜ |
| `releases[].builtFrom.ndk` / `.flags` | string | **"TBD…"** | 人 | 首个 CI 实建钉版回写 ⬜（M1-T6） |
| `releases[].gates.*` | object | 七键全 `true` | **无代码读取** | ⚠️ 见 §3.3 |
| `releases[].mavenCentral.coordinates` / `.published` | string / bool | `io.github.fellow99:node-cli:26.13.0` / `false` | 人 | M3 后回写 true |
| `releases[].status` | string | `draft` | provision `:197`（打印 draft 提示） | `released` 为唯一其他合法值 |
| `matrix.minSdk` / `.abi` | number / string[] | 24 / `["arm64-v8a"]` | 人 | 与模块配置一致 |
| `matrix.allowedNeeded` | string[] | libc/libm/libdl/libz/**libc++_shared** | provision `:184`（**唯一被代码消费的矩阵字段**） | DT_NEEDED 门禁④ 白名单；`libc++_shared.so` 在依赖白名单但文件 BANNED_IN_AAR（D3 双面语义） |
| `matrix.execPackaging` / `.note` | string | useLegacyPackaging 说明 / 消费方配对纪律 | 人 | 文档化字段 |

### 3.2 v2.0 规划扩展字段（⬜ M1-T6 回写时落地，规划 §8）

`builtFrom.{sourceTar, ndk, flags, patch, npm{version,path,fileCount,sha256}, corepack{…}, shims[{name,sha256,size,entry}], assetsManifest{fileCount,totalSha256}}` · `matrix.shellShims[{name, entry}]`（壳白名单事实源，provision 只读不自带 ⬜ M1-T5）。

### 3.3 ⚠️ 数据模型层面发现的问题（评审必读）

1. **`gates` 七键当前全为 `true`，但 `status=draft` 且 sha/size 为空**：从代码看 `gates` **不被任何工具读取**（provision 只消费 `active`/`releases` 的版本/abi/name/status/sha/size/pairedRuntime 与 `matrix.allowedNeeded`）——它是「键集定义 + 预期结论」的**文档性占位**。风险：读者可能把 `sha256Match:true` 误读为「已实测一致」。处置建议：draft 阶段把布尔键改为 `null`（或在 `$comment` 里声明 draft 下 gates 无意义），M1-T6 回写真实结论；[NEEDS CLARIFICATION] `gates` 在 draft 语义下是否应置 `null`，需维护者拍板（涉及 lock schema 约定，本 plan 不代改）。
2. **provision 的投放不是幂等跳过而是覆盖拷贝**（`fs.copyFileSync`，`provision.mjs:244`）：与 ohos 仓 provision 的「已是最新则跳过」语义不同。当前每仓自述「同一套纪律」的注释（`provision.mjs:8`）指的是 ELF 解析与退出码纪律，不含幂等投放。幂等口径已在 overall-test-cases TC-M1-009 登记为 M1-T5 收敛项。
3. **`gradle.properties` 的 `VERSION_NAME=0.1.0`**：仓内无读取点；生效版本 = `CLI_VERSION`（coordinates + 反射双写）。其消费只可能发生在 vanniktech `pomFromGradleProperties` 内部 ⬜ 未核实——M1-T6/M3 发布前检查须断言 POM 版本 = 26.13.0（[NEEDS CLARIFICATION] `VERSION_NAME` 是否可删，取决于插件对缺失属性的行为）。

---

## 4. provision CLI 与退出码契约（`tools/provision.mjs`，276 行 ✅）

### 4.1 命令矩阵

| 命令 | 行为 | 落点 | 退出码 |
|---|---|---|---|
| `--check`（默认） | 读 `<ROOT>/node-cli/src/main/jniLibs/<abi>/<name>`：不存在 ⇒ 「未投放」；存在 ⇒ 七项门禁 + 兄弟文件规则（目录内其它 `.so` ⇒ 非法） | `:211-229` | 0 全过 / 2 |
| `--inspect <file>` | 对任意候选文件打印七项门禁报告（不写盘） | `:199-206` | 0 / 2 |
| `--out <dir> --from <file>` | 七项门禁全过才投放：mkdir -p `<out>/<abi>` → 覆盖拷贝为 `<name>` → BANNED_IN_AAR 存在性检查 → 写 `META-INF/node-cli.properties` | `:208,231-268` | 0 / 2（门禁拒绝）/ 1 |
| `--version <v> --abi <a>` | 显式选择 lock 条目；无该组合 ⇒ 列出可用组合后失败 | `:185-193` | 1 |
| `--allow-page-align-4k` | 仅把门禁⑦降级为通过，且必须打印「上架/16KB 设备不合格」警告 | `:162-167` | — |
| （异常路径） | 缺 lock / JSON 解析失败 / IO 错误 ⇒ stderr `[provision] 失败：…` | `:271-276` | 1 |

### 4.2 七项门禁语义（exec 型 profile，`gates()` `:132-169`）

| # | 判据 | 期望来源 | draft 行为 | 与 dlopen 库（pty/runtime）差异 |
|---|---|---|---|---|
| ① | `e_type === 3`（ET_DYN，PIE） | 固定 | 硬判 | 同 |
| ② | **PT_INTERP 恰 1 个且内容 === `/system/bin/linker64`** | 固定 | 硬判 | **相反**（dlopen 要求 0） |
| ③ | `e_machine === 183`（AArch64） | 固定 | 硬判 | 同（AArch64） |
| ④ | `DT_NEEDED` ⊆ `matrix.allowedNeeded` | lock | 硬判 | **差异**（dlopen 要求必须含 libnode.so） |
| ⑤ | SHA-256 === 锁值 | lock（64 位才生效） | **仅记录**（打印实测值） | 同 |
| ⑥ | size === 锁值 | lock（>0 才生效） | **仅记录** | 同 |
| ⑦ | min(LOAD p_align) ≥ 0x4000 | 固定 | 硬判（可被 4K 开关降级+警告） | 同（16KB 口径） |

无 NAPI 门禁（CLI 独立进程，`provision.mjs:14` 自述）——差异 ③/规划 §6。

### 4.3 输出与副作用契约

- 行前缀 `[provision] `（stdout，`say()` `:52-54`）；失败走 stderr（`:274`）。
- 投放副作用面（**完整清单**）：`<out>/<abi>/<name>` 一个文件 + `node-cli/src/main/resources/META-INF/node-cli.properties` 一个文件（`:252-267`；字段：`tool.version` / `abi` / `name` / `size` / `sha256` / `paired.runtime`（有 pairedRuntime 才写）/ `provisionedAt` ISO 时间）。`--check`/`--inspect` **零写盘**。
- ⚠️ properties 写入后**会入库**（resources/ 不在 .gitignore）——这是有意设计（AAR 携带版本元数据），但意味着「首次投放」会产生一个待提交文件，评审时需知晓（STRUCTURE §3 已登记）。

### 4.4 脚本骨架契约（fetch / build）

| 脚本 | 参数 | 现行为 | M1 目标行为（规划出处） |
|---|---|---|---|
| `fetch-node-cli-source.mjs`（58 行） | `--node <ver>`（必填）/ `--out <dir>`（默认 `.dist/src`）/ `--help` | 缺 `--node` ⇒ usage+1；其余 ⇒ SCAFFOLD 三行说明 + **exit 2**（`:42-54`） | tar.xz 下载 + SHASUMS256 校验 + 解压 `<out>/node-src/` + 出处记录（规划 §4.2 ②） |
| `build-node-cli-android.sh`（57 行，`set -euo pipefail`） | `--node --api(默认 24) --src --ndk --out`（全必填） | 缺参 ⇒ usage+1；齐参 ⇒ 计划回显 + **exit 2**（`:49-57`） | android_configure（无 --shared + intl=none）→ make → 16KB → strip → 改名 → BUILD-METADATA（规划 §4.2 ④–⑦；R1/R2/R3） |

两个脚本的头注释把 D2/D3/D7 的五条差异纪律写死在实现位置旁边——这是「接口已固化」的具体形态。

---

## 5. Gradle / 发布面实现策略（as-built）

| 关注点 | 实现 | 落点 |
|---|---|---|
| 插件加载 | vanniktech 经 settings pluginManagement（版本单点）；模块再 `id(...)` 引用 | `settings.gradle.kts:2-4` · `node-cli/build.gradle.kts:3` |
| 版本链 | `CLI_VERSION` 缺失即 error（不静默）→ `project.version` → `afterEvaluate` 反射 `setVersion` 双写 publication | `node-cli/build.gradle.kts:13-25` |
| 坐标 | `coordinates("io.github.fellow99", projectName, CLI_VERSION)` + `pomFromGradleProperties`（POM 元数据全走 gradle.properties） | `publish.gradle.kts:33-40` |
| Central 对接 | `publishToMavenCentral(false, NONE)`（默认人工在 Portal 点 Publish；`-PAUTOMATIC_RELEASE=true` 才 PUBLISHED）——反射调用以兼容插件 API | `publish.gradle.kts:42-56` |
| 组件形态 | `AndroidSingleVariantLibrary(release, SourcesJar, JavadocJar.None)` | `publish.gradle.kts:58-69` |
| 签名 | `signAllPublications`；`setRequired(release && tokenReady)`；keyData/keyRing 两路注入（keyRing 经 `gpg --export-secret-keys` 落临时文件再 `useInMemoryPgpKeys`，finally 清理） | `publish.gradle.kts:57,75-113` |
| POM SCM 补丁 | `generatePomFile*` 任务 `doLast` 补 `<url>`（Central 强制 `<scm><url>`）指向本仓 | `publish.gradle.kts:115-131` |
| 误发防护 | `signMaven*`/`publishToMavenCentral` 任务在 `!(RELEASE && tokenReady)` 时 `enabled=false` | `publish.gradle.kts:133-139` |
| exec 打包 | `packaging.jniLibs.useLegacyPackaging=true` + 反面注释（为何与 pty 相反） | `node-cli/build.gradle.kts:36-43` |

---

## 6. CI（scaffold 配置期）与 ⚠️ 已知缺陷

workflow `config-check`（ubuntu-24.04 / 20 min / `contents: read`）步骤链：

1. JDK 21 → Gradle 9.4.1（`:23-32`）；
2. `gradle :node-cli:tasks --console=plain`——无 `.so` 必须可配置（`:34-35`，FR-000-040）；
3. `node --check tools/provision.mjs` + `provision --check` 期望退出码 2（`:37-45`，FR-000-041）；
4. `node --check` fetch 脚本 + `bash -n` build 脚本（`:47-50`，FR-000-042）。

⚠️ **已知缺陷（本批 specs 发现）**：GitHub Actions `run` 步骤默认以 fail-fast shell（`bash -e`）执行，步骤 3 中 `node tools/provision.mjs --check` 以 2 退出时会**先终止 step**，`code=$?` 与 `-ne 2` 断言不会执行。后果：纪律仍有强制力（step 失败 = CI 红），但「预期 2」与「意外 1」不可区分，断言语义失效。修法（M1-T6 重写 CI 时落地）：

```yaml
- node tools/provision.mjs --check || code=$?
- if [ "$code" -ne 2 ]; then echo "..."; exit 1; fi
```

---

## 7. 文件清单（真实行数 ✅ 2026-11-02 实测）

| 文件 | 行数 | 内容 | 对应 FR |
|---|---|---|---|
| `settings.gradle.kts` | 21 | rootName / 单模块 / 插件管理 / 仓库管理 | FR-000-001 |
| `gradle.properties` | 21 | GROUP / CLI_VERSION / POM_* / RELEASE=false | FR-000-003 |
| `gradle.properties.local.example` | 8 | 用户级凭据模板 | （C6） |
| `gradle/libs.versions.toml` | 5 | AGP 9.2.1 | FR-000-002 |
| `node-cli/build.gradle.kts` | 44 | AAR 容器 + exec 打包 + 版本链 | FR-000-002/003/004/005 |
| `publish.gradle.kts` | 139 | 发布面 + 门禁 + SCM 补丁 | FR-000-003 延伸 |
| `node-cli.lock.json` | 56 | 唯一事实源（draft） | FR-000-010~013 |
| `tools/provision.mjs` | 276 | 七项门禁 + 投放 + 元数据 | FR-000-030~036 |
| `scripts/fetch-node-cli-source.mjs` | 58 | fetch 骨架（exit 2） | （接口固化，M1-T1） |
| `scripts/build-node-cli-android.sh` | 57 | build 骨架（exit 2） | （接口固化，M1-T2） |
| `.github/workflows/build-node-cli-android.yml` | 50 | 配置期 CI | FR-000-040~042 |
| `.gitignore` | 31 | 卫生清单 | （C3） |
| `README.md` / `README_zh.md` | 126 / 121 | 中英总览 | （文档面） |
| `node-cli/THIRD-PARTY-NOTICES.md` | 15 | 第三方许可清单 | （规划 §12） |
| `docs/000-工程规划.md` | 382 | 唯一规划基线 v2.0 | （C8） |

---

## 8. 与 FR-000-xxx 的交叉引用（实现落点 ⇄ 需求）

| FR | 需求（见 [spec.md](./spec.md) §3 / [../overall-spec.md](../overall-spec.md) §4） | 实现落点 | 状态 |
|---|---|---|---|
| FR-000-001 | rootName + 单模块 | `settings.gradle.kts:20-21` | ✅ |
| FR-000-002 | Android library 四项配置 | `node-cli/build.gradle.kts:27-35` + catalog | ✅ |
| FR-000-003 | 坐标/版本源/禁 NODE_ 前缀 | `gradle.properties:4-9` · `node-cli/build.gradle.kts:13-25` · `publish.gradle.kts:33-40` | ✅ |
| FR-000-004 | useLegacyPackaging=true | `node-cli/build.gradle.kts:36-43` | ✅ |
| FR-000-005 | 无 .so 可配置 | TC-01/TC-02 实测 + CI 步骤 2 | ✅ |
| FR-000-010 | lock 唯一事实源 | `node-cli.lock.json` + `provision.mjs:33,177-194` | ✅ |
| FR-000-011 | draft 不伪造哈希 | lock `:13-14,37` + `provision.mjs:141-142,156-159` | ✅ |
| FR-000-012 | exec 门禁键集 | lock `gates.*`（含 `ptInterpSystemLinker`/`neededWhitelist`，不含 `neededLibnode`/napi 键） | ✅（⚠️ 见 §3.3-1） |
| FR-000-013 | 配对 runtime 记录 | lock `:15-18` | ✅ |
| FR-000-030 | 七项门禁 + 硬失败 | `provision.mjs:132-169` | ✅ 工具 / ⬜ 真实样本 |
| FR-000-031 | PT_INTERP=linker64 形态门禁 | `provision.mjs:148-150` | ✅ 工具 / ⬜ TC-13 |
| FR-000-032 | 白名单 + 16KB 门禁 | `provision.mjs:153-155,160` | ✅ 工具 |
| FR-000-033 | 出处比对 + draft 明示 | `provision.mjs:156-159,197` | ✅（TC-06） |
| FR-000-034 | 唯一原生件投放 + 元数据 | `provision.mjs:240-245,252-267` | ✅ 逻辑 / ⬜ 首投（幂等口径 ⚠️ §3.3-2） |
| FR-000-035 | BANNED_IN_AAR + 兄弟规则 | `provision.mjs:38,221-225,246-250` | ✅ 逻辑 / ⬜ 实测（TC-M1-005） |
| FR-000-036 | META-INF 元数据 | `provision.mjs:252-267` | ✅ 逻辑 / ⬜ 首投 |
| FR-000-040 | CI 配置期门禁 | workflow `:34-35` | ✅ |
| FR-000-041 | CI 未投放=2 断言 | workflow `:37-45` | ⚠️ 断言受 `-e` 影响（§6） |
| FR-000-042 | CI 语法门 | workflow `:47-50` | ✅ |

---

## 9. 测试考虑（呼应 [test-cases.md](./test-cases.md) 与 [../overall-test-cases.md](../overall-test-cases.md)）

- L1 已执行：TC-01~12 全过（执行记录 2026-11-02）；TC-13（负样本）⬜ 待 M1 产出 dlopen 形态样本后补测。
- M1 补测族（TC-M1-001~009）与发布族（TC-PUB-001~004）已在 overall-test-cases §2.2/§2.3 预登记判据。
- **本模块新增的可立即执行验证**（不依赖产物）：① `provision --inspect` 对任意非 ELF 文件 ⇒ 门禁表 `parse` 行失败 + exit 2；② 锁里不存在的版本组合 `--version 99.0.0` ⇒ exit 1 + 可用组合清单；③ `--out` 缺 `--from` ⇒ exit 1 + 用法。三者均未入 TC 表（属工具鲁棒性快检，评审可随手跑）。

---

## 10. 未实现清单（M1 承接，不得当 as-built 引用）

| # | 项 | 里程碑 | 出口判据 |
|---|---|---|---|
| 1 | fetch 下载/解压/SHASUMS256 校验实现 | M1-T1 | `.dist/src` 可复现（TC-M1-001） |
| 2 | configure/make 试编 + patch 子集拍板 | M1-T2 | `out/Release/node`（R1/R2/R3 关闭） |
| 3 | strip + 改名 + 门禁正/负样本全绿 | M1-T3 | TC-M1-003/004 |
| 4 | npm/corepack 树收集/剪枝/manifest + 壳脚本生成 | M1-T4 | TC-M1-007/008 |
| 5 | provision 白名单扩展（`--assets`/`--shims`/兄弟二分类/壳五判据/assets 静态性）+ 幂等口径收敛 | M1-T5 | 规划 §6/§6.1 全过（TC-M1-009） |
| 6 | CI 真实流水线 + 修复 §6 ⚠️ 断言 + GitHub Release + lock 回写 released（含 gates 真实结论） | M1-T6 | TC-PUB-001/002 + G1/G2/G4 |
| 7 | README（中英）「AAR 内容」小节回写（壳脚本/manifest） | M1 文档项 | 与规划 §5 对齐（STRUCTURE §6-2） |
| 8 | `gates` draft 语义 / `VERSION_NAME` 消费核实（§3.3 两处 [NEEDS CLARIFICATION]） | M1-T6 发布前检查 | 维护者拍板 + TC-PUB-003 |

> **模块归属（2026-11-02 立项，规划 §10.2）**：#1–#5 → [`001-building`](../001-building/spec.md)；
> #6 → [`002-building-workflow`](../002-building-workflow/spec.md)（含 `-e` 断言修复）；
> #7 → 001 文档项（随 dev 执行）；#8 → 002 发布前检查。本清单条目不再在 000 内扩展。
