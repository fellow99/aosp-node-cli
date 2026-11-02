# overall-plan.md —— `io.github.fellow99:node-cli` 整体技术方案

> **性质**：项目级**实现计划**（怎么做、按什么顺序做、合规如何逐条对齐、跨切面怎么处理）。
> **上位约束**：`specs/constitution.md`（C1–C8 / S1–S10）· `docs/000-工程规划.md`（唯一权威，下称「规划 §」）。本文引用其 §/D/R 号，不复制其正文。
> **标记**：✅已实现 / 🔶沿用（aosp-node-runtime / aosp-node-pty 同型结论）/ ⬜未实测/规划 / ⚠️冲突或风险。行号均指 as-built 文件（2026-11-02 快照）。
> **版本**：v1.0 · 2026-11-02 · 状态：**M0 已完成**；M1/M2/M3/M4 按规划 §10 排期。

---

## 1. Technical Context

### 1.1 运行环境

| 项 | 值 | 证据 |
|---|---|---|
| 构建机（CI） | `ubuntu-24.04`，timeout 20 min（仅 config-check job；真实编译 job ⬜ 不设 timeout，规划 §9） | workflow `:18-19` ✅ |
| JDK / Gradle | Temurin **21** / **Gradle 9.4.1**（`gradle/actions/setup-gradle@v4`；仓库无 wrapper） | workflow `:23-32` ✅ |
| AGP / 发布插件 | **9.2.1**（version catalog）/ vanniktech **0.37.0**（settings pluginManagement） | `gradle/libs.versions.toml` · `settings.gradle.kts:3` ✅ |
| 目标 ABI / API | 仅 `arm64-v8a` / `minSdk 24` · `compileSdk 36` | `node-cli/build.gradle.kts:29-34` ✅ |
| 版本配对 | `node-cli:26.13.0` ↔ `node-runtime:26.13.0`（draft；首个真实 CI 构建后回写） | lock `:3-18` ✅ |
| 交叉编译 NDK | **r30（30.0.16248370，clang 21.0.0）**，对齐 runtime 线 | 规划 §4.1 ⬜（lock 现值 "TBD"） |
| Node 源 | `nodejs.org/dist/v26.13.0/node-v26.13.0.tar.xz` + 官方 SHASUMS256 校验链 | 规划 §4.1 ⬜（lock `builtFrom.source` 描述级） |
| host 工具链（M1） | build-essential（host 编 mksnapshot）、make、python3、xz、file、curl | 规划 §9 装机清单 ⬜ |

### 1.2 已就绪的工程事实（方案基石，全部一手 ✅）

| # | 事实 | 落点 |
|---|---|---|
| 1 | AAR 容器无 `.so` 可完整配置并产出 786 B 空容器（FR-000-005） | `node-cli/build/outputs/aar/node-cli-debug.aar`（TC-02 记录） |
| 2 | 版本链三处同源：`CLI_VERSION` → 模块 `project.version` → publication（反射双写） | `node-cli/build.gradle.kts:13-25` · `publish.gradle.kts:34-39` |
| 3 | 发布门禁默认关：`RELEASE=false` 或缺 Token ⇒ sign/Central 任务禁用 | `publish.gradle.kts:71-84,133-139` |
| 4 | exec 七项门禁 + 未投放语义 + 兄弟文件规则 + BANNED_IN_AAR 可工作 | `tools/provision.mjs:146-167,211-250` |
| 5 | 脚本骨架以 `exit 2` 表达 SCAFFOLD（接口已固化、实现属 M1） | `scripts/fetch-node-cli-source.mjs:54` · `scripts/build-node-cli-android.sh:57` |
| 6 | 配置期 CI 三段（配置期门禁 / 工具自检 / 语法门）就位 | `.github/workflows/build-node-cli-android.yml:34-50` |

### 1.3 🔶 沿用的同型工程结论（M1 必须自证）

