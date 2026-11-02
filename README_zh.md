# aosp-node-cli

[**English**](README.md) · [中文](README_zh.md)

**以 AAR 形式发布的、Android 版 `node` 命令行可执行**——一份交叉编译的 `libnode_cli.so`
（arm64-v8a，exec 型 PIE），在终端里由 node-pty（[`aosp-node-pty`](https://github.com/fellow99/aosp-node-pty)）
经 `forkpty` + `execve` 启动，提供真正的 `node` 命令；随包 assets 携带 npm/corepack JS 树
（纯数据，不需要 exec 位）。

本仓库**不含任何嵌入 API，也不含 JS 运行时封装**——只有原生二进制与随包 JS 树的可复现构建、
ELF 门禁与发布流水线。它是 [`aosp-node-runtime`](https://github.com/fellow99/aosp-node-runtime)
的 **exec 型伴生制品（companion artifact）**：规划基线见 [`docs/000-工程规划.md`](docs/000-工程规划.md)；
工作区级方案背景见 node-bridge-workspace 的 `docs/aosp+node+python+git运行方案.md`。

## 版本：恒等于 Node 版本

制品版本**始终等于**所配对的 Node.js / `aosp-node-runtime` 版本，与 node-pty 同一配对纪律，
不引入独立 semver。

| 配对 runtime | 本仓（draft） |
|---|---|
| `io.github.fellow99:node-runtime:26.13.0` | `io.github.fellow99:node-cli:26.13.0`（status=draft，首发 CI 构建后回写事实） |

> ⚠️ **只发布 AArch64（arm64-v8a）一个架构**。

### 发布版本 —— Maven Central（`io.github.fellow99:node-cli`）

| 版本 | 状态 | 链接 |
|---|---|---|
| 26.13.0 | ⬜ draft（M1 首产后发布） | — |

## 用法（消费方）

```kotlin
// build.gradle.kts
dependencies {
    val nodeVer = "26.13.0" // runtime / pty / cli 必须同版本
    runtimeOnly("io.github.fellow99:node-runtime:$nodeVer")
    runtimeOnly("io.github.fellow99:node-pty:$nodeVer")
    runtimeOnly("io.github.fellow99:node-cli:$nodeVer")
}
```

终端侧（经 node-pty）：

```js
// PATH 指向 nativeLibraryDir 后：
//   pty.spawn(`${nativeLibraryDir}/libnode_cli.so`, ['-e', 'console.log(1)'])
// 或经 $HOME/bin 符号链接以命令名 `node` 调用。
```

## exec 型打包要点（与 dlopen 库相反）

| 项 | node-pty（dlopen 库） | 本仓（exec 型） |
|---|---|---|
| 打包 | `useLegacyPackaging=false`（APK 内 mmap） | **`useLegacyPackaging=true`**（必须物理落盘 `nativeLibraryDir`，否则 `execve` ENOENT） |
| PT_INTERP | 必须 = 0 | **必须 = `/system/bin/linker64`**（门禁强制） |
| 依赖 | `DT_NEEDED libnode.so` | **DT_NEEDED 白名单**（仅系统库 + 登记随包库） |
| C++ 运行时 | node-runtime 供给 | node-runtime 供给；`LD_LIBRARY_PATH` 须含 `nativeLibraryDir` |

## AAR 内容

```
jni/arm64-v8a/libnode_cli.so      # node 命令行（exec 型 PIE，16KB 对齐）
assets/node-bridge-tools/npm/     # npm JS 树（纯数据；M1 投放）
assets/node-bridge-tools/corepack/
```

要求：`minSdk 24` · ABI `arm64-v8a`。

## 如何构建

二进制**不入库**，也从不由手工构建。000-scaffold 已固化接口与门禁；真实交叉编译流水线在
**M1** 接入 `.github/workflows/build-node-cli-android.yml`（当前该 workflow 只跑配置期门禁）。

```bash
# 1) 取源（M1）：官方 node-v<ver>.tar.xz，不改源，记录 sha256
node scripts/fetch-node-cli-source.mjs --node 26.13.0 --out .dist/src

# 2) 交叉编译（M1）：不带 --shared 的 android-configure → make → strip
bash scripts/build-node-cli-android.sh --node 26.13.0 --api 24 \
  --src .dist/src/node-src --ndk "$ANDROID_NDK_HOME" --out build/out

# 3) 门禁/投放
node tools/provision.mjs --out node-cli/src/main/jniLibs --from build/out/libnode_cli.so
node tools/provision.mjs --check
```

## 锁定与校验

[`node-cli.lock.json`](node-cli.lock.json) 是版本、大小、SHA-256、exec 门禁与出处的唯一事实源
（当前 status=draft）。

```bash
node tools/provision.mjs --check          # 校验已投放产物
node tools/provision.mjs --inspect <so>   # 打印某个二进制的 exec 门禁报告
```

退出码：`0` 全过 · `2` 门禁不合格/未投放 · `1` 用法/IO 错误。

门禁：`ET_DYN`（PIE）、**PT_INTERP=/system/bin/linker64**、AArch64、**DT_NEEDED 白名单**、
16KB 页对齐、sha/size 一致（draft 时仅记录）。

## 仓库结构

```
aosp-node-cli/
├── node-cli/                      # Android library 模块（AAR 容器）
│   └── src/main/jniLibs/          # libnode_cli.so 投放处（git 忽略；CI/provision）
├── scripts/
│   ├── fetch-node-cli-source.mjs  # Node 官方源码包（000-scaffold 骨架，M1 实现）
│   └── build-node-cli-android.sh  # 交叉编译（000-scaffold 骨架，M1 实现）
├── tools/provision.mjs            # 投放 + exec 型 ELF 门禁
├── node-cli.lock.json             # 配对版本 + SHA-256 + 门禁 + 出处（唯一事实源）
└── .github/workflows/build-node-cli-android.yml
```

## 许可

[MIT](LICENSE)。Node.js 本体为 MIT；随包 npm 树适用其自身许可（Artistic-2.0）、corepack 为 MIT
——见 [`node-cli/THIRD-PARTY-NOTICES.md`](node-cli/THIRD-PARTY-NOTICES.md)。
