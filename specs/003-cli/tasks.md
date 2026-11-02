# 003-cli 任务拆解

> 对应：[spec.md](./spec.md) / [plan.md](./plan.md)。原则：契约与用例正典本批冻结；设备侧执行 ⬜ 依赖 CI 首产 + M2-T2。

## T1 契约冻结
- [ ] T1.1 spec.md（FR-003-001…014）+ plan.md（环境注入模板/用例设计决策）入库
- [ ] T1.2 探针归属核对：P1/P5/P8/P9/P10 → 本模块；P2/P3/P4/P6/P7 → 101（规划 §10.2）

## T2 用例正典
- [ ] T2.1 test-cases.md（TC-003-01…21：device 18 条 + host 3 条）入库
- [ ] T2.2 事实记录区骨架（JIT 计时/平台事实/Intl/Temporal 行为/execPath）
- [ ] T2.3 禁止的判据 4 条（host≠device / fixture≠产物 / x86_64≠arm64 / 记录≠断言）
- [ ] T2.4 并入 overall-test-cases.md 索引（§2.1 模块用例段）

## T3 host 侧支撑（随 001 dev 执行）
- [ ] T3.1 TC-003-18 exec 门禁正样本（合成 AArch64 PIE fixture 过七项门禁）
- [ ] T3.2 TC-003-19 AAR 打包面（jni/arm64-v8a/libnode_cli.so + assets/node-bridge-tools/ + manifest.json）
- [ ] T3.3 TC-003-20 META-INF properties 字段与 lock 一致

## T4 设备侧执行（⬜ M2-T1/T2 窗口）
- [ ] T4.1 探针脚本/app 用例实现（依赖消费方 PTY 载体立项）
- [ ] T4.2 TC-003-01…17 执行 + 事实区回填（含 P9 JIT 计时、Intl/Temporal 实际行为）
- [ ] T4.3 结论回写规划 §7.1 / §11-R8 与 README 能力边界小节
