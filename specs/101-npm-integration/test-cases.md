# 101-npm-integration 测试用例（npm/npx/corepack 主要用例正典）

> 对应：[spec.md](./spec.md) §3（FR-101-001…014）· 规划 §7.1（探针 P2/P3/P4/P6/P7）· 决策 D5/D6。
> **环境/状态口径**：同 [`../003-cli/test-cases.md`](../003-cli/test-cases.md)（host/device 分列，⬜ 待执行，C6）。
> `PTY$` = 终端 App 内经 PTY 执行（`npm` = `libnpm.so` 壳脚本别名，余同）。
> **期望值引用规则**：npm/corepack 版本一律引用 lock `builtFrom.{npm,corepack}.version`（记
> `<npmver>`/`<cpver>`），node 版本引用 `active.version`（记 `<nodever>`）——不写死副本。
> **BLOCKED 机制**：P6/P7 安装族前置 = 003 的 TC-003-14（P10 TLS）通过；未通过 ⇒ 标 BLOCKED（外部依赖），不删用例。

## 一、设备侧用例（⬜ 待 CI 首产 + M2-T2）

| # | 用例 | 环境 | 前置 | 步骤 | 期望（可证伪） | 探针 | FR | 状态 |
|---|---|---|---|---|---|---|---|---|
| TC-101-01 | npm -v 直出 | device | 产物物化 + env 注入（[plan](./plan.md) §3） | `PTY$ npm -v` | stdout 形态 `npm@<npmver> (node v<nodever>…)` 或 npm 标准 `npm -v` 输出且含 `<npmver>`；exit 0 | P2 | FR-101-001 | ✅ 探针 2026-11-04（翻译模拟器环境；G3 正式验收需原生 arm64 复测） |
| TC-101-02 | npm 版本一致性 | device | 同上 | `PTY$ npm -v` 对比 lock `builtFrom.npm.version` | 版本段 == `<npmver>`（物化树与 lock 同源） | P2 | FR-101-014 | ✅ 探针 2026-11-04（翻译模拟器环境；G3 正式验收需原生 arm64 复测） |
| TC-101-03 | npx -v 直出 | device | 同上 | `PTY$ npx -v` | 输出 = `<npmver>`（npx 随 npm 同树分发）；exit 0 | P3 | FR-101-002 | ✅ 探针 2026-11-04（翻译模拟器环境；G3 正式验收需原生 arm64 复测） |
| TC-101-04 | 离线首启 | device | 飞行模式/无网络 | `PTY$ npm -v`；`PTY$ npm ls`（空项目目录） | 两命令均成功且**不触网**（无网络下成功即证明）；npm ls 列出（空） | — | FR-101-003 | ✅ 探针 2026-11-04（翻译模拟器环境；G3 正式验收需原生 arm64 复测） |
| TC-101-05 | corepack --version 直出 | device | 同上 | `PTY$ corepack --version` | 输出 = `<cpver>`；exit 0 | P4 | FR-101-002 | ✅ 探针 2026-11-04（翻译模拟器环境；G3 正式验收需原生 arm64 复测） |
| TC-101-06 | 参数透传与退出码 | device | 同上 | `PTY$ npm --help`；`PTY$ npm invalid-subcommand` | help 输出完整（壳零解释）；无效子命令 exit ≠ 0 且与直调 `node …/npm-cli.js invalid-subcommand` 同码 | — | FR-101-004 | ✅ 探针 2026-11-04（翻译模拟器环境；G3 正式验收需原生 arm64 复测） |
| TC-101-07 | 纯 JS 包安装 | device | 网络 + P10 已过 | `PTY$ npm install ms` → `node -e 'console.log(typeof require("ms"))'` | 安装成功 exit 0；require 输出 `function`；`npm ls` 出现 ms | P6 | FR-101-005 | ✅ 探针 2026-11-04（翻译模拟器环境；G3 正式验收需原生 arm64 复测） |
| TC-101-08 | 安装清单 | device | TC-101-07 后 | `PTY$ npm ls`；`PTY$ npm ls -g` | ls 含 npm 与 ms；`ls -g` 列 `$HOME/lib/node_modules` 全局面 | — | FR-101-006 | ✅ 探针 2026-11-04（翻译模拟器环境；G3 正式验收需原生 arm64 复测） |
| TC-101-09 | 卸载 | device | TC-101-07 后 | `PTY$ npm uninstall ms` → `node -e 'require("ms")'` | uninstall exit 0；require 失败（MODULE_NOT_FOUND）；npm ls 不再列出 | — | FR-101-007 | ✅ 探针 2026-11-04（翻译模拟器环境；G3 正式验收需原生 arm64 复测） |
| TC-101-10 | 原生构建包失败如实 | device | 网络 + P10 已过 | `PTY$ npm install <node-gyp 类包（如含 C++ binding 的纯源码包）>` | **预期失败**：exit ≠ 0；stderr 含可分类构建失败语义（编译器/gyp/make 缺失）；`npm ls` 无半安装残留 | P7 | FR-101-008 | ✅ 探针 2026-11-04（翻译模拟器环境；G3 正式验收需原生 arm64 复测） |
| TC-101-11 | npm i -g 边界事实 | device | 网络 + P10 已过 | `PTY$ npm install -g cowsay`（或任一带 bin 的纯 JS 包）→ ①尝试直接执行 `$HOME/bin/cowsay`；②`node <脚本路径>`；③`npx cowsay` | 安装 exit 0 且落 `$HOME/lib/node_modules`；①直接 exec **预期失败**（记录 errno/文案进事实区）；②③可替代成功 | — | FR-101-009 | ✅ 探针 2026-11-04（翻译模拟器环境；G3 正式验收需原生 arm64 复测） |
| TC-101-12 | npx 运行 | device | 网络 + P10 已过 | `PTY$ npx cowsay hello`（未预装场景） | **判据修订（2026-11-03 设备实证）**：npx 对 bin 的执行路径是**直启 bin 文件**（非「经 node 直启」）——bin 落 app 数据目录 ⇒ SELinux C1 拒（exit 126 Permission denied），与 `npm i -g` bin 同一边界；替代路径 = `node <bin 脚本>`（TC-101-11c）。FR-101-010 的「绕开 shebang 限制」假设不成立，按能力边界事实记录 | — | FR-101-010 | ✅ 探针 2026-11-03（exit 126 + 事实记录；替代路径 ✅） |
| TC-101-13 | corepack 禁拉可执行件 | device | 离线（飞行模式） | `PTY$ corepack pnpm -v` | **预期可读失败**：exit ≠ 0（离线 + `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` 拒绝下载）；在线环境若「意外成功」⇒ 记录为边界违规事实回写规划 R6 | — | FR-101-012 | ✅ 探针 2026-11-04（翻译模拟器环境；G3 正式验收需原生 arm64 复测） |
| TC-101-14 | 无网络失败可读 | device | 飞行模式 | `PTY$ npm install <未缓存包（如 is-odd）>`——**判据修订**：须用未缓存包（首测用 ms 命中本地缓存「离线安装成功」假阴性；npm 11 亦无 `--no-cache-dir` flag） | exit ≠ 0；报错含网络语义；不崩溃不静默 | — | FR-101-013 | ✅ 探针 2026-11-03（二跑） |
| TC-101-15 | 树损坏报错 | device | 人为删物化树内 `npm/bin/npm-cli.js` | `PTY$ npm -v` | 明确报错（模块找不到类），exit ≠ 0（兜底 = 消费方重新物化，非 npm 自修复——记录事实） | — | FR-101-014 | ✅ 探针 2026-11-04（翻译模拟器环境；G3 正式验收需原生 arm64 复测） |

