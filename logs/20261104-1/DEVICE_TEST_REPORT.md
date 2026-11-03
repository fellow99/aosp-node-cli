# DEVICE_TEST_REPORT —— M2-T1 探针部署与设备跑批（2026-11-03/04）

> 载体：`probe-app/`（M2-T1）· 设备：本机模拟器（x86_64 + ARM 翻译层，Android 17/API 37，
> abilist 含 arm64-v8a）· 制品：Release v26.13.0 re-cut #2（run 41640714441，静态 libc++）
> **最终结果：49 探针 = 48 PASS + 1 BLOCKED（TC-003-18 REPL，设计内）+ 0 FAIL**
> 报告原件：[probe-report.json](./probe-report.json)

## 环境限定（如实，判据纪律 3）

- 在线设备为 x86_64 模拟器经 ndk_translation 执行 arm64 产物——**非原生 arm64**；
  行为面（SELinux/exec/npm/TLS/模块）判据有效，JIT 计时仅参考；
- 正式 G3 验收需 arm64 真机或原生 arm64 镜像复测（用例表已逐行标注）。

## 三阶段过程（每阶段问题→定位→修复→复跑）

| 阶段 | 现象 | 根因（实证手段） | 修复 |
|---|---|---|---|
| 1 | 全部探针 `CANNOT LINK EXECUTABLE: libc++_shared.so not found` | D3 契约：容器 AAR 恒不带 libc++_shared（runtime 供给）；探针 App 无 runtime | 探针临时带入 runtime release 同源 libc++_shared.so 验证链路（后续 v2.3.1 后移除） |
| 2 | 仍 `not found`（库已在同目录且 LD_LIBRARY_PATH 注入） | **Android 16+ 对 app 孵化的 exec 型进程不采纳 LD_LIBRARY_PATH**（run-as 对照实验：export/prefix 两形态均失效；ld.config isolated=false 排除命名空间因素） | **产品级修复（C8 先行）**：build 步① CXX += `-static-libstdc++`（NDK 官方静态 libc++）→ 产物 DT_NEEDED 只剩系统库，彻底自包含；规划 v2.3.1 契约修订 |
| 2b | 静态 libc++ CI 二跑步⑤挂 | lock 已 released（旧 sha/size）⇒ ⑤⑥ 硬比对判死 | re-cut 重开 draft（sha/size 置空=仅记录），CI 产出后回写 released（FR-002-007 既定流）；**strip 后仅 62,155,912B（62.2MB，静态增量被 strip 吸收）** |
| 3 | node 自身错误输出 stderr 为空（console.error 正常） | **上游 Node Android 行为**：错误文案经 `__android_log_print` 走 logcat（`src/debug_utils.cc:535`，tag=nodejs；logcat 实证 `Error: Cannot find module 'nope'`） | 判据修订（C8）：退出码 + 系统日志为准；另实证 `process.platform='android'`（非 linux——规划预期修正）、`os.cpus().length=0`、npx 直启 bin 亦被 C1 拒（FR-101-010 假设修订） |

## 分层结果

| 域 | 探针 | 结果 | 要点 |
|---|---|---|---|
| 物化 | TC-MAT-01 | ✅ | 1592 文件与 manifest 一致（dot 文件修复回归锁） |
| 003 进程/身份 | TC-003-01/02 | ✅ | `node -v` = v26.13.0；process.version 同源 |
| 003 执行 | 03/04/05a/05b/05c/06/07a-c/08/09 | ✅ | -e/-p/退出码/脚本 CJS+ESM+stdin/stderr 分流/UTF-8 |
| 003 模块 | TC-003-10 | ✅ | 12 模块 require + zlib 闭环 + sha256(aosp) 固定向量 |
| 003 环境 | 11a/11b | ✅ | 无 NODE_TOOLS_DIR 可用；**无 LD_LIBRARY_PATH 亦可执行（自包含实证）** |
| 003 symlink | 12a/12b | ✅ | `$HOME/bin/node` symlink exec 成功（P8）；PATH 直呼记 FACT |
| 003 JIT | 13a/13b | ✅ | JIT + --jitless 双通（P9） |
| 003 TLS | TC-003-14 | ✅ | https.get registry 200（P10，内嵌 CA） |
| 003 边界/平台 | 15/16/17 | ✅ | Intl=undefined；Temporal=undefined；**platform=android**（事实） |
| 003 REPL | TC-003-18 | ⛔ BLOCKED | PTY 语义归终端 App（设计内） |
| 101 直出 | 01/02/03/05 | ✅ | npm 11.20.0 / npx / corepack 0.36.0 与 lock 一致（P2/P3/P4） |
| 101 离线/透传 | 04a/b、06a/b | ✅ | 代理黑洞不触网；--help/退出码透传 |
| 101 安装链 | 07/07b/08a/08b/09/09b | ✅ | install ms→require→ls→ls -g→uninstall→MODULE_NOT_FOUND（P6） |
| 101 边界 | 10/10b/11a/b/c | ✅ | **P7：sqlite3 build-from-source 拒绝且无残留**；i -g bin 拒/替代通 |
| 101 npx | TC-101-12 | ✅（事实） | npx 直启 bin 亦被 C1 拒（FR-101-010 假设修订） |
| 101 corepack | TC-101-13 | ✅ | 离线拒拉可执行件（R6） |
| 101 网络/树 | 14/15 | ✅ | 未缓存包离线失败可读；树损坏报错+assets 恢复原样 |

## 结论

- **G3 探针层（翻译模拟器环境）达成**：node/npm/npx/corepack 在 Android 真实 app 沙箱内
  exec 全链可用；两处规划预期依实测修正（platform=android、npx 直启假设）；
- **产品加固沉淀**：静态 libc++（v2.3.1）使 node-cli AAR 成为真「唯一 ELF」自包含制品，
  消费方无需 runtime 供给链接依赖（§7 契约已修订）；
- 待办：①原生 arm64 环境复测（正式 G3）；②Maven Central（M3）按新 re-cut 事实执行；
  ③REPL/PTY 验收随终端 App（aosp-node-shell）立项。
