#!/usr/bin/env node
/*
 * scripts/fetch-node-cli-source.mjs —— 单源钉选获取（001-building FR-001-001…004）
 *
 * 源：node-v<ver>.tar.xz + 官方 SHASUMS256.txt（https://nodejs.org/dist/v<ver>/，树内含 deps/npm，
 * D6）；corepack 单独钉版 tarball（规划 v2.2：Node 25 起树内无 deps/corepack）。
 *
 * 纪律（宪法 C1/C2/C6）：
 *   - 钉选值（version/url/sha256）唯一出自 node-cli.lock.json releases[].builtFrom.sourceTar，
 *     本脚本不持有任何版本事实；
 *   - sha256 空串 = 未钉选 ⇒ 默认拒绝执行（exit 1）。例外通道（都是引导取值，不是绕过校验）：
 *       --report-sha256  只下载官方文件、按 SHASUMS256.txt 打印 pin> 行供维护者回写 lock
 *                        （不解压、不写元数据、永不写 lock）；
 *       --allow-unpinned 以官方 SHASUMS256.txt 为现场权威校验后继续（出处如实记入
 *                        FETCH-METADATA.json：pinnedFrom=SHASUMS256.txt），lock 仍不自动改；
 *   - 校验链（FR-001-001）：tar.xz 的 sha256 必须 == 官方 SHASUMS256.txt 声明值；若 lock
 *     已钉选，则三方一致（文件 == SHASUMS256.txt == lock），任一不符即失败；
 *   - 可重入（FR-001-002）：已下载且哈希一致 ⇒ 跳过；不一致 ⇒ exit 1（缓存污染，不自动重下；
 *     --force 显式重下）；
 *   - 不改源（C1/D8）：只做下载/校验/解压/记录出处，无任何补丁步骤。
 *
 * 产物布局（默认 --out .dist/src）：
 *   <out>/downloads/node-v<ver>.tar.xz   源包原件
 *   <out>/downloads/SHASUMS256.txt       官方校验文件原件
 *   <out>/node-src/                      解压后的完整源码树（顶层目录归一化）
 *   <out>/corepack/                      corepack 钉版 tarball 解包树（package/ 归一化；规划 v2.2）
 *   <out>/FETCH-METADATA.json            出处记录
 *
 * 外部工具：tar -xJf（解压 .tar.xz；ubuntu runner 与 Git Bash 均预装 xz/tar）。
 *
 * 退出码：0 成功 · 2 sha256 校验失败（含缓存污染/官方链断裂）· 1 用法/IO/未钉选错误
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCK_FILE = 'node-cli.lock.json';

const args = process.argv.slice(2);
function argOf(name, fallback = null) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

function usage() {
  process.stderr.write(
    [
      '用法: node scripts/fetch-node-cli-source.mjs --node <ver> [--out <dir>]',
      '                         [--report-sha256] [--allow-unpinned] [--force]',
      '  --node           配对 Node 版本（= CLI_VERSION；对应 lock releases[].version）',
      '  --out            工作目录（默认 .dist/src）',
      '  --report-sha256  钉选引导：下载官方文件并按 SHASUMS256.txt 打印哈希（不解压、不写 lock）',
      '  --allow-unpinned lock 未钉选时以官方 SHASUMS256.txt 为现场权威继续（出处如实记录）',
      '  --force          忽略已下载缓存强制重下（默认哈希一致即跳过）',
      '  --lock <path>    指定 lock 文件（默认仓库根 node-cli.lock.json；CI 未钉选场景测试用）',
    ].join('\n') + '\n',
  );
}

function say(msg) {
  process.stdout.write(`[fetch] ${msg}\n`);
}
function die(msg, code = 1) {
  process.stderr.write(`[fetch] 失败：${msg}\n`);
  process.exit(code);
}

function sha256File(p) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(p));
  return h.digest('hex');
}

/** 下载（跟随重定向，≤6 跳）到临时文件后原子改名。 */
async function download(url, dest) {
  const { get } = await import('node:https');
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;

  const fetchOnce = (u, hops) =>
    new Promise((resolve, reject) => {
      if (hops > 6) return reject(new Error('重定向超过 6 跳'));
      const req = get(u, { timeout: 300_000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(fetchOnce(new URL(res.headers.location, u).toString(), hops + 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} @ ${u}`));
        }
        const out = fs.createWriteStream(tmp);
        res.pipe(out);
        out.on('finish', () => out.close(() => resolve()));
        out.on('error', reject);
      });
      req.on('timeout', () => req.destroy(new Error('下载超时（300s）')));
      req.on('error', reject);
    });

  try {
    await fetchOnce(url, 0);
    fs.renameSync(tmp, dest);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

/** 从 SHASUMS256.txt 文本中取 <file> 的官方声明哈希（找不到 ⇒ null）。 */
function shaFromShasums(text, file) {
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (m && m[2].trim() === file) return m[1].toLowerCase();
  }
  return null;
}

/** 解压 .tar.xz 到目标目录（顶层目录归一化；tmp 内相对路径规避 Windows 盘符冒号问题）。 */
function extractTarXz(file, destDir) {
  fs.rmSync(destDir, { recursive: true, force: true });
  const tmp = `${destDir}.__extract__`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const rel = path.relative(tmp, file).split(path.sep).join('/');
  try {
    execFileSync('tar', ['-xJf', rel, '-C', '.'], { cwd: tmp, stdio: 'pipe' });
    const entries = fs.readdirSync(tmp);
    if (entries.length === 1 && fs.statSync(path.join(tmp, entries[0])).isDirectory()) {
      fs.renameSync(path.join(tmp, entries[0]), destDir);
      fs.rmSync(tmp, { recursive: true, force: true });
    } else {
      fs.renameSync(tmp, destDir);
    }
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(destDir, { recursive: true, force: true });
    throw new Error(`解压失败 ${path.basename(file)}：${e.message.split('\n')[0]}`);
  }
}

/** 解压 .tar.gz（corepack tarball：package/ 顶层目录归一化）。 */
function extractTarGz(file, destDir) {
  fs.rmSync(destDir, { recursive: true, force: true });
  const tmp = `${destDir}.__extract__`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const rel = path.relative(tmp, file).split(path.sep).join('/');
  try {
    execFileSync('tar', ['-xzf', rel, '-C', '.'], { cwd: tmp, stdio: 'pipe' });
    const pkg = path.join(tmp, 'package');
    if (fs.existsSync(pkg) && fs.statSync(pkg).isDirectory()) {
      fs.renameSync(pkg, destDir);
      fs.rmSync(tmp, { recursive: true, force: true });
    } else {
      fs.renameSync(tmp, destDir);
    }
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(destDir, { recursive: true, force: true });
    throw new Error(`解压失败 ${path.basename(file)}：${e.message.split('\n')[0]}`);
  }
}

// ── 主流程 ──────────────────────────────────────────────────────────────────

const nodeVer = argOf('--node');
const outDir = argOf('--out') ?? path.join(ROOT, '.dist', 'src');
const reportMode = args.includes('--report-sha256');
const allowUnpinned = args.includes('--allow-unpinned');
const force = args.includes('--force');

if (args.includes('--help') || !nodeVer) {
  usage();
  process.exit(nodeVer ? 0 : 1);
}

const lockPath = argOf('--lock') ? path.resolve(argOf('--lock')) : path.join(ROOT, LOCK_FILE);
if (!fs.existsSync(lockPath)) die(`缺 lock 文件：${lockPath}`);
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const abi = lock.active?.abi ?? 'arm64-v8a';
const rel = lock.releases.find((x) => x.version === nodeVer && x.abi === abi);
if (!rel) {
  die(
    `${LOCK_FILE} 无 version=${nodeVer} abi=${abi} 的记录；现有：` +
      lock.releases.map((x) => `${x.version}/${x.abi}`).join(', '),
  );
}
const sourceTar = rel.builtFrom?.sourceTar;
if (!sourceTar) die(`lock releases[].builtFrom 缺 sourceTar 项（001-building FR-001-004）`);
if (sourceTar.version && sourceTar.version !== nodeVer) {
  die(`lock sourceTar.version=${sourceTar.version} 与 --node ${nodeVer} 不一致（C5 同版本配对）`);
}

const distBase = `https://nodejs.org/dist/v${nodeVer}/`;
const tarName = `node-v${nodeVer}.tar.xz`;
const tarUrl = sourceTar.url || `${distBase}${tarName}`;
const shasumsName = 'SHASUMS256.txt';
const shasumsUrl = `${distBase}${shasumsName}`;
const pinnedSha = sourceTar.sha256 && sourceTar.sha256.length === 64 ? sourceTar.sha256 : null;

// corepack 第二源（规划 v2.2：Node 25+ 树内无 deps/corepack，改钉官方 registry tarball）
const corepackTar = rel.builtFrom?.corepackTar ?? null;
const cpPinnedSha = corepackTar?.sha256 && corepackTar.sha256.length === 64 ? corepackTar.sha256 : null;

if ((!pinnedSha || (corepackTar && !cpPinnedSha)) && !reportMode && !allowUnpinned) {
  die(
    `以下源 sha256 未钉选（空值）：${!pinnedSha ? 'sourceTar ' : ''}${corepackTar && !cpPinnedSha ? 'corepackTar' : ''}。` +
      `先运行 --report-sha256 引导取值并由维护者回写 lock（C2/C6：不得以「先拿到什么」冒充钉选）；` +
      `或显式 --allow-unpinned（sourceTar 以官方 SHASUMS256.txt 为现场权威；corepackTar 需先钉选）。`,
  );
}
if (corepackTar && !cpPinnedSha && !reportMode) {
  die(`lock builtFrom.corepackTar.sha256 未钉选——--allow-unpinned 不适用于 corepack（无官方 SHASUMS 链，必须钉选）。`);
}

const downloads = path.join(outDir, 'downloads');
fs.mkdirSync(downloads, { recursive: true });
const tarFile = path.join(downloads, tarName);
const shasumsFile = path.join(downloads, shasumsName);

/** 下载或复用一个文件；已存在且 --force 未给 ⇒ 直接返回（哈希稍后统一校验）。 */
async function fetchFile(url, dest) {
  if (fs.existsSync(dest) && !force) {
    say(`已缓存（跳过下载）：${path.basename(dest)}`);
    return;
  }
  say(`下载：${url}`);
  try {
    await download(url, dest);
  } catch (e) {
    die(`下载失败 ${url}：${e.message}`, 1);
  }
}

await fetchFile(tarUrl, tarFile);
await fetchFile(shasumsUrl, shasumsFile);

// 校验链：官方声明值（SHASUMS256.txt）⇒ 必须与文件一致
const officialSha = shaFromShasums(fs.readFileSync(shasumsFile, 'utf8'), tarName);
if (!officialSha) die(`SHASUMS256.txt 内没有 ${tarName} 的声明（官方校验链断裂）`, 2);
const actualSha = sha256File(tarFile);
if (actualSha !== officialSha) {
  die(
    `SHA-256 校验失败（vs 官方 SHASUMS256.txt）：${tarName}\n  实际 ${actualSha}\n  官方 ${officialSha}`,
    2,
  );
}
say(`✔ ${tarName} == SHASUMS256.txt 声明值（${actualSha.slice(0, 16)}…，${fs.statSync(tarFile).size} 字节）`);

// lock 钉选值若存在 ⇒ 三方一致（文件 == 官方 == lock）
if (pinnedSha && pinnedSha !== officialSha) {
  die(
    `lock 钉选值与官方 SHASUMS256.txt 不一致：\n  lock ${pinnedSha}\n  官方 ${officialSha}` +
      `（lock 过期或被污染——维护者核对后回写，本脚本不改 lock）`,
    2,
  );
}

// corepack 钉版 tarball（下载 + sha256 校验；无可替代官方校验链 ⇒ 必须钉选）
let cpActualSha = null;
let cpFile = null;
if (corepackTar) {
  cpFile = path.join(downloads, `corepack-${corepackTar.version}.tgz`);
  await fetchFile(corepackTar.url, cpFile);
  cpActualSha = sha256File(cpFile);
  if (cpActualSha !== cpPinnedSha) {
    die(
      `SHA-256 校验失败（corepack tarball）：${path.basename(cpFile)}
  实际 ${cpActualSha}
  锁定 ${cpPinnedSha}`,
      2,
    );
  }
  say(`✔ corepack-${corepackTar.version}.tgz == lock 钉选值（${cpActualSha.slice(0, 16)}…，${fs.statSync(cpFile).size} 字节）`);
}

if (reportMode) {
  say(`钉选引导模式（--report-sha256）：以下哈希来自官方文件实测下载链；`);
  say(`请维护者核对后回写 ${LOCK_FILE} builtFrom（本脚本不写 lock）。`);
  say(`pin> sourceTar: version=${nodeVer} url=${tarUrl} sha256=${officialSha}`);
  if (corepackTar && cpActualSha) {
    say(`pin> corepackTar: version=${corepackTar.version} url=${corepackTar.url} sha256=${cpActualSha}`);
  }
  process.exit(0);
}

// 解压（官方原样；无补丁步骤——C1）
say(`解压 → ${path.join(outDir, 'node-src')}`);
extractTarXz(tarFile, path.join(outDir, 'node-src'));
const depsNpm = path.join(outDir, 'node-src', 'deps', 'npm');
const depsCorepack = path.join(outDir, 'node-src', 'deps', 'corepack');
if (!fs.existsSync(depsNpm)) die(`解压树缺 deps/npm（源包异常：${depsNpm}）`);
say('✔ deps/npm 在位（D6：随 node 树分发，零额外下载；corepack 自 v2.2 起单独钉版）');
if (!fs.existsSync(depsCorepack) && !corepackTar) {
  die(`解压树缺 deps/corepack 且 lock 未登记 corepackTar（规划 v2.2：Node 25+ 需钉版 corepackTar）`);
}
let corepackVersion = '';
if (corepackTar && cpFile) {
  const cpDest = path.join(outDir, 'corepack');
  say(`解压 corepack-${corepackTar.version}.tgz → ${cpDest}（package/ 归一化）`);
  extractTarGz(cpFile, cpDest);
  const cpEntry = path.join(cpDest, 'dist', 'corepack.js');
  if (!fs.existsSync(cpEntry)) die(`corepack 解包树缺 dist/corepack.js（tarball 布局异常：${cpEntry}）`);
  const cpPkg = path.join(cpDest, 'package.json');
  if (fs.existsSync(cpPkg)) corepackVersion = JSON.parse(fs.readFileSync(cpPkg, 'utf8')).version ?? '';
  if (corepackVersion && corepackVersion !== corepackTar.version) {
    die(`corepack 树内 package.json version=${corepackVersion} 与 lock 钉选 ${corepackTar.version} 不一致`);
  }
  say(`✔ corepack ${corepackTar.version} 在位（entry corepack/dist/corepack.js）`);
}

// FETCH-METADATA.json（出处记录，C1：无补丁步骤的事实凭证）
const meta = {
  generatedAt: new Date().toISOString(),
  node: nodeVer,
  abi,
  policy: 'unmodified upstream sources only; Android-specific configuration is injected via android_configure args at build time (constitution C1 / decision D8)',
  sourceTar: {
    version: nodeVer,
    url: tarUrl,
    sha256: actualSha,
    size: fs.statSync(tarFile).size,
    pinnedFrom: pinnedSha ? 'node-cli.lock.json (三方一致: file == SHASUMS256.txt == lock)' : 'SHASUMS256.txt (现场权威; lock 未钉选, --allow-unpinned)',
  },
  ...(corepackTar && cpActualSha ? { corepackTar: {
    version: corepackTar.version,
    url: corepackTar.url,
    sha256: cpActualSha,
    size: fs.statSync(cpFile).size,
    pinnedFrom: 'node-cli.lock.json (file == lock)',
  } } : {}),
};
const metaPath = path.join(outDir, 'FETCH-METADATA.json');
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
say(`✔ FETCH-METADATA.json → ${metaPath}`);
say('单源获取完成（下载/校验/解压；未做任何源码改动）。');
process.exit(0);
