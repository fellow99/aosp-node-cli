# 001-building — 模块技术方案（plan.md）

> **性质**：**实现特定**。回答 001-building 的「怎么做」：单源钉选策略、构建脚本十步、
> 壳脚本模板、provision 扩展接口、lock 字段扩展、错误处理与测试考虑。
> **成对文档**：功能规格见 [spec.md](./spec.md)（`FR-001-001…036` 唯一权威定义处，本文件
> 逐条交叉引用）；任务分解见 [tasks.md](./tasks.md)；用例索引见
> [`../overall-test-cases.md`](../overall-test-cases.md)。
> **依据**：[`../../docs/000-工程规划.md`](../../docs/000-工程规划.md) §4（构建设计）/§5（制品）/
> §6（门禁）/§6.1（壳白名单）/§8（lock）· [`../000-scaffold/plan.md`](../000-scaffold/plan.md)
> §4（既有 provision 契约，本模块在其上扩展）。
> **状态**：⬜ 本批实现（代码）；交叉编译首轮验证 ⬜ CI（[`002-building-workflow`](../002-building-workflow/plan.md)）。
> **本地验证边界**：Windows host 无 NDK/make，build 脚本本批只做语法门 + 干跑断言
> （`--dry-run`），真实编译在 CI ubuntu runner；fetch 与 provision 全链本地真实执行。

---

## 1. 技术上下文

| 项 | 取值 | 说明 |
|---|---|---|
| 工具链（CI） | NDK r30（30.0.16248370，与 aosp-node-runtime 对齐线，规划 §3.2）+ clang（NDK 自带 LLVM，含 llvm-strip） | Node 26 / V8 14.6 需 clang≥19.1.0 ⬜ 首产实测 |
| host 工具链 | build-essential（gcc/g++ 作 CC_host/CXX_host）、make、python3、xz | V8 host snapshot（mksnapshot）交叉编译必需（runtime 同款前置） |
| 源 | `node-v<ver>.tar.xz` + `SHASUMS256.txt` @ `https://nodejs.org/dist/v<ver>/`（含 `deps/npm`，D6）；corepack 官方 tarball 单独钉版（v2.2：Node 26 树无 deps/corepack） | URL 模板与 sha256 见 §3.1 |
| 运行时依赖 | `node:fs/path/crypto/url/child_process`（fetch/provision 零第三方）+ bash + NDK 工具 | CI 另需 curl/file/tar/xz |
| 工作区 | `.dist/src`（源包+解压树）、`.dist/build`（编译树内 out/）、`.dist/out`（投放前产物） | `.gitignore` 已忽略 `.dist/` |

## 2. 宪法合规

| 条目 | 落点 | 状态 |
|---|---|---|
| C1 不改源 | fetch 仅下载/校验/解压 + FETCH-METADATA；Android 配置经 configure 参数注入（D8） | 本批实现 |
| C2 唯一事实源 | 单源钉选值只存 `node-cli.lock.json`；壳白名单在 `matrix.shellShims`，provision 只读 lock 不自带清单 | 本批实现 |
| C3 二进制不入库 | `.dist/`、`build/out`、jniLibs `.so`、assets 树全部 gitignore | ✅（000 已固化，assets 路径本批补） |
| C4 不静默降级 | 产物形态校验失败 ⇒ 构建失败；patch 仅按报错引入（FR-001-013/014） | 本批实现 |
| C5 同版本配对 | fetch 版本 = `active.version` = CLI_VERSION（不一致 ⇒ exit 1） | 本批实现 |
| C6 未实测标 ⬜ | sha256 钉选值以首产实测回写为准；未回写前 lock 记空串 | 本批实现 |
| C8 先文档后实现 | 规划 §10.2 已登记本模块，本文件先行 | ✅ |

## 3. 设计

### 3.1 单源钉选（FR-001-001/002/003/004）

`node-cli.lock.json` `releases[i].builtFrom` 按规划 §8 扩展（替换现 `source` 描述串为结构化
字段，保留 `ndk`/`flags` 键位）：

