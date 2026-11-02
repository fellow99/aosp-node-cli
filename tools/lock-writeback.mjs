#!/usr/bin/env node
/*
 * tools/lock-writeback.mjs —— Release 后 lock 回写物生成（002-building-workflow FR-002-007）
 *
 * 读构建产物目录（.dist/out：libnode_cli.so + 三壳 + BUILD-METADATA.txt + node-bridge-tools/
 * manifest.json）与 FETCH-METADATA.json，产出「回写后的 lock 全文 + diff」到 artifact 目录，
 * 供维护者下载后人工 PR（M4 前不自动化合入；本工具永不改仓库内的 node-cli.lock.json）。
 *
 * 回写面（规划 §8 / G4）：
 *   releases[i].size / .sha256          ← libnode_cli.so 实测
 *   releases[i].status                  ← "released"
 *   builtFrom.ndk / .flags / .patch     ← BUILD-METADATA.txt（build 脚本⑩ 产出）
 *   builtFrom.npm / .corepack           ← 树内 package.json version + manifest 计数/树摘要
 *   builtFrom.shims                     ← 三壳 sha256/size/entry
 *   builtFrom.sourceTar.sha256          ← FETCH-METADATA.json（若 lock 为空则补钉）
 *   builtFrom.assetsManifest            ← manifest.json fileCount/totalSha256
 *
 * 用法：
 *   node tools/lock-writeback.mjs --from .dist/out [--fetch-meta .dist/src/FETCH-METADATA.json] \
 *                                [--out .dist/lock-writeback]
 * 退出码：0 成功 · 1 用法/IO 错误（缺产物文件）
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCK_PATH = path.join(ROOT, 'node-cli.lock.json');

const args = process.argv.slice(2);
function argOf(name, fallback = null) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
function say(msg) { process.stdout.write(`[lock-writeback] ${msg}\n`); }
function die(msg) { process.stderr.write(`[lock-writeback] 失败：${msg}\n`); process.exit(1); }

const from = argOf('--from');
const outDir = argOf('--out') ?? path.join(ROOT, '.dist', 'lock-writeback');
const fetchMetaPath = argOf('--fetch-meta') ?? path.join(ROOT, '.dist', 'src', 'FETCH-METADATA.json');
if (!from) die('用法: node tools/lock-writeback.mjs --from <构建产物目录> [--fetch-meta <FETCH-METADATA.json>] [--out <artifact 目录>]');

const sha256File = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

// ── 输入面 ──────────────────────────────────────────────────────────────────
const so = path.join(from, 'libnode_cli.so');
const buildMetaPath = path.join(from, 'BUILD-METADATA.txt');
const manifestPath = path.join(from, 'node-bridge-tools', 'manifest.json');
for (const p of [so, buildMetaPath, manifestPath]) if (!fs.existsSync(p)) die(`缺输入：${p}`);

const lock = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
const rel = lock.releases.find((r) => r.version === lock.active.version && r.abi === lock.active.abi);
if (!rel) die('lock active 记录缺失');

// BUILD-METADATA.txt：首行标记 + JSON 体
const bmText = fs.readFileSync(buildMetaPath, 'utf8');
let bm = {};
try { bm = JSON.parse(bmText.replace(/^BUILD-METADATA\n/, '')); } catch { die('BUILD-METADATA.txt 不是合法 JSON 体'); }

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const fetchMeta = fs.existsSync(fetchMetaPath) ? JSON.parse(fs.readFileSync(fetchMetaPath, 'utf8')) : null;

// 树内 package.json 版本（npm/corepack 不单独钉版：版本随树，回写实测事实）
const pkgVersion = (p) => {
  const f = path.join(from, 'node-bridge-tools', p, 'package.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).version ?? '' : '';
};

// ── 回写 ────────────────────────────────────────────────────────────────────
const next = structuredClone(lock);
const nrel = next.releases.find((r) => r.version === lock.active.version && r.abi === lock.active.abi);
nrel.size = fs.statSync(so).size;
nrel.sha256 = sha256File(so);
nrel.status = 'released';
nrel.builtFrom = nrel.builtFrom ?? {};
if (bm.ndk || bm.toolchain) nrel.builtFrom.ndk = bm.ndk ?? bm.toolchain;
if (bm.configure) nrel.builtFrom.flags = bm.configure;
if (bm.patch !== undefined) nrel.builtFrom.patch = bm.patch;
nrel.builtFrom.npm = {
  version: pkgVersion('npm'), path: 'deps/npm',
  fileCount: Object.keys(manifest.files ?? {}).filter((f) => f.startsWith('npm/')).length,
  sha256: '',
};
nrel.builtFrom.corepack = {
  version: pkgVersion('corepack'), path: 'deps/corepack',
  fileCount: Object.keys(manifest.files ?? {}).filter((f) => f.startsWith('corepack/')).length,
  sha256: '',
};
nrel.builtFrom.assetsManifest = { fileCount: manifest.fileCount ?? 0, totalSha256: manifest.totalSha256 ?? '' };
nrel.builtFrom.shims = (lock.matrix?.shellShims ?? []).map((s) => {
  const f = path.join(from, s.name);
  return {
    name: s.name, entry: s.entry,
    sha256: fs.existsSync(f) ? sha256File(f) : '',
    size: fs.existsSync(f) ? fs.statSync(f).size : 0,
  };
});
if (fetchMeta?.sourceTar?.sha256 && !(nrel.builtFrom.sourceTar?.sha256)) {
  nrel.builtFrom.sourceTar = nrel.builtFrom.sourceTar ?? {};
  nrel.builtFrom.sourceTar.sha256 = fetchMeta.sourceTar.sha256;
}

// ── 输出：回写后 lock 全文 + 人工 diff 底稿 ─────────────────────────────────
fs.mkdirSync(outDir, { recursive: true });
const nextPath = path.join(outDir, 'node-cli.lock.json');
fs.writeFileSync(nextPath, JSON.stringify(next, null, 2) + '\n');
const origLines = JSON.stringify(lock, null, 2).split('\n');
const nextLines = JSON.stringify(next, null, 2).split('\n');
const diffPath = path.join(outDir, 'lock-writeback.diff');
fs.writeFileSync(diffPath,
  [
    '# lock writeback（人工 PR 底稿；来源：lock-writeback.mjs，勿直接 push main —— FR-002-007）',
    `# built: ${bm.builtAtUTC ?? ''}  node=${nrel.version}  abi=${nrel.abi}`,
    `# so: size=${nrel.size} sha256=${nrel.sha256}`,
    `# assets: fileCount=${nrel.builtFrom.assetsManifest.fileCount} totalSha256=${nrel.builtFrom.assetsManifest.totalSha256.slice(0, 16)}…`,
    `# npm=${nrel.builtFrom.npm.version} (${nrel.builtFrom.npm.fileCount} files)  corepack=${nrel.builtFrom.corepack.version} (${nrel.builtFrom.corepack.fileCount} files)`,
    '',
    '--- node-cli.lock.json (仓库现行)',
    '+++ node-cli.lock.json (回写后)',
    ...diffLines(origLines, nextLines),
    '',
  ].join('\n'));

/** 极简 LCS diff（行级；足够人工核对，勿当 patch 用）。 */
function diffLines(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push('- ' + a[i++]); }
    else { out.push('+ ' + b[j++]); }
  }
  while (i < n) out.push('- ' + a[i++]);
  while (j < m) out.push('+ ' + b[j++]);
  return out;
}

say(`✔ 回写物：${nextPath}`);
say(`✔ diff 底稿：${diffPath}`);
say('维护者核对后人工 PR（M4 前不自动化合入；本工具未改动仓库 lock）。');
