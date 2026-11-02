#!/usr/bin/env node
/*
 * tools/make-elf-fixture.mjs —— 合成 AArch64 PIE ELF 测试夹具（测试基础设施，不进产物）
 *
 * 用途：本地（无真实 libnode_cli.so 时）驱动 provision 七项门禁的 ✔/✘ 两侧测试。
 * 生成的最小 ELF64 小端文件满足 provision.mjs parseElf 的全部读取路径：
 *   ELF 头 + 3 个程序头（PT_INTERP / PT_LOAD / PT_DYNAMIC）+ 节头表（.interp/.dynamic/.dynstr/.shstrtab）。
 *
 * 用法：
 *   node tools/make-elf-fixture.mjs --out <file> [--broken interp|align|type|machine|needed|none]
 *
 * --broken 可选破坏项（用于负向断言）：
 *   interp  → PT_INTERP 内容错误（门禁② 必 ✘）
 *   align   → PT_LOAD 对齐 0x1000（门禁⑦ 必 ✘）
 *   type    → e_type=ET_EXEC=2（门禁① 必 ✘）
 *   machine → e_machine=x86-64=62（门禁③ 必 ✘）
 *   needed  → DT_NEEDED=libfake.so（门禁④ 必 ✘，白名单外）
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
function argOf(name, fallback = null) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const out = argOf('--out');
const broken = argOf('--broken', 'none');
if (!out || !['none', 'interp', 'align', 'type', 'machine', 'needed'].includes(broken)) {
  process.stderr.write('用法: node tools/make-elf-fixture.mjs --out <file> [--broken interp|align|type|machine|needed|none]\n');
  process.exit(1);
}

const buf = Buffer.alloc(1024, 0);
// ── ELF64 头 ──
buf.write('\x7fELF', 0, 'binary');          // magic
buf[4] = 2;                                  // ELFCLASS64
buf[5] = 1;                                  // ELFDATA2LSB
buf[6] = 1;                                  // EV_CURRENT
const E_TYPE = broken === 'type' ? 2 : 3;    // ET_EXEC(2) | ET_DYN(3)
buf.writeUInt16LE(E_TYPE, 16);
buf.writeUInt16LE(broken === 'machine' ? 62 : 183, 18); // EM_X86_64 | EM_AARCH64
buf.writeBigUInt64LE(0n, 24);                // e_entry
buf.writeBigUInt64LE(64n, 32);               // e_phoff
buf.writeBigUInt64LE(640n, 40);              // e_shoff（后置）
buf.writeUInt32LE(0, 48);                    // e_flags
buf.writeUInt16LE(64, 52);                   // e_ehsize
buf.writeUInt16LE(56, 54);                   // e_phentsize
buf.writeUInt16LE(3, 56);                    // e_phnum
buf.writeUInt16LE(64, 58);                   // e_shentsize
buf.writeUInt16LE(5, 60);                    // e_shnum（NULL+4）
buf.writeUInt16LE(4, 62);                    // e_shstrndx

// ── 数据区（phdr 之后，offset 232 起）──
const INTERP_OFF = 232;
const interpStr = broken === 'interp' ? '/wrong/linker\0' : '/system/bin/linker64\0';
buf.write(interpStr, INTERP_OFF, 'utf8');
const DYN_OFF = 320;
// .dynamic：needed 破坏时给一条 DT_NEEDED(libfake.so)+DT_NULL；否则仅 DT_NULL
const DYNSTR_OFF = 360;
buf.write('\0libfake.so\0', DYNSTR_OFF, 'utf8');
const dynEntries = broken === 'needed' ? [[1, 1], [0, 0]] : [[0, 0]]; // [tag, val]
dynEntries.forEach(([tag, val], i) => {
  buf.writeBigInt64LE(BigInt(tag), DYN_OFF + i * 16);
  buf.writeBigUInt64LE(BigInt(val), DYN_OFF + i * 16 + 8);
});
const SHSTR_OFF = 400;
const shstr = '\0.interp\0.dynamic\0.dynstr\0.shstrtab\0';
buf.write(shstr, SHSTR_OFF, 'utf8');

// ── 程序头（3 个，offset 64）──
function phdr(i, type, flags, off, filesz, align) {
  const o = 64 + i * 56;
  buf.writeUInt32LE(type, o);
  buf.writeUInt32LE(flags, o + 4);
  buf.writeBigUInt64LE(BigInt(off), o + 8);      // p_offset
  buf.writeBigUInt64LE(BigInt(off), o + 16);     // p_vaddr
  buf.writeBigUInt64LE(0n, o + 24);              // p_paddr
  buf.writeBigUInt64LE(BigInt(filesz), o + 32);  // p_filesz
  buf.writeBigUInt64LE(BigInt(filesz), o + 40);  // p_memsz
  buf.writeBigUInt64LE(BigInt(align), o + 48);   // p_align
}
const ALIGN = broken === 'align' ? 0x1000 : 0x4000;
const dynSize = dynEntries.length * 16;
phdr(0, 3, 4, INTERP_OFF, interpStr.length, 1);            // PT_INTERP, R
phdr(1, 1, 5, 0, 1024, ALIGN);                              // PT_LOAD, R+X
phdr(2, 2, 6, DYN_OFF, dynSize, 8);                         // PT_DYNAMIC, RW

// ── 节头表（offset 640，5 项）──
const nameOf = (s) => shstr.indexOf(s);
function shdr(i, nameOff, type, off, size) {
  const o = 640 + i * 64;
  buf.writeUInt32LE(nameOff === null ? 0 : nameOff, o);
  buf.writeUInt32LE(type, o + 4);
  buf.writeBigUInt64LE(0n, o + 8);
  buf.writeBigUInt64LE(0n, o + 16);
  buf.writeBigUInt64LE(BigInt(off), o + 24);
  buf.writeBigUInt64LE(BigInt(size), o + 32);
}
shdr(0, null, 0, 0, 0);                                  // SHT_NULL
shdr(1, nameOf('.interp'), 1, INTERP_OFF, interpStr.length);
shdr(2, nameOf('.dynamic'), 6, DYN_OFF, dynSize);
shdr(3, nameOf('.dynstr'), 3, DYNSTR_OFF, 16);
shdr(4, nameOf('.shstrtab'), 3, SHSTR_OFF, shstr.length);

fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, buf);
console.log(`fixture: ${out}（broken=${broken}，e_type=${E_TYPE}，align=0x${ALIGN.toString(16)}）`);
