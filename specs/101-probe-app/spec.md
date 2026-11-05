# 101-probe-app · 设备回程探针载体（probe-app）功能规格

> 模块：101-probe-app · 状态：⚠️ 已实现（as-built 归档；代码已落地并于 2026-11-04 翻译模拟器环境跑批，
> 原生 arm64 复测 ⬜）· 本批新增：TC-INTL-* 补充探针（2026-11-05）
> 所属工程：aosp-node-cli · 规划基线：[`docs/000-工程规划.md`](../../docs/000-工程规划.md) §7（运行期契约）/§7.1（回程探针 P1–P10）/§10.2（M2-T1/T2）
> 对应里程碑任务：M2-T1（环境引导层接入）+ M2-T2（真机回程探针，G3）；上游用例正典：
> [`003-cli`](../003-cli/test-cases.md)（TC-003-01…18）· [`101-npm-integration`](../101-npm-integration/test-cases.md)（TC-101-01…15）

## 1. 目的

定义「设备侧回程探针载体」的行为契约：一个独立 Android app（`probe-app`）把 `003-cli` 与
`101-npm-integration` 两模块的**主测试用例正典的可执行子集**落到真实设备上，逐条给出
PASS / FAIL / BLOCKED 判定并产出机器可读的 JSON 报告（`filesDir/probe-report.json`），
作为 M2 真机验收（G3）的执行载体。本模块**不新增产品能力**，是消费方环境引导层契约
（规划 §7 环境变量 + §7.1 探针判据）的验证实现，并对 2026-11-05 实测修复设计
（[`docs/20261105-cli-实测问题-修复设计.md`](../../docs/20261105-cli-实测问题-修复设计.md) §4.1/§2.1）
新增 Intl（full-icu）与 B1 错误 hook 的探针判据。

> 逆向事实源（as-built）：`probe-app/` 全部代码 + `specs/003-cli/test-cases.md` +
> `specs/101-npm-integration/test-cases.md` + `node-cli.lock.json` + 20261105 修复设计文档。

## 2. 范围

**在范围内（101-probe-app）：** 探针载体的物化（assets → filesDir 幂等）、环境注入
（规划 §7 全变量子集）、命令执行（`/system/bin/sh -c` 包装 exec 与三壳）、判据与报告
（PASS/FAIL/BLOCKED + JSON）、用例正典映射（TC-MAT-01 / TC-003-01…18 / TC-101-01…15 /
TC-INTL-01…03）、无头自动化（`--ez autorun true` intent）、树完整性自检（TC-MAT-01）。

**不在范围内（101-probe-app）：** node/npm/corepack 本体行为（→ 003/101 用例正典，本模块
只承载执行）；PTY/REPL 真终端语义（TC-003-18 按 BLOCKED，归终端 App / node-pty）；
物化实现的 marker 纪律（消费方职责，规划 §7）；探针 App 的发布形态（不发布，versionName =
目标 node 版本，`probe-app/build.gradle.kts:7-18`）。

## 3. 功能需求

> 术语：探针（Probe）= `MainActivity.probes()` 中一条带 `id`/`argv`/`判据 check` 的记录；
> 判据 check 返回 `null` = PASS，`"BLOCKED:…"` = BLOCKED，`"PASS-"` 前缀 = 事实形态 PASS，
> 其余 = FAIL（`MainActivity.java:274-275`）。

### 3.1 物化与注入域

- **FR-101-PROBE-001（MUST）**：物化幂等——`assets/node-bridge-tools/**` 物化到
  `filesDir/node-bridge-tools`；`manifest.json` 的 `totalSha256` 与上次持久化 marker 一致时
  跳过（marker 纪律，规划 §7）。树完整性由 TC-MAT-01 自检。
  （as-built：`MainActivity.java:120-135`）
- **FR-101-PROBE-002（MUST）**：环境注入契约——执行 node/npm 命令前注入规划 §7 全表子集：
  `HOME`/`TMPDIR`/`PATH`(nativeLibraryDir:$HOME/bin:/system/bin)/`LD_LIBRARY_PATH`/
  `NODE_TOOLS_DIR`/`NODE_NATIVE_DIR` + `npm_config_prefix`/`npm_config_cache`/
  `npm_config_update_notifier` + `COREPACK_ENABLE_DOWNLOAD_PROMPT`。
  （as-built：`MainActivity.java:180-194`）
