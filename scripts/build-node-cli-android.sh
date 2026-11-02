#!/usr/bin/env bash
# scripts/build-node-cli-android.sh —— 交叉编译 Node.js 为 Android arm64 的 exec 型 node
# 命令行（libnode_cli.so，PIE 可执行）+ npm/corepack 随包树 + 三壳脚本。
#
# 与 aosp-node-runtime 的 build-node-android.sh 同一棵源码树、同一条 android_configure 链路，
# 关键差异（docs/000-工程规划.md §3.1/§4）：
#   1) 配置【不带 --shared】（D2）：默认 make 目标产出 node 可执行（而非 libnode.so 共享库）；
#   2) --with-intl=none + --v8-disable-temporal-support（D7：与 runtime 引擎同口径——runner 有
#      cargo 时 temporal 默认开启，Rust crates 无 android cross target 会产 host 对象挂链接，
#      CI 首跑实测确认：libnode_crates.a incompatible with aarch64linux）；
#   3) 16KB 页对齐 = NDK r28+ 默认 + 门禁⑦验证（as-built R2：configure.py 不读 LDFLAGS
#      env，显式注入不可达——runtime 同款口径）；
#   4) 产物是 exec 型 ELF：PIE + PT_INTERP=/system/bin/linker64（与 dlopen 库门禁相反）；
#   5) 输出命名 libnode_cli.so（Android 打包只认 lib*.so；严禁与引擎 libnode.so 同名，D3）；
#   6) npm 树取自同一棵源码树 deps/npm（D6：零额外下载）；corepack 取自单独钉版 tarball
#      （规划 v2.2：Node 25 起树内无 deps/corepack）；壳脚本直出 npm/npx/corepack。
#
# 十步（规划 §4.2 ①–⑩；FR-001-010…023）：
#   ① env：NDK toolchain 解析 + CC_host/CXX_host（等价 runtime cc-host 补丁，env 注入免改源）+ 主机工具前置检查
#   ② 版本一致性（--node == lock active.version，C5）
#   ③ configure：android_configure（无 --shared）+ --with-intl=none + 16KB LDFLAGS
#   ④ make -j → out/Release/node
#   ⑤ 形态校验（provision --inspect：ET_DYN/PT_INTERP=linker64/16KB，不过 ⇒ exit 2）
#   ⑥ llvm-strip --strip-unneeded → $OUT/libnode_cli.so
#   ⑦ npm/corepack 树收集 + 剪枝 + 入口存在性硬校验
#   ⑧ manifest.json（逐文件 sha256 + 树摘要，经 provision --manifest-only 生成——摘要算法单源）
#   ⑨ 三壳脚本生成（libnpm.so/libnpx.so/libcorepack.so，entry 出自 lock matrix.shellShims）
#   ⑩ BUILD-METADATA.txt + FETCH-METADATA.json 归档
#
# 用法：
#   scripts/build-node-cli-android.sh \
#     --node 26.13.0 --api 24 --src .dist/src/node-src --ndk "$ANDROID_NDK_HOME" --out .dist/out \
#     [--jobs N] [--apply-patch id,id] [--skip-shims] [--dry-run] [--collect-only]
#
#   --apply-patch  显式引入构建期补丁子集（默认不打补丁；ids 见 scripts/patch-node-source-cli.py：
#                  cc-host/temporal/trap-handler/cpu-features；必要性以 CI 首轮裸 configure 报错
#                  为准——规划 §4.3/R1，每引入一条登记一条）
#   --dry-run      只打印 ①②③ 与 ⑦⑧⑨⑩ 的计划，不执行（Windows host 代码级验证入口）
#   --collect-only 只执行 ⑦⑧⑨⑩（不需要 NDK；配合 fetch 产物在任意 host 验证树收集链）
#   --skip-shims   跳过 ⑨（仅维护者排障；provision --check 会因缺三壳而拒绝）
#
# 退出码：0 成功 · 2 门禁/校验/编译失败 · 1 用法/环境缺失错误
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK="$ROOT/node-cli.lock.json"
PROVISION="$ROOT/tools/provision.mjs"
PATCHER="$ROOT/scripts/patch-node-source-cli.py"

