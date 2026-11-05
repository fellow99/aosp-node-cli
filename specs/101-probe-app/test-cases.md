# 101-probe-app 测试用例（probe-app 实际实现的探针正典，as-built）

> 对应：[spec.md](./spec.md)（FR-101-PROBE-001…011）· 上游判据源：[`../003-cli/test-cases.md`](../003-cli/test-cases.md)（TC-003-01…18）·
> [`../101-npm-integration/test-cases.md`](../101-npm-integration/test-cases.md)（TC-101-01…15）·
> 20261105 修复设计 [`docs/20261105-cli-实测问题-修复设计.md`](../../docs/20261105-cli-实测问题-修复设计.md)（§4.1/§2.1）。
> **本表 = `probe-app/app/src/main/java/org/fellow99/nodeprobe/MainActivity.java` `probes()` 实际实现清单**
> （as-built，行号 = 2026-11-05 快照）。
> **环境/状态口径**：`device` = 需 CI 首产 AAR + env 注入（规划 §7 模板）；`host` = 构建机。
> `PTY$` = 终端 App 内经 PTY 执行。**设备判据纪律**：arm64 真机/arm64 模拟器（x86_64 模拟器禁止
> 冒充，003 禁止判据 3）；翻译模拟器结果仅记录、正式 G3 需原生 arm64 复测。
> **期望值引用**：node `<nodever>=26.13.0` / npm `<npmver>=11.20.0` / corepack `<cpver>=0.36.0`
> （lock `active.version` / `builtFrom.npm.version` / `builtFrom.corepack.version`）。

## 一、探针全表（device，MainActivity.probes() 逐条）

