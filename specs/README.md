# 规格文档索引 —— `aosp-node-cli`

**项目名称：** `aosp-node-cli`（Maven 坐标 `io.github.fellow99:node-cli`）
**需求：** **000-scaffold 工程搭建**（模块化扩展：001/002/003/101 已按规划 §10.2 立项）· 规范文档存放目录：`specs/`
**制品版本：** `26.13.0`（**released**——CI run 41471561286 / GitHub Release `v26.13.0`，恒等于配对 Node 版本）
**技术栈：** Gradle 9.4.1 + AGP 9.2.1（AAR 容器，零 Kotlin/Java 源）+ vanniktech 0.37.0（Central 发布面）+ 纯 Node `.mjs` exec 型 ELF 门禁 + bash 交叉编译脚本（真实编译 ⬜ CI）
**文档生成时间：** 2026-11-02 · **最后更新：** 2026-11-02（模块 001/002/003/101 立项批次）

> **权威规划文档是 [`../docs/000-工程规划.md`](../docs/000-工程规划.md)（v2.1，§10.2 模块划分）。**
> 本目录是它的**收敛/展开版**：只做细化与验收，**不复制粘贴**，所有结论回引规划的 §/D/R 号，避免两份文档漂移。
> 新增平台/构建结论必须先写进规划文档，再回到这里引用（宪法 C8）。
> **as-built 纪律：** 本仓 M0 骨架已完成；`libnode_cli.so` 本体尚未构建（M1 CI）——凡 ⬜ 标记皆为规划或未实测，绝不当作既成事实引用。

---

## 一、文档总览

| 层级 | 分类 | 文档数量 | 说明 |
|---|---|---|---|
| 整体 | 项目级顶层文档 | 5 | `constitution.md` · `ARCHITECTURE.md` · `TECH.md` · `STRUCTURE.md` · `SPECS_CHECKLIST.md` |
| 整体 | 整体规格文档 | 3 | `overall-spec.md` · `overall-plan.md` · `overall-test-cases.md` |
| 模块 | 000-scaffold（骨架，✅ M0） | 4 | `spec.md` · `plan.md` · `tasks.md` · `test-cases.md` |
| 模块 | 001-building（构建本体，⬜ 本批） | 3 | `spec.md` · `plan.md` · `tasks.md` |
| 模块 | 002-building-workflow（流水线，⬜ 本批） | 3 | `spec.md` · `plan.md` · `tasks.md` |
| 模块 | 003-cli（node CLI 契约，⬜ 已立项） | 4 | `spec.md` · `plan.md` · `tasks.md` · `test-cases.md` |
| 模块 | 101-npm-integration（npm 集成契约，⬜ 已立项） | 4 | `spec.md` · `plan.md` · `tasks.md` · `test-cases.md` |
| 索引 | 本索引 | 1 | `README.md` |
| **合计** | **6 目录 / 27 文件** | | 模块目录 5 个，模块文档 18 份 |

> **刻意不生成** `API.md` / `overall-api.md`：本仓**不含任何嵌入 API / Kotlin / Java 源**，对外契约面是
> Maven 坐标 + AAR 内容物（jniLibs / assets / META-INF 元数据），见 [`overall-spec.md`](./overall-spec.md) §3 与
> [`000-scaffold/plan.md`](./000-scaffold/plan.md) §4/§5。
> **刻意不生成** `overall-data-model.md`：唯一数据实体是 [`../node-cli.lock.json`](../node-cli.lock.json)
> 与投放元数据，全字段模型见 [`000-scaffold/plan.md`](./000-scaffold/plan.md) §3 与 [`001-building/plan.md`](./001-building/plan.md) §3.1。

---

## 二、项目级顶层文档

全局性的架构、技术、宪法与结构文档，定义项目基线与开发准则。

