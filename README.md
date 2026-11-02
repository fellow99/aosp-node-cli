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

| Paired runtime | This repo (draft) |
|---|---|
| `io.github.fellow99:node-runtime:26.13.0` | `io.github.fellow99:node-cli:26.13.0` (status=draft; facts written back after the first CI build) |

> ⚠️ **AArch64 (arm64-v8a) only** — no x86 / x86_64 / arm32 packages.

### Releases — Maven Central (`io.github.fellow99:node-cli`)

| Version | Status | Link |
|---|---|---|
| 26.13.0 | ⬜ draft (published after the first M1 build) | — |

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
jni/arm64-v8a/libnode_cli.so      # node CLI (exec-form PIE, 16KB aligned)
assets/node-bridge-tools/npm/     # npm JS tree (pure data; provisioned in M1)
assets/node-bridge-tools/corepack/
```

Requirements: `minSdk 24` · ABI `arm64-v8a`.

## How to build

Binaries are **never committed** and never built by hand. 000-scaffold pins the interfaces
and gates; the real cross-compile pipeline lands in **M1** in
`.github/workflows/build-node-cli-android.yml` (currently a configuration-gate-only workflow).

```bash
# 1) Fetch source (M1): official node-v<ver>.tar.xz, unmodified, sha256 recorded
node scripts/fetch-node-cli-source.mjs --node 26.13.0 --out .dist/src

# 2) Cross-compile (M1): android-configure WITHOUT --shared → make → strip
bash scripts/build-node-cli-android.sh --node 26.13.0 --api 24 \
  --src .dist/src/node-src --ndk "$ANDROID_NDK_HOME" --out build/out

# 3) Gates / provision
node tools/provision.mjs --out node-cli/src/main/jniLibs --from build/out/libnode_cli.so
node tools/provision.mjs --check
```

## Lock & verification

[`node-cli.lock.json`](node-cli.lock.json) is the single source of truth for version, size,
SHA-256, exec gates and provenance (currently status=draft).

```bash
node tools/provision.mjs --check          # verify the provisioned artifact
node tools/provision.mjs --inspect <so>   # print the exec gate report for a binary
```

Exit codes: `0` all gates pass · `2` gate failure / not provisioned · `1` usage/IO error.

Gates: `ET_DYN` (PIE), **PT_INTERP=/system/bin/linker64**, AArch64, **DT_NEEDED whitelist**,
16KB page alignment, sha/size match (recorded only while draft).

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
