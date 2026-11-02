# 002 · 构建流水线（building-workflow）功能规格

> 模块：002-building-workflow · 状态：⬜ 已立项（本批实现 workflow 代码；真实跑批 ⬜ 待 tag 推送触发）
> 所属工程：aosp-node-cli · 规划基线：[`docs/000-工程规划.md`](../../docs/000-工程规划.md) §9（CI 设计）/§10.1（发布模式）
> 对应里程碑任务：M1-T6（规划 §10）；上游：[`001-building`](../001-building/spec.md)（构建脚本与门禁扩展）

## 1. 目的

把 001 的构建能力编排成**一条可复现的流水线**：干净 runner 装机（NDK r30 + 16GB swap）→
单源获取 → 交叉编译 → 门禁与投放 → 归档发布 → 事实源回写——全程无手工步骤，并修复 000
已登记的 CI 退出码断言缺陷（`bash -e` 下断言分支不可达）。

## 2. 范围

**在范围内（002）：** CI workflow 双 Job（config-check 配置期门禁保留 + build-android-arm64-v8a
真实流水线）；runner 装机钉版（JDK/Gradle/Node/NDK r30/swapfile）；触发条件（tag `v<nodever>` /
手动 dispatch）；归档制品（tar.gz + `.sha256` + 元数据/许可）；GitHub Release；lock 回写物
（draft→released 的人工 PR 口径）；缓存策略；配置期门禁在 push/PR 路径的保留。

**不在范围内（002）：** 构建脚本内部逻辑与门禁判据（→ 001）；Maven Central 发布（M3，规划
§10.1）；lock 回写自动化（M4 评估）；探针 App 与真机验收（M2 → [`003-cli`](../003-cli/spec.md) /
[`101-npm-integration`](../101-npm-integration/spec.md)）。

## 3. 功能需求

- **FR-002-001（MUST）**：单流水线全链——resolve 版本（tag 去 `v` 前缀 = lock `active.version`
  断言）→ fetch → build（001 十步）→ provision 全门禁（ELF + shims + assets 静态性）→
  `assembleRelease` → 打包 → Release → artifact 上传，任何一步失败即整体失败（无继续语义）。
- **FR-002-002（MUST）**：runner 装机钉版——系统镜像（ubuntu-24.04）、JDK 21、Gradle 9.4.1、
  Node、**NDK r30** 各自版本在 workflow 内显式钉选；16GB swapfile 步骤（V8 host snapshot
  峰值内存，runtime 同款教训）；**不设 timeout-minutes**（冷 V8 交叉编译可数小时）。
- **FR-002-003（MUST）**：触发条件——push tag `v<nodever>`（如 `v26.13.0`）或
  `workflow_dispatch`（inputs：node_version / android_api）触发发布流水线；普通 push/PR 只跑
  配置期门禁（FR-000-040~042 语义保留）。
- **FR-002-004（MUST）**：退出码断言可达——预期非零退出的自检必须用「先捕获后断言」模式
  （`cmd || code=$?` 再断言；修复 000 登记缺陷：`bash -e` 下 `code=$?` 赋值先于断言执行的问题）。
- **FR-002-005（MUST）**：归档形态——`node-cli-v<ver>-android-arm64-v8a.tar.gz`（libnode_cli.so +
  三壳脚本 + npm/corepack 树 + manifest.json + BUILD/FETCH-METADATA + LICENSES）+ `.sha256`
  侧车（规划 §9/§10.1）。
- **FR-002-006（MUST）**：Release 纪律——tag 钉 commit；Release 资产 = 归档 + 侧车；发布 Job
  与配置门禁分 Job，`permissions: contents: write` 仅发布 Job 显式声明（其余 `read`）。
- **FR-002-007（MUST）**：lock 回写路径——Release 成功后产出 lock 回写物（size/sha256/ndk/
  flags/patch/npm/corepack 树摘要/shims + `status=released`）作为 artifact 供维护者 PR
  （M4 前人工合入；不直接 push main）。
- **FR-002-008（SHOULD）**：缓存——fetch 单源与构建中间物按锁值键缓存，命中时跳过（衔接
  FR-001-002 可重入）；首轮实测耗时后定 ccache/NDK 安装缓存策略（规划 §9 ⬜）。
- **FR-002-009（MUST）**：卫生——凭据不入流水线日志；RELEASE 类敏感参数不在 push 路径出现；
  产物只经 artifact/Release 通道出仓。

## 4. 验收场景

- **配置期路径不回归**：PR/push 触发的门禁 Job 与 000 行为一致（含修复后的退出码断言模式）。
- **发布流水线可复现**：同 tag 重跑产出同 sha256 归档（NFR；⬜ 首跑后验证）。
- **断言缺陷已修**：provision `--check` 未投放场景在 CI 中真实走到断言分支并按预期「绿」。
- **lock 回写物就绪**：Release Job 产出可直接应用的 lock 回写 artifact（⬜ 首跑后验证）。

（本批可验证 = workflow 语法/结构/断言模式静态检查 + 本地 `node --check`/YAML 解析；真实
跑批 ⬜ 待 tag 推送。）