| # | 用例 | 环境 | 前置 | 命令（argv） | 期望（可证伪 / 判据） | FR | 状态 |
|---|---|---|---|---|---|---|---|
| TC-MAT-01 | 物化树完整性 | device | 物化完成 | `node -v` 探针内判据：`countFiles(toolsDir) == manifest.fileCount+1` | 文件数一致（捕获 aapt dot 过滤回归）；manifest 缺失/解析失败 ⇒ FAIL | FR-101-PROBE-007 | ✅ 2026-11-04（1592 文件） |
| TC-003-01 | 版本串回程 | device | env 注入 | `node -v` | stdout=`v<nodever>`；exit 0 | — | ✅ 2026-11-04 |
| TC-003-02 | 版本可编程获取 | device | 同上 | `node -e 'console.log(process.version, process.versions.node)'` | 两个值均含 `<nodever>` | — | ✅ 2026-11-04 |
| TC-003-03 | `-e` 执行回程 | device | 同上 | `node -e 'console.log(1+1)'` | stdout=`2`；exit 0 | — | ✅ 2026-11-04 |
| TC-003-04 | `-p` 求值打印 | device | 同上 | `node -p '1+1'` | stdout=`2`；exit 0 | — | ✅ 2026-11-04 |
| TC-003-05a | 退出码传递 | device | 同上 | `node -e 'process.exit(7)'` | exit=7 | — | ✅ 2026-11-04 |
| TC-003-05b | 未捕获异常退出码 | device | 同上 | `node -e 'throw new Error("x")'` | exit=1；文案经 logcat tag=nodejs（stderr 空为平台事实）→ `PASS-LOGCAT` | — | ✅ 2026-11-04 |
| TC-003-05c | 语法错误退出码 | device | 同上 | `node -e 'this is not js'` | exit≠0；文案经 logcat → `PASS-LOGCAT` | — | ✅ 2026-11-04 |
| TC-003-06 | 脚本文件执行（CJS） | device | filesDir 有 `t.js` | `node t.js`；再绝对路径 | 两次输出一致且含 `t.js` 路径 | — | ✅ 2026-11-04 |
| TC-003-07a | ESM 脚本执行 | device | filesDir 有 `m.mjs` | `node m.mjs` | stdout=`a/b` | — | ✅ 2026-11-04 |
| TC-003-07b | stdin 管道执行 | device | 同上 | `node`（stdin=`console.log(9*6)`) | stdout=`54` | — | ✅ 2026-11-04 |
| TC-003-07c | stdin 重定向语义 | device | 同上 | `node`（stdin=`console.log('FROM-STDIN-OK')`） | stdout 含 `FROM-STDIN-OK` | — | ✅ 2026-11-04 |
| TC-003-08 | stderr 分流 | device | 同上 | `node -e 'console.log("o");console.error("e")'` | stdout=`o` 且 stderr 含 `e` | — | ✅ 2026-11-04 |
| TC-003-09 | UTF-8 输入输出 | device | 同上 | `node -e 'console.log("你好世界🦆")'` | stdout 原样回程（无乱码/转义泄漏） | — | ✅ 2026-11-04 |
| TC-003-10 | 基础模块抽查+固定向量 | device | 同上 | `-e`：12 模块 require + zlib 闭环 + sha256(aosp) | `MISSING=0 ZLIB=true SHA=c792a98c…` | — | ✅ 2026-11-04 |
| TC-003-11a | 无 NODE_TOOLS_DIR | device | env 删除该变量 | `node -e 'console.log(1)'` | exit 0（node 本体不依赖） | — | ✅ 2026-11-04 |
| TC-003-11b | 无 LD_LIBRARY_PATH | device | env 删除该变量 | `node -e 'console.log(1)'` | exit 0（v2.3.1 自包含静态 libc++）→ `PASS-FACT` | — | ✅ 2026-11-04 |
| TC-003-12a | symlink 绝对路径 exec | device | `$HOME/bin/node→libnode_cli.so` | `node -v`（绝对） | exit 0 | — | ✅ 2026-11-04 |
| TC-003-12b | symlink+PATH 解析 | device | PATH 含 `$HOME/bin` | bare `node -v` | stdout 含 `<nodever>`；execv 不可达 → `PASS-FACT`（12a 已证 symlink exec） | — | ✅ 2026-11-04 |
| TC-003-13a | JIT hotLoop 计时 | device | 同上 | hotLoop 1e7 次加法 | SUM=`49999995000000`；计时记录不断言 | — | ✅ 2026-11-04 |
| TC-003-13b | `--jitless` 兜底 | device | 同上 | `node --jitless -e '<hotLoop>'` | SUM 正确、可运行 | — | ✅ 2026-11-04 |
| TC-003-14 | TLS/内嵌 CA | device | 网络 | https.get registry.npmjs.org | STATUS=`200|3xx`；exit 0 | — | ✅ 2026-11-04 |
| TC-003-15 | Intl 边界事实 | device | 同上 | `node -p 'typeof Intl'` | `PASS-FACT\|typeof Intl = <值>`（intl=none AAR：`undefined`）**；full-icu 重 cut 后应为 `object`（判据修订见 003 test-cases，本表记录事实不断言） | — | ✅ 2026-11-04（undefined；2026-11-05 起 full-icu 口径） |
| TC-003-16 | Temporal 边界事实 | device | 同上 | `node -p 'typeof Temporal'` | `PASS-FACT\|…`（`undefined`） | — | ✅ 2026-11-04 |
| TC-003-17 | 平台事实记录 | device | 同上 | `-e` 打印 platform/arch/cpus/execPath | `PASS-FACT`；A=arm64；platform=`android`（事实） | — | ✅ 2026-11-04 |
| TC-003-18 | REPL 交互 | device | 标准 PTY 终端 | `node -i` | **BLOCKED**：PTY 真终端语义需终端 App（node-pty），非交互子集 | — | ⛔ 设计内 |
| TC-101-01 | npm -v 直出 | device | 物化+env | `libnpm.so -v` | exit 0 且 stdout 含 `<npmver>` | FR-101-001 | ✅ 2026-11-04 |
| TC-101-02 | npm 版本一致性 | device | 同上 | `libnpm.so -v` | 版本段 == `<npmver>`（=lock builtFrom.npm） | FR-101-014 | ✅ 2026-11-04 |
| TC-101-03 | npx -v 直出 | device | 同上 | `libnpx.so -v` | stdout 含 `<npmver>`；exit 0 | FR-101-002 | ✅ 2026-11-04 |
| TC-101-05 | corepack --version 直出 | device | 同上 | `libcorepack.so --version` | stdout 含 `<cpver>`；exit 0 | FR-101-002 | ✅ 2026-11-04 |
| TC-101-04a | 离线首启 npm -v | device | 代理黑洞 | `libnpm.so -v`（OFFLINE env） | exit 0（不触网） | FR-101-003 | ✅ 2026-11-04 |
| TC-101-04b | 离线 npm ls | device | 同上 | `libnpm.so ls`（OFFLINE） | exit 0（不触网） | FR-101-003 | ✅ 2026-11-04 |
| TC-101-06a | npm --help | device | 同上 | `libnpm.so --help` | exit≤1 且 stdout 含 `Usage`（壳零解释） | FR-101-004 | ✅ 2026-11-04 |
| TC-101-06b | npm 无效子命令 | device | 同上 | `libnpm.so invalid-subcommand-xyz` | exit≠0 | FR-101-004 | ✅ 2026-11-04 |
| TC-101-07 | 纯 JS 包安装 | device | 网络+P10 | `libnpm.so install ms` | exit 0（P6 主链） | FR-101-005 | ✅ 2026-11-04 |
| TC-101-07b | require('ms') 闭环 | device | TC-101-07 后 | `node -e 'console.log(typeof require("ms"))'` | stdout 含 `function` | FR-101-005 | ✅ 2026-11-04 |
| TC-101-08a | npm ls 含 ms | device | TC-101-07 后 | `libnpm.so ls` | stdout 含 `ms@` | FR-101-006 | ✅ 2026-11-04 |
| TC-101-08b | npm ls -g | device | 同上 | `libnpm.so ls -g` | exit 0（列全局面） | FR-101-006 | ✅ 2026-11-04 |
| TC-101-09 | npm uninstall ms | device | TC-101-07 后 | `libnpm.so uninstall ms` | exit 0 | FR-101-007 | ✅ 2026-11-04 |
| TC-101-09b | 卸载后 require 失败 | device | TC-101-09 后 | `node -e 'require("ms")'` | exit≠0 → `PASS-LOGCAT`（MODULE_NOT_FOUND 经 logcat） | FR-101-007 | ✅ 2026-11-04 |
| TC-101-10 | node-gyp 包失败如实 | device | 网络+P10 | `libnpm.so install --no-cache-dir sqlite3`（`npm_config_build_from_source=true`） | **预期失败**：exit≠0 且错误含 gyp/python/make/build 语义；无残留 | FR-101-008 | ✅ 2026-11-04 |
| TC-101-10b | 原生包失败无残留 | device | TC-101-10 后 | `node -e 'require("sqlite3")'` | exit≠0 | FR-101-008 | ✅ 2026-11-04 |
| TC-101-11a | npm install -g cowsay | device | 网络+P10 | `libnpm.so install -g cowsay` | exit 0 落 `$HOME/lib/node_modules` | FR-101-009 | ✅ 2026-11-04 |
| TC-101-11b | 全局 bin 直接 exec | device | TC-101-11a 后 | `$HOME/bin/cowsay --version` | 预期不可 exec（C1/SELinux）→ `PASS-EXPECTED-UNEXECUTABLE` | FR-101-009 | ✅ 2026-11-04 |
| TC-101-11c | node <bin> 替代调用 | device | 同上 | `node $HOME/bin/cowsay -h` | exit 0 | FR-101-009 | ✅ 2026-11-04 |
| TC-101-12 | npx cowsay 边界 | device | 网络+P10 | `libnpx.so cowsay hello` | 预期 exit≠0（直启 bin 被拒）→ `PASS-FACT`；替代=npx 直启或 node <bin> | FR-101-010 | ✅ 2026-11-03（exit 126 事实） |
| TC-101-13 | corepack 禁拉可执行件 | device | 离线 | `libcorepack.so pnpm -v`（OFFLINE） | 预期 exit≠0（可读失败） | FR-101-012 | ✅ 2026-11-04 |
| TC-101-14 | 无网络失败可读 | device | 飞行模式 | `libnpm.so install is-odd`（OFFLINE） | exit≠0 且错误含 network/proxy/econn fetch 语义 | FR-101-013 | ✅ 2026-11-04 |
| TC-101-15 | 树损坏报错+恢复 | device | 人为删文件 | 删 `npm-cli.js` → `libnpm.so -v` → 从 assets 回拷 → 再跑 | 损坏时 exit≠0；恢复后 exit 0 | FR-101-014 | ✅ 2026-11-04 |
| **TC-INTL-01** | JS 属性转义（full-icu 判据） | device | env 注入 | `node -e "console.log(/\\p{ID_Start}/u.test('a'))"` | stdout 含 `true`；**当前 intl=none AAR 预期 FAIL**（SyntaxError Invalid property name）——判据标注「待 full-icu CI 重 cut 后 PASS」，如实记录不伪造 | FR-101-PROBE-008 | ⬜ 未设备跑批（2026-11-05 新增） |
| **TC-INTL-02** | Intl 全 locale | device | 同上 | `node -e "console.log(new Intl.NumberFormat('zh-CN').format(1234))"` | stdout 含 `1,234`；当前 AAR 预期 FAIL（Intl undefined）——同上待 full-icu 重 cut | FR-101-PROBE-009 | ⬜ 未设备跑批（2026-11-05 新增） |
| **TC-INTL-03** | B1 错误 hook（A1 前契约） | device | filesDir 有 `error-hook.js` | `NODE_OPTIONS=--require=<error-hook.js>` + `node -e "throw new Error('boom')"` | exit=1 **且** stderr 含 `boom`/`Error`/stack（B1 注入契约在 CLI 成立；**当前 AAR 即可 PASS**） | FR-101-PROBE-010 | ⬜ 未设备跑批（2026-11-05 新增） |