| 结论 | 来源 | 本仓态度 |
|---|---|---|
| Node 26 / V8 14.6 需 clang≥19.1.0；r28 clang 19.0.1 编不过 `deps/v8/src/base/atomicops.h` | runtime workflow 实测 | 采纳 r30 线，但 M1-T2 首轮试编必须复证（R1） |
| V8 host snapshot 编译峰值可超 runner 16GB RAM ⇒ 16GB swapfile；冷编译「可数小时」⇒ 不设 timeout | runtime 实测教训（规划 §9） | 直接进 M1 CI 设计 |
| `android_configure.py` 固化继承 `--openssl-no-asm --cross-compiling` | runtime 同链路 | 作为 configure 基线假设，试编核验 |
| runtime 四件构建期补丁中「trap-handler / cpu-features / CC_host / temporal」预计仍需要 | 规划 §4.3 逐件评估 | ⬜ M1-T2 拍板；不复用 configure 注入 `--shared`（恰好相反） |

---

## 2. 宪法合规检查（逐条）

| 原则 | 判定 | 理由（含证据） | 待处置 |
|---|---|---|---|
| **C1 fetch 不改源** | ✅ 符合（接口层） | fetch 脚本契约明文「源码不改」✅（`fetch-node-cli-source.mjs:8-9`）；补丁后置+记录纪律已写进 lock 字段设计 ⬜ M1 | M1-T1 实现下载/校验；M1-T2 拍板补丁子集并记录 |
| **C2 lock 唯一事实源** | ✅ 符合 | provision 只读 lock（版本/ABI 选择 `:185-193`、白名单 `:184`、sha/size 期望值 `:141-142`）；工具不自带清单；draft 不伪造哈希（lock `:13-14`） | M1-T6 回写 released 事实；壳脚本白名单进 `matrix.shellShims` ⬜ |
| **C3 二进制不入库** | ✅ 符合 | `.gitignore:22-28` 覆盖 jniLibs .so / assets / .dist / build/out；README 明文「从不手工构建」 | 保持；评审时核对无新增忽略逃逸 |
| **C4 门禁强制** | ✅ 符合 | 七项门禁硬失败（`provision.mjs:146-160`）；门禁不过拒绝投放（`:235-238`）；BANNED_IN_AAR 恒拒（`:246-250`）；唯一放行开关带强制警告（`:162-167`） | 真实产物 + 负样本补测 ⬜（TC-13）；M1-T5 扩展白名单时沿用同一纪律 |
| **C5 同版本配对** | ✅ 符合 | `CLI_VERSION` 恒等配对版本（`gradle.properties:4-9`）；lock 记录 pairedRuntime 坐标+tag（`:15-18`）；`NODE_*` 前缀被显式规避 | runtime 升版触发本仓重编的跟随机制属 M4 ⬜ |
| **C6 发布卫生** | ✅ 符合 | `RELEASE=false` 默认；Token/GPG 仅用户级；发布/签名任务在缺凭据时禁用（`publish.gradle.kts:133-139`） | M3 首发时按 runbook 走 §2/§4/§5/§6 |
| **C7 未实测 ⬜** | ✅ 符合 | 全部 specs 与规划以 ⬜ 标注未实测项；本批 specs 未把任何产物预估（60–90MB、NDK r30 实钉）写成事实 | 持续：M1 后回填事实并翻转标记 |
| **C8 先改文档再改实现** | ✅ 符合 | 规划 v2.0 文件头明文为唯一基线；实现偏差随里程碑回写规划 | 保持；本 specs 套件即为该纪律的展开 |

**结论**：0 条违背（C1–C8 无 ❌）；⚠️ 两项待收敛见 §4.1。

---

## 3. 实现策略总览（里程碑 ↔ 现状）

| 里程碑 | 目标 | 现状 | 出口判据 |
|---|---|---|---|
| **M0 骨架** | Gradle 骨架、exec 门禁 provision、draft lock、骨架脚本、配置期 CI | ✅ **已完成**（含 specs 本批收口） | FR-000-001~005/010~013/030~036/040~042 |
| **M1-T1** | fetch 完整实现（tar.xz + SHASUMS256 校验 + 出处记录） | ⬜ 接口已固化（exit 2） | `.dist/src` 可复现 |
| **M1-T2** | configure/make 首轮试编：**裸 configure 先通**，再按规划 §4.3 拍板 patch 子集与参数注入方式 | ⬜ | `out/Release/node` 产出（R1/R2/R3 关闭） |
| **M1-T3** | strip + 改名 + `provision --inspect` 门禁全过 | ⬜ | 门禁 ①–⑦ 全绿（含 TC-13 负样本） |
| **M1-T4** | npm/corepack 树收集/剪枝/manifest + 壳脚本模板生成 | ⬜ | 规划 §4.2 ⑧⑨ |
| **M1-T5** | provision 白名单扩展（`--assets`/`--shims`/兄弟文件二分类/壳五判据/assets 静态性） | ⬜ | 规划 §6/§6.1 门禁全过 |
| **M1-T6** | CI 真实流水线替换 scaffold + GitHub Release + lock 回写 released | ⬜ | G1/G2/G4（规划 §10） |
| **M2** | 环境引导层接入探针 App + 真机回程探针 P1–P10 | ⬜ | G3（规划 §7.1） |
| **M3** | Maven Central 首发 + lock `published=true` | ⬜ 管线就绪 | A7（overall-spec §6） |
| **M4** | runtime 升版跟随 + lock 回写自动化评估 | ⬜ | 规划 §10 |

