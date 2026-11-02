#!/usr/bin/env node
/*
 * tools/provision.mjs —— node-cli 投放与 ELF 门禁（exec 型 profile）
 *
 * 唯一事实源是仓库根的 `node-cli.lock.json`（版本 + 大小 + SHA-256 + 门禁 + 出处 + 壳白名单）。
 * 二进制不入库：本工具把 CI 产物投放进模块 jniLibs / assets。
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
 * 命令矩阵（000-scaffold 契约 + 001-building 扩展）：
 *   node tools/provision.mjs --check                    校验已投放产物（ELF 门禁 + 壳白名单应有尽有）
 *   node tools/provision.mjs --inspect <file>           打印任意候选文件的七项门禁报告
 *   node tools/provision.mjs --out <dir> --from <file>  门禁全过后投放主件 + 写 META-INF 元数据
 *   node tools/provision.mjs --shims <dir>              壳五判据校验 + 投放三壳（FR-001-033/034/035）
 *   node tools/provision.mjs --assets <dir> [--assets-mode stage|verify]
 *                                                       npm/corepack 树投放/复验 + manifest（FR-001-030…032）
 *   node tools/provision.mjs --manifest-only <dir>      在 <dir>/node-bridge-tools/ 内生成 manifest.json
 *                                                       （build 步⑧ 调用；摘要算法与 --assets 单源）
 *   node tools/provision.mjs --version 26.13.0 --abi arm64-v8a ...
 *   node tools/provision.mjs --allow-page-align-4k ...  仅门禁⑦降级 + 强制警告（bring-up 用）
 *
 * jniLibs 兄弟文件二分类（FR-001-033，规划 §6.1）：
 *   ELF magic   ⇒ 文件名必须 = libnode_cli.so，走七项门禁全套；
 *   文本+首行#! ⇒ 名称 ∈ lock matrix.shellShims 白名单 + 壳五判据；
 *   其余 .so    ⇒ 拒绝（BANNED_IN_AAR：libnode.so/libc++_shared.so 恒拒，白名单不豁免）。
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
// assets 树名（规划 §5：assets/node-bridge-tools/）与其内 manifest 文件名。
const ASSETS_TREE = 'node-bridge-tools';
const MANIFEST_FILE = 'manifest.json';
// 壳脚本网络/下载类关键词黑名单（FR-001-034 判据④；C2 纪律在脚本层生效）。
const SHIM_FORBIDDEN = [/curl/, /wget/, /https?:\/\//, /\bnc\s/, /\bssh\b/, /\bftp\b/, /\blibnode\.so\b/, /libc\+\+_shared\.so/];
// ───────────────────────────────────────────────────────────────────────────

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCK_PATH = path.join(ROOT, LOCK_FILE);
const MODULE_JNILIBS = path.join(MODULE_DIR, 'src', 'main', 'jniLibs');
const MODULE_ASSETS = path.join(MODULE_DIR, 'src', 'main', 'assets');

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

function isElfMagic(buf) {
  return buf.length >= 4 && buf.readUInt32BE(0) === 0x7f454c46;
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

// ── manifest（FR-001-021/031；摘要算法单源：--manifest-only 与 --assets stage 共用）──

function sha256File(p) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(p));
  return h.digest('hex');
}

/** 递归收集目录内全部文件（相对路径 POSIX 化、排序——树摘要与目录序无关）。 */
function walkFiles(dir, base = dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkFiles(fp, base));
    else if (ent.isFile()) out.push(path.relative(base, fp).split(path.sep).join('/'));
  }
  return out.sort();
}

function buildManifest(treeDir, { tool, version, abi }) {
  const files = walkFiles(treeDir).filter((f) => f !== MANIFEST_FILE);
  const map = {};
  for (const rel of files) map[rel] = sha256File(path.join(treeDir, rel));
  const totalSource = files.map((f) => `${f}${map[f]}`).join('\n');
  const totalSha256 = crypto.createHash('sha256').update(totalSource).digest('hex');
  return {
    tool, version, abi,
    files: map,
    fileCount: files.length,
    totalSha256,
    generatedAt: new Date().toISOString(),
  };
}

