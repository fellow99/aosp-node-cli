# 003-cli 测试用例（node CLI 主要用例正典）

> 对应：[spec.md](./spec.md) §3（FR-003-001…014）· 规划 §7.1（回程探针 P1/P5/P8/P9/P10）· 规划 §7（环境变量契约）。
> **环境标记**：`host` = 构建机可执行（node/gradle/unzip）；`device` = 需 CI 首产产物 + PTY 终端
> （arm64 真机或 arm64 模拟器；x86_64 AVD 不可承载 arm64 产物——禁止在其上执行并记录为通过）。
> **状态口径**：✅ 已执行 · ⬜ 待执行（C6：不得把未测当已测）。设备侧命令以 `PTY$` 前缀表示
> 「终端 App 内经 PTY 启动 `libnode_cli.so`」（`node` = `$HOME/bin/node` symlink 或绝对路径）。
> **期望值引用规则**：版本串一律引用 `active.version`（记 `<nodever>`，输出形态 `v<nodever>`）——不写死副本。

## 一、设备侧用例（⬜ 待 CI 首产 + M2-T2）

| # | 用例 | 环境 | 前置 | 步骤 | 期望（可证伪） | 探针 | FR | 状态 |
|---|---|---|---|---|---|---|---|---|
| TC-003-01 | 版本串回程 | device | 产物已物化 + env 注入（[plan](./plan.md) §3 模板） | `PTY$ node -v` | stdout = `v<nodever>`（= `CLI_VERSION`）；退出码 0 | P1 | FR-003-002 | ⬜ |
| TC-003-02 | 版本可编程获取 | device | 同上 | `PTY$ node -e 'console.log(process.version, process.versions.node)'` | 两个值均 = `<nodever>` 形态（`v` 前缀）；与 TC-003-01 同源 | P1 | FR-003-002 | ⬜ |
| TC-003-03 | `-e` 执行回程 | device | 同上 | `PTY$ node -e 'console.log(1+1)'` | stdout = `2`；exit 0 | P5 | FR-003-005 | ⬜ |
| TC-003-04 | `-p` 求值打印 | device | 同上 | `PTY$ node -p '1+1'` | stdout = `2`；exit 0 | P5 | FR-003-005 | ⬜ |
| TC-003-05 | 退出码传递 | device | 同上 | ①`node -e 'process.exit(7)'`；②`node -e 'throw new Error("x")'`；③`node -e 'this is not js'` | ①exit 7；②exit 1 且 stderr 含 `Error: x`；③exit 非 0 且 stderr 可读（含 SyntaxError 语义） | — | FR-003-003 | ⬜ |
| TC-003-06 | 脚本文件执行（CJS） | device | filesDir 放 `t.js`：`console.log(require.main.filename, __dirname.length>0)` | `PTY$ node t.js`；再绝对路径执行 | 两次输出一致且 filename = 实际路径；exit 0 | — | FR-003-006 | ⬜ |
| TC-003-07 | 脚本文件执行（ESM/stdin） | device | filesDir 放 `m.mjs`：`import { join } from 'node:path'; console.log(join('a','b'))` | ①`node m.mjs`；②`echo 'console.log(9*6)' \| node`；③`node < t.js` | ①`a/b`；②`54`；③输出 = t.js 逻辑结果 | — | FR-003-004/006 | ⬜ |
| TC-003-08 | stderr 分流 | device | 同上 | `PTY$ node -e 'console.log("o");console.error("e")' 2>/dev/null` | stdout 仅 `o`（`e` 被重定向吞掉） | — | FR-003-004 | ⬜ |
| TC-003-09 | UTF-8 输入输出 | device | 同上 | `PTY$ node -e 'console.log("你好世界🦆")'` | stdout 原样回程（无 `?`/乱码/转义泄漏） | — | FR-003-004 | ⬜ |
| TC-003-10 | 基础模块抽查 | device | 同上 | `-e`：逐个 `require` fs/path/os/crypto/util/events/stream/buffer/url/querystring/assert/zlib；zlib 做 gzip→gunzip 比对；crypto 做 `createHash('sha256')` 固定向量 | 全部 require 成功；zlib 解压后逐字节相等；sha256(`aosp`) 与宿主参考实现同值 | — | FR-003-008 | ⬜ |
| TC-003-11 | 环境变量错误注入 | device | 故意不注入 `NODE_TOOLS_DIR`（仅本条） | `PTY$ node -e 'console.log(1)'`（node 本体不依赖该变量 ⇒ 应成功）；对照：`libnpm.so` 壳在缺变量下的行为归 TC-101-13 | node 本体 exit 0（NODE_TOOLS_DIR 只影响壳脚本与工具树，不影响解释器——事实记录）；`LD_LIBRARY_PATH` 缺失 ⇒ 链接器明确报错（另记录） | — | FR-003-010 | ⬜ |
| TC-003-12 | symlink 农场 exec | device | `$HOME/bin/node → <nativeLibraryDir>/libnode_cli.so`；PATH 含 `$HOME/bin` | `PTY$ node -v`（以命令名经 PATH 解析） | 输出 `v<nodever>`（SELinux 只查目标标签——symlink exec 成功即证据） | P8 | FR-003-011 | ⬜ |
| TC-003-13 | JIT 计时与 `--jitless` | device | 同上（Android 15 真机优先） | ①`node -e '<hotLoop 计时脚本>'`（1e7 次加法，`console.time`）；②同脚本加 `--jitless` | ①计时值回填事实区（不断言阈值）；②`--jitless` 可运行出相同结果 | P9 | FR-003-012 | ⬜ |
| TC-003-14 | TLS/内嵌 CA | device | 同上 + 网络 | `node -e 'https.get("https://registry.npmjs.org",r=>console.log(r.statusCode)).on("error",e=>{console.error(e.message);process.exit(1)})'` | 状态码（3xx/200）回程；exit 0（握手成功 = 内嵌 CA store 生效） | P10 | FR-003-009 | ⬜ |
| TC-003-15 | Intl 边界事实 | device | 同上 | `node -e 'console.log(typeof Intl)'`（及 `new Intl.NumberFormat` 尝试） | **只记录实际行为**（intl=none 预期：`undefined` 或抛错——以实测为准）；不断言形态；回填事实区与规划 §7 | — | FR-003-013 | ⬜ |
| TC-003-16 | Temporal 边界事实 | device | 同上 | `node -e 'console.log(typeof Temporal)'` | **只记录实际行为**（若拍板禁用：预期 `undefined`）；回填事实区 | — | FR-003-013 | ⬜ |
| TC-003-17 | 平台事实记录 | device | 同上 | `node -e 'console.log(process.platform, os.arch(), os.cpus().length, process.execPath)'` | **只记录不断言**（预期 platform=`linux`、arch=`arm64`；execPath 实际值回填）；结果回填事实区 | — | FR-003-014 | ⬜ |
| TC-003-18 | REPL 交互 | device | 标准 PTY 终端 | 无参启动 → 输入 `1+1` → 输入 `.exit` | 见 `>` 提示符（node REPL 形态）、回显 `2`、干净退出 | — | FR-003-007 | ⬜ |

