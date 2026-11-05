# 101-probe-app — 设备回程探针载体（probe-app）技术方案（plan.md）

> **性质**：**实现特定（as-built）**。本模块的「实现」就是 `probe-app/` 现有代码 + 本批补的
> TC-INTL-* 探针与 autorun；本文档逆向记录真实实现（对照规格 [spec.md](./spec.md) 的
> `FR-101-PROBE-001…011`）。
> **技术栈事实**：独立 Gradle 工程（不在根 settings.gradle 内——000 单模块红线不动，见
> `probe-app/build.gradle.kts:1-6`）；Gradle 9.4.1 + AGP 9.2.1（`probe-app/app/build.gradle.kts:1-3`）；
> 纯 Java（org.json 报告）；无 AndroidX（`probe-app/gradle.properties:1-4`）。
> **状态**：⚠️ as-built 归档；2026-11-04 跑批结论见 [spec.md](./spec.md) §9。

---

## 1. 技术上下文

| 项 | 取值 | 说明 |
|---|---|---|
| 载体模块 | `probe-app/app`（applicationId `org.fellow99.nodeprobe`） | `app/build.gradle.kts:6-18`；`minSdk 24` / `targetSdk 35` / `compileSdk 36` |
| ABI | 仅 `arm64-v8a`（`abiFilters`） | `app/build.gradle.kts:18`；禁止判据 3（x86_64 模拟器不得冒充） |
| 依赖制品 | `app/libs/node-cli-release.aar`（CI Release 归档解包） | `app/build.gradle.kts:45-48`；**当前 intl=none 产物，勿替换** |
| exec 入口 | `nativeLibraryDir/libnode_cli.so` + `libnpm.so`/`libnpx.so`/`libcorepack.so` 三壳 | `MainActivity.java:66-70`（nodeExe/npmSh/…） |
| 物化目标 | `filesDir/node-bridge-tools` + `filesDir/home` + `filesDir/npm-proj` | `MainActivity.java:71-73` |
| 期望值 | node 26.13.0 / npm 11.20.0 / corepack 0.36.0（引用 lock，C2） | `MainActivity.java:47-49`，对应 `node-cli.lock.json` `active.version`/`builtFrom.npm.version`/`builtFrom.corepack.version` |
| 基准跑批 | `logs/20261104-1/DEVICE_TEST_REPORT.md` | 49 探针 = 48 PASS + 1 BLOCKED（翻译模拟器环境） |

## 2. 宪法合规

| 条目 | 落点 |
|---|---|
| C2 唯一事实源 | 期望值全引 lock（版本常量 + `expected` 头）；探针判据不内嵌可枚举版本串副本 |
| C5 同版本配对 | `PROBE_APP_VERSION=26.13.0` = 目标 node 版本（`gradle.properties:4`；`app/build.gradle.kts:15`） |
| C6 未实测标 ⬜ | TC-INTL-01…03 本批新增未设备跑批 ⬜；①② 当前 AAR 预期 FAIL 如实标注 |
| C7 未实测不得当已测 | 判据纪律 FR-101-PROBE-006（PASS-FACT/PASS-LOGCAT 形态）；TC-003-18 标 BLOCKED 不删 |
| C8 先改文档再改实现 | 判据修订（2026-11-03 logcat / v2.3.1 自包含）先落 003/101 test-cases + 规划 §7，再改探针实现 |

## 3. 实现结构（as-built 真实文件与行数）

