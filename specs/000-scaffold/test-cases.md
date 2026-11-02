# 000-scaffold 测试用例

> 对应：[spec.md](./spec.md) §4 验收场景。执行环境：Windows + Gradle 9.4.1 + Temurin 21。

| # | 用例 | 步骤 | 期望 |
|---|---|---|---|
| TC-01 | 干净工程可配置 | `gradle :node-cli:tasks --console=plain` | BUILD SUCCESSFUL，含 `:node-cli` 任务面 |
| TC-02 | AAR 容器可产出 | `gradle :node-cli:assembleDebug` | `node-cli/build/outputs/aar/node-cli-debug.aar` 存在 |
| TC-03 | 版本坐标解析 | 配置日志 / `gradle properties` | version = `CLI_VERSION`（26.13.0 draft） |
| TC-04 | provision 语法 | `node --check tools/provision.mjs` | 退出码 0 |
| TC-05 | provision 未投放语义 | `node tools/provision.mjs --check` | 退出码 = 2，文案含"未投放" |
| TC-06 | draft 不比对哈希 | TC-05 输出 | 出现"draft 无锁值，仅记录不比对"提示 |
| TC-07 | fetch 脚本骨架语义 | `node scripts/fetch-node-cli-source.mjs --node 26.13.0` | 退出码 = 2，输出 SCAFFOLD 说明 |
| TC-08 | fetch 脚本用法错误 | `node scripts/fetch-node-cli-source.mjs` | 退出码 = 1（缺参） |
| TC-09 | build 脚本骨架语义 | `bash scripts/build-node-cli-android.sh --node 26.13.0 --src x --ndk y --out z` | 退出码 = 2，输出 SCAFFOLD 说明 |
| TC-10 | build 脚本用法错误 | `bash scripts/build-node-cli-android.sh` | 退出码 = 1（缺参） |
| TC-11 | build 脚本语法 | `bash -n scripts/build-node-cli-android.sh` | 退出码 0 |
| TC-12 | 二进制不入库 | 投放样本后 `git status --porcelain` | jniLibs/assets 下无待提交条目 |
| TC-13 | exec 门禁负样本（待 M1 补真实样本） | `provision --inspect <无 PT_INTERP 的 .so>` | ② 门禁失败，退出码 2 |

## 执行记录（2026-11-02，scaffold 提交前）

- TC-01/02：✅ `assembleDebug` BUILD SUCCESSFUL（node-cli-debug.aar 786B）。
- TC-04：✅。TC-05/06：✅（exit=2，文案含"未投放"与"draft 无锁值"）。
- TC-07~11：✅（fetch exit=2/1 符合；build-sh exit=2/1 符合；bash -n 过）。
- TC-12：✅（build/ 与 jniLibs 均被忽略，git status 干净分区内）。
- TC-13：⬜ 待 M1 产出真实 dlopen 库样本后补测。
