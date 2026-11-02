#!/usr/bin/env bash
# scripts/build-node-cli-android.sh —— 交叉编译 Node.js 源码为 Android arm64 的 exec 型
# node 命令行（libnode_cli.so，PIE 可执行）。
#
# 与 aosp-node-runtime 的 build-node-android.sh 同一棵源码树、同一条 android-configure
# 链路，关键差异（docs/000-工程规划.md §技术方案）：
#   1) 配置【不带 --shared】：默认 make 目标产出 node 可执行（而非 libnode.so 共享库）；
#   2) 产物是 exec 型 ELF：PIE + PT_INTERP=/system/bin/linker64（与 dlopen 库门禁相反）；
#   3) -Wl,-z,max-page-size=16384（16KB 页设备硬要求）；
#   4) --with-intl=none（体积口径，与 runtime 一致）；
#   5) 输出命名 libnode_cli.so（Android 打包只认 lib*.so；严禁与引擎 libnode.so 同名）。
#
# 产物：<out>/libnode_cli.so（strip）+ <out>/BUILD-METADATA.txt
#
# 用法（规划接口，M1 实现）：
#   scripts/build-node-cli-android.sh \
#     --node 26.13.0 --api 24 \
#     --src .dist/src/node-src \
#     --ndk "$ANDROID_NDK_HOME" \
#     --out build/out
#
# 状态：000-scaffold 只固化接口与差异纪律；configure/make/strip 门禁链在 M1 落地。
set -euo pipefail

usage() {
  cat <<'EOF'
用法: scripts/build-node-cli-android.sh --node <ver> --api <api> --src <node 源码树> --ndk <ndk 路径> --out <dir>
  --node  配对 Node.js 版本（= CLI_VERSION = node-runtime 版本）
  --api   Android API level（默认 24）
  --src   node-v<ver> 解压后的源码树（fetch 脚本产出）
  --ndk   Android NDK 路径
  --out   产物目录
EOF
}

NODE=""; API="24"; SRC=""; NDK=""; OUT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --node) NODE="$2"; shift 2;;
    --api)  API="$2";  shift 2;;
    --src)  SRC="$2";  shift 2;;
    --ndk)  NDK="$2";  shift 2;;
    --out)  OUT="$2";  shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "未知参数: $1" >&2; usage; exit 1;;
  esac
done

if [[ -z "$NODE" || -z "$SRC" || -z "$NDK" || -z "$OUT" ]]; then
  usage
  exit 1
fi

echo "[build] SCAFFOLD: android-configure/make/strip 门禁链在 M1 实现（000-scaffold 只固化接口与差异纪律）。"
echo "[build] 计划: node=$NODE api=$API src=$SRC ndk=$NDK out=$OUT"
echo "[build] 产物计划: $OUT/libnode_cli.so（exec 型 PIE, PT_INTERP=/system/bin/linker64, 16KB 对齐）"
exit 2
