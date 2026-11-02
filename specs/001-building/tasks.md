# 001-building 任务拆解

> 对应：[spec.md](./spec.md) / [plan.md](./plan.md)。原则：代码本批全量落地；交叉编译本体验证留 CI（002）。

## T1 lock 扩展（单源钉选 + 壳白名单事实源）
- [x] T1.1 `builtFrom.sourceTar`（version+url+sha256 空串）替换 `source` 描述串 — FR-001-001/004
- [x] T1.2 `builtFrom.{patch, npm, corepack, shims, assetsManifest}` 占位结构（规划 §8 全字段）
- [x] T1.3 `matrix.shellShims` 三件（name+entry；✅ entry 已依实际树拍板回写：npm/bin/npm-cli.js、npm/bin/npx-cli.js、corepack/dist/corepack.js）
- [x] T1.4 lock JSON 语法门（`node -e JSON.parse`）+ provision 对新 lock 兼容回归（缺字段回落）

## T2 fetch 实现（替换骨架）
- [x] T2.1 读 lock sourceTar → 计划；sha256 空串且未 `--allow-unpinned` ⇒ exit 1 — FR-001-001
- [x] T2.2 下载 tar.xz + SHASUMS256.txt（可重入：存在且哈希一致跳过；不一致 exit 1）— FR-001-002
- [x] T2.3 校验：SHASUMS256.txt 内本版本哈希 == lock 钉选值（`--allow-unpinned` 时 == 官方文件值并回写 FETCH-METADATA）— FR-001-001
- [x] T2.4 解压 tar.xz → `<out>/node-src/`（官方原样，无补丁步骤）— FR-001-003
- [x] T2.5 FETCH-METADATA.json（url/version/sha256/获取时间 + shasums 出处）
- [x] T2.6 `node --check` 过 + 真实下载实测（网络允许时）

## T3 build 脚本实现（替换骨架）
- [x] T3.1 参数面扩展（--jobs/--dry-run/--apply-patch/--skip-shims）
- [x] T3.2 步① env：NDK toolchain 前缀解析 + CC_host/CXX_host 导出 + 主机工具前置检查 — FR-001-011/012
- [x] T3.3 步② 版本一致性（= lock active.version）— C5
- [x] T3.4 步③ configure 命令组装（无 --shared + --with-intl=none + 16KB LDFLAGS）— FR-001-010
- [x] T3.5 步④⑤ make + 形态校验（provision --inspect 门禁化，不过 ⇒ exit 2）— FR-001-014
- [x] T3.6 步⑥ strip（llvm-strip --strip-unneeded → libnode_cli.so）— FR-001-015
- [x] T3.7 步⑦ npm/corepack 树收集 + 剪枝 + 入口存在性硬校验 — FR-001-020
- [x] T3.8 步⑧ manifest.json（逐文件 sha256/totalSha256/fileCount）— FR-001-021
- [x] T3.9 步⑨ 三壳脚本生成（§3.3 模板 + sh -n 自检）— FR-001-022
- [x] T3.10 步⑩ BUILD-METADATA.txt — FR-001-023
- [x] T3.11 `--apply-patch <id,…>` 开关 + 幂等 patch 应用函数（trap-handler/cpu-features/temporal/cc-host 四 id，⬜ 必要性 CI 拍板）— FR-001-013
- [x] T3.12 `bash -n` 过 + `--dry-run` 断言 + ⑦⑧⑨ 以真实源码树实测（Windows 可跑）

## T4 provision 扩展
- [x] T4.1 `--assets <dir> --assets-mode stage|verify` — FR-001-030/031
- [x] T4.2 manifest.json 生成（逐文件 sha256/totalSha256/fileCount/generatedAt，树摘要）
- [x] T4.3 静态性检查（assets 树禁 ELF magic）— FR-001-032
- [x] T4.4 jniLibs 兄弟文件二分类白名单（ELF=主件全套 / sh 壳=白名单+五判据 / 其余拒）— FR-001-033
- [x] T4.5 壳五判据校验器（与 build 生成器分离）— FR-001-034
- [x] T4.6 `--shims <dir>` 投放 — FR-001-035
- [x] T4.7 `--check` 扩展：白名单三壳「应有尽有」+ assets verify 联动
- [x] T4.8 `node --check` + 合成 fixtures 全链测试（投放/复验/篡改检出/伪壳判死）

## T5 验证与登记
- [x] T5.1 host 侧用例执行（见 overall-test-cases.md TC-001-xx host 子集）
- [x] T5.2 000-scaffold plan §10 未实现清单 #1–#5 状态更新（归属本模块已实现/待 CI）
- [x] T5.3 .gitignore 补 assets 投放忽略行（C3）
- [x] T5.4 提交（Conventional Commits：feat(build)/feat(provision)/build(deps)…）
