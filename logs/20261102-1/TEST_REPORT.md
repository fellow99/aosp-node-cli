# TEST_REPORT —— 000-scaffold 批次首轮测试（2026-11-02）

> 执行人：主实现者（specs-based-devflow Testing 阶段）· 计划：[TEST_CHECKLIST.md](./TEST_CHECKLIST.md)
> 环境同 CHECKLIST 头注。**结论：host 侧 15/15 全过；CI 侧 4 族 ⬜ 待 tag；设备侧 2 族 BLOCKED（前提未就绪，如实登记不冒充）。**

## 1. 结果总览

| 层 | 计划 | 通过 | 失败 | 阻塞（⬜/BLOCKED） |
|---|---|---|---|---|
| A host 侧（A1…A15） | 15 | **15** | 0 | 0 |
| B CI 侧（B1…B4） | 4 | 0 | 0 | 4（待 `v26.13.0` tag 首跑） |
| C 设备侧（C1…C2） | 2 | 0 | 0 | 2（CI 首产产物 + PTY 载体 M2-T1） |

## 2. 关键证据（可复核命令/输出摘录）

- **A1 fetch 双源真实链**：`node-v26.13.0.tar.xz == SHASUMS256.txt == lock（263f639e…）`；`corepack-0.36.0.tgz == lock（9128cfe…，127543 B）`；重复运行「已缓存（跳过下载）」。
- **A3/A4/A5 门禁**：fixture 正样本七项 ✔ exit 0；`broken=interp/align/type/machine/needed` 全 exit 2；**interpn（PT_INTERP=0，dlopen 形态，TC-13）→ ② ✘ exit 2**。
- **A6/A9 负样本判死**：jniLibs 预置 `libnode.so` ⇒ `--check` exit 2；伪壳 ×4（引用 libnode.so / 带 curl / `#!/bin/sh` / 白名单外命令行 `rm -rf`）⇒ 全 exit 2；stray.txt（非 .so 杂件）⇒ exit 2。
- **A8 静态性与篡改**：树内混入 ELF（evil.so）⇒ stage 拒 exit 2；投放后篡改 `npm/bin/npm-cli.js` ⇒ verify exit 2（哈希漂移检出）；还原 ⇒ exit 0。
- **A10 幂等**：两次 `--assets` 同 `totalSha256=124c54c0d3e6fd2a…`。
- **A11/A12 树收集与冒烟（评审 Critical#1 回归锁）**：真实 v26.13.0 树 → npm 剔 588（test/docs/man/.bin/*.md）留 1540、corepack 51、合计 1591 文件 + manifest；**host Node 执行三入口：`npm-cli.js -v`→11.20.0、`npx-cli.js -v`→11.20.0、`corepack.js --version`→0.36.0**。
- **A13 打包面**：AAR 3,289,726 B；`jni/arm64-v8a/`（libnode_cli.so fixture 替身 + 三壳，exec 位在）；`assets/node-bridge-tools/`（npm+corepack+manifest）；`classes.jar` 内 properties 十字段（tool.version/abi/name/size/sha256/paired.runtime/npm.version/corepack.version/assets.sha256/provisionedAt）与 lock/产物/manifest 一致。
- **A14 CI 静态族**：YAML 解析过；`|| code=$?` 断言模式存在；双 Job/触发/permissions 结构核对；lock-writeback 本地试跑（npm 1540 files sha 57244a8c…；corepack 51 files path=corepack）。
- **A15 L1 回归**：Gradle 9.4.1 `:node-cli:tasks` 配置期通过；`provision --check` 全绿 exit 0。

## 3. 设备面核查（用户要求：真机或模拟器）

- `adb devices`：仅 `emulator-5554`（`sdk_gphone64_x86_64`，ABI **x86_64**，Android 17/API 37）——按 003/101 用例「禁止判据 3」，**不得**在 x86_64 模拟器上执行 arm64 产物探针。
- AVD 清单：`Medium_Phone`（x86_64）、`python_arm64_api35`（**arm64**，API 35）——产物就绪后 L4 探针可用。
- 无真机连接。模拟器已在线（无需拉起）。
- 设备侧用例（TC-003-01…18 / TC-101-01…15）的两个硬前置均未就绪：① `libnode_cli.so` 真实产物（需 ubuntu CI 交叉编译，本机无 NDK 且 V8 编译面在 Linux runner——规划 §4/§9 既定路线）；② 消费方 PTY 载体与环境引导层（M2-T1 立项项）。故全部 **BLOCKED 登记，不删用例、不冒充通过（C6）**。

