# TECH.md —— `aosp-node-cli` 技术选型（as-built + 决策）

> **性质**：项目级技术选型规格。回答「用了什么、什么版本、为什么、**否掉了什么**」，并逐条给出 **已实现 vs 规划** 状态。
> **依据**：`specs/constitution.md`（C1–C8 / S1–S10）· `docs/000-工程规划.md`（唯一权威，下称「规划 §」）· 本仓库文件 ✅实测（2026-11-02 快照）。
> **标记**：✅已实现（本仓库可复核）/ 🔶沿用（aosp-node-runtime / aosp-node-pty 同型结论，本仓未复现）/ ⬜规划未实现（M1+）/ ⚠️冲突或风险。「选定」一律给理由，「否掉」一律给替代方案。
> **版本**：v1.0 · 2026-11-02 · 状态：M0 骨架已完成；`libnode_cli.so` 本体尚未构建（M1 ⬜）。

---

## 1. 选型总表（含状态列）

| 类别 | 技术/版本 | 用途 | 选型理由 | 状态 |
|---|---|---|---|---|
| **构建系统** | Gradle **9.4.1**（CI 经 `gradle/actions/setup-gradle@v4` 固定；仓库无 wrapper） | 工程构建 / 配置期门禁 | AGP 9.x 要求的最低 Gradle 线；CI 单点钉版可复现（workflow `:29-32`） | ✅ 已实现 |
| **Android 插件** | AGP **9.2.1**（`gradle/libs.versions.toml:2`，alias `android-library`） | `:node-cli` Android library | 与 pty/runtime 同代 AGP 线；版本目录（version catalog）单点管理 | ✅ 已实现 |
| **语言/模块形态** | **无 Kotlin/Java 源** —— `:node-cli` 只是 AAR 容器（jniLibs + assets + resources 元数据） | 打包 exec 型制品 | 本仓只交付「二进制 + 随包 JS 树」的构建与门禁，无任何嵌入 API（README/规划 §1.3）；零依赖 ⇒ 完全离线可配置（FR-000-005 ✅） | ✅ 已实现 |
| **SDK 口径** | `compileSdk 36` / `minSdk 24` / `abiFilters=["arm64-v8a"]`（`node-cli/build.gradle.kts:29-34`） | 兼容面 | minSdk 24 与规划 matrix/lock `androidApi=24` 一致；**只做 AArch64 一个架构**（规划 §2） | ✅ 已实现 |
| **exec 打包** | `packaging.jniLibs.useLegacyPackaging = true`（`node-cli/build.gradle.kts:41`） | 让 `.so` 物理落盘 `nativeLibraryDir` | D1：targetSdk≥29 SELinux 禁止从可写数据目录 exec；不落盘则 `execve` ENOENT；与 pty（dlopen，false）**相反** | ✅ 已实现 |
| **版本纪律** | `CLI_VERSION` Gradle 属性（= 配对 Node 版本）；禁 `NODE_*` 前缀（Gradle 9.4 保留） | 版本恒等配对 | D4/规划 §2：与 node-runtime/node-pty 三件同版上线；`NODE_*` 会被内置 Node 工具链吞掉（`gradle.properties:5-6`） | ✅ 已实现 |
| **发布插件** | vanniktech `gradle-maven-publish-plugin` **0.37.0**（id `com.vanniktech.maven.publish.base`，经 settings pluginManagement） | Maven Central 发布面 | 0.37.0 起直连 Central Portal（central.sonatype.com），无需旧 OSSRH 迁移；与 pty 同插件同纪律（`publish.gradle.kts:1-16`） | ✅ 管线就绪 / ⬜ M3 首发未执行 |
| **发布门禁** | `RELEASE=false` 默认；`RELEASE=true` **且** Token 就绪才启用 sign/Central 任务（`publish.gradle.kts:71-84,133-139`） | 防误发 | C6 发布卫生：默认不可发布；凭据仅用户级 `~/.gradle/gradle.properties`（`gradle.properties.local.example` 模板） | ✅ 已实现 |
| **ELF 门禁语言** | 纯 Node `.mjs`（`node:crypto/fs/path/url` 内置模块），**零第三方依赖** | `tools/provision.mjs`（276 行） | 「一个 `node` 就能跑」⇒ CI 与消费方机器零依赖；自解析 ELF64 小端，不依赖 `llvm-readelf`（`provision.mjs:56-130`） | ✅ 已实现 |
| **门禁 profile** | **exec 型**：①ET_DYN ②PT_INTERP 恰 1 且 = `/system/bin/linker64` ③AArch64 ④DT_NEEDED 白名单 ⑤sha（draft 记录）⑥size（draft 记录）⑦16KB 对齐 | 产物合法性 | exec 与 dlopen 门禁三处相反/差异（规划 §6）：PTY 门禁要求 PT_INTERP=0 / 必须含 libnode.so / 有 NAPI 门禁；本仓相反且无 NAPI 门禁 | ✅ 已实现（真实样本判据 M1 补 ⬜） |
| **白名单事实源** | lock `matrix.allowedNeeded`（libc/libm/libdl/libz/libc++_shared 六白名单键中的五系统库 + libc++_shared）；`BANNED_IN_AAR` 恒拒 `libnode.so`/`libc++_shared.so` 文件 | 依赖面 | C2/S1：工具只读 lock 不自带清单；`libc++_shared.so` 在**依赖白名单**内（运行期由 runtime 供给）但**不得作为文件随包**（D3） | ✅ 已实现 |
| **构建脚本语言** | `bash`（`set -euo pipefail`）+ `.mjs` | `scripts/*` | 与 runtime/pty 构建脚本同构；接口/差异纪律已固化，`exit 2`=SCAFFOLD | ✅ 骨架 / ⬜ M1 实现 |
| **Node.js 源** | `nodejs.org/dist/v26.13.0/node-v26.13.0.tar.xz` + 官方 `SHASUMS256.txt` | 交叉编译输入 | fetch 不改源（C1/D8）；与 runtime **同一棵官方源码树**（D2） | ⬜ 规划（M1-T1；版本为 draft 配对值） |
| **NDK** | **r30（30.0.16248370，clang 21.0.0）** | 交叉编译器 | Node 26 / V8 14.6 需 clang≥19.1.0；r28 的 clang 19.0.1 编不过 `deps/v8/src/base/atomicops.h`（runtime workflow 实测 🔶）；与 runtime 对齐 r30 | ⬜ 规划（M1 首个 CI 实建钉版回写 lock.builtFrom.ndk） |
| **configure 参数** | `android_configure.py` **不带 `--shared`** + `--with-intl=none`；上游固化继承 `--openssl-no-asm --cross-compiling` | 产出 `node` 可执行 PIE | D2：默认 make 目标即产出可执行；**`--with-intl=none` 与 runtime 的 small-icu 是有意分歧**（D7，CLI 不带 ICU 数据，如实登记） | ⬜ 规划（M1-T2；注入方式 R2 ⬜） |
| **16KB 页** | `-Wl,-z,max-page-size=16384` 显式传入 | 16KB 页设备硬要求 | NDK r28+ 默认已是 16384，双保险（规划 §4.1）；门禁⑦ 已实现把关 | ⬜ 注入口 M1 拍板 / ✅ 门禁已实现 |
| **strip/改名** | `llvm-strip --strip-unneeded` → 改名 `libnode_cli.so` | 产物定型 | 体积口径；Android 打包只认 `lib*.so`；严禁 `libnode.so`（引擎 soname 冲突，D3） | ⬜ 规划（M1-T3） |
| **CI** | GitHub Actions：job `config-check`（JDK 21 + Gradle 9.4.1，配置期门禁 + 工具自检 + 语法门，20 min 上限） | 配置期质量闸 | 无 `.so` 也必须可配置（FR-000-005/040）；真实编译 job `build-android-arm64-v8a`（runner ubuntu-24.04、**不设 timeout-minutes**、16GB swapfile、装 NDK r30）按规划 §9 | ✅ scaffold CI / ⬜ 真实流水线 M1-T6 |
| **发布模式** | 两段式：GitHub Release 先行（tar.gz + `.sha256`，tag `v<nodever>` 触发）→ Maven Central 随后（runbook §2/§4/§5/§6） | 分发 | 沿用 aosp-node-pty 两段式（规划 §10.1）；assets+manifest 随 AAR 一同发布 | ⬜ M1-T6（GitHub）/ ⬜ M3（Maven；管线 ✅ 就绪） |
| **许可** | 本仓 MIT（`LICENSE`）；随包：Node MIT + npm Artistic-2.0 + corepack MIT（`node-cli/THIRD-PARTY-NOTICES.md`） | 合规交付物 | 许可全文随 GitHub Release 归档分发（规划 §12「许可」门禁） | ✅ 清单文件 / ⬜ 归档随 M1 Release |
| **目标设备** | arm64-v8a 单架构；Android 8.0+（minSdk 24） | 平台面 | 与 node-runtime/node-pty 配对面一致；明确不做 x86/x86_64/arm32（README） | ✅ 配置已定 |