```jsonc
"builtFrom": {
  "sourceTar": { "version": "26.13.0", "url": "https://nodejs.org/dist/v26.13.0/node-v26.13.0.tar.xz", "sha256": "" },
  "ndk": "TBD (first CI build pins NDK line + version)",
  "flags": "…",
  "patch": "none",                        // 或逐条登记（FR-001-013）
  "npm":      { "version": "", "path": "deps/npm", "fileCount": 0, "sha256": "" },
  "corepackTar": { "version": "0.36.0", "url": "https://registry.npmjs.org/corepack/-/corepack-0.36.0.tgz", "sha256": "9128cfe…" },
  "corepack": { "version": "", "path": "corepack", "fileCount": 0, "sha256": "" },   // 解包树摘要
  "shims": [],                            // [{name, sha256, size, entry}] ×3，draft 期占位
  "assetsManifest": { "fileCount": 0, "totalSha256": "" }
}
```

- **sha256 空串 = 未钉选**：fetch 默认拒绝执行（exit 1，提示先钉选）。例外：`--allow-unpinned`
  显式放行（配合 `--shasums <file>` 用官方 SHASUMS256.txt 现场钉选——下载官方校验文件、
  从中取本版本哈希、回写进 FETCH-METADATA 供维护者核对后钉入 lock；**不**自动改 lock，
  避免「先拿到什么」冒充「钉选了什么」（C2/C6））。
- fetch 可重入：目标文件存在且 sha256 一致 ⇒ 跳过下载；不一致 ⇒ exit 1。
- `matrix.shellShims`：`[{name:"libnpm.so", entry:"npm/bin/npm-cli.js"}, {name:"libnpx.so",
  entry:"npm/bin/npx-cli.js"}, {name:"libcorepack.so", entry:"corepack/dist/corepack.js"}]`
  ——entry 为物化树内相对路径（⬜ M1-T4 以实际树为准拍板回写）。

### 3.2 构建脚本十步（FR-001-010…015/020…023，规划 §4.2 ①–⑩）

`scripts/build-node-cli-android.sh --node <ver> --api 24 --src <dir> --ndk <dir> --out <dir>
[--jobs N] [--dry-run] [--apply-patch <id,…>] [--skip-shims]`：

| 步 | 内容 | 关键纪律 |
|---|---|---|
| ① env | 解析 NDK toolchain 前缀（`<ndk>/toolchains/llvm/prebuilt/*/bin/aarch64-linux-android<api>-clang`）；导出 CC_host/CXX_host（FR-001-012） | NDK/源树/主机工具（make/python3/gcc）任一缺失 ⇒ exit 1 |
| ② 版本一致性 | `--node` = lock `active.version` 校验 | 不一致 ⇒ exit 1（C5） |
| ③ configure | 复刻 android_configure.py 的 PATH/CC/CXX/GYP_DEFINES 后【直呼】`./configure --dest-cpu=arm64 --dest-os=android --openssl-no-asm --cross-compiling --with-intl=none --v8-disable-temporal-support`（无 `--shared`，D2；R2 as-built：wrapper 不透传、LDFLAGS env 不被读取——16KB 靠 NDK r28+ 默认 + 门禁⑦；temporal 禁用系 CI 首跑链接失败的实测结论） | `--dry-run` 打印将执行命令 |
| ④ make | `make -j$(nproc)` → `out/Release/node`（默认目标，R3 ⬜ 核实闭包） | 失败 ⇒ exit 2 |
| ⑤ 形态校验 | `file` + provision `--inspect`：ET_DYN / PT_INTERP 恰 1 = linker64 / LOAD align 全 16384（FR-001-014） | 不过 ⇒ exit 2（不 strip、不投放） |
| ⑥ strip | `llvm-strip --strip-unneeded` → `$OUT/libnode_cli.so`（FR-001-015） | 输出名取自 lock `active.name` |
| ⑦ 树收集 | `deps/npm` → `$OUT/node-bridge-tools/npm/`、corepack 钉版解包树（`--corepack-src`，默认 `$(dirname SRC)/corepack`）→ `$OUT/node-bridge-tools/corepack/`；剪枝清单（§3.4）+ 剔除计数登记 | 入口文件（npm-cli.js/npx-cli.js/corepack 入口）缺失 ⇒ exit 2 |
| ⑧ manifest | 逐文件 sha256 + fileCount + 总 sha256（树摘要）→ `$OUT/node-bridge-tools/manifest.json` | FR-001-021 |
| ⑨ 壳脚本 | 三件 sh 壳写入 `$OUT/`（§3.3 模板）+ `chmod +x` | FR-001-022 |
| ⑩ 元数据 | `BUILD-METADATA.txt` + 复制 FETCH-METADATA.json（FR-001-023） | 版本/NDK/flags/patch/UTC |

