# THIRD-PARTY-NOTICES — aosp-node-cli

本 AAR 随包分发的第三方组件与许可：

- **Node.js**（`libnode_cli.so` 本体，含 V8、OpenSSL、ICU、zlib 等第三方组件）——
  MIT License（含各第三方组件许可全文，随 GitHub Release 归档分发）：
  https://github.com/nodejs/node/blob/main/LICENSE
- **npm**（随包 JS 树，源自 node 源码树 `deps/npm`）—— Artistic License 2.0
- **corepack**（随包 JS 树，源自 node 源码树 `deps/corepack`）—— MIT License

纪律：

- 二进制不入库，由 CI 从官方源码构建（`node-v<ver>.tar.xz`，sha256 校验，源码不改）；
- 完整许可全文随 GitHub Release 归档（`node-cli-v<ver>-android-arm64-v8a.tar.gz`）分发；
- 本仓库自身代码适用仓库根 [LICENSE](../LICENSE)（MIT）。