---

## 2. 被**否掉**的选型及替代方案（规划 D1–D8 的反面栏）

| 被否对象 | 否掉理由（一手依据） | 替代方案（现状） |
|---|---|---|
| **`useLegacyPackaging=false`**（pty dlopen 库的口径） | 不落盘 ⇒ `execve` ENOENT；targetSdk≥29 SELinux 禁止从可写数据目录 exec（D1） | `useLegacyPackaging=true` ✅（`node-cli/build.gradle.kts:41`） |
| **为 CLI 加 `--shared`**（产出 `libnode.so` 库） | 本仓要的是**可执行** node；`--shared` 产出的是库不是可执行（D2） | 无 `--shared` 走默认 make 目标 ⬜（M1-T2 试编，R1） |
| **fork 上游源码 / fetch 阶段打补丁** | 破坏「源包 sha256 针对官方原包」的可复现口径（D8/C1） | fetch 不改源；构建期补丁（若需）后置、幂等、逐条记录 ⬜（规划 §4.3） |
| **命名 `libnode.so`** | 引擎 soname `libnode.so` 被 node-runtime 占用，同目录不可重名（D3） | 唯一命名 `libnode_cli.so` ✅（provision `DEFAULT_BINARY`） |
| **随包 `libc++_shared.so`** | 包内同名冲突；runtime 统一供给（D3/规划 §3.2） | 不随包；运行期 `LD_LIBRARY_PATH=<nativeLibraryDir>` 由 runtime 供给；`libc++_shared.so` 只出现在**依赖白名单**，BANNED_IN_AAR 恒拒其文件 ✅ |
| **独立 semver** | 与引擎同一棵源码树天然同版；镜像 pty 配对纪律（D4） | 版本 = `CLI_VERSION` = 配对 Node 版本 ✅ |
| **JS 树放 jniLibs / 从 APK 内路径直接读** | assets 不是文件系统路径；解释器需要真实路径（D5） | assets → `filesDir` 幂等物化 ⬜（M2 环境引导层） |
| **`--with-intl=small-icu/full-icu`** | 体积翻倍（预估 60–90 MB ⬜ 再翻）；CLI 不带 ICU 数据（D7） | `--with-intl=none`；与 runtime small-icu 的行为分歧**有意**并如实登记（R10） |
| **4KB 页对齐** | 16KB 页设备硬要求（D7；Google Play 2025 起新 app 要求） | `-Wl,-z,max-page-size=16384` ⬜ + 门禁⑦ ✅；`--allow-page-align-4k` 仅 bring-up 且必带警告 ✅ |
| **引入补丁却不记录出处** | 出处纪律（D8/规划 §8） | `lock.builtFrom.patch`（无补丁记 `"none"`）⬜ |
| **npm/corepack 官网另行下载** | 违反 fetch 单一来源纪律（D6 反面） | 取自同一棵源码树 `deps/npm` / `deps/corepack` ⬜（M1-T4） |
| **命令入口放 filesDir** | C1：filesDir 不可 exec（D6 反面） | 壳脚本落 `nativeLibraryDir`（合规 exec 位）⬜；命令名经 `$HOME/bin` symlink 农场 ⬜（M2） |
| **运行期下载可执行件**（corepack 拉取 pnpm/yarn） | pnpm 12+ 为 Rust 可执行件，触碰「不运行期下载可执行」纪律（规划 §13/R6） | 可执行件一律随 APK 预置；corepack 仅 `--version` 与钉版 JS 兜底；pnpm 走独立 `aosp-pnpm-cli` 线 |