| 文档 | 路径 | 说明 |
|---|---|---|
| **项目宪法** | [constitution.md](./constitution.md) | 8 条不可协商原则（C1 fetch 不改源 · C2 lock 唯一事实源 · C3 二进制不入库 · C4 门禁强制 · C5 同版本配对 · C6 发布卫生 · C7 未实测 ⬜ · C8 先改文档再改实现）+ 10 条工程规约（S1–S10）+ 证据纪律（✅/🔶/⬜/⚠️）+ 评审清单 + 变更流程 |
| **整体架构** | [ARCHITECTURE.md](./ARCHITECTURE.md) | 供给侧→消费方全景 ASCII 图（壳脚本/assets 物化均标注 ⬜ 规划）、exec 门禁层与 dlopen 门禁的**四处相反/差异**、与 node-runtime/node-pty 的同源配对关系图、D1–D8 决策的 as-built 落点对照、已知缺口 |
| **技术选型** | [TECH.md](./TECH.md) | 选型总表**含「已实现 vs 规划」状态列**、被否掉的方案 13 条（含与 pty 相反的打包口径）、版本矩阵、退出码契约、体积口径、命令速查 |
| **项目结构** | [STRUCTURE.md](./STRUCTURE.md) | 实际目录树（逐文件行数 ✅实测）、关键配置文件职责表、构建产物落点、目录↔FR 映射、不入库清单、结构层发现、「规划中存在、当前不存在」防误引用表 |
| **检查清单** | [SPECS_CHECKLIST.md](./SPECS_CHECKLIST.md) | 规格文档完成度追踪（项目级 + 模块级 ×5）+ 质量检查 + 未闭合项（模块归属标注） |

### 整体规格文档

跨模块的全局规格、方案与测试索引。

| 文档 | 路径 | 说明 |
|---|---|---|
| **整体规格** | [overall-spec.md](./overall-spec.md) | 技术无关的需求规格（RFC 2119）：目的、目标用户、五个能力面（F1–F5）、系统边界（B1–B5）、`FR-000-xxx` 全集、NFR、出口判据 A1–A7 |
| **整体方案** | [overall-plan.md](./overall-plan.md) | 技术上下文（含 🔶 沿用 runtime/pty 的结论）、宪法 C1–C8 逐条合规检查、里程碑 M0–M4 现状与依赖顺序、横切关注点、测试途径、两段式发布策略 + 发布前检查清单 |
| **测试用例索引** | [overall-test-cases.md](./overall-test-cases.md) | 五层测试分层（L1–L5）、TC-01~13 / TC-M1 / TC-PUB 族索引、模块用例段（001/002/003/101）、规划探针 P1–P10、**禁止的判据**、已知基线 |

---

## 三、模块文档

### 000 — 工程搭建 (`000-scaffold`) ✅ M0

> Gradle 多模块骨架（`:node-cli` AAR 容器 + `useLegacyPackaging=true` + `CLI_VERSION` 配对纪律）、
> 唯一事实源 `node-cli.lock.json`（draft）、exec 型七项门禁与投放工具 `tools/provision.mjs`、
> fetch/build 脚本骨架（接口固化 + exit 2）、配置期 CI、文档与许可。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [000-scaffold/spec.md](./000-scaffold/spec.md) | 技术无关：目的/范围/FR-000 摘要/验收场景 |
| 技术方案 | [000-scaffold/plan.md](./000-scaffold/plan.md) | as-built：技术上下文、宪法合规、lock JSON 数据模型（含 ⚠️ 三项发现）、provision CLI 与退出码契约、Gradle/发布面策略、CI 与 ⚠️ `-e` 缺陷、文件清单、FR 交叉引用全表、未实现清单（已标注模块归属） |
| 任务拆解 | [000-scaffold/tasks.md](./000-scaffold/tasks.md) | T1–T8 任务清单（M0 全部勾选） |
| 测试用例 | [000-scaffold/test-cases.md](./000-scaffold/test-cases.md) | TC-01~13 + 执行记录（TC-01~12 ✅，TC-13 ⬜ 待 M1 样本） |

### 001 — 构建（building）`001-building` ⬜ 本批立项

> 构建本体：node tar.xz fetch + SHASUMS256 校验；无 `--shared` configure + `--with-intl=none` +
> 16KB LDFLAGS；make + 形态校验 + strip 改名；npm/corepack 树收集/剪枝/manifest；三壳脚本生成；
> provision 扩展（`--assets`/`--shims`/兄弟白名单/壳五判据/assets 静态性）。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [001-building/spec.md](./001-building/spec.md) | FR-001-001…036（源获取/交叉编译/随包数据/投放门禁扩展四域） |
| 技术方案 | [001-building/plan.md](./001-building/plan.md) | 单源钉选、构建脚本十步、壳脚本模板、provision 扩展接口、lock 字段扩展、本地验证边界（Windows dry-run + 真实 fetch/⑦⑧⑨） |
| 任务拆解 | [001-building/tasks.md](./001-building/tasks.md) | T1 lock 扩展 / T2 fetch / T3 build / T4 provision / T5 验证登记 |