usage() {
  cat <<'EOF'
用法: scripts/build-node-cli-android.sh --node <ver> --api <api> --src <node 源码树> --ndk <ndk 路径> --out <dir>
              [--jobs N] [--apply-patch cc-host,temporal,trap-handler,cpu-features] [--skip-shims]
              [--dry-run] [--collect-only]
  --node          配对 Node.js 版本（= CLI_VERSION = node-runtime 版本）
  --api           Android API level（默认 24 = minSdk）
  --src           node-v<ver> 解压后的源码树（fetch 脚本产出）
  --ndk           Android NDK 路径（--collect-only 不需要）
  --out           产物目录
  --jobs          make 并行度（默认 nproc）
  --apply-patch   显式补丁子集（默认无补丁；见 scripts/patch-node-source-cli.py）
  --skip-shims    跳过壳脚本生成（排障用；provision --check 会拒绝缺件产物）
  --dry-run       打印计划不执行
  --collect-only  只跑 ⑦⑧⑨⑩（树收集/manifest/壳/元数据；无需 NDK）
  --corepack-src  corepack 钉版解包树（默认 <src 同级>/corepack；fetch 产出；规划 v2.2）
EOF
}

NODE=""; API="24"; SRC=""; NDK=""; OUT=""; JOBS=""
APPLY_PATCH=""; DRY_RUN=0; COLLECT_ONLY=0; SKIP_SHIMS=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --node) NODE="$2"; shift 2;;
    --api)  API="$2";  shift 2;;
    --src)  SRC="$2";  shift 2;;
    --ndk)  NDK="$2";  shift 2;;
    --out)  OUT="$2";  shift 2;;
    --jobs) JOBS="$2"; shift 2;;
    --apply-patch) APPLY_PATCH="$2"; shift 2;;
    --skip-shims)   SKIP_SHIMS=1; shift;;
    --dry-run)      DRY_RUN=1; shift;;
    --collect-only) COLLECT_ONLY=1; shift;;
    --corepack-src) COREPACK_SRC="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "未知参数: $1" >&2; usage; exit 1;;
  esac
done

if [[ -z "$NODE" || -z "$SRC" || -z "$OUT" ]]; then usage; exit 1; fi
if [[ $COLLECT_ONLY -eq 0 && -z "$NDK" ]]; then echo "--ndk 必填（或用 --collect-only 只跑 ⑦⑧⑨⑩）" >&2; exit 1; fi

if [[ -d "$SRC" ]]; then
  SRC="$(cd "$SRC" && pwd)"
elif [[ $DRY_RUN -ne 1 ]]; then
  echo "[build] 环境错误（步②）：源码树不存在：$SRC（先跑 fetch）" >&2; exit 1
fi
COREPACK_SRC="${COREPACK_SRC:-$(dirname "$SRC")/corepack}"
mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"
TOOLS_DIR="$OUT/node-bridge-tools"

log() { echo "[build] $*"; }
die_env() { echo "[build] 环境错误（步$1）：$2" >&2; exit 1; }
die_gate() { echo "[build] 门禁/校验失败（步$1）：$2" >&2; exit 2; }

# ── ② 版本一致性（C5）──────────────────────────────────────────────────────
lock_version() { node -e "console.log(require(process.argv[1]).active.version)" "$LOCK"; }
lock_shims_json() { node -e "console.log(JSON.stringify(require(process.argv[1]).matrix.shellShims||[]))" "$LOCK"; }
if [[ "$(lock_version)" != "$NODE" ]]; then
  die_env ② "--node $NODE 与 lock active.version=$(lock_version) 不一致（C5 同版本配对）"
fi
if [[ $DRY_RUN -ne 1 ]]; then
  [[ -f "$SRC/src/node_version.h" ]] || die_env ② "$SRC 不是 Node.js 源码树（缺 src/node_version.h）"
fi

