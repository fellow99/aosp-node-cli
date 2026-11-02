# STRUCTURE.md —— `aosp-node-cli` 目录与文件结构（as-built）

> **性质**：项目级结构规格（现状快照 + 规划落点）。本文件只描述「文件在哪、干什么、进不进 git/AAR」。
> **依据**：`specs/constitution.md`（C1–C8 / S1–S10）· `docs/000-工程规划.md`（唯一权威，下称「规划 §」）· 本仓库工作区实际文件清单 ✅实测（2026-11-02 快照）。
> **标记**：✅实测（本仓库可复核，行号即当前行数）/ 🔶沿用（同型工程 aosp-node-runtime/pty 的既成结论）/ ⬜未实测/规划（M1+）/ ⚠️冲突或风险。
> **版本**：v1.0 · 2026-11-02 · 状态：**M0 骨架已完成**；`libnode_cli.so` 本体尚未构建（M1 ⬜）。
>
> **一句话边界**：本仓**不含任何嵌入 API / Kotlin / Java 源**——只有「构建系统 + 唯一事实源 + 门禁/投放工具 + 脚本骨架 + CI（配置期）」；产品物是 **M1 的 CI 流水线与它产出的 AAR**（规划 §1.3 / §10）。

---

## 1. 顶层目录树（逐文件一行用途，行数 ✅实测）

```
aosp-node-cli/
├── README.md                           # 库总览（英文）：定位/坐标/配对/exec 打包要点/构建/门禁（126 行）
├── README_zh.md                        # 中文版（121 行）；⚠️「AAR 内容」小节未列壳脚本/manifest（规划 §5 已登记，M1 文档项回写）
├── LICENSE                             # MIT（本仓自身；Copyright (c) 2026 fellow99）（21 行）
├── .gitignore                          # 构建产物 + jniLibs .so + assets 树 + .dist + build/out（31 行）
├── gradle.properties                   # GROUP / CLI_VERSION=26.13.0（draft）/ POM_* / RELEASE=false（21 行）
├── gradle.properties.local.example     # 用户级凭据模板（Central Portal Token / GPG），复制到 ~/.gradle 不提交（8 行）
├── settings.gradle.kts                 # rootName=aosp-node-cli；pluginManagement 装 vanniktech 0.37.0；include(":node-cli")（21 行）
├── publish.gradle.kts                  # 发布面共享配置（由 :node-cli apply）：坐标/签名/Central/发布门禁/SCM 补丁（139 行）
├── gradle/
│   └── libs.versions.toml              # 版本目录：AGP 9.2.1（android-library 插件 alias）（5 行）
├── node-cli.lock.json                  # ★ 唯一事实源（入库）：active + releases[] + matrix（56 行；当前唯一 release 为 draft）
├── node-cli/                           # ★★ Android library 模块（AAR 容器；无任何 Kotlin/Java 源）
│   ├── build.gradle.kts                # namespace/minSdk 24/compileSdk 36/arm64-v8a/useLegacyPackaging=true/版本=CLI_VERSION（44 行）
│   ├── THIRD-PARTY-NOTICES.md          # 随包第三方许可清单（Node MIT + npm Artistic-2.0 + corepack MIT）（15 行）
│   ├── build/                          # Gradle 构建产物（不入库）；本机实测 node-cli/build/outputs/aar/node-cli-debug.aar = 786 B ✅
│   └── src/main/                       # ⬜ 当前不存在源码集；jniLibs/assets 由 provision/CI 投放后生成（见 §3）
├── scripts/                            # 构建脚本（000-scaffold 只固化接口，实现属 M1 ⬜）
│   ├── fetch-node-cli-source.mjs       # 取 Node 官方源码包骨架：--node/--out，SCAFFOLD ⇒ exit 2（58 行）
│   └── build-node-cli-android.sh       # 交叉编译骨架：--node/--api/--src/--ndk/--out，SCAFFOLD ⇒ exit 2（57 行）
├── tools/
│   └── provision.mjs                   # ★ 投放 + exec 型 ELF 门禁 + META-INF 元数据（276 行；纯 Node 内置模块）
├── .github/workflows/
│   └── build-node-cli-android.yml      # CI（scaffold）：配置期门禁 + 工具自检 + 语法门（50 行）；真实编译流水线 M1-T6 ⬜ 替换
├── docs/
│   └── 000-工程规划.md                  # ★ 唯一规划基线（v2.0，382 行；D1–D8 决策 / §4 构建设计 / §6 门禁 / §8 lock / §9 CI / §10 里程碑）
└── specs/                              # 规格体系（本目录）
    ├── README.md                       # 规格索引（最后生成，按实际产出扫描）
    ├── SPECS_CHECKLIST.md              # 逐文档状态表
    ├── STRUCTURE.md · TECH.md · ARCHITECTURE.md · constitution.md   # ← 项目级四件 + 本清单
    ├── overall-spec.md · overall-plan.md · overall-test-cases.md    # ← 整体规格三件
    └── 000-scaffold/                   # 模块 000（唯一在册需求）
        ├── spec.md                     # 功能规格（既有，66 行）
        ├── plan.md                     # 技术方案（本批新增 as-built）
        ├── tasks.md                    # 任务拆解（既有，49 行）
        └── test-cases.md               # 模块级用例 + 执行记录（既有，27 行）
```

