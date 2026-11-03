# node-cli probe-app —— M2-T1 探针载体

对 `aosp-python-cli/probe-app` 的同构实现，映射 `specs/003-cli/test-cases.md`
（TC-003-01…18 设备侧 + host 已覆盖项）与 `specs/101-npm-integration/test-cases.md`
（TC-101-01…15 设备侧）的可执行子集；REPL/PTY（TC-003-18）按 BLOCKED 登记
（非交互 ProcessBuilder 子集，PTY 语义归终端 App/node-pty）。

## 职责（消费方环境引导层契约，规划 §3/§7）

1. **物化**：`assets/node-bridge-tools/**` → `filesDir/node-bridge-tools`（marker 幂等：
   manifest.json `totalSha256` 与上次一致则跳过）；含 **树完整性自检探针**（TC-MAT-01：
   物化文件数 == manifest.fileCount+1，可捕获 aapt dot 文件过滤类回归）。
2. **注入**：`HOME`/`TMPDIR`/`PATH`(nativeLibraryDir:$HOME/bin:/system/bin)/
   `LD_LIBRARY_PATH`/`NODE_TOOLS_DIR`/`NODE_NATIVE_DIR` + `npm_config_prefix`/
   `npm_config_cache`/`npm_config_update_notifier` + `COREPACK_ENABLE_DOWNLOAD_PROMPT`。
3. **执行**：ProcessBuilder exec `nativeLibraryDir/libnode_cli.so` 与三壳
   （`libnpm.so`/`libnpx.so`/`libcorepack.so`）。
4. **报告**：逐条 PASS/FAIL/BLOCKED + `filesDir/probe-report.json`（adb pull 取回）。

## 构建与使用

```bash
# 1) AAR：取本仓 Release 归档（tar.gz 内 node-cli-release.aar）放 app/libs/
#    （CI Release 资产 sha256 校验后解包；AAR 不入库）
# 2) 构建（Gradle 9.4.1 + AGP 9.2.1；SDK platforms;android-36）
gradle :app:assembleDebug --console=plain
# 3) 安装运行（arm64 真机或 arm64 模拟器；x86_64 模拟器禁止冒充——003 禁止判据 3）
adb install -r app/build/outputs/apk/debug/app-debug.apk
# 4) App 内点 RUN ALL PROBES（首次物化 1-2 分钟），然后：
adb shell run-as org.fellow99.nodeprobe cat files/probe-report.json > probe-report.json
```

## 注意事项（实测踩坑）

- **dot 文件覆写**：npm 树含 `npm/.npmrc` 等 5 个 dot 文件，aapt 默认
  `ignoreAssetsPattern` 的 `.*` token 会丢弃——本 app 与容器模块（`node-cli/build.gradle.kts`）
  均已覆写去掉该 token（2026-11-03 实证：缺覆写的 Release AAR 少 5 件且 manifest 校验不过）。
- **llvm-strip 告警**：三壳是 sh 脚本（非 ELF），AGP strip 步会打
  `not recognized as a valid object file` 告警但构建成功、文件原样保留——已知无害。
- **PATH 解析**：`TC-003-12b`（bare `node` 走 PATH）依赖 Android ProcessBuilder 的
  execv/execvp 语义，不可达时记 `PASS-FACT`（符号链接 exec 本身由 TC-003-12a 证明）。
- 版本期望值引用 `node-cli.lock.json`（node 26.13.0 / npm 11.20.0 / corepack 0.36.0），
  升版后需同步 `MainActivity.java` 顶部常量。
