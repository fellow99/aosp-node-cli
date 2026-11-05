# 101-probe-app 任务拆解

> 对应：[spec.md](./spec.md)（FR-101-PROBE-001…011）· [plan.md](./plan.md)（as-built）。
> 本模块**已是实现态**：tasks 记录的是「已完成的建仓/跑批动作 + 本批补充项 + 遗留执行项」，
> 不是规划。

## T1 载体建仓（已闭环，M2-T1）
- [x] T1.1 独立 Gradle 工程 `probe-app/`（根 `build.gradle.kts` + `settings.gradle.kts` + `app/`），
  不在根 settings 内（000 单模块红线；`probe-app/build.gradle.kts:1-6`）
- [x] T1.2 `app/build.gradle.kts`：仅 arm64 ABI + `useLegacyPackaging=true` + `ignoreAssetsPattern`
  覆写（dot 文件）——`app/build.gradle.kts:18-31`
- [x] T1.3 `MainActivity.java`：物化 / 注入 / exec 包装 / 探针表 / JSON 报告（全量，见 plan §4）
- [x] T1.4 manifest：仅 INTERNET + `extractNativeLibs=true`（`AndroidManifest.xml`）

## T2 探针正典映射与设备跑批（已闭环，M2-T2）
- [x] T2.1 实现 TC-MAT-01/TC-003-01…18/TC-101-01…15 可执行子集（`MainActivity.probes()`）
- [x] T2.2 2026-11-04 设备跑批：49 探针 = 48 PASS + 1 BLOCKED（TC-003-18 REPL 设计内）
  ——`logs/20261104-1/DEVICE_TEST_REPORT.md`
- [x] T2.3 事实回填：platform=android、npx 直启 C1 拒、self-contained（v2.3.1）、`typeof Intl`=undefined
- [x] T2.4 本模块 as-built 文档归档（spec.md/plan.md/test-cases.md/tasks.md）——2026-11-05

## T3 本批补充：Intl / B1 探针 + 无头自动化（2026-11-05）
- [x] T3.1 `MainActivity.java` 新增 TC-INTL-01（`/\p{ID_Start}/u`）、TC-INTL-02（`Intl zh-CN`）、
  TC-INTL-03（B1 error-hook + `NODE_OPTIONS=--require`）；判据注释引用
  `docs/20261105-cli-实测问题-修复设计.md` §4.1/§2.1
- [x] T3.2 `runAll()` 生成 `error-hook.js`（TC-INTL-03 前置）
- [x] T3.3 autorun intent（`--ez autorun true`，FR-101-PROBE-011）
- [x] T3.4 host 编译验证：`gradle :app:assembleDebug --console=plain`（项目自带 Gradle 9.4.1）
  ——`logs/20261105-1/DEV_CHECKLIST.md`
- [ ] T3.5 TC-INTL-01/02/03 设备跑批 ⬜（待设备窗口；①② 当前 AAR 预期 FAIL 如实记录，
  ③ 预期 PASS）——结论回填本模块 test-cases 事实区与 SPECS_CHECKLIST

## T4 遗留执行项（非文档缺口）
- [ ] T4.1 原生 arm64 环境复测（正式 G3；翻译模拟器结果仅记录）
- [ ] T4.2 lock 回写 full-icu 重 cut 事实（size/sha、sources.icu 回填）——随 CI 首产
- [ ] T4.3 B3 残余（原生致命错误 stderr 不可见）如需，另行立项（修复设计 §6，不阻塞）
