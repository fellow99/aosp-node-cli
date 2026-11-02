#!/usr/bin/env node
/*
 * tools/provision.mjs —— node-cli 投放与 ELF 门禁（exec 型 profile）
 *
 * 唯一事实源是仓库根的 `node-cli.lock.json`（版本 + 大小 + SHA-256 + 门禁 + 出处）。
 * 二进制不入库：本工具把 CI 产物幂等投放进模块 jniLibs。
 *
 * 与 aosp-node-pty/tools/provision.mjs 同一套极简 ELF64 解析（退出码 0/2/1 同纪律），
 * 但门禁是 **exec 型 profile**，与 dlopen 库门禁的三处相反/差异：
 *   1. PT_INTERP：exec 型必须恰有 1 个，且内容 = /system/bin/linker64
 *      （dlopen 库门禁恰好相反：要求 PT_INTERP=0）。
 *   2. DT_NEEDED 白名单：只允许系统库 + lock matrix.allowedNeeded 登记的随包库
 *      （pty 的对应门禁是"必须含 libnode.so"）。
 *   3. 无 NAPI 门禁：CLI 是独立进程，不加载引擎、不解析 napi_*。
 *   4. 打包：useLegacyPackaging=true——exec 要求物理落盘 nativeLibraryDir
 *      （targetSdk≥29 SELinux 禁止从可写数据目录 exec；不落盘则 execve ENOENT）。
 *
 * 用法：
 *   node tools/provision.mjs --check
 *   node tools/provision.mjs --out node-cli/src/main/jniLibs --from <libnode_cli.so>
 *   node tools/provision.mjs --inspect <libnode_cli.so>
 *   node tools/provision.mjs --version 26.13.0 --abi arm64-v8a ...
 *
 * 退出码：0 全过 · 2 门禁不合格 · 1 用法/IO 错误
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// ── 仓库级常量（每仓一份 provision，仅此块不同）─────────────────────────────
const LOCK_FILE = 'node-cli.lock.json';
const MODULE_DIR = 'node-cli';
const RES_PROPERTIES = 'node-cli.properties';
const DEFAULT_BINARY = 'libnode_cli.so';
// 绝不进入本 AAR 的文件（node-runtime 统一供给；同名库重复会造成包内冲突）。
const BANNED_IN_AAR = ['libnode.so', 'libc++_shared.so'];
// ───────────────────────────────────────────────────────────────────────────

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCK_PATH = path.join(ROOT, LOCK_FILE);
const MODULE_JNILIBS = path.join(MODULE_DIR, 'src', 'main', 'jniLibs');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
function argOf(name, fallback = null) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

function say(msg) {
  process.stdout.write(`[provision] ${msg}\n`);
}

// ── 极简 ELF64（小端）解析：只回答门禁需要的问题（与 pty 同款 + PT_INTERP 内容）──

function parseElf(buf) {
  if (buf.length < 64 || buf.readUInt32BE(0) !== 0x7f454c46) throw new Error('不是 ELF 文件');
  const little = buf[5] === 1;
  if (!little) throw new Error('只支持小端 ELF（AArch64 一定是小端）');
  const u16 = (o) => buf.readUInt16LE(o);
  const u32 = (o) => buf.readUInt32LE(o);
  const u64 = (o) => Number(buf.readBigUInt64LE(o));

  const eType = u16(16);
  const eMachine = u16(18);
  const ePhoff = u64(32);
  const ePhentsize = u16(54);
  const ePhnum = u16(56);
  const eShoff = u64(40);
  const eShentsize = u16(58);
  const eShnum = u16(60);
  const eShstrndx = u16(62);

  let ptInterp = 0;
  let interp = null;
  const loadAligns = [];
  for (let i = 0; i < ePhnum; i++) {
    const o = ePhoff + i * ePhentsize;
    const pType = u32(o);
    const pAlign = u64(o + 48);
    if (pType === 3) {
      ptInterp++;
      const pOffset = u64(o + 8);
      const pFilesz = u64(o + 32);
      interp = buf.toString('utf8', pOffset, pOffset + pFilesz).replace(/\0+$/, '');
    }
    if (pType === 1) loadAligns.push(pAlign);
  }

  const sections = [];
  for (let i = 0; i < eShnum; i++) {
    const o = eShoff + i * eShentsize;
    sections.push({
      nameOff: u32(o),
      type: u32(o + 4),
      offset: u64(o + 24),
      size: u64(o + 32),
    });
  }
  const shstr = sections[eShstrndx];
  const strAt = (base, off) => {
    const s = base + off;
    let e = s;
    while (e < buf.length && buf[e] !== 0) e++;
    return buf.toString('utf8', s, e);
  };
  const byName = new Map();
  for (const s of sections) byName.set(strAt(shstr.offset, s.nameOff), s);

  const dynamic = byName.get('.dynamic');
  const needed = [];
  const soname = [];
  if (dynamic) {
    for (let i = 0; i * 16 < dynamic.size; i++) {
      const o = dynamic.offset + i * 16;
      const tag = Number(buf.readBigInt64LE(o));
      const val = u64(o + 8);
      if (tag === 0) break;
      if (tag === 1 || tag === 14) {
        const nm = strAt(byName.get('.dynstr').offset, val);
        if (tag === 1) needed.push(nm);
        else soname.push(nm);
      }
    }
  }

  return { eType, eMachine, ptInterp, interp, loadAligns, needed, soname };
}

function gates(buf, rel, allowedNeeded) {
  let elf;
  try {
    elf = parseElf(buf);
  } catch (e) {
    return { ok: false, results: [{ id: 'parse', ok: false, detail: e.message }] };
  }
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const minAlign = elf.loadAligns.length ? Math.min(...elf.loadAligns) : 0;
  const expectSha = rel.sha256 && rel.sha256.length === 64 ? rel.sha256 : null;
  const expectSize = rel.size && rel.size > 0 ? rel.size : null;
  const r = [];
  const add = (id, ok, detail) => r.push({ id, ok, detail });

  add('① e_type = ET_DYN（PIE 可执行）', elf.eType === 3, `e_type=${elf.eType}`);
  // 本工程特有（与 dlopen 库门禁相反）：exec 型必须经系统动态链接器启动。
  add('② PT_INTERP 恰 1 个且 = /system/bin/linker64',
    elf.ptInterp === 1 && elf.interp === '/system/bin/linker64',
    `PT_INTERP=${elf.ptInterp} interp=${JSON.stringify(elf.interp)}`);
  add('③ e_machine = AArch64', elf.eMachine === 183, `e_machine=${elf.eMachine}`);
  // exec 型依赖白名单：只允许系统库 + lock matrix.allowedNeeded 登记的随包库。
  const banned = elf.needed.filter((n) => !allowedNeeded.includes(n));
  add('④ DT_NEEDED 全部在白名单', banned.length === 0,
    `NEEDED=${JSON.stringify(elf.needed)}；白名单外=${banned.length ? JSON.stringify(banned) : '无'}`);
  if (expectSha) add('⑤ SHA-256 与锁一致', sha256 === expectSha, `${sha256.slice(0, 16)}… vs ${expectSha.slice(0, 16)}…`);
  else add('⑤ SHA-256（draft 无锁值，仅记录）', true, sha256);
  if (expectSize) add('⑥ 大小与锁一致', buf.length === expectSize, `${buf.length} vs ${expectSize}`);
  else add('⑥ 大小（draft 无锁值，仅记录）', true, `${buf.length}`);
  add('⑦ 16 KB 页对齐', minAlign >= 0x4000, `min LOAD align=0x${minAlign.toString(16)}（小于 0x4000=16KB，16 KB 页设备不合格）`);

  const allow4k = has('--allow-page-align-4k');
  const gateAlign = r.find((x) => x.id.startsWith('⑦'));
  const hardOk = r.every((x) => (allow4k && x === gateAlign ? true : x.ok));
  if (allow4k && gateAlign && !gateAlign.ok) {
    say('⚠ --allow-page-align-4k 放行「16 KB 页对齐」：仅 bring-up，上架/16 KB 设备不合格');
  }
  return { ok: hardOk, results: r, elf, sha256 };
}

function printGates(g) {
  for (const x of g.results) say(`${x.ok ? '✔' : '✘'} ${x.id} — ${x.detail}`);
}

// ── 主流程 ──────────────────────────────────────────────────────────────────

function readLock() {
  if (!fs.existsSync(LOCK_PATH)) throw new Error(`缺 ${LOCK_PATH}`);
  return JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
}

function main() {
  const lock = readLock();
  const allowedNeeded = lock.matrix?.allowedNeeded ?? ['libc.so', 'libm.so', 'libdl.so', 'libz.so'];
  const wantVersion = argOf('--version') || lock.active.version;
  const wantAbi = argOf('--abi') || lock.active.abi;
  const rel = lock.releases.find((x) => x.version === wantVersion && x.abi === wantAbi);
  if (!rel) {
    throw new Error(
      `${LOCK_FILE} 里没有记录 version=${wantVersion} abi=${wantAbi}；现有：` +
      lock.releases.map((x) => `${x.version}/${x.abi}`).join(', '),
    );
  }
  const active = { version: rel.version, abi: rel.abi, name: rel.name || DEFAULT_BINARY };

  say(`目标 release：version=${rel.version} abi=${rel.abi}（${rel.pairedRuntime?.coordinates ?? '无配对信息'}）`);
  if (rel.status === 'draft') say('⚠ lock 中该 release 为 draft：sha/size 无锁值，仅记录不比对');

  const inspectPath = argOf('--inspect');
  if (inspectPath) {
    const buf = fs.readFileSync(inspectPath);
    const g = gates(buf, rel, allowedNeeded);
    printGates(g);
    say(g.ok ? '门禁：全过' : '门禁：不合格');
    process.exit(g.ok ? 0 : 2);
  }

  const outDir = argOf('--out');
  const from = argOf('--from');

  if (!outDir) {
    // --check：校验已投放产物
    const target = path.join(ROOT, MODULE_JNILIBS, active.abi, active.name);
    if (!fs.existsSync(target)) {
      say(`未投放：${target}（先跑 --out …）`);
      process.exit(2);
    }
    const buf = fs.readFileSync(target);
    const g = gates(buf, rel, allowedNeeded);
    printGates(g);
    // 纪律：jniLibs 目录里只能有本工具二进制，绝不能混入引擎/C++ 运行时。
    const dir = path.dirname(target);
    const siblings = fs.readdirSync(dir).filter((f) => f.endsWith('.so'));
    const illegal = siblings.filter((f) => f !== active.name);
    say(`${illegal.length === 0 ? '✔' : '✘'} jniLibs 仅含 ${active.name}（其它 .so：${illegal.length ? JSON.stringify(illegal) : '无'}）`);
    const ok = g.ok && illegal.length === 0;
    say(ok ? '门禁：全过' : '门禁：不合格');
    process.exit(ok ? 0 : 2);
  }

  if (!from) throw new Error(`--out 需要配 --from <${DEFAULT_BINARY}>`);
  const buf = fs.readFileSync(from);
  const g = gates(buf, rel, allowedNeeded);
  printGates(g);
  if (!g.ok) {
    say('门禁不合格 ⇒ 拒绝投放');
    process.exit(2);
  }

  // 投放：只复制本工具二进制。
  const destDir = path.resolve(ROOT, outDir, active.abi);
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, active.name);
  fs.copyFileSync(from, dest);
  say(`✔ 投放（唯一原生件）：${dest}`);
  for (const banned of BANNED_IN_AAR) {
    if (fs.existsSync(path.join(destDir, banned))) {
      throw new Error(`${banned} 不得进入本 AAR（应由配对 runtime 供给，避免包内同名冲突）`);
    }
  }

  // 版本元数据（供 AAR resources 使用）
  const resDir = path.join(ROOT, MODULE_DIR, 'src', 'main', 'resources', 'META-INF');
  fs.mkdirSync(resDir, { recursive: true });
  fs.writeFileSync(
    path.join(resDir, RES_PROPERTIES),
    [
      `tool.version=${rel.version}`,
      `abi=${rel.abi}`,
      `name=${active.name}`,
      `size=${buf.length}`,
      `sha256=${g.sha256}`,
      rel.pairedRuntime?.coordinates ? `paired.runtime=${rel.pairedRuntime.coordinates}` : '',
      `provisionedAt=${new Date().toISOString()}`,
      '',
    ].filter((l) => l !== '').join('\n'),
  );
  say('投放完成');
}

try {
  main();
} catch (e) {
  process.stderr.write(`[provision] 失败：${e.message}\n`);
  process.exit(1);
}