**依赖顺序（不可并行者）**：M1-T1 → M1-T2（试编）→ M1-T3（strip/门禁）→ M1-T4（树/壳）→ M1-T5（门禁扩展）→ M1-T6（CI/Release/回写）；M2 依赖 M1-T6 的归档产物；M3 依赖 M1-T6 与发布前检查。

---

## 4. 跨切面关注点

### 4.1 错误处理与失败语义

| 层 | 策略 | 依据 |
|---|---|---|
| provision | 三档退出码 0/2/1；错误走 stderr 并带 `[provision]` 前缀；未捕获异常统一 `exit 1`（`:271-276`） | S2/S8 ✅ |
| 脚本骨架 | SCAFFOLD ⇒ `exit 2` + 「在 M1 实现」明示；用法错误 ⇒ `exit 1` + usage | fetch `:42-54` · build `:36-57` ✅ |
| Gradle | 版本属性缺失 ⇒ 配置期**立即 error**（不静默默认）（`node-cli/build.gradle.kts:15-16`、`publish.gradle.kts:37-38`） | FR-000-003 ✅ |
| CI | ⚠️ **本批新发现**：workflow `:41-45` 期望捕获 `--check` 的退出码 2，但 GitHub Actions run 步骤默认以 fail-fast shell 执行，`exit 2` 会先于 `code=$?` 终止该 step ⇒ 断言分支疑似死代码，纪律实际靠 step 失败兜底（退化：无法区分「预期 2」与「意外 1」）。**修法**：`node tools/provision.mjs --check \|\| code=$?`（M1-T6 重写 CI 时落地，属规格允许的仓内修正） | FR-000-041 ⚠️ |
| 发布面 | 误发布防护：`RELEASE`/Token 双条件 + 签名 required 动态化（`publish.gradle.kts:71-84`） | C6 ✅ |

### 4.2 卫生与供应链

| 关注点 | 做法 | 现状 |
|---|---|---|
| 二进制不入库 | `.gitignore` 四类忽略（jniLibs .so / assets / .dist / build/out）+ CI 唯一产出通道 | ✅ C3 |
| 源出处 | SHASUMS256 官方链 + `lock.builtFrom.sourceTar`（M1 回写） | ⬜ C1 |
| 工具链出处 | `lock.builtFrom.ndk`（r30 实钉）+ `builtFrom.flags` | ⬜（现值 "TBD"，如实 draft） |
| 构建期补丁 | 幂等 + 逐条记录 `builtFrom.patch`；无补丁记 `"none"` | ⬜ M1-T2 |
| 随包树出处 | `manifest.json` 逐文件 sha256 + 总 sha256；壳脚本 sha/size 入 lock | ⬜ M1-T4/T6 |
| 凭据 | 仅用户级 `~/.gradle/gradle.properties`；仓库只留模板 | ✅ C6 |

### 4.3 体积与性能口径

- 产物预估 **60–90 MB**（strip 后、intl=none）——⬜ 规划口径，首产实测回填 lock.size（R4）；消费方可用 Play 动态特性模块缓解。
- 16KB 页对齐是上架硬判据：构建侧 `-Wl,-z,max-page-size=16384`（⬜ 注入口 M1 拍板）+ 校验侧门禁⑦（✅ `min LOAD align >= 0x4000`）双保险。
- V8 host snapshot 内存峰值 ⇒ CI 16GB swapfile（🔶 runtime 教训）；冷编译不设 timeout（规划 §9）。

