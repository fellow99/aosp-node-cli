# 规格文档索引 —— `aosp-node-cli`

**项目名称：** `aosp-node-cli`（Maven 坐标 `io.github.fellow99:node-cli`）
**需求：** **000-scaffold 工程搭建** · 规范文档存放目录：`specs/`
**制品版本：** `26.13.0`（**draft**，恒等于配对 Node 版本；M1 首个真实 CI 构建后回写事实）
**技术栈：** Gradle 9.4.1 + AGP 9.2.1（AAR 容器，零 Kotlin/Java 源）+ vanniktech 0.37.0（Central 发布面）+ 纯 Node `.mjs` exec 型 ELF 门禁 + bash 交叉编译脚本（M1 实现 ⬜）
**文档生成时间：** 2026-11-02 · **最后更新：** 2026-11-02

> **权威规划文档是 [`../docs/000-工程规划.md`](../docs/000-工程规划.md)（v2.0）。**
> 本目录是它的**收敛/展开版**：只做细化与验收，**不复制粘贴**，所有结论回引规划的 §/D/R 号，避免两份文档漂移。
> 新增平台/构建结论必须先写进规划文档，再回到这里引用（宪法 C8）。
> **as-built 纪律：** 本仓 M0 骨架已完成；`libnode_cli.so` 本体尚未构建（M1）——凡 ⬜ 标记皆为规划或未实测，绝不当作既成事实引用。

---

## 一、文档总览

| 层级 | 分类 | 文档数量 | 说明 |
|---|---|---|---|
| 整体 | 项目级顶层文档 | 5 | `constitution.md` · `ARCHITECTURE.md` · `TECH.md` · `STRUCTURE.md` · `SPECS_CHECKLIST.md` |
| 整体 | 整体规格文档 | 3 | `overall-spec.md` · `overall-plan.md` · `overall-test-cases.md` |
| 模块 | 000-scaffold（唯一在册需求） | 4 | `spec.md` · `plan.md` · `tasks.md` · `test-cases.md` |
| 索引 | 本索引 | 1 | `README.md` |
| **合计** | **2 目录（`specs/` 与 `specs/000-scaffold/`）/ 13 文件** | | 模块目录 1 个，模块文档 4 份 |

> **刻意不生成** `API.md` / `overall-api.md`：本仓**不含任何嵌入 API / Kotlin / Java 源**，对外契约面是
> Maven 坐标 + AAR 内容物（jniLibs / assets / META-INF 元数据），见 [`overall-spec.md`](./overall-spec.md) §3 与
> [`000-scaffold/plan.md`](./000-scaffold/plan.md) §4/§5。
> **刻意不生成** `overall-data-model.md`：唯一数据实体是 [`../node-cli.lock.json`](../node-cli.lock.json)（56 行）与
> 投放元数据（7 字段），全字段模型见 [`000-scaffold/plan.md`](./000-scaffold/plan.md) §3。

---

## 二、项目级顶层文档

全局性的架构、技术、宪法与结构文档，定义项目基线与开发准则。

| 文档 | 路径 | 说明 |
|---|---|---|
| **项目宪法** | [constitution.md](./constitution.md) | 8 条不可协商原则（C1 fetch 不改源 · C2 lock 唯一事实源 · C3 二进制不入库 · C4 门禁强制 · C5 同版本配对 · C6 发布卫生 · C7 未实测 ⬜ · C8 先改文档再改实现）+ 10 条工程规约（S1–S10）+ 证据纪律（✅/🔶/⬜/⚠️）+ 评审清单 + 变更流程 |
| **整体架构** | [ARCHITECTURE.md](./ARCHITECTURE.md) | 供给侧→消费方全景 ASCII 图（壳脚本/assets 物化均标注 ⬜ 规划）、exec 门禁层与 dlopen 门禁的**四处相反/差异**、与 node-runtime/node-pty 的同源配对关系图、D1–D8 决策的 as-built 落点对照、已知缺口 |
| **技术选型** | [TECH.md](./TECH.md) | 选型总表**含「已实现 vs 规划」状态列**（Gradle 9.4.1 / AGP 9.2.1 / vanniktech 0.37.0 / 纯 Node 门禁 ✅；NDK r30、无 `--shared`、`--with-intl=none` 有意分歧、16KB LDFLAGS ⬜ 规划）、被否掉的方案 13 条（含与 pty 相反的打包口径）、版本矩阵、退出码契约、体积口径、命令速查 |
| **项目结构** | [STRUCTURE.md](./STRUCTURE.md) | 实际目录树（逐文件行数 ✅实测）、关键配置文件职责表、构建产物落点（786 B 空容器实测）、目录↔FR 映射、不入库清单、结构层 4 项发现（含 CI `-e` 与 `VERSION_NAME` ⚠️）、「规划中存在、当前不存在」防误引用表 |
| **检查清单** | [SPECS_CHECKLIST.md](./SPECS_CHECKLIST.md) | 规格文档完成度追踪（项目级 + 模块级）+ 质量检查 + 未闭合项（M1–M3 承接清单） |