/** assets 静态性检查（FR-001-032）：树内不得出现 ELF magic 文件（纯 JS/JSON/文档）。 */
function assertStaticTree(treeDir) {
  const bad = [];
  for (const rel of walkFiles(treeDir)) {
    const fp = path.join(treeDir, rel);
    const fd = fs.openSync(fp, 'r');
    const head = Buffer.alloc(4);
    const n = fs.readSync(fd, head, 0, 4, 0);
    fs.closeSync(fd);
    if (n === 4 && isElfMagic(head)) bad.push(rel);
  }
  if (bad.length) {
    throw new GateError(`assets 静态性检查失败：树内出现 ELF magic 文件（${bad.length} 个）：${bad.slice(0, 5).join(', ')}${bad.length > 5 ? '…' : ''}`);
  }
  say(`✔ assets 静态性：树内无 ELF magic 文件（.wasm 放行口径 ⬜ 规划 §6）`);
}

class GateError extends Error {}

// ── 壳脚本五判据（FR-001-034，规划 §6.1；生成器在 build 脚本，校验器在此——分离）──

function validateShim(file, name, entry, lockedShim) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  const sha256 = crypto.createHash('sha256').update(content).digest('hex');
  const r = [];
  const add = (id, ok, detail) => r.push({ id, ok, detail });

  add('判据① 名称 ∈ matrix.shellShims', true, `${name} → entry ${entry}`);
  add('判据② shebang = #!/system/bin/sh', lines[0] === '#!/system/bin/sh', `首行=${JSON.stringify(lines[0])}`);
  const execOk = content.includes(`"\${NODE_NATIVE_DIR:-\$(dirname "\$0")}/libnode_cli.so"`)
    && content.includes(`"\$NODE_TOOLS_DIR/${entry}"`);
  add('判据③ exec 目标仅 libnode_cli.so + 树内入口', execOk,
    execOk ? `exec … libnode_cli.so + NODE_TOOLS_DIR/${entry}` : '未匹配模板 exec 行（libnode_cli.so + lock 登记 entry）');
  const hit = SHIM_FORBIDDEN.filter((re) => re.test(content)).map((re) => re.source);
  add('判据④ 无网络/下载命令、无 libnode.so/libc++_shared.so 引用', hit.length === 0,
    hit.length ? `命中黑名单：${hit.join(', ')}` : '黑名单零命中');
  if (lockedShim && lockedShim.sha256 && lockedShim.sha256.length === 64) {
    add('判据⑤ sha256 与 lock 一致', sha256 === lockedShim.sha256, `${sha256.slice(0, 16)}… vs ${lockedShim.sha256.slice(0, 16)}…`);
  } else {
    add('判据⑤ sha256+size（draft 仅记录）', true, `sha256=${sha256.slice(0, 16)}… size=${Buffer.byteLength(content)}`);
  }
  const ok = r.every((x) => x.ok);
  for (const x of r) say(`  ${x.ok ? '✔' : '✘'} ${x.id} — ${x.detail}`);
  return { ok, sha256, size: Buffer.byteLength(content) };
}