### 4.4 与配对制品的边界

| 面 | 本仓 | runtime | pty |
|---|---|---|---|
| 产物形态 | exec 可执行（改名 `libnode_cli.so`） | dlopen 引擎（`libnode.so`） | dlopen 终端库 |
| PT_INTERP | = `/system/bin/linker64`（门禁②） | = 0 | = 0 |
| libc++_shared | **不随包**（BANNED_IN_AAR），运行期由 runtime 供给 | 随包 | — |
| 版本 | `CLI_VERSION` = `<node>` | `<node>` | `<node>` |
| 消费方依赖 | 三件 `runtimeOnly` 同版声明（README 用法节） | — | — |

---

## 5. 测试途径（详见 overall-test-cases.md）

| 层 | 内容 | 需要产物? | 现状 |
|---|---|---|---|
| L1 配置期/工具门禁（host） | Gradle 配置、provision 语法与退出码、脚本语法、二进制不入库 | 否 | ✅ TC-01~12 已执行（2026-11-02 记录） |
| L2 构建门禁（M1） | fetch 校验链、试编产物 file/readelf、七项门禁正反样本、树 manifest、壳校验 | 是 | ⬜ M1-T1~T5 |
| L3 归档自洽（M1-T6） | Release 归档哈希、lock 回写 released 字段核对 | 是 | ⬜ |
| L4 真机回程（M2） | 探针 P1–P10（含 P6 纯 JS 包正例 / P7 原生构建包如实失败 / P9 JIT 计时） | 是 | ⬜ |
| L5 发布核验（M3） | `publishToMavenLocal` 结构断言 → Portal 上传 → 坐标解析 → lock 回写 | 是 | ⬜ |

**判据纪律**：每条判据必须可证伪；「AAR 构建成功」「`--check` 全过」都不是「CLI 可用」的判据——后者只能是真机回程（L4）。

---

## 6. 发布策略（两段式，规划 §10.1）

### 6.1 第一段：GitHub Release（⬜ M1-T6）

| 项 | 设计 |
|---|---|
| 触发 | push tag `v<nodever>`（如 `v26.13.0`）或 workflow_dispatch（inputs：node_version / android_api）；permissions `contents: write` |
| 归档 | `node-cli-v<ver>-android-arm64-v8a.tar.gz`（libnode_cli.so + 三壳脚本 + npm/corepack 树 + manifest + BUILD/FETCH-METADATA + LICENSES）+ `.sha256` |
| 事实回写 | lock `status=released` + size/sha256/ndk/flags/树摘要（M4 评估自动化；当前人工） |

### 6.2 第二段：Maven Central（⬜ M3；管线 ✅ 就绪）

| 项 | 设计 | 落点 |
|---|---|---|
| 凭据 | Central Portal Token + GPG，仅用户级 `~/.gradle/gradle.properties`（模板 `gradle.properties.local.example`） | C6 ✅ |
| 发布前检查 | 二进制就位 / 版本三处对齐（lock / `CLI_VERSION` / coordinates）/ `publishToMavenLocal` 结构断言（含 POM 版本 = `CLI_VERSION` ⚠️ 核实 `VERSION_NAME` 不回写，TECH §5-6） | 规划 §10.1 |
| 上传 | `gradle :node-cli:publishToMavenCentral -PCLI_VERSION=26.13.0 -PRELEASE=true` → Portal 点 Publish（`AUTOMATIC_RELEASE=true` 才自动） | `publish.gradle.kts:42-56` |
| 核验 | 坐标可解析 → lock `mavenCentral.published=true` 回填 | 规划 §10.1 |

### 6.3 发布前最终检查清单

- [ ] `provision --check` 全过（七项门禁；released 后 sha/size 严格比对）
- [ ] 门禁负样本（dlopen 形态产物）被判死（TC-13）
- [ ] jniLibs 内仅 `libnode_cli.so`（兄弟文件规则 / M1-T5 后含壳白名单）
- [ ] assets manifest 校验过（逐文件 sha256 自洽；树内无 ELF magic）
- [ ] lock 事实回写齐备（`status=released`、ndk/flags/patch/树摘要）
- [ ] THIRD-PARTY-NOTICES 随归档分发（G4 口径）
- [ ] 仓库内无凭据材料；`RELEASE=false` 恢复默认
