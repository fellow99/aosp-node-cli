# aosp-node-cli

[English](README.md) · [**中文**](README_zh.md)

**The Android `node` command-line executable, packaged as an AAR** — a cross-compiled
`libnode_cli.so` (arm64-v8a, exec-form PIE) launched from the terminal by node-pty
([`aosp-node-pty`](https://github.com/fellow99/aosp-node-pty)) via `forkpty` + `execve`,
providing a real `node` command; bundled assets carry the npm/corepack JS trees
(pure data, no exec bit needed).

This repository contains **no embedding API and no JS runtime wrapper** — only the
reproducible build, ELF gates and release pipeline for the native binary and its bundled
JS trees. It is the **exec-form companion artifact** of
[`aosp-node-runtime`](https://github.com/fellow99/aosp-node-runtime). Planning baseline:
[`docs/000-工程规划.md`](docs/000-工程规划.md); workspace-level rationale: the
node-bridge-workspace doc `docs/aosp+node+python+git运行方案.md`.

## Version: equals the Node version

The artifact version **always equals** the paired Node.js / `aosp-node-runtime` version —
the same pairing discipline as node-pty, no independent semver.

| Paired runtime | This repo |
|---|---|
| `io.github.fellow99:node-runtime:26.13.0` | `io.github.fellow99:node-cli:26.13.0` (lock status=released; full-icu re-cut CI run 42157255884 wrote back size/sha) |

> ⚠️ **AArch64 (arm64-v8a) only** — no x86 / x86_64 / arm32 packages.

### Releases — Maven Central (`io.github.fellow99:node-cli`)

| Version | Status | Link |
|---|---|---|
| 26.13.0 | ⬜ not on Maven Central yet (CI artifact ready; Release runs on the tag pipeline) | — |

## Usage (consumers)

```kotlin
// build.gradle.kts
dependencies {
    val nodeVer = "26.13.0" // runtime / pty / cli must share the same version
    runtimeOnly("io.github.fellow99:node-runtime:$nodeVer")
    runtimeOnly("io.github.fellow99:node-pty:$nodeVer")
    runtimeOnly("io.github.fellow99:node-cli:$nodeVer")
}
```

Terminal side (via node-pty):

```js
// With PATH pointing at nativeLibraryDir:
//   pty.spawn(`${nativeLibraryDir}/libnode_cli.so`, ['-e', 'console.log(1)'])
// or call it by command name `node` via a $HOME/bin symlink.
```

## Exec-form packaging points (opposite of dlopen libraries)

| Aspect | node-pty (dlopen lib) | This repo (exec form) |
|---|---|---|
| Packaging | `useLegacyPackaging=false` (mmap from APK) | **`useLegacyPackaging=true`** (must be physically extracted to `nativeLibraryDir`, otherwise `execve` ENOENT) |
| PT_INTERP | must be 0 | **must be `/system/bin/linker64`** (hard gate) |
| Dependencies | `DT_NEEDED libnode.so` | **DT_NEEDED whitelist** (system libs + registered bundled libs only) |
| C++ runtime | provided by node-runtime | provided by node-runtime; `LD_LIBRARY_PATH` must include `nativeLibraryDir` |

## AAR contents

```
jni/arm64-v8a/libnode_cli.so      # node CLI (exec-form PIE, 16KB aligned; the only ELF)
jni/arm64-v8a/libnpm.so           # npm shell shim (sh): exec libnode_cli.so <tools>/npm/bin/npm-cli.js "$@"
jni/arm64-v8a/libnpx.so           # npx shell shim (sh): entry npm/bin/npx-cli.js
jni/arm64-v8a/libcorepack.so      # corepack shell shim (sh): corepack entry
assets/node-bridge-tools/npm/     # npm JS tree (pruned deps/npm; pure data, materialized to filesDir on first run)
assets/node-bridge-tools/corepack/
assets/node-bridge-tools/manifest.json   # per-file sha256 + tree digest (generated/verified at provision time)
```

- The shell shims give direct `npm` / `npx` / `corepack` commands via the `$HOME/bin` symlink
  farm (plan §5/§7); `libc++_shared.so` is **never bundled** (provided by the paired node-runtime);
- `META-INF/node-cli.properties`: version/ABI/size/sha256/paired-runtime metadata (written at
  provision time).

Requirements: `minSdk 24` · ABI `arm64-v8a`.

## How to build

Binaries are **never committed** and never built by hand. Build scripts and gates are fully
implemented (001-building); real cross-compilation runs on CI (tag `v<ver>` triggers the
`build-android-arm64-v8a` job of `.github/workflows/build-node-cli-android.yml`;
push/PR runs the configuration gate only).

```bash
# 1) Fetch source: official node-v<ver>.tar.xz + SHASUMS256.txt verification chain, unmodified
node scripts/fetch-node-cli-source.mjs --node 26.13.0 --out .dist/src

# 2) Cross-compile: android_configure WITHOUT --shared + --with-intl=full-icu (fetched, pinned ICU source) → make → gates → strip
#    → npm/corepack tree collection/pruning/manifest → shell shims (--dry-run prints the plan)
bash scripts/build-node-cli-android.sh --node 26.13.0 --api 24 \
  --src .dist/src/node-src --ndk "$ANDROID_NDK_HOME" --out .dist/out

# 3) Gates / provision (7 ELF gates + shim 5-criteria + assets staticness + manifest)
node tools/provision.mjs --out node-cli/src/main/jniLibs --from .dist/out/libnode_cli.so
node tools/provision.mjs --shims .dist/out
node tools/provision.mjs --assets .dist/out
node tools/provision.mjs --check
```

## Lock & verification

[`node-cli.lock.json`](node-cli.lock.json) is the single source of truth for version, size,
SHA-256, exec gates and provenance (currently status=released).

```bash
node tools/provision.mjs --check          # verify the provisioned artifact
node tools/provision.mjs --inspect <so>   # print the exec gate report for a binary
```

Exit codes: `0` all gates pass · `2` gate failure / not provisioned · `1` usage/IO error.

Gates: `ET_DYN` (PIE), **PT_INTERP=/system/bin/linker64**, AArch64, **DT_NEEDED whitelist**,
16KB page alignment, sha/size match.


## Capability boundaries / known limits

The following are **measured facts** (wording per workspace
`docs/20261105-cli-实测问题-修复设计.md` §4.3); consumers must know them before integrating:

- **Uncaught exceptions / syntax-error messages go to logcat (tag=`nodejs`) by default, with an
  empty stderr** — this is an exec-form CLI platform fact on Android, not a defect of this AAR.
  With an environment bootstrap layer (B1: PTY allocation / standard-stream takeover), **JS-level
  errors** become readable on stderr with exit code 1.
- **Native fatal errors (native crash / OOM, etc.) still never reach stderr** — rely on the exit
  code plus logcat; auto-merge would require the harness to capture the logcat `nodejs` tag on
  non-zero exit (fix design §6 B3 follow-up, not implemented in this round).
- **Intl is a full-icu build** (`--with-intl=full-icu` with a pinned icu4c source, fix design
  §4.1): `\p{...}` Unicode property escapes and full locales (e.g.
  `Intl.NumberFormat('zh-CN')`) work out of the box without `NODE_ICU_DATA`; the trade-off is a
  substantially larger binary (see the measured size in the lock).
## Repository layout

```
aosp-node-cli/
├── node-cli/                      # Android library module (AAR container)
│   └── src/main/jniLibs/          # libnode_cli.so provisioning target (git-ignored)
├── scripts/
│   ├── fetch-node-cli-source.mjs  # official Node source tarball (000-scaffold skeleton, M1)
│   └── build-node-cli-android.sh  # cross-compile (000-scaffold skeleton, M1)
├── tools/provision.mjs            # provision + exec-form ELF gates
├── node-cli.lock.json             # paired version + SHA-256 + gates + provenance
└── .github/workflows/build-node-cli-android.yml
```

## License

[MIT](LICENSE). Node.js itself is MIT; the bundled npm tree carries its own license
(Artistic-2.0), corepack is MIT — see
[`node-cli/THIRD-PARTY-NOTICES.md`](node-cli/THIRD-PARTY-NOTICES.md).
