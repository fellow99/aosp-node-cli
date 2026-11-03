# 101 · npm 集成（npm-integration）功能规格

> 模块：101-npm-integration · 状态：⬜ 已立项（契约与用例本批冻结；执行依赖 CI 首产产物 + M2-T2 真机窗口）
> 所属工程：aosp-node-cli · 规划基线：[`docs/000-工程规划.md`](../../docs/000-工程规划.md) §3.1 D5/D6（JS 树随包+壳脚本）/§5（制品）/§7（npm_config_* 契约）/§7.1（P2/P3/P4/P6/P7 探针）
> 对应里程碑任务：M1-T4/T5（npm 部分）+ M2-T2（P2/P3/P4/P6/P7）；上游：[`003-cli`](../003-cli/spec.md)（node 解释器与 TLS 前置）

## 1. 目的

定义「设备上的 `npm` / `npx` / `corepack` 命令」的行为契约：随包 JS 树的组成与离线可用性、
壳脚本直出、`npm install <纯 JS 包>` 全链、**安装边界（原生构建包失败如实上报）**、
`npm i -g` 的能力边界（bin 脚本不可 exec / `#!/usr/bin/env node` 不可寻）、corepack 的
使用边界（禁止经其获取可执行件）——并给出可证伪的主测试用例集。

## 2. 范围

**在范围内（101）：** npm/corepack 树随包构成（同一棵源码树剪枝、manifest 登记）；`libnpm.so`
/ `libnpx.so` / `libcorepack.so` 壳脚本行为；`npm -v` / `npx -v` / `corepack --version`
直出（P2/P3/P4）；`npm install <纯 JS 包>` + `require` 闭环（P6）；`npm ls` / `npm uninstall`；
安装边界（`npm install <node-gyp 原生构建包>` 失败如实上报 P7）；`npm i -g` 边界事实；
`npm_config_*` 环境契约（prefix/cache/update_notifier）；corepack 边界（仅 `--version` 与
钉版 JS 兜底，禁止运行期下载可执行件）；npx 运行包；npm 网络失败可读。

**不在范围内（101）：** npm/corepack 本体的修改或补丁（随包树原样剪枝，C1）；npm/corepack
的交叉编译（纯 JS 无此环节）；树怎么收集/投放（→ [`001-building`](../001-building/spec.md)）；
node 解释器行为与 TLS（→ 003，P10 是本模块 P6 的前置）；pnpm 本体（独立线 `aosp-pnpm-cli`，
规划 §1.3/§9.3）；私有镜像/index 配置（消费方环境面）；物化实现与 marker 纪律（消费方职责）。

## 3. 功能需求

### 3.1 命令直出域（D5/D6）

- **FR-101-001（MUST）**：`npm` 命令直出——`libnpm.so` 壳脚本以 `exec
  <nativeLibraryDir>/libnode_cli.so <NODE_TOOLS_DIR>/npm/bin/npm-cli.js "$@"` 实现；PTY 内
  `npm -v` 回程 `npm@<npmver>` 形态且与 lock `builtFrom.npm.version` 一致（P2）。
- **FR-101-002（MUST)**：`npx` / `corepack` 命令直出——`libnpx.so`（`npm/bin/npx-cli.js`）回程
  `npx -v`（P3）；`libcorepack.so`（corepack 入口）回程 `corepack --version`（P4）。
- **FR-101-003（MUST）**：离线首启——npm/corepack 树随包物化后，首次 `npm -v` / `npm ls`
  **不触发任何网络请求**（飞行模式判据）；npm/corepack 不单独钉版（随 node 树分发，版本
  记 lock `builtFrom`，规划 §2-5）。
- **FR-101-004（MUST）**：参数透传——壳脚本对参数零解释（`"$@"` 原样），退出码 = 内层 CLI
  退出码；`NODE_TOOLS_DIR` 缺失 ⇒ 壳脚本明确报错退出（不静默、不 fallback 错误路径）。

### 3.2 安装域（P6/P7 主链）

- **FR-101-005（MUST）**：纯 JS 包安装——`npm install <纯 JS 包>`（如 `ms`）从 registry
  下载并安装进 `$HOME`（filesDir 侧项目/全局），随后 `node -e 'require("<pkg>")'` 成功
  （P6 判据；前置 = 003 的 P10 TLS 链路可用）。
