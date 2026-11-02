# 001 · 构建（building）功能规格

> 模块：001-building · 状态：⬜ 已立项（本批实现全部代码；交叉编译本体验证在 CI，规划 §10.2）
> 所属工程：aosp-node-cli · 规划基线：[`docs/000-工程规划.md`](../../docs/000-工程规划.md) §4（构建设计）/§5（制品形态）/§6（exec 门禁）/§6.1（壳脚本白名单）/§8（lock）
> 对应里程碑任务：M1-T1～T5（规划 §10）；上游：[`000-scaffold`](../000-scaffold/spec.md)（骨架与 exec 门禁已就位）
> 下游：[`002-building-workflow`](../002-building-workflow/spec.md)（流水线编排）· [`101-npm-integration`](../101-npm-integration/spec.md)（npm/corepack 随包树消费方）

## 1. 目的

把「官方 Node 源码树」变成「过全部 exec 门禁、含 npm/corepack 随包数据、可投放进 AAR 的
构建产物目录」：钉选获取 node 官方 tar.xz、按「无 `--shared`」纪律交叉编译出 exec 型
`libnode_cli.so`（PIE + 系统 linker64 + 16KB 对齐）、收集/剪枝 npm/corepack JS 树并生成
manifest、生成 `libnpm.so`/`libnpx.so`/`libcorepack.so` 壳脚本，并把投放门禁工具扩展到
assets/清单/壳脚本白名单。

## 2. 范围

**在范围内（001）：** fetch 单源（node tar.xz + SHASUMS256.txt 官方校验链）钉选+校验+解压；
NDK r30 工具链解析；configure（无 `--shared` + `--with-intl=none` + 16KB LDFLAGS）；make；
产物 ELF 形态校验；strip 改名；npm/corepack 树收集与剪枝；manifest 生成；三壳脚本生成；
构建元数据；provision 工具扩展（`--assets`/`--shims` 投放、manifest 生成与校验、assets
静态性检查、jniLibs 兄弟文件白名单二分类、壳脚本五判据）。

**不在范围内（001）：** CI 流水线编排与 Release/lock 回写（→ [`002-building-workflow`](../002-building-workflow/spec.md)）；
产物在设备上的行为契约（→ [`003-cli`](../003-cli/spec.md)）；npm/npx/corepack 命令语义与
安装边界（→ [`101-npm-integration`](../101-npm-integration/spec.md)）；fetch 阶段打补丁（宪法
C1/D8 禁止——补丁若需，后置在构建脚本内且逐条记录）。

## 3. 功能需求

### 3.1 源获取域（M1-T1）

- **FR-001-001（MUST）**：单源钉选获取——`node-v<ver>.tar.xz` 与官方 `SHASUMS256.txt`，
  版本 + URL + SHA-256 出自唯一事实源 `node-cli.lock.json` `builtFrom.sourceTar`；下载后
  逐字节校验，任一不符即失败。
- **FR-001-002（MUST）**：获取可重入——已下载且哈希一致的文件跳过重复下载（CI 缓存友好）；
  哈希不一致 ⇒ 失败（缓存污染信号，不自动重下）。
- **FR-001-003（MUST）**：fetch 不改源（C1/D8）——fetch 只做下载/校验/解压/记录出处
  （FETCH-METADATA.json），无任何补丁步骤；Android 配置差异一律经构建脚本的 configure
  参数注入；构建期补丁（若拍板需要）发生在 build 脚本内、幂等、逐条记录进
  `builtFrom.patch`（无补丁记 `"none"`）。
- **FR-001-004（MUST）**：事实源扩展——`builtFrom.{sourceTar, ndk, flags, patch, npm,
  corepack, shims, assetsManifest}` 与 `matrix.shellShims` 按规划 §8 落地；draft 期哈希/
  摘要空值照录不伪造（沿用 FR-000-011 纪律）。

### 3.2 交叉编译域（M1-T2~T3）

- **FR-001-010（MUST）**：configure 纪律——经上游 `android_configure.py <ndk> <api> arm64`
  （固化继承 `--openssl-no-asm --cross-compiling`），**不带 `--shared`**（D2），追加
  `--with-intl=none`（D7）；`-Wl,-z,max-page-size=16384` 显式传入（注入方式按规划 R2 拍板
  并记录）；temporal 支持的禁用方式（configure 参数 vs patch）随首轮试编拍板（R1/R2 ⬜）。
- **FR-001-011（MUST）**：NDK 工具链钉版——NDK 路径不存在 / toolchain 前缀解析失败 ⇒ 显式
  失败；NDK 版本回写 lock `builtFrom.ndk`（r30 线 ⬜ 首个 CI 实建钉版）。
- **FR-001-012（MUST）**：host 工具链前置——CC_host/CXX_host（gcc/g++）显式导出供
  mksnapshot 等 V8 host 快照工具；缺失 ⇒ 显式失败（不静默用交叉编译器冒充 host 编译器）。
- **FR-001-013（MUST）**：patch 子集拍板纪律——**裸 configure 先通**；仅按报错逐项引入
  runtime patch 子集（trap-handler / cpu-features / temporal / CC_host 导出，规划 §4.3），
  每引入一条登记一条进 `builtFrom.patch`；不得「预防性」引入未确认需要的补丁。
