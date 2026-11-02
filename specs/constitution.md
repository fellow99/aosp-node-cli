# constitution.md —— `aosp-node-cli` 项目宪法（治理原则）

> 本文件是 `io.github.fellow99:node-cli` 工程的**最高约束**。任何 `spec.md` / `plan.md` / 实现 / 评审都必须先过这一关。
> 原则不是发明的，而是从**已落地的代码**（Gradle 骨架 / `tools/provision.mjs` / `node-cli.lock.json` / CI）与
> 规划基线中抽取的（依据列在每条末尾）。
>
> - 权威规划文档：[`../docs/000-工程规划.md`](../docs/000-工程规划.md)（v2.0，**结论以它为准**，下称「规划 §」）
> - 版本：v1.0 · 2026-11-02 · 状态：**生效**
> - 适用：`node-cli/`（AAR 容器）· `tools/` · `scripts/` · `.github/workflows/` · `specs/`
> - 里程碑口径：**M0 骨架已完成（as-built）**；M1 交叉编译 / M2 真机 / M3 Maven 发布 / M4 跟随机制均为**规划**，逐条标 ⬜，绝不当作已定事实引用。

---

## 一、八条不可协商的原则

### C1. fetch 不改源（Fetch Never Modifies Sources）

**Node.js 官方源码包（`node-v<ver>.tar.xz`）在 fetch 阶段必须保持逐字节原样；出处校验针对官方原包。**

- `fetch-node-cli-source.mjs` 的契约是「只下载、解压、记录出处与 sha256」，注释明文「源码不改」（`scripts/fetch-node-cli-source.mjs:8-9`）；
- 构建期需要的差异（Android 配置、补丁）只能经**构建脚本的 configure 参数或构建期补丁**注入，且补丁必须幂等、逐条记录进 `lock.builtFrom.patch`（规划 §4.3 / D8）；⬜ M1 落地；
- SHA-256 校验链必须来自官方 `SHASUMS256.txt`（规划 §4.1）；⬜ M1 实现。

依据：规划 §4.1 / §4.3 / §13 · D8 · `scripts/fetch-node-cli-source.mjs:8-16`。

---

### C2. lock 唯一事实源（Lock File Is the Single Source of Truth）

**「该用哪个二进制、多大、哈希多少、和谁配对、门禁键是什么」只有一个权威出处：仓库根 `node-cli.lock.json`，进 git。**

- `tools/provision.mjs` 只从 lock 读期望值（版本/ABI 选择、`matrix.allowedNeeded` 白名单、sha/size 期望值），工具不自带任何清单（`provision.mjs:33,177-193`）；
- M1 的壳脚本白名单同纪律：白名单事实源在 lock `matrix.shellShims`，provision 只读不自带（规划 §6.1）⬜；
- draft 记录**不伪造哈希**：当前 release `size=0`、`sha256=""`、`status=draft`，首个真实 CI 构建后才回写事实（`node-cli.lock.json:13-14,37` · 规划 §8）。

依据：规划 §8 / §13 · `node-cli.lock.json` · `provision.mjs` 文件头注释（`provision.mjs:5`）。

---

### C3. 二进制不入库（Binaries Are Never Committed）

**`libnode_cli.so` 与随包 npm/corepack JS 树由 CI 产出、由 `provision.mjs` 投放，绝不进 git、绝不手工构建。**

- `.gitignore:22-24`：`node-cli/src/main/jniLibs/**/*.so` 与 `node-cli/src/main/assets/**` 全部忽略；
- README 明文「二进制**不入库**，也从不由手工构建」（`README_zh.md:73-74`）；
- CI 是唯一产出通道；`build/out`、`.dist/` 等构建工作区同样不入库（`.gitignore:26-28`）。

依据：规划 §13 · `.gitignore` · README（中英）「如何构建」节。

---

### C4. 门禁强制（Gates Are Mandatory, Hard-Fail）

**exec 型 ELF 门禁任一项不过即硬失败（`exit 2`），没有「警告后继续」档位；投放被拒绝而不是「就地凑合」。**

- 七项门禁：① `ET_DYN`（PIE）② PT_INTERP 恰 1 个且 = `/system/bin/linker64` ③ AArch64 ④ DT_NEEDED ⊆ 白名单 ⑤ SHA-256（draft 仅记录）⑥ 大小（draft 仅记录）⑦ 16KB 页对齐（`provision.mjs:146-160`）；
- 门禁不过 ⇒ 拒绝投放（`provision.mjs:235-238`）；`--check` 不过 ⇒ `exit 2`；
- 命名禁区恒拒：`libnode.so` / `libc++_shared.so` 不得进入本 AAR（BANNED_IN_AAR，`provision.mjs:38,246-250`；D3）；
- 唯一放行例外：`--allow-page-align-4k` 只服务 bring-up，且必须打印「上架/16KB 设备不合格」警告（`provision.mjs:162-167`）。

