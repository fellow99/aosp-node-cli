#!/usr/bin/env python3
"""Apply the minimal, EXPLICITLY REQUESTED source changes needed to build
Node.js as an Android arm64-v8a *exec* CLI (libnode_cli.so).

Unlike aosp-node-runtime/scripts/patch-node-source.py (which patches
--shared/small-icu unconditionally), this CLI variant applies NOTHING by
default: every patch must be requested by id via --patch (build script
--apply-patch). Rationale (plan §4.3): the exec build walks the DEFAULT
configure path (no --shared, decision D2), and each patch is only introduced
after the bare-configure round fails for the documented reason (risk R1).

Patches (all idempotent; markers make re-runs no-ops)
-----------------------------------------------------
cc-host      export CC_host/CXX_host in android_configure.py so gyp builds the
             host snapshot tools (mksnapshot/mkcodecache) with the host gcc/g++.
temporal     add --v8-disable-temporal-support for Node >= 26: the Rust Temporal
             crates have no upstream Android cross target and would build as
             host x86_64 objects that fail the aarch64 link.
trap-handler force V8_TRAP_HANDLER_SUPPORTED=false GLOBALLY in
             deps/v8/src/trap-handler/trap-handler.h so host snapshot tools and
             the Android target stay consistent (same approach as runtime).
cpu-features copy the NDK sources/android/cpufeatures into deps/android and
             compile it into the zlib gyp target (vendored zlib calls
             android_getCpuFeatures() under ARMV8_OS_ANDROID).

NOT ported on purpose (plan §4.3):
- configure --shared + small-icu : runtime-only; the CLI build wants the exact
  opposite (no --shared, --with-intl=none).
- node.gyp cctest skip: only active under node_shared=="true"; expected not
  needed for the exec build (verify with CI round R3).

Exit codes: 0 ok (or nothing to do) · 2 patch error (marker not found etc.)
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path


class PatchError(RuntimeError):
    pass


def _node_major(root: Path) -> int:
    hdr = root / "src" / "node_version.h"
    if not hdr.is_file():
        raise PatchError(f"Not a Node.js source tree: {root}")
    return int(
        hdr.read_text(encoding="utf-8")
        .split("#define NODE_MAJOR_VERSION ", 1)[1]
        .splitlines()[0]
        .strip()
    )


def patch_cc_host(root: Path) -> None:
    path = root / "android_configure.py"
    text = path.read_text(encoding="utf-8")
    if "os.environ['CC_host']" in text:
        print("  already patched: android_configure.py (CC_host/CXX_host)")
        return
    if "import shutil" not in text and "import os" in text:
        text = text.replace("import os", "import os\nimport shutil", 1)
    cxx_line = (
        "os.environ['CXX'] = toolchain_path + \"/bin/\" + TOOLCHAIN_PREFIX"
        " + android_sdk_version + \"-\" + \"clang++\""
    )
    if cxx_line not in text:
        raise PatchError("Could not locate the CXX export line in android_configure.py")
    text = text.replace(
        cxx_line,
        cxx_line
        + "\nos.environ['CC_host'] = shutil.which('gcc') or 'gcc'"
        + "\nos.environ['CXX_host'] = shutil.which('g++') or 'g++'",
        1,
    )
    path.write_text(text, encoding="utf-8")
    print("  patched: android_configure.py (CC_host/CXX_host exported)")


def patch_temporal(root: Path) -> None:
    path = root / "android_configure.py"
    text = path.read_text(encoding="utf-8")
    if "--v8-disable-temporal-support" in text:
        print("  already patched: android_configure.py (temporal disabled)")
        return
    if _node_major(root) < 26:
        print("  skip (node < 26 has no Rust Temporal crates)")
        return
    anchor = '"--openssl-no-asm'
    if anchor in text:
        text = text.replace(anchor, '"--v8-disable-temporal-support --openssl-no-asm', 1)
    elif "--openssl-no-asm" in text:
        text = text.replace(
            "--openssl-no-asm", "--v8-disable-temporal-support --openssl-no-asm", 1
        )
    else:
        raise PatchError("Could not locate configure args in android_configure.py")
    path.write_text(text, encoding="utf-8")
    print("  patched: android_configure.py (--v8-disable-temporal-support)")


def patch_trap_handler(root: Path) -> None:
    header = root / "deps" / "v8" / "src" / "trap-handler" / "trap-handler.h"
    if not header.exists():
        raise PatchError(f"{header} not found")
    text = header.read_text(encoding="utf-8")
    marker = "// aosp-node-cli: trap handler disabled"
    if marker in text:
        print("  already patched: trap-handler.h")
        return
    start_marker = "// X64 on Linux, Windows, MacOS, FreeBSD."
    end_marker = "\n#if V8_OS_ANDROID && V8_TRAP_HANDLER_SUPPORTED"
    start = text.find(start_marker)
    end = text.find(end_marker)
    if start < 0 or end < 0:
        raise PatchError("trap-handler.h platform markers not found")
    replacement = (
        f"{marker}: the trap-handler implementation is not built for\n"
        "// Android. Force it off globally so the host snapshot tools and the\n"
        "// Android target stay consistent (same approach as aosp-node-runtime).\n"
        "#define V8_TRAP_HANDLER_SUPPORTED false\n"
    )
    header.write_text(text[:start] + replacement + text[end:], encoding="utf-8")
    print("  patched: trap-handler.h (V8_TRAP_HANDLER_SUPPORTED=false, host+target)")


def patch_cpu_features(root: Path, ndk: Path) -> None:
    src = ndk / "sources" / "android" / "cpufeatures"
    if not (src / "cpu-features.c").is_file():
        raise PatchError(
            f"Missing NDK source: {src / 'cpu-features.c'} "
            "(use an NDK that still ships sources/android/cpufeatures)"
        )
    dst = root / "deps" / "android"
    dst.mkdir(parents=True, exist_ok=True)
    for name in ("cpu-features.c", "cpu-features.h"):
        shutil.copy2(src / name, dst / name)
    print("  copied: NDK cpu-features -> deps/android")

    gyp = root / "deps" / "zlib" / "zlib.gyp"
    text = gyp.read_text(encoding="utf-8")
    if "../android/cpu-features.c" in text:
        print("  already patched: deps/zlib/zlib.gyp (android cpu-features source)")
        return
    anchor = (
        "          'direct_dependent_settings': {\n"
        "            'include_dirs': [ '<(ZLIB_ROOT)' ],\n"
        "          },\n"
        "          'conditions': [\n"
        "            ['OS!=\"win\"', {\n"
    )
    replacement = (
        "          'direct_dependent_settings': {\n"
        "            'include_dirs': [ '<(ZLIB_ROOT)' ],\n"
        "          },\n"
        "          'conditions': [\n"
        "            ['OS==\"android\"', {\n"
        "              'sources': [ '../android/cpu-features.c' ],\n"
        "              'include_dirs': [ '../android' ],\n"
        "            }],\n"
        "            ['OS!=\"win\"', {\n"
    )
    if text.count(anchor) != 1:
        raise PatchError(f"zlib.gyp zlib-target anchor not unique/found ({text.count(anchor)})")
    gyp.write_text(text.replace(anchor, replacement, 1), encoding="utf-8")
    print("  patched: deps/zlib/zlib.gyp (compile cpu-features.c into zlib target)")


PATCHES = {
    "cc-host": lambda root, ndk: patch_cc_host(root),
    "temporal": lambda root, ndk: patch_temporal(root),
    "trap-handler": lambda root, ndk: patch_trap_handler(root),
    "cpu-features": lambda root, ndk: patch_cpu_features(root, ndk),
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path, help="Node.js source tree")
    parser.add_argument("--ndk", required=True, type=Path, help="Android NDK root")
    parser.add_argument(
        "--patch",
        required=True,
        help=f"comma-separated patch ids; valid: {','.join(PATCHES)}",
    )
    args = parser.parse_args()

    ids = [s.strip() for s in args.patch.split(",") if s.strip()]
    unknown = [i for i in ids if i not in PATCHES]
    if unknown:
        print(f"unknown patch id(s): {', '.join(unknown)}; valid: {', '.join(PATCHES)}", file=sys.stderr)
        return 1

    root = args.source.resolve()
    ndk = args.ndk.resolve()
    print(f"applying requested patches (explicit-only, plan §4.3): {', '.join(ids)}")
    try:
        for i in ids:
            print(f"[{i}]")
            PATCHES[i](root, ndk)
    except PatchError as e:
        print(f"patch error: {e}", file=sys.stderr)
        return 2
    print("done (every patch is idempotent; re-runs are no-ops).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