> ⚠️ 仓库**没有 Gradle Wrapper**（无 `gradlew` / `gradle/wrapper/`）：Gradle 9.4.1 由 CI 的
> `gradle/actions/setup-gradle@v4` 固定安装（`.github/workflows/build-node-cli-android.yml:29-32`）。
> 本地开发需自备 Gradle ≥ 9.4（`gradle.properties:5-6` 的 `NODE_*` 前缀注释以 9.4 为口径）。

---

## 2. 关键配置文件位置与职责

| 文件 | 层级 | 关键内容（as-built ✅） | 规划锚点 |
|---|---|---|---|
| `settings.gradle.kts` | 工程 | `rootProject.name = "aosp-node-cli"`；仅 `include(":node-cli")`；`pluginManagement` 以 id `com.vanniktech.maven.publish.base` 版本 **0.37.0** 加载发布插件；`dependencyResolutionManagement` google()+mavenCentral 且 `FAIL_ON_PROJECT_REPOS` | FR-000-001 |
| `gradle.properties` | 工程 | `GROUP=io.github.fellow99`；`VERSION_NAME=0.1.0`（见 §6 ⚠️-3）；**`CLI_VERSION=26.13.0`**（draft 计划值）；`POM_*` 元数据；`RELEASE=false`（发布门禁默认关） | FR-000-003 / D4 |
| `gradle/libs.versions.toml` | 工程 | `agp = "9.2.1"`，plugins 别名 `android-library`（无其他依赖——AAR 容器零依赖） | FR-000-002 |
| `node-cli/build.gradle.kts` | 模块 | `namespace=org.fellow99.nodecli`、`compileSdk=36`、`minSdk=24`、`ndk.abiFilters=["arm64-v8a"]`、**`packaging.jniLibs.useLegacyPackaging=true`**（D1）；`version = CLI_VERSION`（未设置即 error）；`afterEvaluate` 反射 `setVersion` 双保险 | FR-000-002/003/004/005 |
| `publish.gradle.kts` | 发布 | 坐标 `io.github.fellow99:node-cli:<CLI_VERSION>`；`pomFromGradleProperties`；`publishToMavenCentral(false, NONE)`（`-PAUTOMATIC_RELEASE=true` 才用 PUBLISHED）；`signAllPublications`；单 variant release + sources jar（无 Javadoc）；POM `<scm><url>` 补丁指向本仓；`RELEASE=false` 或缺 Token ⇒ sign/Central 任务禁用 | 规划 §10.1 |
| `node-cli.lock.json` | 事实源 | `active{26.13.0, arm64-v8a}`；`releases[0]`：androidApi=24、name=`libnode_cli.so`、size=0、sha256=""、pairedRuntime=`node-runtime:26.13.0`/`v26.13.0`、builtFrom（source 描述 + ndk/flags "TBD"）、gates 七键、mavenCentral.published=false、**status=draft**；`matrix`：minSdk 24、abi 单项、`allowedNeeded` 六库、execPackaging/note 说明 | 规划 §8 · FR-000-010~013 |
| `.gitignore` | 仓库 | Gradle/IDE 产物 + keystore + **`node-cli/src/main/jniLibs/**/*.so`** + **`node-cli/src/main/assets/**`** + `.dist/` + `build/out/` | C3 / 规划 §13 |
| `.github/workflows/build-node-cli-android.yml` | CI | name `CI (scaffold)`；push main / PR / 手动；`permissions: contents: read`；job `config-check`（ubuntu-24.04 / 20 min）：JDK 21 → Gradle 9.4.1 → `gradle :node-cli:tasks` → `node --check` provision + `--check` 未投放=2 → fetch/build 脚本语法门 | FR-000-040~042 |

