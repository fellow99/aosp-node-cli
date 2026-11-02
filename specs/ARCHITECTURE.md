# ARCHITECTURE.md —— `aosp-node-cli` 整体架构（as-built + 规划标注）

> **性质**：项目级架构规格。回答「制品分几部分、门禁怎么把关、和 runtime/pty 怎么配对、运行期谁引导、硬约束落在哪一行」。
> **依据**：`specs/constitution.md`（C1–C8 / S1–S10）· `docs/000-工程规划.md`（唯一权威，下称「规划 §」）· 源码 ✅实测（行号即本仓库当前行号）。
> **标记**：✅已实现（as-built）/ 🔶沿用（同型工程结论）/ ⬜规划未实现（标注里程碑）/ ⚠️冲突或风险。**凡 ⬜ 项，代码里确实没有。**
> **版本**：v1.0 · 2026-11-02 · 状态：M0 骨架已完成；`libnode_cli.so` 本体尚未构建（M1 ⬜）。

---

## ① 制品与运行期全景

```
┌─ 供给侧（本仓库，host 侧） ─────────────────────────────────────────────────────────┐
│                                                                                      │
│  node-cli.lock.json（唯一事实源 ✅）── active 26.13.0/arm64-v8a + gates 键 + matrix │
│        │ allowedNeeded（依赖白名单）/ pairedRuntime（node-runtime:26.13.0）          │
│        ▼                                                                             │
│  scripts/fetch-node-cli-source.mjs ── ⬜ M1-T1：官方 node-v<ver>.tar.xz（不改源 C1）│
│        ▼                                                                             │
│  scripts/build-node-cli-android.sh ── ⬜ M1-T2/T3：android_configure（无 --shared， │
│        │       --with-intl=none）→ make → 16KB LDFLAGS → llvm-strip → 改名          │
│        ▼                                                                             │
│  tools/provision.mjs ── ✅ exec 型七项门禁（①–⑦）→ 门禁不过拒绝投放                 │
│        │       ✅ BANNED_IN_AAR：libnode.so / libc++_shared.so 文件恒拒              │
│        ▼                                                                             │
│  node-cli/src/main/jniLibs/arm64-v8a/libnode_cli.so ── ⬜（投放终点；当前不存在）    │
│  node-cli/src/main/resources/META-INF/node-cli.properties ── ⬜（投放时生成，入库）  │
│  node-cli/src/main/assets/node-bridge-tools/{npm,corepack,manifest.json} ── ⬜ M1-T4│
│  node-cli/src/main/jniLibs/arm64-v8a/{libnpm,libnpx,libcorepack}.so ── ⬜ M1-T4/T5  │
│        │            （壳脚本，内容为 sh；D6 规划，实现属 M1）                        │
│        ▼                                                                             │
│  Gradle（AGP 9.2.1）:node-cli AAR 容器 ✅（useLegacyPackaging=true，D1）            │
│  发布：GitHub Release（⬜ M1-T6）→ Maven Central（⬜ M3；vanniktech 0.37.0 管线 ✅）│
└──────────────────────────────────────────────────────────────────────────────────────┘
                                   │ AAR（Maven 坐标 node-cli:<node>，与 runtime/pty 同版）
┌─ 消费方 App 进程 ────────────────▼──────────────────────────────────────────────────┐
│  环境引导层（bridge 载荷或 Kotlin，消费方/后续里程碑 ⬜）                            │
│   - assets/node-bridge-tools/ 幂等物化 → <filesDir>/node-bridge-tools（D5 ⬜）       │
│   - 注入 HOME/TMPDIR/PATH/LD_LIBRARY_PATH/NODE_TOOLS_DIR/NODE_NATIVE_DIR/npm_config_*│
│   - $HOME/bin symlink 农场：node→libnode_cli.so；npm/npx/corepack→壳脚本 ⬜         │
│        │ pty.spawn(<nativeLibraryDir>/libnode_cli.so 或壳脚本, args, env)           │
│        ▼             （forkpty → setsid → TIOCSCTTY；node-pty 提供 pty 库）         │
│  node 子进程（exec 型，独立生命周期 ✅形态已定/⬜产物未产）                          │
│   - libnode_cli.so：ET_DYN + PT_INTERP=/system/bin/linker64 + 16KB 对齐（门禁强制） │
│   - LD_LIBRARY_PATH=<nativeLibraryDir> ⇒ libc++_shared.so 由 node-runtime 供给     │
│   - 壳脚本（⬜ D6）：exec <nativeLibraryDir>/libnode_cli.so <物化树内 cli 入口> "$@"│
└──────────────────────────────────────────────────────────────────────────────────────┘
```

| 层 | 归属 | 进哪个发布物 | 现状 |
|---|---|---|---|
| 构建与门禁层（lock / provision / scripts / CI） | **本仓** | 仓库内工具（不随 AAR） | ✅ M0 |
| AAR 容器（jniLibs + assets + resources 元数据） | **本仓** | `node-cli:<node>.aar` | ✅ 容器配置 / ⬜ 内容物 M1 |
| 环境引导层（物化 / env 注入 / symlink 农场） | 消费方（bridge 载荷或 Kotlin） | 消费方 APK | ⬜ 规划 §7 / M2 |
| 终端层（pty.spawn / 会话管理） | node-pty + 消费方 | `node-pty:<node>.aar` | 不在本仓（规划 §1.3） |
| 进程内引擎层（`libnode.so` dlopen） | node-runtime | `node-runtime:<node>.aar` | 不在本仓（配对供给） |