if [[ $DRY_RUN -eq 1 ]]; then
  log "DRY-RUN：以下为将执行的命令（不执行）"
  log "  ③ (cd $SRC && PATH/GYP_DEFINES/CC/CXX/CC_host 等价复刻 android_configure.py 后直呼:)"
  log "     ./configure …（同上 + --v8-disable-temporal-support）"
  log "     ※ 无 --shared（D2）；16KB=NDK r30 默认+门禁⑦验证（R2 as-built：configure 不读 LDFLAGS env）"
  [[ -n "$APPLY_PATCH" ]] && log "  ③patch python3 $PATCHER --source $SRC --ndk $NDK --patch $APPLY_PATCH"
  log "  ④ (cd $SRC && make -j${JOBS:-\$(nproc)})"
  log "  ⑤ node $PROVISION --inspect $SRC/out/Release/node   # ET_DYN/PT_INTERP=linker64/16KB"
  log "  ⑥ <ndk-llvm-strip> --strip-unneeded → $OUT/libnode_cli.so"
  log "  ⑦ cp -r deps/npm + corepack 钉版树 → $TOOLS_DIR（剪枝 test/docs/man + node_modules/.bin + *.md；保留 node_modules）"
  log "  ⑧ node $PROVISION --manifest-only $OUT"
  log "  ⑨ 三壳 libnpm.so/libnpx.so/libcorepack.so（entry 出自 lock matrix.shellShims）"
  log "  ⑩ BUILD-METADATA.txt + FETCH-METADATA.json"
  log "DRY-RUN 完成（无任何写盘）。"
  exit 0
fi

# ── ① env（--collect-only 跳过）────────────────────────────────────────────
if [[ $COLLECT_ONLY -eq 0 ]]; then
  [[ -d "$NDK" ]] || die_env ① "NDK 路径不存在：$NDK"
  TOOLCHAIN_BIN="$(ls -d "$NDK"/toolchains/llvm/prebuilt/*/bin 2>/dev/null | head -1)"
  [[ -n "$TOOLCHAIN_BIN" ]] || die_env ① "NDK toolchain 未找到：$NDK/toolchains/llvm/prebuilt/*/bin"
  CC="$TOOLCHAIN_BIN/aarch64-linux-android$API-clang"
  CXX="$TOOLCHAIN_BIN/aarch64-linux-android$API-clang++"
  STRIP="$TOOLCHAIN_BIN/llvm-strip"
  [[ -x "$CC" ]] || die_env ① "交叉编译器不存在：$CC"
  [[ -x "$STRIP" ]] || die_env ① "llvm-strip 不存在：$STRIP"
  for t in make python3 gcc g++; do command -v "$t" >/dev/null || die_env ① "主机工具缺失：$t（build-essential/make/python3 前置）"; done
  export CC_host="$(command -v gcc)" CXX_host="$(command -v g++)"   # FR-001-012（或经 --apply-patch cc-host 注入）
  log "① toolchain=$TOOLCHAIN_BIN CC_host=$CC_host API=$API"

  # ── ③ patch（显式子集；默认无补丁——FR-001-013）─────────────────────────
  if [[ -n "$APPLY_PATCH" ]]; then
    log "③patch 显式补丁子集：$APPLY_PATCH（逐条登记进 BUILD-METADATA）"
    python3 "$PATCHER" --source "$SRC" --ndk "$NDK" --patch "$APPLY_PATCH" \
      || die_gate ③ "补丁应用失败（marker 不匹配？核对源码树版本）"
  fi

  # ── ③ configure（无 --shared，D2；intl=none + temporal 禁用，D7）──────────
  # as-built（R2 结论，实测 v26.13.0 树 + CI 首跑）：android_configure.py 恰收 3 参（多参即 Usage
  # 退出）且无 exec 位 ⇒ 等价复刻 wrapper 的 PATH/CC/CXX/GYP_DEFINES 后【直呼 ./configure】注入
  # 我们的参数；configure.py 不读 LDFLAGS env ⇒ 16KB 靠 NDK r28+ 默认 + 门禁⑦验证；CC_host/CXX_host
  # 由步① env 导出。--v8-disable-temporal-support 是【真实选项】（configure.py:1277/2267 →
  # v8_enable_temporal_support=0，node_crates 不进链接）：runner 自带 cargo≥1.86 时 temporal
  # 默认开启且 cargo 无 android target ⇒ host x86_64 对象挂 aarch64 链接（CI run 41449442265
  # 实测），故必须显式禁用（与 runtime 引擎同口径，规划 §7 已知限制 5）。
  [[ -f "$SRC/configure" ]] || die_env ③ "源码树缺 ./configure"
  log "③ ./configure --dest-cpu=arm64 --dest-os=android --openssl-no-asm --cross-compiling --with-intl=none --v8-disable-temporal-support（无 --shared，D2）"
  ( cd "$SRC" &&
    export PATH="$TOOLCHAIN_BIN:$PATH" \
           CC="$CC" CXX="$CXX" CC_host="$CC_host" CXX_host="$CXX_host" \
           GYP_DEFINES="target_arch=arm64 v8_target_arch=arm64 android_target_arch=arm64 host_os=linux OS=android android_ndk_path=$NDK" &&
    ./configure --dest-cpu=arm64 --dest-os=android --openssl-no-asm --cross-compiling --with-intl=none --v8-disable-temporal-support ) \
    || die_gate ③ "configure 失败（记录报错清单后按需 --apply-patch，禁止盲目补丁）"

  # ── ④ make ───────────────────────────────────────────────────────────────
  J="${JOBS:-$(nproc)}"
  log "④ make -j$J → out/Release/node（默认目标，R3 ⬜ 闭包 CI 核实）"
  ( cd "$SRC" && make -j"$J" ) || die_gate ④ "make 失败"
  [[ -f "$SRC/out/Release/node" ]] || die_gate ④ "out/Release/node 未产出"

  # ── ⑤ 形态校验（FR-001-014：不过 ⇒ 不 strip 不投放）─────────────────────
  log "⑤ exec 门禁校验 out/Release/node"
  node "$PROVISION" --inspect "$SRC/out/Release/node" \
    || die_gate ⑤ "ET_DYN/PT_INTERP=linker64/16KB 校验未过（产物形态不是 exec 型 PIE）"

  # ── ⑥ strip + 改名（FR-001-015）─────────────────────────────────────────
  log "⑥ llvm-strip --strip-unneeded → $OUT/libnode_cli.so"
  "$STRIP" --strip-unneeded "$SRC/out/Release/node" || die_gate ⑥ "strip 失败"
  cp "$SRC/out/Release/node" "$OUT/libnode_cli.so"