## 二、host 侧用例（构建机执行——随 001 dev 验证）

| # | 用例 | 环境 | 前置 | 步骤 | 期望 | FR | 状态 |
|---|---|---|---|---|---|---|---|
| TC-101-16 | npm/corepack 树构成与可执行冒烟 | host | 001 build 步⑦产物（真实源码树驱动） | ①检查 `.dist/out/node-bridge-tools/{npm,corepack}/`；②host node 执行三入口：`node …/npm/bin/npm-cli.js -v`、`npx-cli.js -v`、`corepack/dist/corepack.js --version` | ①入口在位；`test/`、docs、`man/`、`node_modules/.bin`、`*.md` 已剔除而 **`node_modules` 本体保留**（v2.2.1 剪枝口径）；无 ELF magic 文件；②三入口冒烟回程版本串（host Node 满足 engines；此为树完整性判据，非设备行为判据） | FR-101-001/003 | ✅ 2026-11-02（logs/20261102-1） |
| TC-101-17 | 壳脚本内容与语法 | host | 同上 | 查看三壳内容；`sh -n` | 内容 = 001 §3.3 模板（shebang `#!/system/bin/sh` + `exec …libnode_cli.so <entry> "$@"`）；语法过；entry 与 lock `matrix.shellShims` 一致 | FR-101-001/004 | ✅ 2026-11-02（logs/20261102-1） |
| TC-101-18 | manifest 登记树 | host | provision `--assets` 投放后 | 检查 manifest.json；篡改一个文件后 `--assets-mode verify` | `files` 含 `npm/…`/`corepack/…` 条目；篡改 ⇒ verify exit 2（漂移检出） | FR-101-003 | ✅ 2026-11-02（logs/20261102-1） |
| TC-101-19 | 白名单放行 | host | jniLibs 投放主件+三壳后 `--check` | `node tools/provision.mjs --check` | exit 0（二分类白名单生效，三壳五判据全过） | FR-101-001 | ✅ 2026-11-02（logs/20261102-1） |
| TC-101-20 | 伪壳判死（错误引用） | host | 伪壳内容 exec `libnode.so` 放入 jniLibs | `--check` | exit 2（判据③ 拒：内容含 `libnode.so`） | FR-101-001 | ✅ 2026-11-02（logs/20261102-1） |
| TC-101-21 | 伪壳判死（网络命令） | host | 伪壳内容含 `curl …` | `--check` | exit 2（判据④ 拒：网络/下载关键词） | FR-101-001 | ✅ 2026-11-02（logs/20261102-1） |
| TC-101-22 | 伪壳判死（错误 shebang） | host | 伪壳首行 `#!/bin/sh` 或二进制内容 | `--check` | exit 2（判据②拒 / 非 sh 壳形态走 ELF 规则拒） | FR-101-001 | ✅ 2026-11-02（logs/20261102-1） |