---

## ② 门禁层（本仓已建成的核心）

```
provision.mjs 主流程（✅ 276 行，纯 Node 内置模块）
  readLock()  ←─ node-cli.lock.json（缺文件/无该版本组合 ⇒ exit 1，列出可用组合）
     │
     ├─ --inspect <file> ──► gates(buf) 打印七项 ──► exit 0 / 2
     ├─ --check（默认）──► 读 <ROOT>/node-cli/src/main/jniLibs/<abi>/<name>
     │        ├─ 不存在 ⇒ 「未投放」 exit 2                     (:214-217)
     │        ├─ gates(buf) 七项                                (:146-160)
     │        └─ 兄弟文件规则：jniLibs 内其它 .so ⇒ 判非法       (:221-225)
     │              （⬜ M1-T5 扩展：ELF + 壳脚本白名单二分类）  （规划 §6.1）
     └─ --out <dir> --from <file> ──► gates 七项 ──► 不过 ⇒ 拒绝投放 exit 2 (:235-238)
              ├─ 投放唯一原生件 → <out>/<abi>/<name>            (:240-245)
              ├─ BANNED_IN_AAR 存在性检查（恒拒）                (:246-250)
              └─ 写 META-INF/node-cli.properties                (:252-267)
```

**exec 型 profile 与 dlopen 库（node-pty/runtime）门禁的四处差异**（`provision.mjs:9-16` 头注释 ✅）：

| # | 维度 | 本仓（exec 型） | pty/runtime（dlopen 库） |
|---|---|---|---|
| 1 | PT_INTERP | **恰 1 个且 = `/system/bin/linker64`**（`provision.mjs:148-150`） | 必须 = 0 |
| 2 | DT_NEEDED | **白名单**（系统库 + lock 登记；`provision.mjs:153-155`） | 必须含 `libnode.so` |
| 3 | NAPI | **无门禁**（CLI 独立进程，不解析 `napi_*`） | 有「`napi_*` 未定义引用」门禁 |
| 4 | 打包 | `useLegacyPackaging=true`（物理落盘） | `false`（APK 内 mmap） |

**门禁不覆盖的面（必须诚实）**：门禁只证明「ELF 形态与锁值一致」，**不证明真机 exec 可用**——`--check` 全过 ≠ 真机 `node -v` 回程（M2 探针 P1–P10 ⬜）。SELinux / execmem / linker namespace 行为只能在真机验证（C7 证据纪律）。

---

## ③ 与 node-runtime / node-pty 的配对关系

```
             同一棵官方 Node v26.13.0 源码树（fetch 不改源，C1）
                        │
      ┌─────────────────┼──────────────────┐
      ▼                 ▼                  ▼
 node-runtime       node-pty           node-cli（本仓）
 libnode.so         pty dlopen 库      libnode_cli.so
 （引擎共享库）      （forkpty 终端）    （exec 型 node 命令）
 PT_INTERP=0        PT_INTERP=0        PT_INTERP=/system/bin/linker64 ✅门禁
 dlopen 进 App      dlopen 进 App      forkpty + execve 独立进程
 useLegacy=false    useLegacy=false    useLegacyPackaging=true ✅(:41)
 随包 libc++_shared  —                 不随包 libc++_shared（BANNED_IN_AAR ✅）
      │                 │                  │
      └─────────────────┴──────────────────┘
        消费方 APK 内必须三件同版本上线（node:<v> ×3，D4/规划 §2）
        配对是版本纪律而非编译期链接：本仓制品不 DT_NEEDED 挂靠 runtime
```

**运行期的分工**（消费方视角，⬜ M2 探针验收）：

| 项 | 值/机制 | 出处 |
|---|---|---|
| `PATH` | `<nativeLibraryDir>:$HOME/bin:/system/bin`（命令名 ≠ 文件名，经 symlink 直出） | 规划 §7 ⬜ |
| `LD_LIBRARY_PATH` | `<nativeLibraryDir>`（exec 子进程走默认 linker namespace，不自动看到 App 库目录） | 规划 §7 ⬜ |
| `libc++_shared.so` | 由 node-runtime 供给（依赖白名单内、文件禁止随包） | D3 ✅（provision 强制） |
| `NODE_TOOLS_DIR` / `NODE_NATIVE_DIR` | 物化树根 / 壳脚本兜底定位 | 规划 §7 ⬜（M1 壳脚本引用） |
| `npm_config_prefix` / `npm_config_cache` | `$HOME` / `$HOME/.npm`（`/usr/local` 不可写） | 规划 §7 ⬜ |

---

## ④ 关键决策 D1–D8 的 as-built 落点对照（评审用）