| 文件 | 行数（实测 2026-11-05） | 职责 |
|---|---|---|
| `probe-app/app/src/main/java/org/fellow99/nodeprobe/MainActivity.java` | 685（本批 +TC-INTL & autorun） | 物化 / 注入 / 执行器 / 探针表 / 报告（详见 §4） |
| `probe-app/app/build.gradle.kts` | 48 | application 配置 + AAR 依赖 + `packaging.jniLibs.useLegacyPackaging=true` + `ignoreAssetsPattern` 覆写（dot 文件） |
| `probe-app/build.gradle.kts` | 6 | 根工程（`com.android.application` 插件声明 apply false，独立工程） |
| `probe-app/settings.gradle.kts` | 16 | pluginManagement / dependencyResolutionManagement（google+mavenCentral+gradlePluginPortal） / include ":app" |
| `probe-app/gradle.properties` | 4 | `org.gradle.jvmargs=-Xmx2g` · `android.useAndroidX=false` · `PROBE_APP_VERSION` |
| `probe-app/local.properties` | 1 | `sdk.dir=C:/Users/Administrator/AppData/Local/Android/Sdk`（本机，废弃后由 ANDROID_HOME 兜底） |
| `probe-app/app/src/main/AndroidManifest.xml` | 20 | 仅 `INTERNET` 权限；`extractNativeLibs=true`；单一 LAUNCHER activity |
| `probe-app/README.md` | 43 | 职责 / 构建 / 使用（adb install + run-as pull 报告） |
| `probe-app/.gitignore` | 存在 | build/ 等不入库 |

## 4. 关键实现点（每条可回溯）

1. **物化（FR-101-PROBE-001/007）**：`materialize()`（`MainActivity.java:120-135`）以
   `manifest.json` 的 `totalSha256` 为 marker，与 `SharedPreferences("probe").tools.sha` 比对；
   `copyAssetTree()`（137-162）递归拷贝，空目录条目 mkdir 占位；`parseFileCount()`（592-603）
   供 TC-MAT-01 解析 `fileCount`。自检判据（353-369）：物化文件数 == fileCount+1，可捕获 aapt
   dot 过滤回归（`app/build.gradle.kts:26-31` 已覆写 ignoreAssetsPattern 去掉 `.*` token）。
2. **注入（FR-101-PROBE-002）**：`baseEnv()`（180-194）注入规划 §7 全表子集；
   `exec()`（204-257）统一经 `/system/bin/sh -c` 包装（211-232），进程层 remove
   `LD_LIBRARY_PATH`（232）——2026-11-03 实测 arm64 linker 对 exec 型产物不采纳直接传入的
   LD_LIBRARY_PATH（`MainActivity.java:211-215` 注释）。
3. **探针表（FR-101-PROBE-005）**：`probes()`（350-590）声明式数组；`Probe`/`Out`/`Check`
   数据结构见 [spec.md](./spec.md) §6。`node(...)`/`sh(...)`/`envKv(...)`/`arr(...)`
   （293-318）为命令组装工具；`OFFLINE`（347-348）代理黑洞注入。
4. **判据形态（FR-101-PROBE-006）**：`runAll()`（607-683）runner 对 check 返回做统一 verdict
   （`BLOCKED`/`PASS-` 前缀 → BLOCKED/PASS，647-650）；「只记录」类探针返回 `PASS-FACT|…`
   或 `PASS-LOGCAT|…`（如 TC-003-11b/15/16/17、TC-101-11b/12）。
5. **报告（FR-101-PROBE-004）**：汇总 `probes[]` + `runAt/device/expected` 写
   `filesDir/probe-report.json`（667-679），`adb run-as org.fellow99.nodeprobe cat files/…` 取回。
6. **前置文件（runAll 内，动线）**：`t.js`/`m.mjs`/`npm-proj/package.json`（613-624）由宿主
   生成；`$HOME/bin/node → libnode_cli.so` 软链（626-632）；本批新增 `error-hook.js`（TC-INTL-03）。
7. **本批新增（FR-101-PROBE-008…011）**：TC-INTL-01/02/03 探针 + autorun intent——见
   `MainActivity.java` §TC-INTL 探针段（本批追加）；判据注释引用 `docs/20261105-cli-实测问题-修复设计.md`
   §4.1/§2.1。

## 5. 构建与部署命令（DEV 侧）

