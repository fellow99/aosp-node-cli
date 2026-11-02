# 002-building-workflow — 模块技术方案（plan.md）

> **性质**：**实现特定**。回答 002 的「怎么做」：workflow 双 Job 结构、装机矩阵、断言修复
> 模式、归档与 lock 回写物生成、缓存策略。
> **成对文档**：功能规格见 [spec.md](./spec.md)（`FR-002-001…009` 唯一权威定义处）；任务分解
> 见 [tasks.md](./tasks.md)；上游契约见 [`../001-building/plan.md`](../001-building/plan.md)。
> **状态**：⬜ 本批实现 workflow 文件；真实跑批与 Release ⬜ 待 tag 推送（本机不可推）。

---

## 1. 技术上下文

| 项 | 取值 | 说明 |
|---|---|---|
| runner | `ubuntu-24.04` | 规划 §9 |
| JDK / Gradle | Temurin 21（`actions/setup-java`）/ Gradle 9.4.1（`gradle/actions/setup-gradle`，仓库无 wrapper） | 配置门沿用 000 |
| Node | 22（`actions/setup-node`） | provision/fetch 运行时（版本宽进：≥20 即可） |
| NDK | r30（30.0.16248370）⬜ 首跑核对 | 规划 §3.2/§4.1；env 单点钉版 |
| host 工具 | build-essential、curl、file、make、python3、unzip、xz-utils（runner 预装/APT） | 规划 §9 装机清单 |
| swap | 16GB swapfile 步骤 | V8 host snapshot 峰值可超 runner 16GB RAM（runtime 实测教训） |

## 2. workflow 双 Job 结构（FR-002-001/003/006）

改造 `.github/workflows/build-node-cli-android.yml`（保留文件名，Job 重排）：

```
on: push(branches main, paths-ignore docs) · pull_request · workflow_dispatch(inputs: node_version, android_api)
    · push(tags: 'v*')
env: NDK_VERSION=r30 钉版单点
jobs:
  config-check:    # 配置期门禁（push/PR/dispatch 全触发；permissions: contents: read）
    - checkout · setup-java 21 · setup-gradle 9.4.1 · setup-node 22
    - gradle :node-cli:tasks --console=plain（FR-000-040）
    - node --check tools/*.mjs scripts/*.mjs；bash -n scripts/*.sh（FR-000-042）
    - lock JSON 语法门（node -e JSON.parse node-cli.lock.json）
    - 退出码断言（修复后模式，§3）
  build-android-arm64-v8a:   # 仅 tag v* / dispatch 触发
    needs: config-check · permissions: contents: write
    - 装机（§1 矩阵 + 16GB swap，不设 timeout-minutes）
    - resolve 版本（tag 去 v 前缀；dispatch 用 inputs；与 lock active.version 比对，不一致 ⇒ fail）
    - node scripts/fetch-node-cli-source.mjs --node <ver> --out .dist/src
    - bash scripts/build-node-cli-android.sh --node <ver> --api <lock> --src .dist/src/node-src
        --ndk $ANDROID_NDK_HOME --out .dist/out
    - node tools/provision.mjs --out node-cli/src/main/jniLibs --from .dist/out/libnode_cli.so
    - node tools/provision.mjs --shims .dist/out
    - node tools/provision.mjs --assets .dist/out
    - node tools/provision.mjs --check（含 shims 白名单 + assets verify：门禁全过才继续）
    - gradle :node-cli:assembleRelease（AAR 一并归档验证）
    - 打包 tar.gz + .sha256 侧车 + lock 回写物 artifact（§4）
    - softprops/action-gh-release（tag 钉 commit）
```

- **失败即停**：Job 步骤默认 fail-fast；显式断言步骤只用于「预期非零」场景（§3）。
- **触发隔离**：build Job 用 `if: startsWith(github.ref, 'refs/tags/v') || github.event_name == 'workflow_dispatch'`。

## 3. 退出码断言修复（FR-002-004，000 plan §6 ⚠️ 缺陷）

Actions `run` 默认 `bash -e`，`node tools/provision.mjs --check` 退出 2 时 shell 在 `code=$?`
赋值前终止。修复模式（所有「预期非零」自检统一）：

```yaml
- name: provision --check must exit 2 before provisioning
  run: |
    code=0
    node tools/provision.mjs --check || code=$?
    if [ "$code" -ne 2 ]; then
      echo "::error::expected exit 2, got $code"; exit 1
    fi
```

## 4. 归档与 lock 回写物（FR-002-005/007）

- 归档：`node-cli-v${VER}-android-arm64-v8a.tar.gz`（`libnode_cli.so` + `libnpm.so` +
  `libnpx.so` + `libcorepack.so` + `node-bridge-tools/`（npm/corepack 树 + manifest.json）+
  `BUILD-METADATA.txt` + `FETCH-METADATA.json` + `LICENSE` + `node-cli/THIRD-PARTY-NOTICES.md`）
  + `sha256sum` 侧车 + AAR 一并上传。
- lock 回写物：`tools/lock-writeback.mjs --from .dist/out --build-meta .dist/out/BUILD-METADATA.txt`
  生成回写后的 lock 全文 + diff 到 artifact `lock-writeback`，**不 push main**——维护者下载
  后人工 PR（M4 再评估自动化）。回写面：`size`/`sha256`/`builtFrom.{ndk, flags, patch, npm,
  corepack, shims, assetsManifest}` + `status:"released"`。

## 5. 缓存（FR-002-008）

- `actions/cache` 键：`fetch-<sourceTar.sha256 前 12>`，path `.dist/src`（fetch 可重入保证
  命中正确性，FR-001-002）。
- ccache/NDK 安装缓存：首轮整链 60–120min 量级（冷 V8 可数小时）实测后定（规划 §9 ⬜）。

## 6. 测试考虑

- 本批静态验证：YAML 解析（`node -e` + js-yaml 不可得时用 Python/结构 grep）+ 断言模式检查
  （`|| code=$?` 存在性）+ 触发条件/permissions 结构核对。
- 真实跑批 ⬜：首次 tag `v26.13.0` 推送后按 [`../overall-test-cases.md`](../overall-test-cases.md)
  TC-002-xx / TC-PUB-001/002 执行并回填。

## 7. 不一致与风险登记

| # | 项 | 处置 |
|---|---|---|
| 1 | NDK r30 装机方式（sdkmanager vs 直接钉链接）首跑核对 ⬜ | workflow env 单点钉版本；实测后回写 |
| 2 | Gradle wrapper 缺失（000 登记建议项） | 本批维持 setup-gradle 钉版口径；wrapper 引入另立任务 |
| 3 | 裸 configure 首轮报错清单（R1/R2/R3）回写 | build Job 允许 `--apply-patch` 逐轮试错；结论回写规划 §4.3 与 lock |
| 4 | 归档体积（npm 树万级文件）⬜ | 首产实测 tar.gz 体积与上传耗时；超标则调整剪枝清单（001 §3.4） |