---

## 3. 构建产物与投放落点（as-built）

| 产物 | 落点 | 现状 | 说明 |
|---|---|---|---|
| `node-cli-debug.aar`（AAR 容器空壳） | `node-cli/build/outputs/aar/` | ✅ **786 B**（2026-11-02 12:21 本机实测，TC-02） | 无 `.so`/assets 时的容器产物；仅证明「无二进制可构建」，**不是发布物** |
| `libnode_cli.so` | `node-cli/src/main/jniLibs/arm64-v8a/` | ⬜ 不存在（M1 CI 产出后由 `provision --out` 投放） | 投放终点 = `nativeLibraryDir`；`.gitignore:23` 忽略，绝不入库（C3） |
| `META-INF/node-cli.properties` | `node-cli/src/main/resources/META-INF/` | ⬜ 不存在（`provision --out` 成功后生成并**入库**） | 字段：`tool.version` / `abi` / `name` / `size` / `sha256` / `paired.runtime` / `provisionedAt`（`provision.mjs:252-267`） |
| npm/corepack JS 树 + `manifest.json` | `node-cli/src/main/assets/node-bridge-tools/` | ⬜ 不存在（M1-T4 收集/剪枝/manifest） | `.gitignore:24` 忽略；规划 D5/D6（含壳脚本 libnpm/libnpx/libcorepack.so ⬜） |
| fetch 工作区 | `.dist/src/` | ⬜ 不存在（M1-T1 实现后产出） | `node-v<ver>.tar.xz` + 解压树；`.gitignore:27` |
| 交叉编译产物 | `build/out/` | ⬜ 不存在（M1-T2/T3） | `libnode_cli.so` + `BUILD-METADATA.txt`；`.gitignore:28` |
| GitHub Release 归档 | （仓库外） | ⬜ M1-T6 | `node-cli-v<ver>-android-arm64-v8a.tar.gz` + `.sha256`（规划 §10.1） |

---

## 4. 目录 ↔ 需求编号映射（000-scaffold 覆盖面）

| 目录 / 文件 | 需求编号 | 内容 | 现状 |
|---|---|---|---|
| `settings.gradle.kts` · `gradle.properties` · `gradle/libs.versions.toml` | FR-000-001/003 | 工程骨架与版本源 | ✅ 已实现 |
| `node-cli/build.gradle.kts` | FR-000-002/004/005 | AAR 容器 + exec 打包 + 无 .so 可配置 | ✅ 已实现 |
| `publish.gradle.kts` · `gradle.properties.local.example` | FR-000-003 延伸 | Maven 发布面（两段式的第二段就绪） | ✅ 管线就绪 / ⬜ M3 首发未执行 |
| `node-cli.lock.json` | FR-000-010~013 | 唯一事实源（draft） | ✅ 已实现（draft 状态） |
| `tools/provision.mjs` | FR-000-030~036 | exec 门禁 + 投放 + 元数据 | ✅ 已实现（276 行） |
| `scripts/*`（两件骨架） | （接口固化；实现属 M1-T1/T2） | fetch/build 接口 + 差异纪律注释 + SCAFFOLD exit 2 | ✅ 骨架已实现 / ⬜ 实现属 M1 |
| `.github/workflows/build-node-cli-android.yml` | FR-000-040~042 | 配置期 CI | ✅ 已实现 / ⬜ 真实流水线 M1-T6 |
| `docs/000-工程规划.md` · `specs/` | （文档面） | 规划基线 + 规格体系 | ✅ v2.0 + 本批 |
| `node-cli/THIRD-PARTY-NOTICES.md` · `LICENSE` | 规划 §12「许可」门禁 | 第三方许可清单 | ✅ 已实现（随 Release 归档分发 ⬜ M1） |

---

## 5. 「不入库」清单（C3 + .gitignore 逐条）

