# overall-test-cases.md —— `aosp-node-cli` 全模块测试用例索引

> **性质**：**索引文档**（不是逐条用例全集）。逐条用例的步骤与执行记录写在 `specs/000-scaffold/test-cases.md`、`specs/003-cli/test-cases.md`、`specs/101-npm-integration/test-cases.md`（003/101 为本批新增正典）；本文负责①分层口径 ②用例族索引 ③里程碑判据 ④禁止的判据 ⑤已知基线。
> **依据**：`specs/constitution.md`（C1–C8 / S1–S10）· `docs/000-工程规划.md`（唯一权威，下称「规划 §」：§7.1 探针 / §9 CI / §12 门禁汇总）。
> **标记**：✅已实现可跑 / ⬜规划未实现（里程碑）/ ⚠️风险项。
> **版本**：v1.1 · 2026-11-02（模块 001/002/003/101 立项批次；判据纪律不变）。**判据纪律：每条判据必须可证伪；无「通过/不通过」二元出口的条目不得进表。**

---

## 1. 测试分层

| 层 | 代号 | 需要产物 | 跑在哪 | 目的 | 现状 |
|---|---|---|---|---|---|
| **配置期/工具门禁** | **L1** | ❌ | 开发机 / CI（node + bash + Gradle） | 无 `.so` 可配置、provision 语法与退出码纪律（未投放=2）、脚本语法、二进制不入库 | ✅ 已实现（TC-01~12 已执行，见模块 test-cases.md 执行记录） |
| **构建门禁** | **L2** | ✅ | CI / 开发机（M1） | fetch 校验链、试编产物 file/readelf、七项 exec 门禁正反样本、assets manifest、壳脚本五判据 | ⬜ M1-T1~T5 |
| **归档自洽** | **L3** | ✅ | CI / 发布页（M1-T6） | Release 归档（二进制+树+manifest+元数据+许可）哈希自洽；lock 回写 released 字段齐备 | ⬜ M1-T6 |
| **真机回程** | **L4** | ✅ | 真机 + 消费方/探针 App（M2） | 探针 P1–P10（PTY 内 node/npm/npx/corepack 回程、npm 安装正反例、symlink exec、JIT 计时、TLS） | ⬜ M2 |
| **发布核验** | **L5** | ✅ | 开发机 + Central Portal（M3） | `publishToMavenLocal` 结构断言 → 上传 → 坐标解析 → lock `published=true` | ⬜ M3 |

**顺序纪律**：L2 未全绿之前，L3/L4 的任何「成功」都不算验收（产物出处未固化）；L1 不能替代 L2/L4——门禁只证明 ELF 形态与锁值一致，**不证明真机 exec 可用**（宪法 C7）。

---

## 2. 用例族索引

### 2.1 模块 000-scaffold（`TC-01`~`TC-13`，✅ 详情与执行记录见 [000-scaffold/test-cases.md](./000-scaffold/test-cases.md)）

| 用例族 | 名称 | 层 | 判据（可证伪） | 状态 |
|---|---|---|---|---|
| TC-01 | 干净工程可配置 | L1 | `gradle :node-cli:tasks` BUILD SUCCESSFUL，含 `:node-cli` 任务面 | ✅（2026-11-02 记录） |
| TC-02 | AAR 容器可产出 | L1 | `node-cli/build/outputs/aar/node-cli-debug.aar` 存在（实测 786 B） | ✅ |
| TC-03 | 版本坐标解析 | L1 | version = `CLI_VERSION`（26.13.0 draft） | ✅ |
| TC-04 | provision 语法 | L1 | `node --check` 退出码 0 | ✅ |
| TC-05 | provision 未投放语义 | L1 | `--check` 退出码 = 2，文案含「未投放」 | ✅ |
| TC-06 | draft 不比对哈希 | L1 | 输出含「draft 无锁值，仅记录不比对」 | ✅ |
| TC-07/08 | fetch 骨架语义 / 用法错误 | L1 | exit 2（SCAFFOLD 明示）/ exit 1（缺参） | ✅ |
| TC-09/10/11 | build 骨架语义 / 用法错误 / 语法 | L1 | exit 2 / exit 1 / `bash -n` 过 | ✅ |
| TC-12 | 二进制不入库 | L1 | 投放样本后 `git status --porcelain` 无 jniLibs/assets 条目 | ✅ |
| TC-13 | exec 门禁负样本 | L2 | 无 PT_INTERP 的 dlopen 库样本 ⇒ ② 门禁失败、exit 2 | ✅ 2026-11-02（合成 interpn 样本） |

### 2.2 构建门禁族（⬜ M1，`TC-M1-*` 为本索引预留编号；落地时写入模块 test-cases.md）

