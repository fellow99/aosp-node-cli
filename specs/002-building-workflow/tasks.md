# 002-building-workflow 任务拆解

> 对应：[spec.md](./spec.md) / [plan.md](./plan.md)。原则：workflow 代码本批全量落地；真实跑批 ⬜ 待 tag 推送。

## T1 config-check Job 重排
- [ ] T1.1 触发面扩展（push tags v* / dispatch inputs node_version+android_api / paths-ignore docs）
- [ ] T1.2 setup-node 显式钉版（修复 000 未显式 setup-node 的事实差距）
- [ ] T1.3 退出码断言修复（`|| code=$?` 先捕获后断言模式）— FR-002-004
- [ ] T1.4 lock JSON 语法门步骤（`node -e JSON.parse`）
- [ ] T1.5 `node --check` 覆盖 scripts/*.mjs + tools/*.mjs；`bash -n` 覆盖 scripts/*.sh

## T2 build-android-arm64-v8a Job（真实流水线）
- [ ] T2.1 触发隔离（if tag/dispatch）+ `permissions: contents: write` 仅本 Job
- [ ] T2.2 装机矩阵（build-essential/xz/file + JDK21/Gradle9.4.1/Node + NDK r30 env 单点钉版）
- [ ] T2.3 16GB swapfile 步骤；**不设** timeout-minutes
- [ ] T2.4 resolve 版本步骤（tag/dispatch → 与 lock active.version 断言）
- [ ] T2.5 步骤链接线：fetch → build → provision（--out/--shims/--assets/--check）→ assembleRelease
- [ ] T2.6 归档（tar.gz + .sha256 侧车 + AAR）+ artifact 上传 — FR-002-005
- [ ] T2.7 GitHub Release（softprops/action-gh-release，tag 钉 commit）— FR-002-006

## T3 lock 回写物
- [ ] T3.1 `tools/lock-writeback.mjs`（读 .dist/out 产物与 BUILD-METADATA → 生成回写 lock 全文 + diff）
- [ ] T3.2 artifact `lock-writeback` 上传；不 push main — FR-002-007

## T4 缓存与卫生
- [ ] T4.1 fetch 缓存（键含 sourceTar.sha256 前 12）— FR-002-008
- [ ] T4.2 凭据/RELEASE 参数不出现在 push 路径；日志无敏感值 — FR-002-009

## T5 验证与登记
- [ ] T5.1 YAML 语法解析 + 断言模式 grep 检查（`|| code=$?` 存在）+ 结构核对（触发/permissions/双 Job）
- [ ] T5.2 lock-writeback.mjs `node --check` + 合成输入本地试跑
- [ ] T5.3 提交（Conventional Commits：ci(workflow)/feat(tools)…）