依据：规划 §6 / §12 · `provision.mjs` 门禁实现。

---

### C5. 同版本配对纪律（Version-for-Version Pairing）

**制品版本恒等于配对 Node 版本；`node-runtime` / `node-pty` / `node-cli` 三件必须同版本上线，不引入独立 semver。**

- 版本源唯一为 `CLI_VERSION` Gradle 属性（`node-cli/build.gradle.kts:15-16` · `publish.gradle.kts:37-38`）；
- 禁用 `NODE_*` 前缀属性——Gradle 9.4 把该前缀保留给内置 Node 工具链（`gradle.properties:5-6` 注释）；
- lock 记录配对坐标与 releaseTag：`pairedRuntime = io.github.fellow99:node-runtime:26.13.0 / v26.13.0`（`node-cli.lock.json:15-18`）；
- 配对是**版本纪律**而非编译期链接：CLI（exec 可执行）与引擎（dlopen 共享库）是两个形态的制品，互不 `DT_NEEDED` 挂靠（规划 §2）。

依据：规划 §2 · D4 · `gradle.properties` / `node-cli/build.gradle.kts` / lock。

---

### C6. 发布卫生（Release Hygiene）

**默认绝不发布；凭据绝不入库；发布动作必须显式、可审计。**

- `RELEASE=false` 为仓库默认（`gradle.properties:21`）；`RELEASE=false` 或缺 Token 时 Central/签名任务被禁用（`publish.gradle.kts:133-139`）；
- Central Portal Token / GPG 只从**用户级** `~/.gradle/properties` 读取，仓库只提供 `gradle.properties.local.example` 模板（`publish.gradle.kts:13` · `gradle.properties.local.example`）；
- 发布两段式：GitHub Release 先行（M1-T6 ⬜）→ Maven Central 随后（M3 ⬜），沿用 aosp-node-pty runbook（规划 §10.1）。

依据：规划 §10.1 / §12 / §13 · `publish.gradle.kts` · `gradle.properties`。

---

### C7. 未实测 ⬜ 纪律（Evidence Discipline）

**凡未在本工程实测的结论一律标 ⬜，绝不当作已定事实引用；规划与 as-built 必须逐条可区分。**

- 规划 § 纪律明文：「⬜ 为未实测项，绝不当作已定事实引用」（`docs/000-工程规划.md:9`）；
- 本仓现状：`libnode_cli.so` 本体尚未构建（M1）⇒ 一切涉及「产物体积、ELF 实测值、真机行为、NDK 实钉版本」的论断都是 ⬜；
- specs 只把 M0 已实现部分当 as-built；M1/M2/M3/M4 内容只能以**规划引用**出现并标注出处（规划 § 号）。

依据：规划文件头纪律 · 规划 §10 里程碑表（M0 ✅，其余 ⬜）。

---

### C8. 先改文档再改实现（Docs Before Implementation）

**规划基线 `docs/000-工程规划.md` 是唯一权威；变更走「先改本文件，再改实现」；specs 做收敛/展开，不复制粘贴。**

- 规划文件头明文：「本文件是唯一规划基线，变更走"先改本文件，再改实现"」（`docs/000-工程规划.md:3`）；
- 实现与本文件的偏差**随各里程碑直接回写规划文档**（`docs/000-工程规划.md:6`）；
- 规格文档（本目录）只引用规划的 § 号并给出验收判据；新增平台结论必须先落规划文档。

依据：`docs/000-工程规划.md:3-9` · 本目录 `README.md`「文档结构规范」。

---

## 二、工程规约（从现有代码抽取，实现必须一致）