> **TC-003-15 判据说明**：2026-11-05 修复设计 §4.1 把 intl 从 `none` 改为 `full-icu`（含
> `--with-icu-source` 钉版 icu4c），因此「Intl 边界事实」在 full-icu 重 cut 后 `typeof Intl`
> 将为 `object`（不再 `undefined`）、`/\p{ID_Start}/u` 可用。**本表/探针只记录实际行为**，
> 未来 full-icu AAR 跑批时按实测回填（003 test-cases 禁止判据 4：只记录条目不得事后改写成断言）。

## 二、host 侧用例（构建机——载体 App 本身）

| # | 用例 | 环境 | 步骤 | 期望 | 状态 |
|---|---|---|---|---|---|
| TC-101-PROBE-16 | probe-app 编译产出 | host | `gradle :app:assembleDebug --console=plain`（项目自带 Gradle 9.4.1） | `app/build/outputs/apk/debug/app-debug.apk` 产出；exit 0 | ✅ 2026-11-05（logs/20261105-1） |
| TC-101-PROBE-17 | 探针实现与正典映射核对 | host | Grep `probes()` 各 `new Probe(id,…)` | id 全集 = 本表（TC-MAT-01/TC-003-*/TC-101-*/TC-INTL-*） | ✅ 2026-11-05 |
| TC-101-PROBE-18 | AAR 未替换检查 | host | `ls -l app/libs/node-cli-release.aar` + lock sha 对照 | 仍为 intl=none 首产 AAR，未被本批替换 | ✅ 2026-11-05 |

