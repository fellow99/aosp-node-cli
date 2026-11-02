# SPECS_CHECKLIST.md —— 规格文档完成度追踪

> 工程：`aosp-node-cli`（`io.github.fellow99:node-cli`）· 需求：**000-scaffold 工程搭建**
> 规范文档存放目录：`specs/` · 生成日期：**2026-11-02**
> 权威规划文档：[`../docs/000-工程规划.md`](../docs/000-工程规划.md)（v2.0，**结论以它为准**）
>
> 状态口径：✅ 已完成 · ⚠️ 已完成但含未闭合项（见备注）· ⬜ 待生成

---

## 一、项目级文档

| # | 文档 | 路径 | 状态 | 说明 |
|---|---|---|---|---|
| P-01 | 项目宪法 | [constitution.md](./constitution.md) | ✅ | 8 条不可协商原则（C1 fetch 不改源 · C2 lock 唯一事实源 · C3 二进制不入库 · C4 门禁强制 · C5 同版本配对 · C6 发布卫生 · C7 未实测 ⬜ · C8 先改文档再改实现）+ 10 条工程规约（S1–S10）+ 证据纪律 + 评审清单 + 变更流程 |
| P-02 | 整体架构 | [ARCHITECTURE.md](./ARCHITECTURE.md) | ✅ | 制品/运行期全景 ASCII 图、门禁层与 dlopen 门禁的四处差异、与 runtime/pty 配对关系、D1–D8 as-built 落点对照、已知缺口（M1–M3） |
| P-03 | 技术选型 | [TECH.md](./TECH.md) | ✅ | 选型总表**含已实现 vs 规划状态列**（Gradle 9.4.1 / AGP 9.2.1 / vanniktech 0.37.0 / 纯 Node 门禁 / NDK r30+无 --shared+intl=none 为规划）、被否方案 13 条、版本矩阵、退出码契约、命令速查 |
| P-04 | 目录结构 | [STRUCTURE.md](./STRUCTURE.md) | ✅ | 实际目录树（逐文件行数）、关键配置表、产物落点、需求编号映射、不入库清单、结构层 4 项发现、规划中不存在路径防误引用表 |
| P-05 | 整体规格 | [overall-spec.md](./overall-spec.md) | ✅ | 技术无关：目的/用户故事/五个能力面/边界（设备无编译器、npm 原生包不可装等 B1–B5）/FR-000-001~042 沿用展开 + 050~052 规划预留 / NFR / 出口判据 A1–A7 |
| P-06 | 整体技术方案 | [overall-plan.md](./overall-plan.md) | ✅ | 技术上下文（含 🔶沿用结论）、宪法 C1–C8 逐条合规、里程碑 M0–M4 现状、横切关注点（⚠️ CI `-e` 缺陷 / VERSION_NAME ⚠️）、测试途径、两段式发布策略与检查清单 |
| P-07 | 测试用例索引 | [overall-test-cases.md](./overall-test-cases.md) | ✅ | 五层分层（L1–L5）、TC-01~13 / TC-M1 / TC-PUB / 探针 P1–P10 索引、禁止的判据 6 条、已知基线（2026-11-02 快照） |
| P-08 | 规格检查清单 | SPECS_CHECKLIST.md | ✅ | 本文件 |
| P-09 | 规格索引 | [README.md](./README.md) | ✅ | 最后生成：按实际产出扫描的文档总览与快速导航 |
| — | `API.md` / `overall-api.md` | — | ⛔ 刻意不生成 | 本仓**不含任何嵌入 API / Kotlin / Java 源**（AAR 容器）；对外契约面 = Maven 坐标 + AAR 内容物（jniLibs/assets/META-INF），已在 `overall-spec.md` §3、`ARCHITECTURE.md` §① 与 `000-scaffold/plan.md` §4/§5 承载 |
| — | `overall-data-model.md` | — | ⛔ 刻意不生成 | 本仓唯一数据实体是 `node-cli.lock.json`（56 行）与 `META-INF/node-cli.properties`（7 字段），规模不需要独立文档：全字段模型见 [`000-scaffold/plan.md`](./000-scaffold/plan.md) §3（含 v2.0 规划扩展字段） |

---

## 二、模块级文档