- **FR-101-PROBE-003（MUST）**：执行器包装——`ProcessBuilder` 经
  `/system/bin/sh -c 'export LD_LIBRARY_PATH=<dir>; exec "$0" "$@"'` 启动（2026-11-03 实测：
  直接传给进程的 `LD_LIBRARY_PATH` 对 exec 型产物不生效，见 `MainActivity.java:211-232`）；
  进程层移除 `LD_LIBRARY_PATH`（保住负路径探针语义）；stdout/stderr 分流、退出码采集、
  超时 `destroyForcibly` 兜底。（as-built：`MainActivity.java:204-257`）

### 3.2 判据与报告域

- **FR-101-PROBE-004（MUST）**：报告——每条探针 `PASS/FAIL/BLOCKED` + `detail/exit/ms/stdout/stderr`
  汇总为 `filesDir/probe-report.json`（`runAt`/`device`/`expected` 头部）；逐条 `log()` 到 UI。
  （as-built：`MainActivity.java:654-679`）
- **FR-101-PROBE-005（MUST）**：用例正典映射——探针 id 与 `003-cli`/`101-npm-integration`
  test-cases 一一对应；期望值（node/npm/corepack 版本）引用 lock（常量
  `NODE_VER`/`NPM_VER`/`COREPACK_VER`，`MainActivity.java:47-49`），不写死副本（C2）。
- **FR-101-PROBE-006（MUST）**：判据纪律——「只记录不断言」类（平台/JIT/Intl/Temporal 边界、logcat
  文案）以 `PASS-FACT`/`PASS-LOGCAT` 形态记录事实，不断言形态；外部依赖缺失（如 REPL/PTY）
  标 BLOCKED 不删用例（沿用 003/101 禁止判据纪律，C6）。
- **FR-101-PROBE-007（MUST）**：树完整性自检——TC-MAT-01 断言物化文件数 ==
  `manifest.fileCount` + 1，捕获 aapt dot 文件过滤类回归（`MainActivity.java:353-369` /
  `app/build.gradle.kts:26-31` ignoreAssetsPattern 覆写）。

### 3.3 Intl / B1 补充探针域（2026-11-05 本批新增）

- **FR-101-PROBE-008（MUST）**：JS 属性转义探针——`node -e "console.log(/\p{ID_Start}/u.test('a'))"`
  期望 stdout 含 `true`；判据注明**待 full-icu CI 重 cut 后 PASS**（当前 intl=none AAR 会 FAIL，
  如实记录，不伪造 PASS）。引用修复设计 §4.1 ①。（探针 TC-INTL-01）
- **FR-101-PROBE-009（MUST）**：Intl 全 locale 探针——`node -e "console.log(new Intl.NumberFormat('zh-CN').format(1234))"`
  期望 stdout 含 `1,234`；判据同上（待 full-icu 重 cut）。引用修复设计 §4.1 ②。（探针 TC-INTL-02）
- **FR-101-PROBE-010（MUST）**：B1 错误 hook 探针——内置 `error-hook.js` 挂
  `uncaughtException`/`unhandledRejection` → stderr 写 stack + `exit 1`；以
  `NODE_OPTIONS=--require=<hook>` 注入后 `node -e "throw new Error('boom')"`，断言
  exit=1 **且** stderr 含 stack/boom（验证 B1 注入契约在 CLI 上成立；当前 AAR 即可 PASS）。
  引用修复设计 §2.1 B1 / §4.1 ②。（探针 TC-INTL-03）
- **FR-101-PROBE-011（MUST）**：无头自动化——`adb shell am start … --ez autorun true` 启动即
  自动跑批，无需点击 UI 按钮（便于 CI/脚本采集报告）。（本批新增，`MainActivity.onCreate`）

## 4. 用户故事

- 作为 **测试/QA**，我需要在真实设备上按 003/101 正典一键跑批，得到可证伪的 PASS/FAIL/BLOCKED
  与机器可读 JSON，从而在 M2 窗口给出 G3 判据。
- 作为 **构建/流水线实现者**，我需要在 CI 首产后自动部署 AAR 到探针 App，验证物化/注入/exec
  三链无回归，避免把「host 能编」当成「设备能跑」。
- 作为 **消费者方开发**，我需要一个可复现的载体观察 `Intl`（full-icu）与 B1 错误 hook 在本
  CLI 上的真实行为，以决定环境层是否按设计注入 `NODE_OPTIONS=--require=error-hook.js`。

## 5. 验收场景（Given/When/Then）

1. **物化幂等 + 树完整性**：Given 首次安装且 assets 树含 npm/corepack/manifest；
   When 点击 RUN ALL PROBES；Then TC-MAT-01 PASS 且物化文件数 == manifest.fileCount+1。
2. **版本回程**：Given AAR 已就位（lock 钉版 26.13.0）；When 执行 TC-003-01/02；
   Then `node -v` == `v26.13.0`，`process.version` 同源。