fi

# ── ⑦ npm/corepack 树收集 + 剪枝 + 入口硬校验（FR-001-020，D5/D6）──────────
log "⑦ 收集 deps/npm（同源）+ $COREPACK_SRC（钉版 corepack）→ $TOOLS_DIR（剪枝 test/docs/fixture）"
rm -rf "$TOOLS_DIR"
mkdir -p "$TOOLS_DIR"
prune_tree() {  # $1=dest：剔除 test/docs/man 与 node_modules/.bin 与 *.md；**保留 node_modules 本体**
  # （v2.2.1 评审 Critical #1 修正：npm-cli.js 的裸包名依赖全靠 node_modules 解析，整删则 npm 必然
  #  MODULE_NOT_FOUND；文件级取舍，不触碰保留文件字节——C1）
  local before after
  before=$(find "$1" -type f | wc -l)
  find "$1" -type d \( -name test -o -name tests -o -name __tests__ -o -name docs -o -name markdocs -o -name man \) -prune -exec rm -rf {} + 2>/dev/null || true
  find "$1" -type d -name .bin -path '*/node_modules/*' -prune -exec rm -rf {} + 2>/dev/null || true
  find "$1" -type f \( -name '*.md' -o -name '*.markdown' \) -delete 2>/dev/null || true
  find "$1" -type d -empty -delete 2>/dev/null || true
  after=$(find "$1" -type f | wc -l)
  echo "$((before - after))"
}
[[ -d "$SRC/deps/npm" ]]      || die_gate ⑦ "源码树缺 deps/npm（fetch 产物异常）"
[[ -d "$COREPACK_SRC" ]] || die_gate ⑦ "corepack 钉版解包树不存在：$COREPACK_SRC（fetch 产出；规划 v2.2：Node 26 树无 deps/corepack）"
cp -r "$SRC/deps/npm" "$TOOLS_DIR/npm"
cp -r "$COREPACK_SRC" "$TOOLS_DIR/corepack"
PRUNED_NPM=$(prune_tree "$TOOLS_DIR/npm")
PRUNED_CP=$(prune_tree "$TOOLS_DIR/corepack")
log "⑦ 剪枝剔除：npm $PRUNED_NPM 个文件、corepack $PRUNED_CP 个文件（计数登记进 BUILD-METADATA）"

# 入口存在性硬校验（lock matrix.shellShims[].entry；R5：以实际树为准，缺 ⇒ 回写 lock 后重跑）
SHIMS_JSON="$(lock_shims_json)"
while IFS=' ' read -r shim_name entry; do
  [[ -f "$TOOLS_DIR/$entry" ]] || die_gate ⑦ "lock matrix.shellShims 登记的入口不存在：$TOOLS_DIR/$entry（$shim_name）——以实际树拍板后回写 lock（规划 R5/M1-T4）"
