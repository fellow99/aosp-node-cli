# REVIEW_REPORT —— 001/002 构建链实现（提交 9a7972e..dac2d19）

> 评审人：code-reviewer 子代理（requesting-code-review 技能模板派发，只读评审）
> 评审范围：`git diff 9a7972e..dac2d19`（规格批次 9a7972e + 开发批次 a4de110/e6d8a0f/dac2d19）
> 处置人：主实现者（receiving-code-review 纪律：逐条核实 → 修复/反驳 → 逐项复测）
> 结论：**2 Critical + 4 Important + 8 Minor**；除 #3（折中并回写规划）、#10/#13（文档化）外全部修复并复测。

## 一、问题清单与处置

| # | 级别 | 问题（摘要） | 处置 | 复测证据 |
|---|---|---|---|---|
| 1 | **Critical** | `prune_tree` 整删 `node_modules` ⇒ 随包 npm 树必然 MODULE_NOT_FOUND（`npm -v` 都起不来）；且规划 §4.2⑧/R5 登记了错误清单（「实测」只验了入口在位没执行过 npm） | ✅ 修复：剪枝定稿为「test/tests/__tests__/docs/markdocs/man + `node_modules/.bin` + `*.md`，**保留 node_modules 本体**」；C8 先改 docs/000（§4.2⑧ + R5 含教训登记）与 specs/001 plan §3.4；build 脚本同步；CI 增加三入口 host 冒烟步骤（TC-101-16 判据升级） | 重跑 collect-only：剔除 588（原 1881）；树 1592 文件；`node npm-cli.js -v`→11.20.0、`npx-cli.js -v`→11.20.0、`corepack.js --version`→0.36.0（host Node 24） |
| 2 | **Critical** | CI「fetch 拒绝未钉选」步骤在本批钉选 sha256 后逻辑反转——config-check 必红且阻断 tag 发布链；且该步骤会真打 63MB 网络 | ✅ 修复：fetch 新增 `--lock <path>`；CI 改用「复制 lock 清空 sha256 的 fixture」断言 exit 1（拒绝发生在下载前，零网络） | 本地 `--lock .dist/unpinned.lock.json` → exit 1 ✓；workflow YAML 解析过 + 锚点核对 |
| 3 | Important | CI 首跑带全部四件补丁，与 R1「裸 configure 先通」相反 | ⚙️ 折中并回写规划（v2.2.1 R1 as-built）：冷 V8 一轮数小时，逐项二分不可行；默认携带 runtime 已证四件（同树同 NDK 线最强先验），**裸 configure 保留为 workflow_dispatch 输入**（apply_patches 留空即裸跑，R1 归因通道） | workflow 增 `apply_patches` input + 条件拼参；docs/000 R1 已登记该决定 |
| 4 | Important | 缺「npm 树可执行」冒烟——正是漏掉 #1 的测试缺口 | ✅ 修复：CI build 步后新增三入口冒烟步骤；TC-101-16 判据升级（构成 + 冒烟双判据）；本地已复测通过 | 冒烟三行输出见 #1 证据 |
| 5 | Important | 壳判据③只查两个子串——含 `rm -rf` 的伪壳可过；且与模板逐字耦合 | ✅ 修复：结构化断言——exec 行**行级全等**（×1）+ 其余非注释行 ∈ 守卫白名单（NODE_TOOLS_DIR 守卫 if/echo/exit 1/fi）；001 plan §3.5 同步 | 伪壳含 `rm -rf /data` 行 → --check exit 2 ✓；合法三壳全过 ✓ |
| 6 | Important | lock-writeback 把 corepack 出处写成 `deps/corepack`（v2.2 前旧世界）；npm/corepack 树 sha256 永远空串 | ✅ 修复：path 改 `corepack` + `sourceTar` 引用 corepackTar.url；补**每树摘要**（manifest 前缀「relpath+sha256」排序串再摘要） | writeback 产物：npm 1540 files sha 57244a8c88ae…；corepack 51 files path=corepack sha a0aa6c9e5a23… ✓ |
| 7 | Minor | fetch/build 头注仍写「树内含 deps/corepack / 零额外下载」与 v2.2 矛盾 | ✅ 头注与 dry-run 文案修正 | 头注 grep 核对 |
| 8 | Minor | 002 tasks T1.1「paths-ignore」与 T4.1 缓存键描述与实现不符 | ✅ 双向修复：workflow 补 `paths-ignore`（docs/specs/*.md）；任务文本改与实现一致 | YAML 解析过 |
| 9 | Minor | 缓存污染退出码文档说 1、实现是 2 | ✅ 统一为 2（校验失败语义）；fetch 头注 + 001 tasks 文本同步 | — |
| 10 | Minor | 壳脚本 `dirname "$0"` 兜底在 symlink 农场场景失效 | 📄 文档化：docs/000 §7 NODE_NATIVE_DIR 行加注「兜底仅覆盖 nativeLibraryDir 直启，经 symlink 调用必须注入本变量或绝对路径直启」 | 规划已改 |
| 11 | Minor | jniLibs 非 `.so` 文件不入检查；ELF 判形态整读 ~90MB | ✅ 修复：非白名单文件（含杂件/子目录）一律拒；`head4()` 只读 4 字节 | stray.txt 放入 jniLibs → --check exit 2 ✓ |
| 12 | Minor | 归档步骤 `cp …aar || true` 静默降级 | ✅ 去掉 `|| true`（缺件显式失败，C4） | workflow diff |
| 13 | Minor | manifest `generatedAt` 破坏字节级可复现 | 📄 保留（出处价值 > 字节可复现；`totalSha256` 已排除 manifest 自身，校验面不受影响）；如 §12 日后按字节口径执行再议 | 代码注释已留说明口径 |
| 14 | Minor | 缓存把解压/编译脏树一并缓存（数 GB），破坏干净 runner 口径 | ✅ 缓存范围收敛到 `.dist/src/downloads`（源包原件）；docs/000 §9 登记定稿 | workflow + 规划同步 |
| 15 | Minor | 承诺的 properties 增补字段（npm.version 等）未实现 | ✅ 实现：--out 写全量；--assets stage 后**回填刷新**树级字段（投放顺序无关自洽） | AAR classes.jar 内 properties：npm.version=11.20.0 / corepack.version=0.36.0 / assets.sha256=124c54c0…（与当前 manifest 一致）✓ |

## 二、评审人附加建议的采纳

- 「先修 Critical #1 再推 tag」→ 已修 + 冒烟锁死（本报告 #1/#4）。
- 「剪枝口径收敛单一清单 + C8 顺序」→ docs/000 §4.2⑧/R5 已回写（含「规划带病、规格正确、实现跟错」的教训登记）。
- 「fetch 加 --lock」→ 已实现（亦使未钉选场景 fixture 化，脱离真实网络与 lock 状态）。
- 「R1/R2/R3 观测点写进 CI 日志」→ 部分：R1 已由 apply_patches 输入显式化；R2（LDFLAGS 透传核验——注意 NDK r28+ 默认 16384 会让门禁⑦即使 LDFLAGS 失效也绿，不能以门禁绿推断注入成功）登记为 CI 首跑人工观测项（docs/000 R2 处置不变，⬜ 待首跑）。

## 三、复测总表（全部 host 侧，2026-11-02）

| 复测项 | 结果 |
|---|---|
| collect-only（修正剪枝）+ 三入口冒烟 | ✅（npm/npx 11.20.0、corepack 0.36.0） |
| provision --out/--shims/--assets/--check 全链 | ✅ exit 0 |
| 伪壳（引用 libnode.so / curl / 错 shebang / **含 rm -rf 行**）| ✅ 全部 exit 2 |
| BANNED（libnode.so）+ 非 .so 杂件 | ✅ exit 2 |
| assets 篡改检出 / 恢复 | ✅ exit 2 → exit 0 |
| fetch --lock 未钉选 fixture | ✅ exit 1（零网络） |
| lock-writeback（每树摘要 + corepack 出处） | ✅ |
| AAR 重建（3.29 MB）+ properties 十字段自洽 | ✅ |

## 四、遗留（如实登记）

- R2/R3 的 CI 首跑观测（LDFLAGS 透传核验、make 目标闭包）⬜ 待 `v26.13.0` tag 推送。
- 评审人「Ready to merge: No」的判定基于修复前状态；两项 Critical 已修复并逐项复测（本文件证据），由处置人判定进入测试阶段。