3. **A1 错误边界**：Given 错误注入（无 `LD_LIBRARY_PATH`）；When TC-003-11b；
   Then 自包含产物可执行（记录 PASS-FACT，不断言形态）。
4. **B1 注入契约**：Given `error-hook.js` 就位；When 以 `NODE_OPTIONS=--require` 注入并抛未捕获异常；
   Then exit=1 且 stderr 含 stack（TC-INTL-03 PASS）。
5. **Intl 边界如实**：Given 当前 intl=none AAR；When TC-INTL-01/02；
   Then 判据按设计标注「待 full-icu CI 重 cut 后 PASS」（如实 FAIL，不伪造）。
6. **无头报告**：Given `asm --ez autorun true` 启动；When 自动跑批结束；
   Then `filesDir/probe-report.json` 存在且可 `adb run-as` 拉回。

## 6. 实体表

| 实体 | 字段 | 说明 | as-built |
|---|---|---|---|
| `Probe` | `id`/`title`/`argv`/`envOverride`/`stdin`/`cwd`/`timeoutMs`/`check` | 一条探针的完整定义；`envOverride` value=null 表示删除基线变量 | `MainActivity.java:277-291` |
| `Out` | `stdout`/`stderr`/`exit`/`ms`/`timedOut`/`failReason` | 单次执行的采集结果 | `MainActivity.java:196-202` |
| `Check` | `String check(Out o)` | 判据函数：null=PASS；`BLOCKED:`/`PASS-` 前缀特殊判定 | `MainActivity.java:273-275` |
| 报告 JSON | `runAt`/`device`/`expected`/`probes[]` | `filesDir/probe-report.json`，`probes[]` 含逐条 verdict | `MainActivity.java:667-679` |
| `node-bridge-tools/manifest.json` | `fileCount`/`totalSha256`/`files[]` | 物化 marker + 完整性基准（provision 生成） | `app/build.gradle.kts:26-31` · 示例 `logs/20261104-1` |

## 7. NFR

- **性能**：首次物化 1–2 分钟（full npm/corepack 树）；跑批时长受网络用例（TC-101-07 等）支配，
  各探针带独立 timeout（`MainActivity.probes()` 逐条给出）。
- **可靠性**：离线可跑（materialize 不全依赖网络）；物化幂等；任一探针崩溃/超时不中断整体
  （`try/catch` + `timedOut`）。
- **可维护性**：探针为声明式数据（`new Probe(...)` 数组），新增用例只加一条记录 + 判据 lambda。
- **环境要求**：arm64-v8a 唯一 ABI（真机或 arm64 模拟器）；x86_64 模拟器禁止冒充（003 禁止判据 3）。
- **安全/卫生**：探针 App 不发布、无敏感权限（仅 INTERNET）；报告纯文本 JSON。

## 8. 依赖

| 依赖 | 锚点 | 说明 |
|---|---|---|
| `003-cli` 用例正典 | [`../003-cli/test-cases.md`](../003-cli/test-cases.md) | TC-003-01…18 判据源（本模块只做可执行子集） |
| `101-npm-integration` 用例正典 | [`../101-npm-integration/test-cases.md`](../101-npm-integration/test-cases.md) | TC-101-01…15 判据源 |
| `node-cli.lock.json` | [`../../node-cli.lock.json`](../../node-cli.lock.json) | 期望值（node 26.13.0 / npm 11.20.0 / corepack 0.36.0）唯一事实源（C2） |
| CI 产物 AAR | `node-cli-release.aar`（`app/libs/`） | 探针载体依赖的 exec 型制品；**当前为 intl=none 产物，勿替换** |
| 20261105 修复设计 | [`docs/20261105-cli-实测问题-修复设计.md`](../../docs/20261105-cli-实测问题-修复设计.md) | §4.1（full-icu①/Intl②）/§2.1 B1——TC-INTL-* 判据出处 |
| 环境引导层契约 | [`docs/000-工程规划.md`](../../docs/000-工程规划.md) §7/§7.1 | 注入变量与 P1–P10 判据 |

## 9. 状态与遗留

- 2026-11-04 设备跑批：49 探针 = 48 PASS + 1 BLOCKED（TC-003-18 REPL）+ 0 FAIL（翻译模拟器环境，
  非原生 arm64，正式 G3 需复测）——见 `logs/20261104-1/DEVICE_TEST_REPORT.md`。
- 本批新增 TC-INTL-01…03：**尚未设备跑批** ⬜；①② 在当前 intl=none AAR 上预期 FAIL
  （标注待 full-icu 重 cut），③ 当前即可验证。