| # | 决策（规划 §3.1） | 实现落点 | 状态 |
|---|---|---|---|
| **D1** | exec 打包 `useLegacyPackaging=true` | `node-cli/build.gradle.kts:36-43`（含为何相反的注释） | ✅ |
| **D2** | 同一棵源码树、configure 不带 `--shared` | `scripts/build-node-cli-android.sh:7`（差异纪律注释）；实现 ⬜ M1-T2 | 注释 ✅ / 实现 ⬜ |
| **D3** | 产物唯一 ELF 改名 `libnode_cli.so`；`libc++_shared.so` 不随包 | `provision.mjs:36,38`（DEFAULT_BINARY + BANNED_IN_AAR）+ `:246-250` | ✅ |
| **D4** | `CLI_VERSION` 恒等于配对 Node 版本 | `gradle.properties:9` + `node-cli/build.gradle.kts:13-25` + `publish.gradle.kts:34-39` | ✅ |
| **D5** | npm/corepack JS 树走 assets→filesDir 幂等物化 | 规划 §7；本仓仅预留 assets 目录约定（`.gitignore:24`） | ⬜ M1-T4（树收集）/ M2（物化） |
| **D6** | 壳脚本打入 `libnpm/libnpx/libcorepack.so`（内容为 sh） | 规划 §5/§6.1（三纪律 + 五判据）；无任何代码 | ⬜ M1-T4 生成 / M1-T5 校验 |
| **D7** | `--with-intl=none` + strip + 16KB LDFLAGS | 16KB 门禁⑦ ✅（`provision.mjs:160`）；intl/strip ⬜ M1-T2/T3 | 部分 ✅ / ⬜ |
| **D8** | fetch 不改源；构建期补丁后置且逐条记录 | `fetch-node-cli-source.mjs:8-9`（纪律注释）；`lock.builtFrom.patch` ⬜ M1 | 接口 ✅ / 实现 ⬜ |

---

## ⑤ 已实现的运行期契约面 vs 未实现面

| 面 | 内容 | 状态 |
|---|---|---|
| 版本配对 | lock `pairedRuntime` 坐标 + `matrix.note` 消费方纪律文案 | ✅ |
| META-INF 元数据 | `tool.version / abi / name / size / sha256 / paired.runtime / provisionedAt`（投放时写入，入库） | ✅ 生成逻辑 / ⬜ 首次投放 |
| 消费方环境契约（§7 表） | HOME/TMPDIR/PATH/LD_LIBRARY_PATH/NODE_TOOLS_DIR/NODE_NATIVE_DIR/npm_config_* | ⬜ 规划（M2 引导层接入时验证） |
| npm/npx/corepack 命令面 | 壳脚本 + symlink 农场 | ⬜ M1-T4/T5 + M2 |
| 回程探针 P1–P10 | `node -v` / 壳脚本回程 / `node -e` / npm 安装正反例 / symlink exec / JIT 计时 / TLS | ⬜ M2 真机验收判据 |
| 已知限制（如实登记，能力边界非缺陷） | ① `npm i -g` bin 脚本不可 exec 且 `#!/usr/bin/env node` 不可寻；② 设备无编译器 ⇒ node-gyp 类包必失败并如实上报；③ corepack 禁止拉取 pnpm/yarn 可执行件；④ Intl API 不可用（D7 有意取舍）；⑤ Temporal ⬜（若 M1 拍板 temporal 禁用，与 runtime 同口径） | 规划 §7（写入消费方文档的要求） |

---

## ⑥ 架构层面的已知缺口（里程碑划分）

| 缺口 | 归属 | 影响 |
|---|---|---|
| `libnode_cli.so` 本体（fetch/configure/make/strip 全链） | M1-T1/T2/T3 | 无产物 ⇒ 一切真机/发布面无法验收 |
| provision 兄弟文件白名单扩展（ELF + 壳脚本二分类 + 壳五判据） | M1-T5（规划 §6.1） | 壳脚本无法投放/校验；现规则只放行单一 `libnode_cli.so` ✅ |
| `--assets` / `--shims` 投放子命令 + assets 静态性检查（树内无 ELF magic） | M1-T5（规划 §6） | npm/corepack 树与 manifest 无门禁 |
| lock v2.0 扩展字段（`builtFrom.sourceTar/ndk/flags/patch/npm/corepack/shims/assetsManifest`、`matrix.shellShims`） | M1-T6 回写（规划 §8） | 出处目前只有描述级 source + "TBD"（如实为 draft） |
| CI 真实流水线 job（`build-android-arm64-v8a`：NDK r30 / 16GB swap / Release 归档） | M1-T6（规划 §9） | 目前只有配置期门禁 |
| ⚠️ scaffold CI 退出码断言的 `bash -e` 死代码问题 | M1-T6 重写时一并修（`overall-plan.md` §4.1） | 「未投放=2」纪律的实际强制力依赖 step 失败而非断言输出 |
| 环境引导层与真机探针 | M2（消费方/探针 App） | 运行期契约无验证 |
| Maven Central 首发（`published=true` 回写） | M3 | AAR 尚无正式分发渠道 |
