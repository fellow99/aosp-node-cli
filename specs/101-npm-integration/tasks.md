# 101-npm-integration 任务拆解

> 对应：[spec.md](./spec.md) / [plan.md](./plan.md)。原则：契约与用例正典本批冻结；设备侧执行 ⬜ 依赖 CI 首产 + M2-T2。

## T1 契约冻结
- [ ] T1.1 spec.md（FR-101-001…014）+ plan.md（npm_config_* 模板/设计决策）入库
- [ ] T1.2 探针归属核对：P2/P3/P4/P6/P7 → 本模块（规划 §10.2）；P10 前置引用 003

## T2 用例正典
- [ ] T2.1 test-cases.md（TC-101-01…22：device 15 条 + host 7 条）入库
- [ ] T2.2 事实记录区骨架（npm i -g bin 失败形态 / corepack 下载边界 / 树损坏报错形态）
- [ ] T2.3 BLOCKED 机制登记（P10 未过 ⇒ P6 族 BLOCKED；不删用例）
- [ ] T2.4 并入 overall-test-cases.md 索引（模块用例段）

## T3 host 侧支撑（随 001 dev 执行）
- [ ] T3.1 TC-101-16 npm/corepack 树构成（剪枝后入口在位 + 无 test/docs 大 fixture）
- [ ] T3.2 TC-101-17 壳脚本内容与 `sh -n`（三件 = 001 §3.3 模板）
- [ ] T3.3 TC-101-18 manifest 登记树（files 含 npm/corepack 条目 + 总摘要复算一致）
- [ ] T3.4 TC-101-19/20/21/22 白名单与伪壳判死（合法三壳放行 / 引用 libnode.so / 带 curl /
       非 `#!/system/bin/sh` 首行的伪壳 ⇒ exit 2）
- [ ] T3.5 TC-101-15 lock 版本一致性（builtFrom.npm/corepack.version 与树内 package.json 一致）

## T4 设备侧执行（⬜ M2-T1/T2 窗口）
- [ ] T4.1 TC-101-01…15 执行（P2/P3/P4 直出、P6 安装链、P7 边界链、corepack 边界）
- [ ] T4.2 事实区回填（npm i -g bin 失败形态 / corepack 下载行为 / 树损坏报错）
- [ ] T4.3 结论回写规划 §7.1 / §11-R6/R7 与 README 能力边界小节