- **FR-001-014（MUST）**：产物形态校验——`out/Release/node` 必须 ET_DYN（PIE）+ PT_INTERP
  恰 1 个且 = `/system/bin/linker64` + LOAD align 全 16384；校验失败 ⇒ 构建失败（C4，不
  静默继续）。
- **FR-001-015（MUST）**：strip 纪律——`llvm-strip --strip-unneeded` → 改名
  `libnode_cli.so`（Android 打包只认 `lib*.so`；**严禁** `libnode.so`/`libc++_shared.so`，
  D3）。

### 3.3 随包数据域（M1-T4）

- **FR-001-020（MUST）**：npm/corepack 树收集——取自**同一棵源码树** `deps/npm` /
  `deps/corepack`（零额外下载，D6）；剪枝清单显式（test/docs/大型 fixture，⬜ 清单 M1-T4
  以实际树拍板并登记 BUILD-METADATA）；纯数据，无 exec 位要求（D5）。
- **FR-001-021（MUST）**：manifest 生成——`manifest.json` 含逐文件 sha256 + fileCount +
  总 sha256（树摘要，与目录序无关）+ 生成时间；npm/corepack 树 + manifest 一同随包
  （规划 §5）。
- **FR-001-022（MUST）**：壳脚本生成——`libnpm.so` / `libnpx.so` / `libcorepack.so` 三件
  sh 壳（shebang `#!/system/bin/sh`）：exec `<nativeLibraryDir>/libnode_cli.so` + 物化树
  内 `.js` 入口 + `"$@"`（D6）；入口路径以实际树为准在 M1-T4 拍板并写死进壳脚本模板，
  同时登记 lock `matrix.shellShims[].entry`。
- **FR-001-023（MUST）**：构建元数据——BUILD-METADATA.txt（目标版本/NDK/flags/补丁清单/
  UTC 时间）与 FETCH-METADATA.json 一同归档（镜像 pty/runtime 纪律）。

### 3.4 投放门禁扩展域（M1-T5）

- **FR-001-030（MUST）**：assets 投放——provision 新增把 npm/corepack 树投放到容器 assets
  目录（`assets/node-bridge-tools/`）的能力，幂等（重复投放结果一致，先清残留再投放）。
- **FR-001-031（MUST）**：manifest 生成与校验——投放时生成逐文件 SHA-256 + 总 SHA-256 清单；
  校验模式下按清单复验：缺文件/多文件/哈希漂移任一即失败。
- **FR-001-032（MUST）**：assets 静态性检查——assets 树内**不得出现 ELF magic 文件**
  （`0x7f 'E' 'L' 'F'`；npm/corepack 树纯 JS/JSON/文档，防任何二进制漏网；`.wasm` 放行
  与否 ⬜ M1 评估，规划 §6）。
- **FR-001-033（MUST）**：jniLibs 兄弟文件白名单扩展——兄弟 `.so` 检查从「仅
  `libnode_cli.so`」扩展为二分类（规划 §6.1）：ELF ⇒ 文件名必须 = `libnode_cli.so` 且走
  exec 门禁全套；文本+首行 `#!` ⇒ 名称 ∈ lock `matrix.shellShims` 白名单 + 壳校验五判据；
  其余 `.so` 拒绝。`BANNED_IN_AAR`（`libnode.so`/`libc++_shared.so`）恒拒，白名单不豁免。
- **FR-001-034（MUST）**：壳脚本校验五判据（规划 §6.1，全部满足才放行）：① 名称 ∈
  `matrix.shellShims`；② shebang = `#!/system/bin/sh`；③ exec 目标仅限
  `libnode_cli.so` + 物化树内 `.js` 入口，内容不得出现 `libnode.so`/`libc++_shared.so`/
  其它 ELF 引用；④ 禁止网络/下载类命令（curl/wget/… 黑名单）；⑤ sha256 + size 记入
  lock（draft 仅记录）。
- **FR-001-035（MUST）**：`--shims` 投放——校验+投放壳脚本（生成器在 build 脚本、校验器在
  provision，**生成器与校验器分离**，防单点自洽假象）。
- **FR-001-036（MUST）**：退出码纪律沿用——0 成功 / 2 门禁或校验不合格 / 1 用法或 IO 错误
  （与 FR-000-032 同口径）。

## 4. 验收场景

- **单源可复现**：两台干净机器跑同一 fetch 命令，得到 sha256 一致的源包与解压树。
- **门禁全过**：构建产物过 000 七项 exec 门禁 + 本模块 assets 静态性检查 + 壳脚本五判据。
- **manifest 可复验**：投放后的 assets 树按清单校验通过；人为改动一个文件后校验失败。
- **壳脚本直出**：jniLibs 内 `libnpm.so`/`libnpx.so`/`libcorepack.so` 存在且内容为 sh 壳
  （exec `libnode_cli.so` + 树内入口）。
- **伪壳判死**：把引用 `libnode.so` 或带 `curl` 的伪壳放进 jniLibs ⇒ provision 拒绝
  （exit 2）。

（交叉编译本体的首轮验证在 CI（⬜），判据见 [`002-building-workflow`](../002-building-workflow/spec.md)
§4；本批代码级验收见 [tasks.md](./tasks.md) 与 [`../overall-test-cases.md`](../overall-test-cases.md)。）