### 整体规格文档

跨模块的全局规格、方案与测试索引。

| 文档 | 路径 | 说明 |
|---|---|---|
| **整体规格** | [overall-spec.md](./overall-spec.md) | 技术无关的需求规格（RFC 2119）：目的、目标用户、五个能力面（F1–F5）、系统边界（**B1 设备无编译器 / B2 npm 原生包不可装 / B3 npm -g 不可 exec / B4 corepack 禁拉可执行件 / B5 Intl 不可用**）、`FR-000-xxx` 沿用展开 + 050~052 规划预留、NFR、出口判据 A1–A7 |
| **整体方案** | [overall-plan.md](./overall-plan.md) | 技术上下文（含 🔶 沿用 runtime/pty 的结论）、宪法 C1–C8 逐条合规检查、里程碑 M0–M4 现状与依赖顺序、横切关注点（失败语义/卫生供应链/体积/配对边界）、测试途径、两段式发布策略 + 发布前检查清单 |
| **测试用例索引** | [overall-test-cases.md](./overall-test-cases.md) | 五层测试分层（L1 配置期/L2 构建门禁/L3 归档/L4 真机回程/L5 发布核验）、TC-01~13 与 TC-M1/TC-PUB 族索引、规划探针 P1–P10、**禁止的判据** 6 条、已知基线（2026-11-02 快照） |

---

## 三、模块 000-scaffold（工程搭建）

### 000 — 工程搭建 (`000-scaffold`)

> M0 骨架：Gradle 多模块骨架（`:node-cli` AAR 容器 + `useLegacyPackaging=true` + `CLI_VERSION` 配对纪律）、
> 唯一事实源 `node-cli.lock.json`（draft）、exec 型七项门禁与投放工具 `tools/provision.mjs`、
> fetch/build 脚本骨架（接口固化 + exit 2）、配置期 CI、文档与许可。
> **M1（交叉编译 libnode_cli.so / npm 壳脚本打入 / 白名单扩展 / 真实流水线）为规划引用，逐条标 ⬜。**

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [000-scaffold/spec.md](./000-scaffold/spec.md) | 技术无关：目的/范围/FR-000 摘要/验收场景（2026-11-02 更新头注指向 plan.md） |
| 技术方案 | [000-scaffold/plan.md](./000-scaffold/plan.md) | **本批新增 as-built**：技术上下文、宪法合规、lock JSON 数据模型（含 ⚠️ gates/幂等/VERSION_NAME 三项发现）、provision CLI 与退出码契约、Gradle/发布面策略、CI 与 ⚠️ `-e` 缺陷、文件清单（真实行数）、FR 交叉引用全表 |
| 任务拆解 | [000-scaffold/tasks.md](./000-scaffold/tasks.md) | T1–T8 任务清单（M0 全部勾选） |
| 测试用例 | [000-scaffold/test-cases.md](./000-scaffold/test-cases.md) | TC-01~13 + 执行记录（2026-11-02：TC-01~12 ✅，TC-13 ⬜ 待 M1 样本） |

---

## 四、模块编号一览

| 编号 | 模块名 | 英文名 | 分类 | 规划出处 | 状态 |
|---|---|---|---|---|---|
| 000 | 工程搭建（scaffold） | 000-scaffold | 工程 | 规划 §10 M0 | ✅ M0 已完成（本目录四件套） |
| — | （M1–M4 工作项） | — | 构建/真机/发布 | 规划 §10 | ⬜ 仍归属 000 需求编号体系（FR-000-050+、TC-M1/TC-PUB 预登记）；如需拆分新编号，先改规划再开目录（C8） |

> 本仓与 ohos 仓不同：**只有 000 一个需求编号**，M1–M4 的增量在 `000-scaffold` 的 FR/TC 编号段内扩展，
> 不预设 001+ 目录——避免「目录存在、规划未定」的漂移。

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
| **构建/流水线实现者（M1）** | `000-scaffold/plan.md` §4/§6 → 规划 §4/§6/§9 → `000-scaffold/tasks.md` → `overall-test-cases.md` §2.2 |
| **消费方（接入 AAR）** | 仓库根 [`README_zh.md`](../README_zh.md)（或 [README.md](../README.md)）→ `overall-spec.md` §3.3 边界 → `ARCHITECTURE.md` §③ |
| **测试 / QA** | `overall-test-cases.md` → `000-scaffold/test-cases.md` → `SPECS_CHECKLIST.md` §五 |
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
  --src .dist/src/node-src --ndk "$ANDROID_NDK_HOME" --out build/out
node tools/provision.mjs --out node-cli/src/main/jniLibs --from build/out/libnode_cli.so
```

---

**文档维护者：** `aosp-node-cli` 开发团队 · **权威来源：** [`../docs/000-工程规划.md`](../docs/000-工程规划.md)（v2.0）