- **FR-101-006（MUST）**：安装清单——`npm ls` 显示已装包（npm 自身 + 新装包）；`npm ls -g`
  列全局面。
- **FR-101-007（MUST）**：卸载——`npm uninstall <包>` 后 require 失败且 `npm ls` 不再列出；
  无半卸载残留。
- **FR-101-008（MUST）**：原生构建包失败如实上报（P7）——`npm install <node-gyp 类包>`
  **必须失败**：npm 非 0 退出 + 明确报编译器/构建工具缺失（设备无编译器是能力边界，
  绝不静默降级，规划 §7 已知限制 2）；无半安装残留。
- **FR-101-009（MUST）**：`npm i -g` 边界事实（规划 §7 已知限制 1）——全局安装成功落
  `$HOME/lib/node_modules`（`npm_config_prefix=$HOME` 生效）；但产出的 bin 脚本 ①落
  filesDir 不可直接 exec（C1/SELinux）②`#!/usr/bin/env node` 在 Android 无 `/usr/bin/env`
  ⇒ 经 `npx <包>` 或 `node <脚本路径>` 显式调用是**事实判据**（记录，不判失败）。
- **FR-101-010（SHOULD）**：npx 运行——`npx <纯 JS CLI 包> --version` 型调用成功（bin 脚本
  经 npx 的 node 直启路径，绕开 shebang 限制）。**v2.3.1 as-built 修订（2026-11-03 设备
  实证）**：npx 对 bin 的执行路径为**直启 bin 文件**——落 app 数据目录即被 SELinux C1 拒
  （exit 126），「绕开 shebang 限制」假设不成立；能力边界 = 与 `npm i -g` bin 同限，
  替代路径 `node <bin 脚本>` 可用（TC-101-11c 实证）。

### 3.3 配置与边界域

- **FR-101-011（MUST）**：`npm_config_*` 契约（规划 §7 全表在本模块验收）：
  `npm_config_prefix=$HOME`（`npm i -g` 落 `$HOME/lib/node_modules`，默认 `/usr/local` 不可写）、
  `npm_config_cache=$HOME/.npm`、`npm_config_update_notifier=false` ⬜——错误注入下的失败
  模式（prefix 指向只读路径 ⇒ 安装失败可读）可观察。
- **FR-101-012（MUST）**：corepack 使用边界（规划 §7 已知限制 3/R6）——corepack 仅用于
  `--version` 与钉版 JS 兜底；**禁止经 corepack 获取可执行件**（`corepack use pnpm` 类操作
  触发运行期下载 Rust 可执行件，与 C2 冲突）：判据 = `corepack pnpm -v` 类调用要么被
  `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` + 离线环境拒绝（可读失败），要么记录为边界事实；
  pnpm 走独立 `aosp-pnpm-cli` 线。
- **FR-101-013（MUST）**：网络失败可读——无网络时 `npm install` 失败报错含网络语义，
  不崩溃、不静默成功。
- **FR-101-014（MUST）**：物化树版本一致性——设备上 `npm -v` / `corepack --version` 与
  lock `builtFrom.{npm, corepack}.version` 一致；树损坏（人为删文件）⇒ 明确报错（事实
  判据，兜底 = 消费方重新物化，非 npm 自修复）。

## 4. 验收场景（主测试用例索引）

用例正典：[test-cases.md](./test-cases.md)（TC-101-01…22，host/device 分列）。设备侧判据 =
规划 §7.1 P2/P3/P4/P6/P7；host 侧判据 = 随包树构成/壳脚本内容/manifest 登记/白名单。

- **P2/P3/P4 直出链**：`npm -v` → `npx -v` → `corepack --version`（TC-101-01/03/05）。
- **P6 安装链**：`npm install ms` + `require`（TC-101-07）→ `npm ls`（TC-101-08）。
- **P7 边界链**：node-gyp 包失败如实（TC-101-10）；`npm i -g` 边界事实（TC-101-11）。
- **corepack 边界链**：禁拉可执行件（TC-101-13）。