## 4. 首个真实基线（回填 overall-test-cases §4）

| 项 | 值 | 出处 |
|---|---|---|
| AAR 容器（fixture 驱动全链） | **3,289,726 B**（M0 期 786 B） | 本机 assembleDebug ✅ |
| 随包树 | npm 1540 + corepack 51 = **1591 文件**（manifest totalSha256 `124c54c0d3e6fd2a…`） | collect-only ✅ |
| 树内版本 | npm **11.20.0**（随 v26.13.0 树）/ corepack **0.36.0**（钉版 tarball） | host 冒烟 ✅ |
| 源钉选 | node tar.xz `263f639e…` / corepack tgz `9128cfe2…` | fetch 三方一致 ✅ |
| 剪枝 | npm −588 / corepack −3（test/docs/man + node_modules/.bin + *.md） | BUILD-METADATA ✅ |

## 5. 失败与回归

无 host 侧失败。评审阶段发现并已修复的缺陷见 [REVIEW_REPORT.md](./REVIEW_REPORT.md)（含 Critical#1 npm 树剪枝——本轮 A11/A12 即其回归锁）。

## 6. 后续（B/C 层解锁条件）

1. 推送 tag `v26.13.0` 触发 CI（含 R1 归因通道：`apply_patches` 可留空裸跑）→ 回填 B1…B4 与 lock（writeback artifact 人工 PR）。
2. CI 首产后：`python_arm64_api35` AVD 或 arm64 真机 + 消费方探针 App（M2-T1）→ 执行 TC-003-01…18 / TC-101-01…15 并回填事实区。

## 7. CI 首跑补录（2026-11-02 晚，tag `v26.13.0` 推送后）

**两轮流水线，问题-修复-复跑闭环：**

| 轮次 | run | 提交 | 结果 | 事实 |
|---|---|---|---|---|
| 1 | 41449442265 | aeee9ab | **失败**（步④ make，≈2h13m 处） | `ld.lld: libnode_crates.a(temporal_rs/temporal_capi/diplomat_runtime…) is incompatible with aarch64linux`——runner 自带 cargo≥1.86 ⇒ temporal 默认开启，Rust crates 无 android cross target 产 host x86_64 对象 |
| 2 | 41471561286 | ed3ab18 | **成功**（≈2h25m，19 步全绿） | 修复：build 步③ 直呼 `./configure` 追加 `--v8-disable-temporal-support`（真实选项，configure.py:1277/2267）；顺带更正上一提交把该标志误判为「幽灵参数」的记录（grep 截断所致） |

**B 层（CI 侧）结果：B1 ✅ B2 ✅ B3 ✅ B4 ✅（G1/G2/G4 达成）**

- B1（TC-M1-002）：真实 `out/Release/node` 过形态门禁（ET_DYN / PT_INTERP=/system/bin/linker64 / AArch64 / NEEDED⊆白名单(libm,libdl,liblog,libc++_shared,libc) / 16KB align=0x4000）；
- B2（TC-M1-003/004）：strip 后 `libnode_cli.so` = **61,270,496 B（≈58.4 MiB）**，sha256 `7b540f41192d2b5d…`（lock 已回写，gates 七键转 CI 实证）；
- B3（R2/R3 观测）：R3 已答（默认闭包含 embedtest，无 cctest/openssl-cli 挂链）；R4 顺带回填（预估带内偏下沿）；
- B4（TC-PUB-001/002）：GitHub Release `v26.13.0` 资产 tar.gz 45,955,095 B + `.sha256` 侧车；lock 回写 `status=released`（依 CI 日志事实人工执行——正是 FR-002-007 设计的人工 PR 步）。

**发现并已修的第三个问题（不影响 Release 资产）：**
`actions/upload-artifact@v4` 默认 `include-hidden-files: false`，`.dist` 为点开头目录 ⇒ 三个 path 全被隐藏过滤吞掉（`if-no-files-found` 默认 warn ⇒ 步骤「绿」但 0 artifact——C4 形态的静默降级）。修复：`include-hidden-files: true` + `if-no-files-found: error`；lock-writeback 回写物因此首跑缺失，改依 CI 日志事实人工回写（本文件证据链完整）。

**C 层（设备侧）更新**：产物前置已就绪（Release 可下载 arm64 libnode_cli.so）；剩余前置 = 消费方 PTY 载体与环境引导层（M2-T1）。arm64 AVD（python_arm64_api35）在位待用。