### 002 — 构建流水线（building-workflow）`002-building-workflow` ⬜ 本批立项

> CI 双 Job（config-check 保留 + build-android-arm64-v8a 真实流水线）、NDK r30 装机、16GB swap、
> 归档与 GitHub Release、lock 回写物、退出码断言缺陷修复。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [002-building-workflow/spec.md](./002-building-workflow/spec.md) | FR-002-001…009（单流水线/装机钉版/触发/断言修复/归档/Release/回写/缓存/卫生） |
| 技术方案 | [002-building-workflow/plan.md](./002-building-workflow/plan.md) | workflow 双 Job 结构图、断言修复模式、归档与 lock-writeback.mjs、缓存策略 |
| 任务拆解 | [002-building-workflow/tasks.md](./002-building-workflow/tasks.md) | T1 config-check 重排 / T2 真实流水线 / T3 回写物 / T4 缓存卫生 / T5 验证 |

### 003 — CLI（node 命令行）`003-cli` ⬜ 已立项（契约冻结）

> node CLI 产品契约：进程/身份/执行/环境/能力边界（Intl=none、Temporal）；探针 P1/P5/P8/P9/P10；
> **主测试用例正典 TC-003-01…21**（device 18 + host 3）。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [003-cli/spec.md](./003-cli/spec.md) | FR-003-001…014（进程身份/执行/运行环境能力三域） |
| 技术方案 | [003-cli/plan.md](./003-cli/plan.md) | 环境变量注入模板、探针映射、用例设计决策（host≠device 纪律） |
| 任务拆解 | [003-cli/tasks.md](./003-cli/tasks.md) | 契约冻结/用例正典/host 支撑/设备侧 M2 窗口 |
| 测试用例 | [003-cli/test-cases.md](./003-cli/test-cases.md) | **CLI 主用例正典**：版本/退出码/脚本/模块抽查/symlink/JIT/TLS/边界事实 + host 打包面 |

### 101 — npm 集成（npm-integration）`101-npm-integration` ⬜ 已立项（契约冻结）

> npm/npx/corepack 集成：JS 树随包物化、壳脚本直出（P2/P3/P4）、npm install 纯 JS 包（P6）、
> 原生构建包失败如实（P7）、`npm i -g` 边界事实、corepack 禁拉可执行件、`npm_config_*` 契约；
> **主测试用例正典 TC-101-01…22**（device 15 + host 7）。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [101-npm-integration/spec.md](./101-npm-integration/spec.md) | FR-101-001…014（命令直出/安装/配置边界三域） |
| 技术方案 | [101-npm-integration/plan.md](./101-npm-integration/plan.md) | npm_config_* 模板、五条设计决策（含 corepack 边界可执行判据）、BLOCKED 机制 |
| 任务拆解 | [101-npm-integration/tasks.md](./101-npm-integration/tasks.md) | 契约冻结/用例正典/host 支撑/设备侧 M2 窗口 |
| 测试用例 | [101-npm-integration/test-cases.md](./101-npm-integration/test-cases.md) | **npm 主用例正典**：直出/离线首启/安装链/边界链/corepack 边界 + host 树/壳/manifest/白名单 |

---

## 四、模块编号一览

| 编号 | 模块名 | 英文名 | 分类 | 规划出处 | 状态 |
|---|---|---|---|---|---|
| 000 | 工程搭建（scaffold） | 000-scaffold | 工程 | 规划 §10 M0 | ✅ M0 已完成 |
| 001 | 构建（building） | 001-building | 构建工程 | 规划 §10.2（M1-T1~T5） | ⬜ 本批立项（代码本批落地，编译验证 CI） |
| 002 | 构建流水线（building-workflow） | 002-building-workflow | 构建工程 | 规划 §10.2（M1-T6） | ⬜ 本批立项（workflow 代码本批落地） |
| 003 | CLI（node 命令行） | 003-cli | 产品契约 | 规划 §10.2（M1 产物 + M2-T2 部分） | ⬜ 已立项（契约+用例冻结） |
| 101 | npm 集成（npm-integration） | 101-npm-integration | 设备侧集成 | 规划 §10.2（M1-T4/T5 部分 + M2-T2 部分） | ⬜ 已立项（契约+用例冻结） |

