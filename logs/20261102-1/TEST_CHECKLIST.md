# TEST_CHECKLIST —— 000-scaffold 批次（001/002/003/101 立项后首轮）

> 依据：`specs/overall-test-cases.md`（TC-M1/TC-PUB 族）+ `specs/003-cli/test-cases.md`（TC-003-19…21）
> + `specs/101-npm-integration/test-cases.md`（TC-101-16…22）+ `specs/000-scaffold/test-cases.md`（TC-13）。
> 执行环境：Windows Git Bash · Node 24.7 · Gradle 9.4.1（.dist 内钉版）· JDK 21 · Android SDK（platforms 36）。
> 设备环境：**无真机**；在线模拟器 `emulator-5554` = x86_64/API 37（不可承载 arm64 产物）；
> 另有 arm64 AVD `python_arm64_api35` 可用（但设备侧用例前置 = CI 首产 `libnode_cli.so` + 消费方 PTY 载体（M2-T1），二者均未就绪）。

## A. host 侧（本机可执行）

| # | 用例 | 判据 | 结果 |
|---|---|---|---|
| A1 | TC-M1-001 fetch 校验链 | 真实下载 node tar.xz + SHASUMS256 三方一致；corepack tarball 钉选校验；可重入 | ✅ |
| A2 | TC-M1-001-neg 未钉选拒绝 | fixture lock（--lock）⇒ exit 1，零网络 | ✅ |
| A3 | TC-M1-003 门禁正样本 | 合成 PIE fixture `--inspect` 七项 ✔ exit 0 | ✅ |
| A4 | TC-M1-004 门禁负样本 | broken=interp/align/type/machine/needed ⇒ 全 exit 2 | ✅ |
| A5 | TC-13 dlopen 形态负样本 | PT_INTERP=0（interpn）⇒ ② ✘ exit 2 | ✅ |
| A6 | TC-M1-005 BANNED | jniLibs 预置 libnode.so ⇒ `--check` exit 2 | ✅ |
| A7 | TC-M1-006 META-INF 自洽 | properties 字段 = lock/产物/树事实（含 npm.version/corepack.version/assets.sha256） | ✅ |
| A8 | TC-M1-007 assets manifest | verify 逐文件复验一致；篡改 ⇒ exit 2；树内 ELF ⇒ stage exit 2 | ✅ |
| A9 | TC-M1-008 壳五判据 | 三壳全过；伪壳（libnode.so 引用/curl/错 shebang/白名单外命令行）⇒ exit 2 | ✅ |
| A10 | TC-M1-009 幂等投放 | 连续两次 `--assets` 同 totalSha256；重复 `--out` 覆盖一致 | ✅ |
| A11 | TC-M1-007b 树收集 | 真实树：npm 剔 588 留 1540、corepack 51；node_modules 保留；无 ELF | ✅ |
| A12 | TC-101-16 树构成+冒烟 | 三入口 host node 执行回程版本串 | ✅ |
| A13 | TC-003-19/20/21 打包面 | AAR 3.29MB：jni 四件 + assets 树 + manifest + classes.jar 内 properties | ✅ |
| A14 | TC-002 静态族 | workflow YAML 解析；断言模式（\|\| code=$?）存在；触发/permissions/双 Job 结构；lock-writeback 试跑 | ✅ |
| A15 | L1 回归 | `gradle :node-cli:tasks`（Gradle 9.4.1）配置期通过；`provision --check` 全绿 | ✅ |

## B. CI 侧（待 tag 推送，⬜）

| # | 用例 | 阻塞前提 |
|---|---|---|
| B1 | TC-M1-002 试编产物形态（真实 out/Release/node 的 file/readelf） | ubuntu CI 首跑 |
| B2 | TC-M1-003/004 真实产物正负样本 | 同上 |
| B3 | R2 观测（LDFLAGS 透传核验）· R3（make 目标闭包） | 同上 |
| B4 | TC-PUB-001/002 Release 归档 + lock 回写 | tag `v26.13.0` |

## C. 设备侧（⬜ BLOCKED，如实登记）

| # | 用例 | 阻塞前提 |
|---|---|---|
| C1 | TC-003-01…18（P1/P5/P8/P9/P10 探针） | CI 首产 arm64 `libnode_cli.so` + 消费方 PTY 载体（M2-T1） |
| C2 | TC-101-01…15（P2/P3/P4/P6/P7 探针） | 同上（P6/P7 另前置 P10 TLS 通过） |

> 设备面核查事实（2026-11-02）：无真机连接；在线模拟器为 x86_64（API 37），按「禁止判据 3」
> 不得执行 arm64 产物探针；arm64 AVD `python_arm64_api35` 存在，待产物就绪后可用于 L4。
> 模拟器已在线（无需拉起）；不将其用于无产物冒充测试（C6）。