| # | 规约 | 现状依据 |
|---|---|---|
| S1 | **provision 只读 lock，不自带清单**：依赖白名单取 `lock.matrix.allowedNeeded`；M1 起壳脚本白名单同纪律（`matrix.shellShims` ⬜） | `provision.mjs:184` · 规划 §6.1 |
| S2 | **退出码纪律 0/2/1**：`0` = 全过；`2` = 门禁不合格/未投放/SCAFFOLD 未实现；`1` = 用法/IO/锁文件错误；fetch/build 脚本骨架以 `exit 2` 表达「接口已固化、实现未落地」 | `provision.mjs:24,275` · 两个脚本的 SCAFFOLD 分支 |
| S3 | **jniLibs 单一原生件**：`--check` 的兄弟文件规则只放行 `libnode_cli.so`，任何兄弟 `.so` 判非法；扩展为「ELF + 壳脚本白名单」属 M1-T5 规划 ⬜ | `provision.mjs:221-225` · 规划 §6.1 |
| S4 | **BANNED_IN_AAR 恒拒**：`libnode.so` / `libc++_shared.so` 无论出现在 DT_NEEDED 白名单与否，都不得作为文件进入本 AAR（防包内同名冲突） | `provision.mjs:38,246-250` · D3 |
| S5 | **产物唯一命名**：`libnode_cli.so`；严禁 `libnode.so`（引擎 soname 被 node-runtime 占用） | `provision.mjs:36` · D3 · build 脚本头注释 |
| S6 | **版本属性命名 `CLI_VERSION`**：禁 `NODE_*` 前缀（Gradle 9.4 保留给内置 Node 工具链）；模块 `project.version` 与 publication 双写 | `gradle.properties:5-9` · `node-cli/build.gradle.kts:13-25` |
| S7 | **每仓一份 provision，仅仓库级常量块不同**：`LOCK_FILE` / `MODULE_DIR` / `RES_PROPERTIES` / `DEFAULT_BINARY` / `BANNED_IN_AAR` 集中在文件头常量块（与 pty/runtime 同构） | `provision.mjs:32-39` |
| S8 | **失败文本必须可操作**：锁里没有该版本 ⇒ 列出全部可用组合；缺 `--from` ⇒ 给出完整用法；draft ⇒ 明说「仅记录不比对」 | `provision.mjs:188-193,197,231` |
| S9 | **CI 配置期必须无 `.so` 通过**：Gradle 配置/任务求值不得依赖二进制存在；`provision --check` 未投放的预期退出码恰为 2 | `.github/workflows/build-node-cli-android.yml:3-5,34-45` |
| S10 | **随包树与 manifest 出处齐全**（⬜ M1 规划）：npm/corepack 树逐文件 sha256 + 总 sha256 记 manifest.json；壳脚本 sha/size 记 lock；assets 树内不得出现 ELF magic | 规划 §5 / §6 / §8 |

---

## 三、证据纪律

全文使用四种标记，**不要把推断当实测**：

| 标记 | 含义 |
|---|---|
| ✅ **实测** | 本工程内可复核的一手证据（源码 `path:line` / 本机产物 / CI 配置 / 已执行的用例记录） |
| 🔶 **沿用** | 沿用同型工程（aosp-node-runtime / aosp-node-pty）的一手结论，本工程**未复现** |
| ⬜ **未实测/规划** | M1+ 规划项或必须实测后才能定稿的项 |
| ⚠️ **冲突/风险** | 两份材料不一致，或存在已知风险（含规划已登记的 R1–R10） |

两条纪律：

1. `🔶 沿用` 的结论**不得**作为本仓对外承诺的依据——runtime 仓实测过的交叉编译行为，本仓 M1 必须自证一次（R1 的本质）。
2. **产物相关的一切数字（体积、页对齐实测值、NDK 版本）在 M1 首产前都是 ⬜**；规划的 60–90 MB 预估只是口径，不是事实。

---

## 四、评审清单（Reviewer Checklist）

评审任何 `spec.md` / `plan.md` / PR 时逐条问：

- [ ] 是否改动了 fetch 产物？出处校验是否仍针对官方原包？（C1）
- [ ] 新增的「该用哪个产物」事实是否写进了 lock，而不是散落在脚本/文档里？（C2）
- [ ] 是否有二进制/随包树被纳入版本控制？（C3）
- [ ] 门禁是否有绕过路径？新增放行是否带警告与理由？（C4）
- [ ] 版本是否仍然恒等于配对 Node 版本？三件制品是否同版？（C5）
- [ ] 发布是否仍默认关闭？凭据是否只在用户级？（C6）
- [ ] 新论断是否带 ✅/🔶/⬜/⚠️ 标记？产物数字是否在实测前被写成事实？（C7）
- [ ] 是否先改了 `docs/000-工程规划.md` 再改实现？（C8）
- [ ] 命名是否避开 `libnode.so` / `libc++_shared.so` / `NODE_*` 属性前缀？（S4/S5/S6）

---

## 五、变更流程

1. **改 `node-cli.lock.json`**（换配对版本 / 回写 released 事实）⇒ 必须同步 `gradle.properties` 的 `CLI_VERSION`，并重跑 `provision --check`（M1 后含真实产物）。
2. **改门禁判据** ⇒ 必须同步 lock `gates` 键集（FR-000-012）与 `provision.mjs`、CI 自检三处；任何新放行开关必须带警告输出。
3. **新增平台/构建结论** ⇒ **先**写进 `docs/000-工程规划.md`（唯一权威），规格文档只引用 § 号，不复制粘贴（C8）。
4. **M1 引入构建期补丁** ⇒ 逐条记录进 `lock.builtFrom.patch`；无补丁记 `"none"`（规划 §4.3 / §8）。