done < <(node -e "JSON.parse(process.argv[1]).forEach(s=>console.log(s.name, s.entry))" "$SHIMS_JSON")
log "⑦ 入口校验通过（lock 登记的 entry 全部在树内）"

# ── ⑧ manifest（FR-001-021；摘要算法与 provision 单源）─────────────────────
log "⑧ 生成 manifest.json（逐文件 sha256 + 树摘要）"
node "$PROVISION" --manifest-only "$OUT" || die_gate ⑧ "manifest 生成失败"

# ── ⑨ 三壳脚本（FR-001-022，D6；生成后 sh -n 自检）────────────────────────
if [[ $SKIP_SHIMS -eq 0 ]]; then
  log "⑨ 生成三壳脚本（模板单点；entry 出自 lock）"
  while IFS=' ' read -r shim_name entry; do
    cat > "$OUT/$shim_name" <<EOF
#!/system/bin/sh
# $shim_name — generated by build-node-cli-android.sh (do not edit)
# entry: $entry (matrix.shellShims)
if [ -z "\$NODE_TOOLS_DIR" ]; then
  echo "$shim_name: NODE_TOOLS_DIR not set (materialized tools tree root)" >&2
  exit 1
fi
exec "\${NODE_NATIVE_DIR:-\$(dirname "\$0")}/libnode_cli.so" "\$NODE_TOOLS_DIR/$entry" "\$@"
EOF
    sh -n "$OUT/$shim_name" || die_gate ⑨ "$shim_name 语法检查失败"
    chmod +x "$OUT/$shim_name"
    log "⑨ ✔ $shim_name（entry=$entry）"
  done < <(node -e "JSON.parse(process.argv[1]).forEach(s=>console.log(s.name, s.entry))" "$SHIMS_JSON")
else
  log "⑨ --skip-shims：跳过壳脚本生成（provision --check 将拒绝缺件产物）"
fi

# ── ⑩ 元数据（FR-001-023）──────────────────────────────────────────────────
log "⑩ BUILD-METADATA.txt"
NDK_REV="unknown (--collect-only 无 NDK)"
if [[ $COLLECT_ONLY -eq 0 && -f "$NDK/source.properties" ]]; then
  NDK_REV="$(grep -m1 '^Pkg.Revision' "$NDK/source.properties" | cut -d= -f2 | tr -d ' \r')"
fi
node -e '
const fs = require("fs");
const lock = require(process.argv[1]);
const rel = lock.releases.find(r => r.version === lock.active.version && r.abi === lock.active.abi);
const meta = {
  tool: "build-node-cli-android.sh",
  node: rel.version, abi: rel.abi, androidApi: rel.androidApi,
  ndk: process.argv[6],
  configure: "android_configure WITHOUT --shared (D2) + --with-intl=none (D7) + LDFLAGS -Wl,-z,max-page-size=16384",
  patch: process.argv[3] === "" ? "none" : process.argv[3],
  pruned: { npm: Number(process.argv[4]), corepack: Number(process.argv[5]) },
  builtAtUTC: new Date().toISOString(),
};
fs.writeFileSync(process.argv[2], "BUILD-METADATA\n" + JSON.stringify(meta, null, 2) + "\n");
' "$LOCK" "$OUT/BUILD-METADATA.txt" "$APPLY_PATCH" "$PRUNED_NPM" "$PRUNED_CP" "$NDK_REV"
if [[ -f "$ROOT/.dist/src/FETCH-METADATA.json" ]]; then
  cp "$ROOT/.dist/src/FETCH-METADATA.json" "$OUT/FETCH-METADATA.json"
  log "⑩ ✔ FETCH-METADATA.json 归档"
fi
if [[ $COLLECT_ONLY -eq 1 ]]; then
  log "⑩ --collect-only 完成（未编译本体；libnode_cli.so 需 CI 全链产出）。"
elif [[ ! -f "$OUT/libnode_cli.so" ]]; then
  log "⑩ 注意：$OUT/libnode_cli.so 不存在（本批未编译或 --collect-only 路径）。"
fi
log "产物目录：$OUT"
exit 0
