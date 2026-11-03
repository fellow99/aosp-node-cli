# 003-cli — 模块技术方案（plan.md）

> **性质**：**实现特定**。003-cli 是产品行为契约模块——本仓**不新增解释器代码**（Node 上游即
> 实现），实现落点是：① 探针用例的可执行化（脚本化判据）；② 打包面/门禁对行为的支撑核对；
> ③ 环境变量契约的注入模板。
> **成对文档**：功能规格见 [spec.md](./spec.md)（`FR-003-001…014` 唯一权威定义处）；用例正典见
> [test-cases.md](./test-cases.md)（TC-003-01…21）。
> **状态**：⬜ 契约冻结；设备侧执行 ⬜ 依赖 CI 首产（[`002`](../002-building-workflow/spec.md)）+ M2-T2 验收窗口。

---

## 1. 技术上下文

| 项 | 取值 | 说明 |
|---|---|---|
| 产品件 | `jni/arm64-v8a/libnode_cli.so`（exec 型 PIE，NDK r30 交叉编译，intl=none） | 001 产出、002 归档 |
| 启动方式 | 消费方 PTY：`pty.spawn(<nativeLibraryDir>/libnode_cli.so, argv, env)`；或 `$HOME/bin/node` symlink 经 PATH 解析 | 规划 §3 图 / §7 |
| 运行时配对 | `node-runtime:<ver>` 同版本上线；`LD_LIBRARY_PATH` **v2.3.1 契约修订**：设备实证 Android 16+ 对 app 孵化 exec 不采纳 ⇒ 产物改静态 libc++（`-static-libstdc++`），本变量不再承担链接职责 | 规划 §2/§7 |
| 环境注入 | 消费方环境引导层（bridge 载荷或 Kotlin）按 §3 模板注入 | FR-003-010 验收载体 |
| 探针执行面 | host：门禁/打包检查（`node`/`gradle`/`unzip`）；设备：adb shell + 真机 PTY App（M2-T1）⬜ | 用例正典分列 |

## 2. 宪法合规

C6（未实测标 ⬜）是本模块主纪律：设备侧用例全部 ⬜ 待产物；host 侧用例本批可执行。
C7：Intl=none 与 runtime small-icu 的**有意分歧**如实登记（规划 §3.2/§7 已知限制 4/5）。
C8：本文件与 [test-cases.md](./test-cases.md) 先于设备侧验收存在（规划 §10.2 已登记）。

## 3. 环境变量注入模板（FR-003-010 验收载体，与规划 §7 全表一致）

```
HOME=<filesDir>/home
TMPDIR=<filesDir>/tmp
PATH=<nativeLibraryDir>:$HOME/bin:/system/bin
LD_LIBRARY_PATH=<nativeLibraryDir>   # ⚠️ v2.3.1：linker 不再采纳（静态 libc++ 后无链接职责，保留为兼容项）
NODE_TOOLS_DIR=<filesDir>/node-bridge-tools
NODE_NATIVE_DIR=<nativeLibraryDir>
```

（物化 marker/失败上报/清残留纪律归消费方环境引导层，本模板只锁语义。`npm_config_*`
七项归 [`101-npm-integration`](../101-npm-integration/plan.md)。）

## 4. 用例设计决策

1. **编号**：`TC-003-NN`；设备侧判据直接映射规划 §7.1 探针（P1→TC-003-01/02、P5→TC-003-03、
   P8→TC-003-12、P9→TC-003-13、P10→TC-003-14），消费方验收按本表逐条引用，不另造判据。
2. **环境列**：`host`（本批可跑）/ `device`（⬜ CI 首产 + M2-T2；arm64 真机或 arm64 模拟器
   ——x86_64 AVD 不可承载 arm64 产物，禁止记录为通过）；禁止把 host 通过冒充 device。
3. **判据可证伪**：每条写「期望输出/退出码」而非「正常工作」；错误注入/UTF-8/退出码等
   负路径与正路径同权重。
4. **事实记录区**：P9 JIT 计时、`process.platform` 等只记录不断言的条目回填事实区（C6）。
5. host 侧用例（TC-003-19…21）以**合成 ELF fixture + assets 替身**驱动（001 §5 测试基础
   设施），验证打包面/门禁链，**不**断言解释器行为。

## 5. 实现策略（本批）

- 用例正典（test-cases.md）随规格入库；TC-003-19…21 并入 [`../overall-test-cases.md`](../overall-test-cases.md) 索引。
- 设备侧探针执行脚本（`scripts/probe-device.mjs` 或消费方探针 App 用例）⬜ M2-T1 立项时
  实现，本批不写空壳脚本（C4：不静默降级、S1：接口先冻结再填实现）。

## 6. 不一致与风险登记

| # | 项 | 处置 |
|---|---|---|
| 1 | REPL/UTF-8/PTY 行为受终端 App 影响（消费方变量） | 用例注明「在标准 PTY 终端下」前置；消费方差异记入事实记录区 |
| 2 | `--jitless` 与 Android 15 execmem 收紧趋势（规划 R8 ⬜） | TC-003-13 只记录 + 兜底验证；新 targetSdk 档位跟踪归规划 |
| 3 | Intl/Temporal 的具体禁用形态（`typeof Intl === 'undefined'` vs 抛错）⬜ 取决于 intl=none 编译行为 | TC-003-15/16 只记录实际行为不断言形态；结论回填规划 §7 |
| 4 | `process.execPath` 在改名 `libnode_cli.so` 后的实际值 ⬜ | TC-003-17 只记录不断言 |