| 用例族 ID | 名称 | 层 | 判据（可证伪） | 规划出处 | 状态 |
|---|---|---|---|---|---|
| TC-M1-001 | fetch 校验链 | L2 | 源包 sha256 == SHASUMS256.txt 声明值；解压树未改动（对原包再哈希一致） | 规划 §4.1/§4.2 ② | ✅ host 2026-11-02（真实下载三方一致 + corepack 钉选；CI 复跑待 tag） |
| TC-M1-002 | 试编产物形态 | L2 | `file`/`readelf`：ET_DYN、PT_INTERP 恰 1 = linker64、LOAD align 全 16384 | 规划 §4.2 ⑥ | ✅ CI 2026-11-02（run 41471561286：门禁化校验真实 out/Release/node，①②③⑦ 全过） |
| TC-M1-003 | 门禁正样本全绿 | L2 | `provision --inspect` 七项全过、exit 0 | M1-T3 出口 | ✅ fixture 2026-11-02（真实产物待 CI） |
| TC-M1-004 | 门禁负样本判死 | L2 | dlopen 形态（PT_INTERP=0）样本 ⇒ ② FAIL；白名单外依赖样本 ⇒ ④ FAIL；4KB 对齐样本 ⇒ ⑦ FAIL；均 exit 2 且不落投放文件 | 规划 §6 | ✅ fixture 2026-11-02（六负样本全 exit 2） |
| TC-M1-005 | BANNED_IN_AAR | L2 | 目标目录预置 `libnode.so`/`libc++_shared.so` 后投放 ⇒ 报错 | `provision.mjs` BANNED 恒拒 | ✅ 2026-11-02（--check 判死 exit 2） |
| TC-M1-006 | META-INF 元数据自洽 | L2 | properties 字段与 lock/产物逐一相等（version/abi/name/size/sha256/paired.runtime/npm.version/corepack.version/assets.sha256） | FR-000-036 | ✅ 2026-11-02（AAR classes.jar 内十字段） |
| TC-M1-007 | assets manifest 自洽 | L2 | 逐文件 sha256 复算一致；总 sha256 一致；树内无 ELF magic 文件 | 规划 §5/§6 | ✅ 2026-11-02（verify 过 + 篡改/混入 ELF 均判死） |
| TC-M1-008 | 壳脚本五判据 | L2 | 名称∈lock 白名单 / shebang=`#!/system/bin/sh` / exec 目标仅 libnode_cli.so+树内 .js / 无网络下载命令 / sha+size 入 lock | 规划 §6.1 | ✅ 2026-11-02（三壳全过 + 伪壳×4 判死） |
| TC-M1-009 | 幂等投放 | L2 | 同输入重跑不重复写（--assets 先清残留再投放，totalSha256 稳定） | FR-000-034 | ✅ 2026-11-02（两次 stage 同摘要） |

### 2.3 归档/发布族（⬜ M1-T6 / M3）

| 用例族 ID | 名称 | 层 | 判据（可证伪） | 规划出处 | 状态 |
|---|---|---|---|---|---|
| TC-PUB-001 | Release 归档自洽 | L3 | tar.gz 内容齐（so+壳+树+manifest+元数据+许可）；`.sha256` 与归档一致 | 规划 §10.1 | ✅ 2026-11-02（Release v26.13.0 资产：tar.gz 45,955,095 B + 侧车 109 B） |
| TC-PUB-002 | lock 回写齐备 | L3 | `status=released`；size/sha256/ndk/flags/树摘要非占位 | G4 | ✅ 2026-11-02（依 CI 日志事实人工回写；upload-artifact 隐藏目录过滤致回写物 artifact 缺失一次，已修复 include-hidden-files+error） |
| TC-PUB-003 | publishToMavenLocal 结构断言 | L5 | POM 坐标 = `io.github.fellow99:node-cli:<CLI_VERSION>`；AAR 内含 jni/ + assets/ + manifest | 规划 §10.1 §4 | ⬜ |
| TC-PUB-004 | Central 坐标解析 | L5 | Maven Central 可解析 26.13.0；lock `published=true` | A7 | ⬜ |

### 2.4 真机回程族（⬜ M2；判据 = 规划 §7.1 探针 P1–P10）

| 探针 | 判据 | 状态 |
|---|---|---|
| P1 | `pty.spawn(libnode_cli.so, ['-v'])` ⇒ `node -v` 版本串回程、exit/close 齐全 | ⬜ |
| P2/P3/P4 | 壳脚本回程 `npm -v` / `npx -v` / `corepack --version` | ⬜ |
| P5 | `node -e 'console.log(1+1)'` stdout 回程、退出码正确 | ⬜ |
| P6 | `npm install <纯 JS 包>` 后 `node -e 'require(...)'` 成功 | ⬜ |
| P7 | `npm install <node-gyp 包>` ⇒ **预期失败**且明确报编译器缺失（绝不静默） | ⬜ |
| P8 | `$HOME/bin/node → libnode_cli.so` symlink 执行成功 | ⬜ |
| P9 | JIT hotLoop 计时 + `--jitless` 可运行（Android 15 真机） | ⬜ |
| P10 | `https.get('https://registry.npmjs.org')` TLS 握手成功（内嵌 CA store） | ⬜ |