- `--apply-patch <id,…>`：patch 子集显式引入开关（FR-001-013）——默认**不**打补丁；每个 id
  对应 §4.3 评估表条目，逐条幂等应用并写入 BUILD-METADATA 与 lock `builtFrom.patch` 草案；
  ⬜ 各 id 的必要性以 CI 首轮裸 configure 报错为准（R1）。
- `--dry-run`：①②③ 与 ⑦⑧⑨ 的计划打印不执行——Windows host 的代码级验证入口。
- `--skip-shims`：仅维护者排障用（跳过⑨）；产物目录缺壳 ⇒ provision `--check` 会拒绝
  （FR-001-033 白名单校验「应有尽有」）。

### 3.3 壳脚本模板（FR-001-022，D6）

```sh
#!/system/bin/sh
# libnpm.so — generated by build-node-cli-android.sh (do not edit)
# entry: npm/bin/npm-cli.js (matrix.shellShims)
exec "${NODE_NATIVE_DIR:-$(dirname "$0")}/libnode_cli.so" "${NODE_TOOLS_DIR}/npm/bin/npm-cli.js" "$@"
```

- shebang `#!/system/bin/sh`（内核按 shebang 解释执行，与文件名/扩展名无关）；
- `NODE_NATIVE_DIR` 缺省回落 `dirname "$0"`（nativeLibraryDir 内自定位，规划 §7「壳脚本
  兜底定位」）；`NODE_TOOLS_DIR` = 物化树根（消费方注入，缺失时回落
  `$(dirname "$0")/../node-bridge-tools` 不可靠——直接报错退出更诚实：模板内做 `[ -n
  "$NODE_TOOLS_DIR" ] || { echo "NODE_TOOLS_DIR not set" >&2; exit 1; }`）；
- 三件壳除 entry 外逐字相同（模板单点生成）；生成后 `sh -n` 自检。
- provision 壳校验五判据（FR-001-034）对内容做**结构化**断言（见 §3.5）。

### 3.4 剪枝清单（FR-001-020，⬜ M1-T4 以实际树定稿）