> 编号约定：`0NN` = 构建工程/产品域（000–003），`1NN` = 设备侧集成域（101 起）。
> v2.0 期「只有 000 一个需求编号、不预设 001+ 目录」的口径已由规划 v2.1 §10.2 取代——
> 模块先在规划登记、后开目录（C8 闭环）；M1/M2 增量不再挤占 FR-000 编号段。

---

## 五、模块文档结构规范

每个模块目录 `NNN-<name>/` 下**必须成对**提供以下两份文档：

| 文件 | 命名 | 说明 |
|---|---|---|
| 功能规格 | `spec.md` | **技术无关**：模块目的、范围边界、用户故事、功能需求（`FR-0NN-*`，RFC 2119）、验收场景（Given/When/Then） |
| 技术方案 | `plan.md` | **实现特定**：技术上下文与版本、宪法合规检查、数据模型、CLI/接口契约、实现策略、测试考虑、文件清单（**真实行数**）、FR 交叉引用、未实现清单 |

复杂模块可再追加：`tasks.md`（任务拆解）、`test-cases.md`（模块级用例与执行记录）。

**三条纪律**：

1. `spec.md` 写「做什么、验收判据是什么」；`plan.md` 写「怎么做」。两份都**回引** `docs/000-工程规划.md` 的 §/D 号。
2. `spec.md`/`overall-spec.md` 正文不出现框架名与文件路径；`plan.md` 不出现没有源码依据的断言。
3. as-built 与 planned 必须逐条区分：未实现的写 `⬜ 规划（M1-Tx）`，**不得**把规划当既成事实（宪法 C7）。

---

## 六、快速导航

| 目标读者 | 推荐阅读顺序 |
|---|---|
| **新加入开发者** | `constitution.md` → `STRUCTURE.md` → `overall-spec.md` → `000-scaffold/spec.md` |
| **架构师 / Tech Lead** | `ARCHITECTURE.md` → `TECH.md` → `overall-plan.md` → 规划 §3.1 决策表（D1–D8） |
| **构建/流水线实现者（M1）** | `001-building/plan.md` → `002-building-workflow/plan.md` → 规划 §4/§6/§9 → 各自 `tasks.md` → `overall-test-cases.md` §2.5 |
| **消费方（接入 AAR）** | 仓库根 [`README_zh.md`](../README_zh.md)（或 [README.md](../README.md)）→ `overall-spec.md` §3.3 边界 → `ARCHITECTURE.md` §③ → `003-cli/plan.md` §3（env 模板） |
| **测试 / QA** | `overall-test-cases.md` → `003-cli/test-cases.md` → `101-npm-integration/test-cases.md` → `000-scaffold/test-cases.md` → `SPECS_CHECKLIST.md` §五 |
| **合规 / 发布** | `constitution.md` C6 → `overall-plan.md` §6 → 规划 §10.1/§12 |

### 快照命令（先看证据，再看结论）

```bash
node tools/provision.mjs --check            # 校验已投放产物（未投放 ⇒ exit 2；M0 期的预期值）
node tools/provision.mjs --inspect <so>     # 打印任意候选二进制的 exec 七项门禁报告
gradle :node-cli:tasks --console=plain      # 配置期门禁（无 .so 必须通过）
gradle :node-cli:assembleDebug              # AAR 容器产物（M0 期为 786 B 空容器）
# ⬜ M1 后可用：
node scripts/fetch-node-cli-source.mjs --node 26.13.0 --out .dist/src
bash scripts/build-node-cli-android.sh --node 26.13.0 --api 24 \
  --src .dist/src/node-src --ndk "$ANDROID_NDK_HOME" --out build/out [--dry-run]
node tools/provision.mjs --out node-cli/src/main/jniLibs --from build/out/libnode_cli.so
node tools/provision.mjs --shims build/out
node tools/provision.mjs --assets build/out
```

---

**文档维护者：** `aosp-node-cli` 开发团队 · **权威来源：** [`../docs/000-工程规划.md`](../docs/000-工程规划.md)（v2.1）
