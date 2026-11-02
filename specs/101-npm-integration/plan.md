# 101-npm-integration — 模块技术方案（plan.md）

> **性质**：**实现特定**。101 的实现落点在 **001 的构建产物**（npm/corepack 树剪枝/manifest/
> 壳脚本/provision 白名单）与**本模块用例正典**；本仓不修改 npm/corepack 本体（C1：随包树
> 原样剪枝）。
> **成对文档**：功能规格见 [spec.md](./spec.md)（`FR-101-001…014` 唯一权威定义处）；用例正典见
> [test-cases.md](./test-cases.md)（TC-101-01…22）。
> **状态**：⬜ 契约冻结；设备侧执行 ⬜ 依赖 CI 首产 + M2-T2；host 侧（树构成/壳脚本/清单/白名单）
> 随 001 dev 验证。

---

## 1. 技术上下文

| 项 | 取值 | 说明 |
|---|---|---|
| 随包 npm 树 | `assets/node-bridge-tools/npm/`（源码树 `deps/npm` 剪枝） | 001 build 步⑦生成 |
| 随包 corepack 树 | `assets/node-bridge-tools/corepack/`（`deps/corepack` 剪枝） | 同上 |
| manifest | `assets/node-bridge-tools/manifest.json`（逐文件 sha256 + 总摘要） | 001 build 步⑧ / provision `--assets` |
| 命令入口 | `jni/arm64-v8a/libnpm.so` / `libnpx.so` / `libcorepack.so`（sh 壳，001 §3.3 模板） | provision 白名单（FR-001-033/034） |
| 钉版事实 | lock `builtFrom.{npm, corepack}`（version/path/fileCount/sha256）；不单独钉版（随 node 树，规划 §2-5） | 001 §3.1 |
| 安装目标 | `$HOME`（filesDir 侧）：`npm_config_prefix=$HOME` ⇒ 全局落 `$HOME/lib/node_modules`；项目装落 `$PWD/node_modules` | 消费方注入（§3） |
| 网络前置 | 003 的 P10（TLS/内嵌 CA store）——npm registry 访问面 | 前置失败 ⇒ P6 族 BLOCKED |

## 2. 宪法合规

| 条目 | 落点 |
|---|---|
| C1 不改源 | npm/corepack 树**原样剪枝**（文件级取舍，不触碰保留文件字节）；壳脚本是我们自己的入口件 |
| C2 唯一事实源 | npm/corepack 版本/摘要只在 lock `builtFrom`；用例期望值引用 lock，不写死副本 |
| C2（运行期） | 不运行期下载可执行件：npm 装包只下载数据型 JS（P7 边界）；corepack 下载可执行件被禁止（R6） |
| C6 未实测标 ⬜ | 设备侧用例全 ⬜；外部依赖未就绪用 BLOCKED 机制（不删用例） |
| C7 许可 | Node MIT + npm Artistic-2.0 + corepack MIT 已在 `node-cli/THIRD-PARTY-NOTICES.md` 登记 |

## 3. 环境变量注入模板（FR-101-011 验收载体，规划 §7 子集）

```
npm_config_prefix=$HOME
npm_config_cache=$HOME/.npm
npm_config_update_notifier=false        # ⬜ 评估项
COREPACK_ENABLE_DOWNLOAD_PROMPT=0       # ⬜ 防交互阻塞；下载边界见 FR-101-012
```

（`HOME`/`TMPDIR`/`PATH`/`NODE_TOOLS_DIR`/`NODE_NATIVE_DIR` 六项归 [003 §3](../003-cli/plan.md)。）

## 4. 设计决策

1. **壳脚本而非 symlink**：Android APK 解包后 symlink 语义不可靠；sh 壳 + `NODE_NATIVE_DIR`
   自定位（回落 `dirname "$0"`）是 nativeLibraryDir 内最稳入口（001 §3.3 已固化）。
2. **不随包 npm 树的 `bin/`**：npm 树内 `bin/npm-cli.js`/`bin/npx-cli.js` 是壳脚本的 exec 目标
   **必须保留**；剔除的是测试/docs/大型 fixture（001 §3.4）——与 python-cli「剔除 wheel bin」
   不同源：npm 的命令入口就是树内 JS，壳脚本 exec 它。
3. **安装边界的判据口径**：「失败可读」= 退出码非 0 且 stderr 含可分类错误串（编译器缺失/
   构建失败/网络），同时 `npm ls` 无半安装残留——**不**断言具体错误文案（npm 版本会变）。
4. **`npm i -g` 边界是事实判据不是失败**：全局安装成功 + bin 脚本不可直接 exec 是**预期
   行为**（C1 SELinux + 无 /usr/bin/env）；用例记录失败形态（errno/文案）与替代路径
   （npx / node 显式调用）。
5. **corepack 边界的可执行判据**：`corepack --version`（钉版本地行为）✅；`corepack <pkg>`
   触发下载的调用在离线环境 ⇒ 可读失败（exit ≠ 0）即判据；在线环境的「意外成功」要记录
   为**边界违规事实**回写规划（R6 处置 = 禁止面写进消费方文档）。

## 5. 用例设计（与 003 同构纪律）

- 编号 `TC-101-NN`；环境列 host/device；设备侧映射 P2（TC-101-01/02）、P3（TC-101-03）、
  P4（TC-101-05）、P6（TC-101-07/08/09）、P7（TC-101-10）。
- host 侧可本批执行：npm/corepack 树构成（剪枝正确性 + 入口在位）、壳脚本内容与语法、
  manifest 登记、jniLibs 白名单放行/伪壳判死——由 001 dev 阶段的本地构建（步⑦⑧⑨ + 
  provision fixtures）覆盖。
- 设备侧全部 ⬜；外部依赖未就绪（如 registry 不可达）用例标 BLOCKED 不删除。

## 6. 实现策略（本批）

- 本模块**不新增独立代码文件**：实现载体是 001 的 build 步⑦⑧⑨ + provision 扩展（壳白名单/
  manifest 含 npm 树）+ 本用例正典。dev 阶段在 001 的 tasks 下执行，验收口径在此引用。
- 设备侧探针执行 ⬜ M2-T1/T2 窗口（与 003 共用载体）。

## 7. 不一致与风险登记

| # | 项 | 处置 |
|---|---|---|
| 1 | npm 树入口路径（`npm/bin/npm-cli.js` / `npx-cli.js` / corepack 入口）⬜ 以实际树为准（规划 R5） | 001 步⑦ 入口存在性硬校验 + lock `matrix.shellShims[].entry` 登记；首产回写 |
| 2 | `npm install` 走 HTTPS 需 TLS 可用（依赖 003 P10） | 用例前置声明 P10 通过；P10 未过 ⇒ P6 族 BLOCKED（引用，不重复测） |
| 3 | corepack 行为随 node 版本变化（下载提示/缓存路径）⬜ | `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` 注入 + 边界用例只断言「可读失败或违规事实记录」 |
| 4 | npm 树体积/物化耗时（规划 R9 ⬜） | 剪枝 + manifest（001）；首测耗时回填；超标改单 zip 物化（消费方侧，另立项） |
| 5 | `npm i -g` 装的 bin 脚本 shebang 不可寻（规划 R7） | TC-101-11 记录事实判据（npx/node 显式调用可替代）；shebang 改写器 M2 可选项 ⬜（不本批实现） |