定稿口径（v2.2.1，评审 Critical #1 修正）：剔除 `test/`、`tests/`、`__tests__/`、`docs/`、
`markdocs/`、`man/` 目录 + `node_modules/.bin/` + `*.md`；**保留 `node_modules` 本体**——
npm-cli.js 的裸包名依赖（graceful-fs/proc-log/@npmcli/* …）全靠 `deps/npm/node_modules/`
解析，整删则 `npm -v` 即 MODULE_NOT_FOUND。规则实现为「目录名/后缀黑名单 + 剔除计数登记
进 BUILD-METADATA」，**不做内容改写**（C1：剪枝是复制时的文件级取舍，不触碰保留文件字节）；
收集后以 host node 执行三个入口冒烟（`node <npm-cli.js> -v` 等）锁死此类回归（CI 步骤）。

### 3.5 provision 扩展（FR-001-030…036）

`tools/provision.mjs` 新增/变更（既有 `--check/--inspect/--out/--from` 语义不变，见
[`../000-scaffold/plan.md`](../000-scaffold/plan.md) §4.1）：

| 参数 | 行为 | 退出码 |
|---|---|---|
| `--assets <dir> [--assets-mode stage\|verify]` | stage：静态性检查（树内 ELF magic ⇒ 拒）→ 复制 `<dir>/node-bridge-tools/` → `node-cli/src/main/assets/` → 生成 `manifest.json`（逐文件 sha256 + fileCount + 总 sha256 + 生成时间）；verify（可配合 `--check`）：按已投放 manifest 复验（多/少/漂移逐项报告） | 0/2/1 |
| `--shims <dir>` | 读取 `<dir>` 内三壳 → 逐件过五判据 → 全过才投放进 jniLibs（与主件同目录） | 0/2/1 |
| jniLibs 兄弟规则（变更） | 二分类：ELF magic ⇒ 必须 = `libnode_cli.so`（走七项门禁）；文本且首行 `#!` ⇒ 名称 ∈ `matrix.shellShims` + 五判据；其余 `.so` 拒绝。`--check` 同时校验「白名单三壳应有尽有」（缺件 ⇒ 2） | 违规 ⇒ 2 |

- 壳五判据实现（全部满足才放行）：① 名称 ∈ `matrix.shellShims`；② 首行 ===
  `#!/system/bin/sh`；③ 内容仅引用 `libnode_cli.so` + `${NODE_TOOLS_DIR}/…js` 入口
  （**结构化断言**：exec 行行首锚定 = `exec "${NODE_NATIVE_DIR:-$(dirname "$0")}/libnode_cli.so"
  "$NODE_TOOLS_DIR/<lock 登记 entry>" "$@"`；其余非注释行 ∈ 白名单 {NODE_TOOLS_DIR 守卫
  if/echo/exit/fi、空行}——额外命令（如 `rm -rf`）不得出现）；④ 内容不得含网络/下载关键词（`curl`、`wget`、`http://`、
  `https://`、`nc `、`ssh `）与 `libnode.so`/`libc++_shared.so` 字样；⑤ sha256 + size 打印
  （draft 仅记录，released 后与 lock `builtFrom.shims` 比对）。
- manifest.json 形态：`{ tool, version, abi, files: {"<relpath>": "<sha256>"}, fileCount,
  totalSha256, generatedAt }`；`totalSha256` = 对「relpath+sha256」排序串的摘要（与目录序
  无关）。幂等：stage 先清空目标目录再投放（版本升级清残留）。
- 万级文件性能：流式逐文件哈希，不整树读内存。

### 3.6 lock 字段消费兼容性

`builtFrom` 由纯字符串演进为结构化对象（§3.1）。provision 现行只消费 `active`/
`releases[].{version,abi,name,size,sha256,status}`/`matrix.allowedNeeded`，不触碰
`builtFrom.source`——本批扩展后新增读取点仅 `matrix.shellShims` 与 `builtFrom.shims`
（released 后比对），无解析风险（缺字段 ⇒ 回落旧行为并打印警告）。

## 4. 实现策略

1. **顺序**：lock 扩展 → fetch 实现 → build 脚本（③–⑥ CI 执行体 + ⑦⑧⑨ 本地可测）→
   provision 扩展 →（CI 接线归 002）。
2. **本地可测/不可测切分**：本地可测 = fetch（真实下载 node tar.xz + SHASUMS256 校验）+
   ⑦⑧⑨（用官方源码树真实 `deps/npm` + corepack 钉版解包树做输入）+ provision 全链（合成
   fixtures：ELF fixture 复用 000 的合成 PIE 思路 + 伪壳负样本）+ build `--dry-run`；
   不可测 = ①–⑥ 真实编译（CI ⬜，R1–R3）。
3. **错误处理**：外部命令失败 ⇒ 定位到步号报错；门禁/校验类 exit 2、用法/IO exit 1
   （FR-001-036 与 FR-000-032 同口径）。

## 5. 测试考虑

- 用例正典登记于 [`../overall-test-cases.md`](../overall-test-cases.md)（TC-001-xx 段），本批
  执行 host 侧子集；CI 侧与产物侧子集 ⬜ 待 002 流水线首跑。
- 合成 ELF fixture（本地造过七项门禁的最小 AArch64 PIE）+ 伪壳 fixtures（引用 libnode.so /
  带 curl / 错误 shebang）驱动 provision `--out/--from/--check/--assets/--shims` 全链。
- host 侧树收集验证以真实 `deps/npm`（node-v26.13.0 tar.xz 解压）为输入——fetch 与 ⑦⑧⑨
  可在 Windows 真实执行（bash + node 即可，⑦⑧⑨ 不依赖 NDK）。

## 6. 不一致与风险登记

| # | 项 | 处置 |
|---|---|---|
| 1 | 裸 configure 首轮试编的 patch 子集与参数注入方式（规划 R1/R2 ⬜） | build 脚本 `--apply-patch` 显式开关 + 逐条登记；CI 首轮（002）试编后回写 |
| 2 | npm/corepack 树入口路径与剪枝清单（规划 R5 ✅ 已实测拍板：npm/bin/npm-cli.js、npm/bin/npx-cli.js、corepack/dist/corepack.js） | 已写死进壳脚本模板与 lock `matrix.shellShims`；剪枝清单登记 BUILD-METADATA |
| 3 | `.wasm` 文件的静态性放行（规划 §6 ⬜） | 静态性检查先按「ELF magic 拒」实现；`.wasm` 首次出现真实样本时拍板并登记 |
| 4 | 单源 sha256 钉选值本批不填（C6） | lock 留空串 + fetch 拒绝空值（`--allow-unpinned --shasums` 例外通道）；首产前维护者按官方 SHASUMS256.txt 回写 |
| 5 | `assets/node-bridge-tools/` 落位与 .gitignore（C3） | 本批在 .gitignore 增加 assets 忽略行（投放产物不入库） |