## 三、事实记录区（回填处，C6）

| 项 | 值 | 记录时间 |
|---|---|---|
| 物化完整性 | TC-MAT-01：1592 文件 == manifest.fileCount+1（dot 文件修复回归锁） | 2026-11-04 模拟器 |
| Intl 边界实际值（intl=none AAR） | `typeof Intl` = `undefined`（TC-003-15 / logs/20261104-1/probe-report.json） | 2026-11-03 模拟器 |
| B1 预期（error hook 注入后） | stderr 可见 stack + exit 1 ——修复设计 §2.1 B1 实测结论；本批 TC-INTL-03 转探针，待设备跑批 | 2026-11-05 |
| full-icu 预期 | `/\p{ID_Start}/u.test('a')===true`、`Intl.NumberFormat('zh-CN').format(1234)==='1,234'`（修复设计 §4.1 验证用例） | 2026-11-05 |

## 四、禁止的判据

1. 不得在 x86_64 模拟器上执行 arm64 产物探针并记录为通过（翻译环境仅记录，正式 G3 复测）。
2. 不得把 TC-INTL-01/02 在 intl=none AAR 上的 FAIL 当作回归缺陷上报——应为设计内预期
   （待 full-icu CI 重 cut），也不得伪造 PASS。
3. logcat 文案类用例只断言退出码/`PASS-LOGCAT`，不得断言上游错误文案逐字匹配。
4. 「只记录不断言」条目（TC-003-15/16/17、JIT）不得事后改写成断言。
5. `app/libs/node-cli-release.aar` 不得被本批替换（intl=none 首产制品，full-icu 另行 CI 重 cut）。

## 附、统一队列跑批记录（2026-11-06）

- 载体：`emulator-5554`（sdk_gphone64_x86_64 API 37 × ndk_translation；App 域 ABI=arm64）；由编排者统一排队串行执行（安装→`--ez autorun true`→`run-as cat` 回读报告）。
- 报告：`logs/20261105-1/report-node.json`（工程内留档，不入库）。
- 汇总：52 探针：PASS 49 / BLOCKED 1 / FAIL 2（TC-INTL-01/02 为 FAIL-ANTICIPATED，待 full-icu CI 重 cut；TC-003-18 PTY-terminal BLOCKED）。
- 判读纪律：翻译模拟器结果**仅记录**，正式 G3 需原生 arm64 复测；FAIL/BLOCKED 均按本节/Spec 既有分类如实记录，未伪造 PASS。