## 二、host 侧用例（构建机执行，验证打包面/门禁链——不断言解释器行为）

| # | 用例 | 环境 | 前置 | 步骤 | 期望 | FR | 状态 |
|---|---|---|---|---|---|---|---|
| TC-003-19 | exec 门禁正样本（合成 fixture） | host | 合成 AArch64 PIE fixture（PT_INTERP=/system/bin/linker64、16KB 对齐、NEEDED ⊆ 白名单） | `node tools/provision.mjs --inspect <fixture>` | 七项 ✔（sha/size 为「记录」语义，draft 不比对）；exit 0 | FR-003-001 | ✅ 2026-11-02（logs/20261102-1 A3） |
| TC-003-20 | AAR 打包面 | host | TC-003-19 后 `--out` 投放 + `--shims` + `--assets` 投放 | `gradle :node-cli:assembleDebug` → 解包 AAR | `jni/arm64-v8a/libnode_cli.so` + `libnpm.so`/`libnpx.so`/`libcorepack.so` + `assets/node-bridge-tools/`（含 manifest.json）齐备；`useLegacyPackaging` 生效（jni 物理目录存在） | FR-003-001 | ✅ 2026-11-02（fixture 替身驱动，AAR 3.29MB；logs/20261102-1 A13） |
| TC-003-21 | META-INF 元数据自洽 | host | 同上 | 解包读 `META-INF/node-cli.properties`（library 模块打包于 classes.jar 内） | 字段与 lock/产物逐一相等（version/abi/name/size/sha256/paired.runtime/npm.version/corepack.version/assets.sha256） | FR-003-002 | ✅ 2026-11-02（logs/20261102-1 A7/A13） |

## 三、事实记录区（P9/P6 类回填处，C6）

| 项 | 值 | 记录时间 |
|---|---|---|
| P9 hotLoop 计时（JIT） | ⬜ 待 CI 首产 + 真机 | — |
| P9 `--jitless` 同脚本计时 | ⬜ | — |
| `typeof Intl` 实际行为 | ⬜ | — |
| `typeof Temporal` 实际行为 | ⬜ | — |
| process.platform / os.arch() | ⬜ | — |
| process.execPath 实际值 | ⬜ | — |
| LD_LIBRARY_PATH 缺失时报错形态 | ✅ 2026-11-03 设备实证（API 37）：无论缺失与否，linker 报 `CANNOT LINK EXECUTABLE: library "libc++_shared.so" not found: needed by main executable`——**Android 16+ 对 app 孵化 exec 不采纳 LD_LIBRARY_PATH**（export/prefix 两形态 run-as 对照均失效）⇒ 产品改静态 libc++（规划 v2.3.1，重编后此探针应双态 PASS） | — |
| 设备/系统版本 | ⬜ | — |

## 四、禁止的判据（沿用 overall-test-cases 纪律）

1. 不得以「host node 能跑」推断「设备 node 能跑」（环境面完全不同）。
2. 不得把合成 fixture 的门禁通过当作解释器可用。
3. 不得在 x86_64 模拟器上执行 arm64 产物探针并记录为通过。
4. 「只记录不断言」的条目（P9/Intl/Temporal/平台事实）不得事后改写成断言——改判据先改规划（C8）。