```bash
# 使用项目自带 Gradle 9.4.1 发行版（.dist/gradle-dist/gradle-9.4.1/bin/gradle）
distGradle=".dist/gradle-dist/gradle-9.4.1/bin/gradle"
cd probe-app && "$OLDPWD/$distGradle" :app:assembleDebug --console=plain
# 产物：probe-app/app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n org.fellow99.nodeprobe/.MainActivity --ez autorun true   # FR-101-PROBE-011
adb shell run-as org.fellow99.nodeprobe cat files/probe-report.json > probe-report.json
```

## 6. 用例设计（与 003/101 同构纪律）

- 编号沿用上游正典（`TC-003-*`/`TC-101-*`），本模块自有 `TC-MAT-01`（物化）与 `TC-INTL-*`
  （2026-11-05 修复设计新增域），用例表见 [test-cases.md](./test-cases.md)。
- 判据「设备语义」优先：不能在 x86_64 模拟器上执行 arm64 产物并记录为通过（003 禁止判据 3）；
  logcat 文案类用例以退出码 + `PASS-LOGCAT` 记录（TC-003-05b/05c、TC-101-09b）。
- BLOCKED 不删用例：TC-003-18（REPL/PTY）固定 BLOCKED（非交互 ProcessBuilder 子集）。

## 7. 不一致与风险登记

| # | 项 | 处置 |
|---|---|---|
| 1 | 当前 AAR 为 intl=none 产物 ⇒ TC-INTL-01/02 将 FAIL（预期） | 判据标注「待 full-icu CI 重 cut 后 PASS」，不伪造、不改预期值；AAR 不替换 |
| 2 | 翻译模拟器 ≠ 原生 arm64（2026-11-03/04 环境限定） | 正式 G3 需原生 arm64 复测；用例表/报告逐行标注 |
| 3 | `LD_LIBRARY_PATH` 对 exec 型进程不生效（Android 16+） | 已由 v2.3.1 静态 libc++ 消解（自包含）；进程层不传该变量（负路径探针语义） |
| 4 | `npm_config_update_notifier`/`COREPACK_ENABLE_DOWNLOAD_PROMPT` 为 ⬜ 评估项 | 已注入 0，语义以 101 正典为准（101 plan §3） |

## 8. FR 交叉引用

| FR | 落点 |
|---|---|
| FR-101-PROBE-001 | `MainActivity.java:120-135`（物化幂等）· TC-MAT-01 |
| FR-101-PROBE-002 | `MainActivity.java:180-194`（baseEnv） |
| FR-101-PROBE-003 | `MainActivity.java:204-257`（exec 包装） |
| FR-101-PROBE-004 | `MainActivity.java:654-679`（报告） |
| FR-101-PROBE-005 | `MainActivity.java:47-49`（期望值）+ `probes()` 全表 |
| FR-101-PROBE-006 | `MainActivity.java:647-650`（verdict）+ 判据形态贯穿 probes() |
| FR-101-PROBE-007 | `MainActivity.java:353-369`（TC-MAT-01）+ `app/build.gradle.kts:26-31` |
| FR-101-PROBE-008 | TC-INTL-01（`/\p{ID_Start}/u.test('a')`） |
| FR-101-PROBE-009 | TC-INTL-02（`Intl.NumberFormat('zh-CN')`） |
| FR-101-PROBE-010 | TC-INTL-03（B1 error-hook + `NODE_OPTIONS=--require`） |
| FR-101-PROBE-011 | autorun intent（`MainActivity.onCreate` 本批新增） |

## 9. 文件清单（本模块，as-built 快照 2026-11-05）

- 新增（本批）：`spec.md`（147 行）/ `plan.md`（~130 行）/ `test-cases.md` / `tasks.md`。
- 修改：`MainActivity.java`（+TC-INTL-01…03 与 error-hook 生成 + autorun）。
- 既有（as-built 源）：`app/build.gradle.kts`（48 行）/ `probe-app/build.gradle.kts`（6 行）/
  `settings.gradle.kts`（16 行）/ `gradle.properties`（4 行）/ `AndroidManifest.xml`（20 行）/
  `README.md`（43 行）/ `.gitignore`。
- 未实现清单：无（本模块已是实现态；遗留仅为「原生 arm64 复测」执行项，非文档缺口）。