---

## 3. 版本矩阵与兼容口径

| 维度 | 值 | 来源 |
|---|---|---|
| 制品坐标 | `io.github.fellow99:node-cli:26.13.0`（**draft**） | `node-cli.lock.json:33-37` ✅ |
| 配对 runtime | `io.github.fellow99:node-runtime:26.13.0`（releaseTag `v26.13.0`） | `node-cli.lock.json:15-18` ✅ |
| 版本源 | `CLI_VERSION` Gradle 属性（= 26.13.0） | `gradle.properties:9` ✅ |
| minSdk / androidApi | 24 | `node-cli/build.gradle.kts:31` + lock `matrix.minSdk` ✅ |
| compileSdk | 36 | `node-cli/build.gradle.kts:29` ✅ |
| ABI | 仅 `arm64-v8a` | lock `matrix.abi` + `abiFilters` ✅ |
| Gradle / AGP / JDK | 9.4.1 / 9.2.1 / 21（Temurin） | CI workflow ✅ |
| vanniktech 插件 | 0.37.0 | `settings.gradle.kts:3` ✅ |
| Node 源版本 | v26.13.0（官方 tar.xz + SHASUMS256） | lock `builtFrom.source`（描述级；M1 实建后转 `sourceTar` 字段 ⬜） |
| NDK | r30（30.0.16248370） | 规划 §4.1 ⬜（lock 现值 "TBD"） |
| Maven Central | published=false（M3 后回写） | lock `mavenCentral` ✅（draft 事实） |
| 消费方配对要求 | runtime/pty/cli 三件必须同版本上线 | lock `matrix.note` + README ✅ |