/** jniLibs 兄弟文件二分类检查（FR-001-033）+ 白名单三壳「应有尽有」（--check 用）。 */
function checkSiblings(dir, active, lock, rel) {
  const whitelist = (lock.matrix?.shellShims ?? []).map((s) => s.name);
  const entries = fs.readdirSync(dir).filter((f) => f.endsWith('.so'));
  const problems = [];
  for (const f of entries) {
    const fp = path.join(dir, f);
    if (BANNED_IN_AAR.includes(f)) {
      problems.push(`${f} ∈ BANNED_IN_AAR（恒拒，白名单不豁免）`);
      continue;
    }
    const head = fs.readFileSync(fp).subarray(0, 4);
    if (isElfMagic(head)) {
      if (f !== active.name) problems.push(`${f}：ELF 但文件名 ≠ ${active.name}（唯一原生件纪律，D3）`);
      // 主件 ELF 门禁由调用方跑（--check/--out 主流程）
    } else {
      const first = fs.readFileSync(fp, 'utf8').split(/\r?\n/)[0];
      if (whitelist.includes(f) && first.startsWith('#!')) {
        const entry = (lock.matrix?.shellShims ?? []).find((s) => s.name === f)?.entry;
        const locked = (rel.builtFrom?.shims ?? []).find((s) => s.name === f);
        say(`壳脚本 ${f}（entry=${entry}）五判据：`);
        const v = validateShim(fp, f, entry, locked);
        if (!v.ok) problems.push(`${f}：壳五判据未全过`);
      } else if (whitelist.includes(f)) {
        problems.push(`${f}：在白名单但首行非 #!（伪壳，二分类不过）`);
      } else {
        problems.push(`${f}：非 ELF、非白名单壳（jniLibs 只允许 ${active.name} + 白名单三壳）`);
      }
    }
  }
  // 应有尽有：主件 + 白名单三壳
  for (const f in { [active.name]: 1, ...Object.fromEntries(whitelist.map((n) => [n, 1])) }) {
    if (!entries.includes(f)) problems.push(`缺件：${f} 不在 jniLibs（白名单应有尽有，FR-001-033）`);
  }
  return problems;
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

  // ── --manifest-only <outDir>（build 步⑧：在产物目录内生成 manifest，不投放）──
  const manifestOnly = argOf('--manifest-only');
  if (manifestOnly) {
    const treeDir = path.resolve(manifestOnly, ASSETS_TREE);
    if (!fs.existsSync(treeDir)) throw new GateError(`缺 ${treeDir}（build 步⑦ 应先产出树）`);
    assertStaticTree(treeDir);
    const m = buildManifest(treeDir, { tool: 'provision.mjs', version: rel.version, abi: rel.abi });
    fs.writeFileSync(path.join(treeDir, MANIFEST_FILE), JSON.stringify(m, null, 2) + '\n');
    say(`✔ manifest.json → ${path.join(treeDir, MANIFEST_FILE)}（fileCount=${m.fileCount}，totalSha256=${m.totalSha256.slice(0, 16)}…）`);
    process.exit(0);
  }

  // ── --shims <dir>（FR-001-035：五判据校验 + 投放三壳进 jniLibs）──────────
  const shimsDir = argOf('--shims');
  if (shimsDir) {
    const whitelist = lock.matrix?.shellShims ?? [];
    if (!whitelist.length) throw new Error('lock matrix.shellShims 为空（白名单事实源缺失，FR-001-033）');
    const dir = path.resolve(shimsDir);
    const problems = [];
    const destDir = path.join(ROOT, MODULE_JNILIBS, active.abi);
    for (const w of whitelist) {
      const src = path.join(dir, w.name);
      if (!fs.existsSync(src)) { problems.push(`缺件：${src}`); continue; }
      say(`壳脚本 ${w.name}（entry=${w.entry}）五判据：`);
      const locked = (rel.builtFrom?.shims ?? []).find((s) => s.name === w.name);
      const v = validateShim(src, w.name, w.entry, locked);
      if (!v.ok) problems.push(`${w.name}：五判据未全过`);
    }
    const extras = fs.readdirSync(dir).filter((f) => f.endsWith('.so') && !whitelist.some((w) => w.name === f) && f !== active.name);
    for (const e of extras) problems.push(`${e}：不在白名单（${dir} 内只应有三壳）`);
    if (problems.length) {
      for (const p of problems) say(`✘ ${p}`);
      throw new GateError('壳脚本校验不合格 ⇒ 拒绝投放');
    }
    fs.mkdirSync(destDir, { recursive: true });
    for (const w of whitelist) fs.copyFileSync(path.join(dir, w.name), path.join(destDir, w.name));
    for (const banned of BANNED_IN_AAR) {
      if (fs.existsSync(path.join(destDir, banned))) {
        throw new Error(`${banned} 不得进入本 AAR（应由配对 runtime 供给，避免包内同名冲突）`);
      }
    }
    say(`✔ 三壳投放（${whitelist.map((w) => w.name).join(' / ')}）→ ${destDir}`);
    process.exit(0);
  }

  // ── --assets <dir> [--assets-mode stage|verify]（FR-001-030/031/032）──────
  const assetsDir = argOf('--assets');
  if (assetsDir) {
    const mode = argOf('--assets-mode', 'stage');
    const srcTree = path.resolve(assetsDir, ASSETS_TREE);
    const destTree = path.join(ROOT, MODULE_ASSETS, ASSETS_TREE);

    if (mode === 'stage') {
      if (!fs.existsSync(srcTree)) throw new GateError(`缺 ${srcTree}（build 步⑦ 应先产出树）`);
      assertStaticTree(srcTree);
      fs.rmSync(path.join(ROOT, MODULE_ASSETS, ASSETS_TREE), { recursive: true, force: true }); // 幂等：先清残留
      fs.mkdirSync(path.join(ROOT, MODULE_ASSETS), { recursive: true });
      fs.cpSync(srcTree, destTree, { recursive: true });
      const m = buildManifest(destTree, { tool: 'provision.mjs', version: rel.version, abi: rel.abi });
      fs.writeFileSync(path.join(destTree, MANIFEST_FILE), JSON.stringify(m, null, 2) + '\n');
      say(`✔ assets 投放：${destTree}（fileCount=${m.fileCount}，totalSha256=${m.totalSha256.slice(0, 16)}…）`);
      process.exit(0);
    }
    if (mode === 'verify') {
      const manifestPath = path.join(destTree, MANIFEST_FILE);
      if (!fs.existsSync(manifestPath)) throw new GateError(`缺已投放的 ${manifestPath}（先 --assets-mode stage）`);
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const actual = buildManifest(destTree, { tool: 'verify', version: m.version, abi: m.abi });
      const problems = [];
      const listed = new Set(Object.keys(m.files ?? {}));
      const actualSet = new Set(Object.keys(actual.files));
      for (const f of listed) if (!actualSet.has(f)) problems.push(`缺文件：${f}`);
      for (const f of actualSet) if (!listed.has(f)) problems.push(`多文件：${f}`);
      for (const f of listed) if (actualSet.has(f) && actual.files[f] !== m.files[f]) problems.push(`哈希漂移：${f}`);
      if ((m.fileCount ?? -1) !== actual.fileCount) problems.push(`fileCount 不一致：manifest=${m.fileCount} 实测=${actual.fileCount}`);
      if ((m.totalSha256 ?? '') !== actual.totalSha256) problems.push(`totalSha256 不一致：manifest=${m.totalSha256?.slice(0, 16)}… 实测=${actual.totalSha256.slice(0, 16)}…`);
      for (const p of problems) say(`✘ ${p}`);
      if (problems.length) throw new GateError(`assets verify 失败（${problems.length} 项差异）`);
      say(`✔ assets verify：${actual.fileCount} 个文件逐一复验一致（totalSha256=${actual.totalSha256.slice(0, 16)}…）`);
      process.exit(0);
    }
    throw new Error(`未知 --assets-mode：${mode}（可用 stage|verify）`);
  }

  const inspectPath = argOf('--inspect');
  if (inspectPath) {
    const buf = fs.readFileSync(inspectPath);
    const g = gates(buf, rel, allowedNeeded);
    printGates(g);
    say(g.ok ? '门禁：全过' : '门禁：不合格');
    process.exit(g.ok ? 0 : 2);
  }

  const outDir = argOf('--out');

  if (!outDir) {
    // --check：校验已投放产物（ELF 门禁 + 兄弟二分类 + 壳五判据 + 应有尽有）
    const target = path.join(ROOT, MODULE_JNILIBS, active.abi, active.name);
    if (!fs.existsSync(target)) {
      say(`未投放：${target}（先跑 --out …）`);
      process.exit(2);
    }
    const buf = fs.readFileSync(target);
    const g = gates(buf, rel, allowedNeeded);
    printGates(g);
    // 纪律：jniLibs 兄弟文件二分类（ELF=主件 / sh 壳=白名单+五判据 / 其余拒绝）+ 应有尽有。
    const dir = path.dirname(target);
    const problems = checkSiblings(dir, active, lock, rel);
    for (const p of problems) say(`✘ ${p}`);
    if (!problems.length) say(`✔ jniLibs 兄弟文件二分类 + 白名单应有尽有（${lock.matrix?.shellShims?.map((s) => s.name).join(' / ') ?? '无'}）`);
    const ok = g.ok && problems.length === 0;
    say(ok ? '门禁：全过' : '门禁：不合格');
    process.exit(ok ? 0 : 2);
  }

  const from = argOf('--from');
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
  if (e instanceof GateError) {
    process.stderr.write(`[provision] 门禁不合格：${e.message}\n`);
    process.exit(2);
  }
  process.stderr.write(`[provision] 失败：${e.message}\n`);
  process.exit(1);
}