| # | 模块 | 目录 | spec.md | plan.md | tasks.md | test-cases.md | 状态 | 备注 |
|---|---|---|---|---|---|---|---|---|
| M-01 | 000-scaffold 工程搭建 | [`000-scaffold/`](./000-scaffold/) | ✅（既有，头注已更新） | ✅（既有，as-built；§10 未实现清单已标注模块归属） | ✅（既有） | ✅（既有，含执行记录） | ⚠️ | M0 全部落地（TC-01~12 ✅）；TC-13 负样本、全部产物级判据 ⬜ M1；FR-000-041 的 CI 断言 ⚠️（plan §6，修复归 002） |
| M-02 | 001-building 构建 | [`001-building/`](./001-building/) | ✅ **本批新增** | ✅ **本批新增** | ✅ **本批新增** | —（host 子集随 dev 执行，判据在 overall-test-cases TC-001-xx 段） | ⬜ 已立项 | FR-001-001…036；代码本批落地，交叉编译验证 ⬜ CI（规划 §10.2） |
| M-03 | 002-building-workflow 构建流水线 | [`002-building-workflow/`](./002-building-workflow/) | ✅ **本批新增** | ✅ **本批新增** | ✅ **本批新增** | —（静态验证随 dev 执行；跑批 ⬜） | ⬜ 已立项 | FR-002-001…009；workflow 代码本批落地，真实跑批 ⬜ 待 tag |
| M-04 | 003-cli node 命令行契约 | [`003-cli/`](./003-cli/) | ✅ **本批新增** | ✅ **本批新增** | ✅ **本批新增** | ✅ **本批新增**（TC-003-01…21 正典） | ⬜ 已立项 | FR-003-001…014；契约+用例冻结，设备侧执行 ⬜ CI 首产 + M2-T2 |
| M-05 | 101-npm-integration npm 集成契约 | [`101-npm-integration/`](./101-npm-integration/) | ✅ **本批新增** | ✅ **本批新增** | ✅ **本批新增** | ✅ **本批新增**（TC-101-01…22 正典） | ⬜ 已立项 | FR-101-001…014；契约+用例冻结，设备侧执行 ⬜ CI 首产 + M2-T2 |

**模块目录纪律**：每模块 `spec.md`（技术无关）与 `plan.md`（实现特定）必须成对；复杂模块可追加 `tasks.md` / `test-cases.md`。五模块全部成对齐备（000/003/101 四件套，001/002 三件套）。

---

## 三、生成顺序与依据

1. **先项目级、后模块级**：P-01…P-07 先行建立宪法/结构/术语与 FR 编号，模块 plan 再细化——避免引用不存在的文件。
2. **最后生成索引**：`README.md` 与本清单按**实际目录内容**扫描生成/更新，不预测结构。
3. **不复制粘贴**：所有结论回引 `docs/000-工程规划.md` 的 §/D/R 号；新增平台结论必须先落规划文档（宪法 C8）。
4. **证据标记**：每条非显然结论带 ✅ / 🔶 / ⬜ / ⚠️ 之一（口径见 `constitution.md` §三）；产物相关数字在 M1 首产前一律 ⬜。

---

## 四、质量检查

| 检查项 | 结果 |
|---|---|
| 每条结论可回溯到源码 `path:line` 或规划 §/D/R 号 | ✅ |
| 无占位内容（`TODO` / `TBD` / 「待补充」）；lock 中的 "TBD" 为**被引用的 as-built 事实**而非文档占位 | ✅ |
| `spec.md` / `overall-spec.md` 技术无关（正文无文件路径/构建命令） | ✅（overall-spec 仅在头注指明 FR 编号出处） |
| `plan.md` 引用真实文件路径与真实行数（2026-11-02 快照实测） | ✅ |
| `plan.md` 交叉引用本模块 `spec.md` 的 FR-000-* | ✅（plan §8 全表） |
| 000-scaffold 同时具备 spec.md 与 plan.md | ✅ |
| as-built 与 planned 逐条区分（⬜ + 里程碑标注） | ✅ |
| README.md 链接全部指向存在的文件 | ✅（生成后经 §五脚本核验） |
| 模块目录数与登记数一致 | ✅（1/1） |
| 文档总览计数与实际文件数一致 | ✅（13 份） |

---

## 五、未闭合项（不属文档缺失，属**实现**阶段工作）

| 项 | 归属 | 依据 |
|---|---|---|
| `libnode_cli.so` 交叉编译全链（fetch/configure/make/strip） | M1-T1~T3 | 规划 §4 / R1–R3 |
| provision 白名单扩展 + `--assets`/`--shims` + assets 静态性 + 幂等口径收敛 | M1-T5 | 规划 §6/§6.1 · plan §3.3-2 |
| ~~CI 真实流水线 + 修复 FR-000-041 断言~~ | ✅ M1-T6 完成（2026-11-02 CI 全绿，Release v26.13.0；断言修复随新 workflow 落地） | plan §6 · overall-plan §4.1 |
| ~~GitHub Release 归档 + lock 回写~~ | ✅ 完成（Release 资产 tar.gz 45,955,095 B + 侧车；lock 已回写 size/sha256/ndk/flags/patch/树摘要/shims，gates 七键转 CI 实证） | 规划 §8/§10.1 |
| README（中英）「AAR 内容」小节回写壳脚本/manifest | M1 文档项 | 规划 §5 ⚠️ · STRUCTURE §6-2 |
| `VERSION_NAME=0.1.0` 是否可删 / POM 版本断言 | M1-T6/M3 发布前检查 | plan §3.3-3 [NEEDS CLARIFICATION] · TECH §5-6 |
| lock `gates` 在 draft 下的取值语义（布尔 true vs null） | M1-T6 前拍板 | plan §3.3-1 [NEEDS CLARIFICATION] |
| 真机回程探针 P1–P10（含 npm 原生包如实失败） | M2 | 规划 §7.1 |
| Maven Central 首发 + `published=true` 回写 | M3 | 规划 §10.1 |