### 2.5 新模块用例索引（2026-11-02 立项，规划 §10.2）

| 模块 | 正典位置 | 用例段 | 环境 | 状态 |
|---|---|---|---|---|
| 001-building | tasks T2/T3/T4 内嵌（fetch/build/provision 各步验收）+ 本表 TC-M1-001…009 归属本模块 | TC-001-xx（host 子集） | host | 随本批 dev 执行；CI 子集 ⬜ |
| 002-building-workflow | tasks T5 内嵌（YAML/断言模式/结构）+ 本表 TC-PUB-001/002 归属本模块 | TC-002-xx | host+CI | ✅ 跑批 2026-11-02（config-check 与发布流水线均绿；首跑 temporal 挂链→修复→二跑全绿） |
| 003-cli | [`003-cli/test-cases.md`](./003-cli/test-cases.md) | TC-003-01…18（device）/ 19…21（host） | host+device | host 随本批执行；device ⬜ 待 CI 首产 + M2-T2 |
| 101-npm-integration | [`101-npm-integration/test-cases.md`](./101-npm-integration/test-cases.md) | TC-101-01…15（device）/ 16…22（host） | host+device | host 随本批执行；device ⬜（P10 未过 ⇒ P6/P7 族 BLOCKED 机制） |

> 探针归属：P1/P5/P8/P9/P10 → 003-cli（TC-003-01…14）；P2/P3/P4/P6/P7 → 101-npm-integration
> （TC-101-01…10）；§2.4 表与模块正典一一对应，消费方验收按模块正典逐条引用，不另造判据。

---

## 3. 禁止的判据（写进每条用例的验收纪律）

| 禁止的判据 | 为什么是假信号 | 必须改用的判据 |
|---|---|---|
| **AAR 构建成功 ⇒ CLI 可用** | 786 B 空容器也能「构建成功」（FR-000-005 的预期行为） | L4 真机回程（P1/P5） |
| **`--check` 全过 ⇒ 真机 exec 可用** | 门禁只覆盖 ELF 形态与锁值，不覆盖 SELinux/execmem/linker namespace | 真机 `node -v` 回程（P1） |
| **配置期通过 ⇒ 产物合格** | 配置期从不需要产物存在 | L2 门禁正样本（TC-M1-003） |
| **规划里的数字（60–90 MB / r30）⇒ 实测事实** | 规划口径在首产前都是 ⬜（宪法 C7） | `lock.size` 回写值（TC-PUB-002） |
| **draft 门禁「全过」⇒ 哈希已验证** | draft 下 ⑤⑥ 仅记录不比对（工具输出已明示） | released 后严格比对（TC-PUB-002） |
| **README/文档写了 ⇒ 已实现** | 文档先行属 C8 纪律；壳脚本/assets 尚无代码 | 以 `path:line` 或命令输出为证据 |

---

## 4. 已知基线（2026-11-02 快照，回归比对用）

| 项 | 值 | 出处 |
|---|---|---|
| AAR 空容器（M0） | 786 B → **fixture 驱动全链 3,289,726 B**（2026-11-02：jni 四件 + npm/corepack 树 1591 文件 + manifest） | 本机实测 ✅ |
| provision 未投放 | exit **2** + 「未投放」文案 | TC-05 ✅ |
| fetch/build 骨架 | exit **2**（SCAFFOLD）/ exit **1**（缺参） | TC-07~10 ✅ |
| lock | `26.13.0 / arm64-v8a`，size=0，sha256=""，status=draft | `node-cli.lock.json` ✅ |
| 依赖白名单 | libc/libm/libdl/libz/libc++_shared（5 项） | lock `matrix.allowedNeeded` ✅ |
| 工具规模（M0 → 本批） | provision 276→~560 行 / fetch 58→~330 行 / build 57→~250 行（+patch-node-source-cli.py / lock-writeback.mjs / make-elf-fixture.mjs） | 本批实测 ✅ |
| **CI 首产（v26.13.0 / run 41471561286）** | libnode_cli.so（strip 后）**61,270,496 B ≈ 58.4 MiB**（sha256 `7b540f41…`）；归档 tar.gz **45,955,095 B** + 侧车；整链 ≈ 2h25m（fetch 命中缓存后） | CI ✅ 2026-11-02 |

> L2/L3/L4 产生首个真实基线后（体积、门禁耗时、回程时延），按本表格式追加；任何一项变化必须给出版本/配置层面的解释，否则视为回归。
