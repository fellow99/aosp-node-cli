# 003 · CLI（node 命令行）功能规格

> 模块：003-cli · 状态：⬜ 已立项（契约与用例本批冻结；执行依赖 CI 首产产物 + M2-T2 真机窗口）
> 所属工程：aosp-node-cli · 规划基线：[`docs/000-工程规划.md`](../../docs/000-工程规划.md) §1.1（定位）/§6（exec 门禁）/§7（运行期契约）/§7.1（回程探针）
> 对应里程碑任务：M1 产物行为 + M2-T2 探针（P1/P5/P8/P9/P10）；构建见 [`001-building`](../001-building/spec.md)

## 1. 目的

定义「设备上的 `node` 命令」这一产品本体的行为契约：进程形态、版本身份、代码执行、
stdio 语义、`$HOME/bin` symlink 农场、JIT 与 TLS 能力面、环境变量契约与**能力边界**
（Intl=none / Temporal 不可用）——并给出可证伪的主测试用例集（host 侧 + 设备侧）。

## 2. 范围

**在范围内（003）：** 解释器进程契约（exec/PTY/退出码/stdio）；`node -v` / `--version` /
`-e` / `-p` / 脚本文件 / REPL / stdin 管道行为；`require`/`import` 基础模块抽查；TLS 信任链
（内嵌 Mozilla CA store）；环境变量契约（`HOME`/`TMPDIR`/`PATH`/`LD_LIBRARY_PATH`/
`NODE_TOOLS_DIR`/`NODE_NATIVE_DIR` 的**语义定义**）；symlink 农场（`node → libnode_cli.so`）
exec 语义（P8）；JIT 行为与 `--jitless` 兜底（P9）；平台事实记录。

**不在范围内（003）：** 二进制怎么编出来（→ 001）；流水线（→ 002）；`npm`/`npx`/`corepack`
命令语义与安装边界（→ [`101-npm-integration`](../101-npm-integration/spec.md)；`node <npm 入口>`
的解释器职责归本模块，命令契约归 101）；环境引导层的物化实现与 marker 纪律（消费方职责，
规划 §7）；嵌入 API / Kotlin 桥（属 aosp-node-bridge，规划 §1.3）。

## 3. 功能需求

### 3.1 进程与身份域

- **FR-003-001（MUST）**：独立进程解释器——经终端 PTY（`forkpty`+`execve`）启动
  `libnode_cli.so`，进程有独立生命周期；ELF 形态服从 000 七项 exec 门禁（ET_DYN PIE /
  PT_INTERP=/system/bin/linker64 / 16KB 对齐）；exec 时 `LD_LIBRARY_PATH` 须含
  nativeLibraryDir（`libc++_shared.so` 由配对 runtime 供给，规划 §7）。
- **FR-003-002（MUST）**：版本身份——`node -v`（经 PTY）输出 `v<ver>` 且 = 制品版本 =
  `CLI_VERSION`；`process.version`/`process.versions.node` 可编程获取同值（P1）。
- **FR-003-003（MUST）**：退出码传递——`node -e 'process.exit(7)'` 退出 7；未捕获异常
  exit 1；`node -e` 语法错误 exit 非 0 且 stderr 可读。
- **FR-003-004（MUST）**：stdio 语义——stdout/stderr 分流（`2>` 重定向可见）；UTF-8
  输入输出不乱码；stdin 管道（`echo … | node`）与 `node < file` 可用。

### 3.2 执行域

- **FR-003-005（MUST）**：`-e` 执行——单行/多行代码、`console.log` 回程（P5 主判据）；
  `-p` 求值打印。
- **FR-003-006（MUST）**：脚本文件执行——物化在 filesDir 的 `.js`/`.mjs`/`.cjs` 文件可执行
  （相对/绝对路径；`require.main.filename`/`import.meta.url` 正确）；ESM/CJS 双形态。
- **FR-003-007（MUST）**：REPL——交互式 `>` 提示符回程、多行续行、`.exit`/Ctrl-D 退出
  （PTY 真终端语义）。
- **FR-003-008（MUST）**：基础模块抽查——`fs`/`path`/`os`/`crypto`（hash/Hmac）/`util`/
  `events`/`stream`/`buffer`/`url`/`querystring`/`assert` 逐项 require + 最小闭环；
  `zlib`（压缩/解压闭环）；`https`（网络域，见 3.3）。

### 3.3 运行环境与能力域

- **FR-003-009（MUST）**：TLS 信任链——Node 内嵌 Mozilla CA store 生效：`https.get`
  公网站点握手成功 + 状态码回程（P10；npm 网络面前置，101 依赖此结论）；证书校验失败
  路径可预期（错误而非静默）。
- **FR-003-010（MUST）**：环境变量契约（规划 §7 全表在本模块验收）：
  `HOME`/`TMPDIR`=filesDir 子目录、`PATH` 含 nativeLibraryDir 与 `$HOME/bin`、
  `LD_LIBRARY_PATH`=nativeLibraryDir、`NODE_TOOLS_DIR`=物化树根、`NODE_NATIVE_DIR`=
  nativeLibraryDir——错误注入下的失败模式（缺 `NODE_TOOLS_DIR` ⇒ 壳脚本/工具路径类
  明确报错；`LD_LIBRARY_PATH` 缺失 ⇒ 链接器报错）可观察、不静默。
- **FR-003-011（MUST）**：symlink 农场 exec（P8）——`$HOME/bin/node →
  <nativeLibraryDir>/libnode_cli.so` 后，以命令名 `node -v` 经 PATH 解析执行成功
  （SELinux 只查目标文件标签， symlink 不构成 exec 障碍——以真机证据为准）。
- **FR-003-012（MUST）**：JIT 行为（P9）——hotLoop 计时入验收记录（时间量级记录，不断言
  阈值）；`--jitless` 可运行（兜底路径）；结论回填规划（R8）。
- **FR-003-013（MUST）**：能力边界如实呈现——`Intl` 不可用（`--with-intl=none`，D7 有意
  分歧；`typeof Intl` / `new Intl.NumberFormat` 的**实际行为**记录进事实区）；Temporal
  不可用（若 §4.3 拍板禁用；`typeof Temporal`）；消费方文档口径以本模块用例记录为准。
- **FR-003-014（MUST）**：平台事实记录——`process.platform`（预期 `linux`）/`os.arch()`
  （预期 `arm64`）/`os.cpus().length`/`process.execPath` 记录入验收记录（记录事实，
  不断言特定值）。

## 4. 验收场景（主测试用例索引）

设备侧判据 = 规划 §7.1 P1/P5/P8/P9/P10；host 侧判据 = 产物门禁与打包面。用例正典：
[test-cases.md](./test-cases.md)（TC-003-01…21，含执行环境/前置/状态列）。

- **P1 主链**：PTY 内 `node -v` 与 `node -e` 双回程（TC-003-01/03）。
- **P5 脚本链**：`-e`/`-p`/脚本文件/stdin（TC-003-03/04/06/07）。
- **P8 symlink 链**：`$HOME/bin/node` 经 PATH 解析执行（TC-003-12）。
- **P9 JIT 链**：hotLoop 计时 + `--jitless` 兜底（TC-003-13）。
- **P10 TLS 链**：内嵌 CA store 的 https.get（TC-003-14）。
- **边界链**：错误注入（NODE_TOOLS_DIR/LD_LIBRARY_PATH 缺失）、Intl/Temporal 边界事实
  （TC-003-11/15/16）。