| 对象 | 位置 | 机制 | 依据 |
|---|---|---|---|
| `libnode_cli.so`（⬜ M1 产出，预估 60–90 MB ⬜） | `node-cli/src/main/jniLibs/**/*.so` | `.gitignore:23` | C3 · 规划 §13 |
| npm/corepack JS 树 + manifest（⬜ M1） | `node-cli/src/main/assets/**` | `.gitignore:24` | C3 · D5 |
| fetch 源码工作区 `node-v<ver>/` | `.dist/` | `.gitignore:27` | C1（官方原包不入库） |
| 交叉编译产物 | `build/out/` | `.gitignore:28` | C3 |
| Gradle/构建产物 | `build/`、`.gradle/`、`.kotlin/`、`*.aab`、`*.apk` 等 | `.gitignore:2-15` | — |
| 密钥材料 | `*.jks`、`*.keystore`、`google-services.json` | `.gitignore:18-20` | C6 |
| Central Portal Token / GPG | **用户级** `~/.gradle/gradle.properties` | 仓库只有 `gradle.properties.local.example` 模板 | C6 · `publish.gradle.kts:13` |
| 本地 IDE 配置 | `local.properties`、`.idea/`、`*.iml` | `.gitignore:4-7` | — |

---

## 6. 结构层面发现的问题（评审必读）

1. **`node-cli/src/main/` 目录当前不存在**：`jniLibs` / `assets` / `resources/META-INF` 都要到第一次投放（`provision --out`）或 M1 CI 才会出现。这不违反任何 FR（FR-000-005 要求无 `.so` 可配置），但意味着「AAR 内容」在 M1 前是**空的容器**（实测 786 B）。
2. **README_zh.md「AAR 内容」小节与规划 v2.0 有出入**：只列了 `libnode_cli.so` + `assets/node-bridge-tools/npm|corepack`，未列壳脚本 `libnpm/libnpx/libcorepack.so` 与 `manifest.json`（规划 §5 已明文登记 ⚠️，回写列为 M1 文档项）。
3. **`gradle.properties` 的 `VERSION_NAME=0.1.0` 与实际发布版本（`CLI_VERSION=26.13.0`）并存**：生效版本由 `coordinates(...)` + `afterEvaluate` 反射覆写双写为 `CLI_VERSION`；`VERSION_NAME` 在本仓源码中无任何读取点（其消费只可能发生在 vanniktech 插件 `pomFromGradleProperties` 内部）⬜ 未核实——评审时应确认它不会把 POM 版本带回 0.1.0。
4. **CI 的退出码断言在 `bash -e` 下可能是死代码**：workflow 的 `provision --check` 期望退出码 2，但 GitHub Actions 默认 `bash -e` 会让 `exit 2` 直接终止该 step，`code=$?` 与后续 if 分支大概率不会执行（详见 `overall-plan.md` §4.1 ⚠️）。建议改用 `node tools/provision.mjs --check || code=$?` 捕获。
5. **`scripts/build-node-cli-android.sh:10` 的头注释与规划 D7 不一致**：注释写「`--with-intl=none`（体积口径，**与 runtime 一致**）」，而规划 §3.2/D7 明文「Intl=none 与 runtime 的 small-icu 为**有意分歧**（CLI 不带 ICU 数据，如实登记）」。⇒ 该注释属事实性错误，M1 实现该脚本时应一并改正（本 specs 只登记，不改 spec 目录外文件）。

---

## 7. 规划中存在、当前**不存在**的路径（防误引用）

| 规划路径 | 规划锚点 | 现状 |
|---|---|---|
| `node-cli/src/main/jniLibs/arm64-v8a/libnode_cli.so` | 规划 §5 / FR-000-030 系 | ⬜ M1 CI 产出后投放 |
| `node-cli/src/main/assets/node-bridge-tools/{npm,corepack,manifest.json}` | D5 · 规划 §5 | ⬜ M1-T4 |
| `node-cli/src/main/jniLibs/arm64-v8a/{libnpm,libnpx,libcorepack}.so`（壳脚本） | D6 · 规划 §5/§6.1 | ⬜ M1-T4 生成 / M1-T5 校验投放 |
| `scripts/fetch-node-cli-source.mjs` 的下载/解压/校验实现 | M1-T1 | ⬜ 当前为 SCAFFOLD（exit 2） |
| `scripts/build-node-cli-android.sh` 的 configure/make/strip 链 | M1-T2/T3 · 规划 §4.2 | ⬜ 当前为 SCAFFOLD（exit 2） |
| CI job `build-android-arm64-v8a`（真实流水线） | 规划 §9 | ⬜ M1-T6 替换 scaffold CI |
| lock `builtFrom.{sourceTar,ndk,flags,patch,npm,corepack,shims,assetsManifest}`、`matrix.shellShims` | 规划 §8（v2.0 扩展字段） | ⬜ M1-T6 回写时落地 |
| `META-INF/node-cli.properties` 增补字段（npm.version / corepack.version / assets.sha256 / ndk / flags） | 规划 §5 | ⬜ M1（现版字段见 §3 表） |