---

## 4. 依赖清单（运行时 / 构建期）

| 依赖 | 谁提供 | 何时需要 | 缺失后果 |
|---|---|---|---|
| Node.js（host，任意近年版） | 开发机 / CI 预装 | `provision.mjs`、`fetch` 脚本、`node --check` | 工具跑不了；CI 步骤失败 |
| JDK 21（Temurin） | CI setup-java / 开发机 | Gradle 配置与 AGP | 配置期失败 |
| Gradle 9.4.1 | CI setup-gradle / 开发机自备（无 wrapper） | 构建 | 配置期失败 |
| AGP 9.2.1 | google() 仓库 | 构建 | 同上 |
| vanniktech 0.37.0 | gradlePluginPortal() | 发布面配置 | 发布任务不存在 |
| bash / coreutils | 开发机 / runner | `build-node-cli-android.sh`、CI 语法门 | 语法门失败 |
| NDK r30（⬜） | CI 装 / 开发机自备 | M1 交叉编译 | 无法编译（规划 §9 装机清单） |
| `libc++_shared.so`（运行期） | **node-runtime AAR**（不随本包） | 消费方 exec 时 | 动态链接失败（依赖白名单内、文件 BANNED_IN_AAR） |
| `libnode.so`（运行期引擎，可选） | node-runtime AAR | 仅当消费方同时跑进程内引擎 | 与本仓无关（互不 DT_NEEDED，规划 §2） |

> **依赖面为 0 的 third-party 库**：`node-cli/build.gradle.kts` 无任何 `dependencies {}` 条目；`libs.versions.toml` 只有 AGP 一项 ⇒ 工程完全离线可配置 ✅（FR-000-005 的选型基础，非偶然）。

---

## 5. 选型层面的未决 / 风险（⚠️ / ⬜）

| # | 项 | 现状 | 处置 |
|---|---|---|---|
| 1 | **无 `--shared` 首轮试编**（R1，高） | ⬜ M1-T2 首项；runtime patch 子集（trap-handler / cpu-features / CC_host / temporal）哪些仍需要未知 | 裸 configure 先通 → 按报错逐项引入并记录（规划 §4.3） |
| 2 | android_configure 额外参数注入方式（intl=none / temporal / LDFLAGS 16KB）是否透传（R2） | ⬜ | 先探透传；不行则最小 patch 注入并记录 |
| 3 | 默认 make 目标闭包：cctest / openssl-cli 是否被牵入（R3） | ⬜ | 试编核验；必要时显式 `make node` |
| 4 | 体积预估 60–90 MB（R4） | ⬜ 首产实测回填 lock | Play 动态特性模块可作消费方缓解 |
| 5 | **scaffold CI 的退出码断言在 `bash -e` 下疑似死代码**（本批 specs 新发现 ⚠️） | workflow `:41-45`：`node tools/provision.mjs --check` 以退出码 2 失败时，GitHub Actions 默认 `bash -e` 会直接终止 step，`code=$?` 不会执行 | 改 `node tools/provision.mjs --check \|\| code=$?`；在 M1-T6 重写 CI 时一并修复 |
| 6 | `gradle.properties` 的 `VERSION_NAME=0.1.0` 与生效版本 `CLI_VERSION=26.13.0` 并存（本批 specs 新发现 ⚠️） | 生效版本由 `coordinates()`+反射 `setVersion` 双写为 CLI_VERSION；`VERSION_NAME` 无仓内读取点，仅 vanniktech `pomFromGradleProperties` 可能消费 ⬜ | M1-T6 发布前检查时核实 POM 版本 = 26.13.0 |
| 7 | npm/corepack 树入口路径与剪枝口径（R5） | ⬜ M1-T4 以实际树为准 | 拍板后写死进壳脚本模板与 manifest |
| 8 | CLI node 的 JIT 与 targetSdk execmem 收紧趋势（R8） | ⬜ M2 探针 P9（Android 15 真机 hotLoop） | `--jitless` 兜底；跟踪新 targetSdk 档位 |

