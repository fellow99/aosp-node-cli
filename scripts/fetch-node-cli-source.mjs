#!/usr/bin/env node
/*
 * scripts/fetch-node-cli-source.mjs —— 取构建输入（Node.js 官方源码包，不改源）
 *
 * 计划输出目录（默认 .dist/src）：
 *   <out>/node-src/            node-v<ver> 解压后的完整源码树（含 deps/npm、deps/corepack）
 *
 * 源码不改（工作区纪律：fetch 不打补丁；Android 专用配置经构建脚本的 configure 参数注入）。
 * 本脚本只下载、解压、记录出处与 sha256。
 *
 * 用法（规划接口，M1 实现）：
 *   node scripts/fetch-node-cli-source.mjs --node 26.13.0 --out .dist/src
 *
 * 状态：000-scaffold 只固化接口与纪律；下载/解压/校验逻辑在 M1 落地。
 *
 * 退出码：0 成功 · 2 SCAFFOLD 未实现 · 1 用法/IO/下载错误
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function argOf(name, fallback = null) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

function usage() {
  process.stderr.write(
    [
      '用法: node scripts/fetch-node-cli-source.mjs --node <node 版本> [--out <dir>]',
      '  --node   配对 Node.js 版本（= CLI_VERSION = node-runtime 版本）',
      '  --out    输出目录（默认 .dist/src）',
    ].join('\n') + '\n',
  );
}

const node = argOf('--node');
const out = argOf('--out') ?? path.join(ROOT, '.dist', 'src');

if (has('--help') || !node) {
  usage();
  process.exit(node ? 0 : 1);
}

process.stderr.write(
  [
    `[fetch] SCAFFOLD: 下载/解压/SHA-256 校验逻辑在 M1 实现（000-scaffold 只固化接口）。`,
    `[fetch] 计划输入: node-v${node}.tar.xz @ https://nodejs.org/dist/v${node}/`,
    `[fetch] 计划输出: ${out}/node-src/`,
  ].join('\n') + '\n',
);
process.exit(2);

function has(f) {
  return args.includes(f);
}