## 三、事实记录区（回填处，C6）

| 项 | 值 | 记录时间 |
|---|---|---|
| `npm i -g` bin 直接 exec 失败形态（errno/文案） | exit=126 `Permission denied`（SELinux C1；bin 落 `$HOME/bin`（app 数据目录））；`node <bin 脚本>` 替代成功 | 2026-11-03 模拟器 |
| `node <bin 脚本路径>` 替代调用结果 | ✅ 探针 2026-11-04（翻译模拟器环境；G3 正式验收需原生 arm64 复测） | — |
| corepack 在线环境拉可执行件的实际行为 | ✅ 探针 2026-11-04（翻译模拟器环境；G3 正式验收需原生 arm64 复测） | — |
| 树损坏报错串样例 | 探针实测：删 `npm/bin/npm-cli.js` ⇒ npm 明确报错 exit≠0；从 assets 恢复后复原（TC-101-15 全链 PASS） | 2026-11-03 模拟器 |
| 原生构建包失败错误串样例（P7） | ✅ 探针 2026-11-04（翻译模拟器环境；G3 正式验收需原生 arm64 复测） | — |
| npm/corepack 实测版本（vs lock 钉选） | npm 11.20.0 / corepack 0.36.0——与 lock 钉选一致（TC-101-02/05 PASS）；npm --help 本身 exit 1（npm 11 行为，help 文本完整输出） | 2026-11-03 模拟器 |

## 四、禁止的判据

1. 不得以 host npm 行为推断设备 npm（路径/权限/网络面不同）。
2. 不得断言上游错误文案逐字匹配（npm 版本会变），只断言可分类语义 + 退出码 + 无残留。
3. P10（TLS）未通过时 P6/P7 族标 BLOCKED，不得删除用例或跳过不记录。
4. `npm i -g` bin 不可 exec 是**预期边界**（规划 §7 已知限制 1），不得记为缺陷；记录事实即可。
5. corepack 禁拉可执行件是纪律（R6）：在线「意外成功」必须记录为边界违规事实，不得当作通过。