---

## 6. 关键技术口径（实现必须对齐的硬数据）

### 6.1 exec 型七项门禁（`provision.mjs:146-160`，任一不过 ⇒ `exit 2`）

| # | 判据 | 实现落点 | 实测状态 |
|---|---|---|---|
| ① | `e_type == ET_DYN`（3，PIE 可执行） | `provision.mjs:146` | ✅ 代码就绪；真实产物样本 ⬜（TC-13） |
| ② | **PT_INTERP 恰 1 个且内容 = `/system/bin/linker64`** | `provision.mjs:148-150`（与 dlopen 门禁相反） | ✅ 代码就绪；负样本（无 PT_INTERP 库）⬜ TC-13 |
| ③ | `e_machine == 183`（AArch64） | `provision.mjs:151` | 同上 |
| ④ | `DT_NEEDED` ⊆ `lock.matrix.allowedNeeded` | `provision.mjs:153-155` | 同上；白名单事实源 lock ✅ |
| ⑤ | SHA-256 与锁一致 | `provision.mjs:156-157`（draft 无锁值 ⇒ 仅记录） | ✅ draft 语义已实测（TC-06） |
| ⑥ | 大小与锁一致 | `provision.mjs:158-159`（draft 仅记录） | 同上 |
| ⑦ | 16KB 页对齐（min LOAD align ≥ 0x4000） | `provision.mjs:160`；`--allow-page-align-4k` bring-up 放行带警告 `:162-167` | 同上 |

### 6.2 退出码契约（全工具统一）

| 码 | 含义 | 出处 |
|---|---|---|
| `0` | 校验/投放全过；`--help` 正常输出 | `provision.mjs:24` · 两脚本 |
| `2` | 门禁不合格 / **未投放** / 门禁不过拒绝投放 / **SCAFFOLD 未实现** | `provision.mjs:216,228,237` · fetch `:54` · build `:57` |
| `1` | 用法错误 / IO / 锁文件缺失或无该版本组合 | `provision.mjs:275` · fetch `:44` · build `:45,51` |

### 6.3 体积与形态口径（M1 前全部 ⬜）

| 条目 | 值 | 证据等级 |
|---|---|---|
| `libnode_cli.so` 预估（strip 后） | **60–90 MB** | ⬜ 规划口径（D7），首产实测回填 |
| AAR 容器（无 `.so` 时） | **786 B** | ✅ 本机实测 `node-cli/build/outputs/aar/node-cli-debug.aar`（2026-11-02） |
| PT_INTERP | 恰 1 个 = `/system/bin/linker64` | ⬜ 产物级实测属 M1-T3；门禁判据 ✅ |
| LOAD align | 全部 ≥ 16384 | ⬜ 同上 |
| ICU 数据 | 不内嵌（`--with-intl=none`，与 runtime small-icu **有意分歧**） | ⬜ D7 · R10 |

### 6.4 命令速查（host 侧，as-built）

```bash
node tools/provision.mjs --check                                    # 校验已投放产物（未投放 ⇒ exit 2）
node tools/provision.mjs --inspect <libnode_cli.so>                 # 打印某二进制的 exec 门禁报告
node tools/provision.mjs --out node-cli/src/main/jniLibs \
     --from build/out/libnode_cli.so                                # 门禁全过后投放 + 写 META-INF 元数据（M1 后可用）
node tools/provision.mjs --version 26.13.0 --abi arm64-v8a ...      # 显式选择 lock 条目（无该组合 ⇒ exit 1 并列出可用项）
node scripts/fetch-node-cli-source.mjs --node 26.13.0 --out .dist/src   # ⬜ M1：现骨架 exit 2
bash scripts/build-node-cli-android.sh --node 26.13.0 --api 24 \
     --src .dist/src/node-src --ndk "$ANDROID_NDK_HOME" --out build/out # ⬜ M1：现骨架 exit 2
gradle :node-cli:tasks --console=plain                              # 配置期门禁（无 .so 必须通过）
gradle :node-cli:assembleDebug                                      # AAR 容器产物（现 786 B 空壳）
gradle :node-cli:publishToMavenCentral -PCLI_VERSION=26.13.0 -PRELEASE=true   # ⬜ M3（需用户级凭据）
```
