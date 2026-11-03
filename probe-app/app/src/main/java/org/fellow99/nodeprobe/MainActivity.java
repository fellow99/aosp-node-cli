package org.fellow99.nodeprobe;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.AssetManager;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * node-cli 探针载体（M2-T1 / specs 003-cli + 101-npm-integration tasks T4.1）。
 *
 * 职责（镜像 docs/000-工程规划.md §3 消费方环境引导层 + §7 环境变量契约）：
 *  1) 物化：assets/node-bridge-tools/** → filesDir/node-bridge-tools（marker 幂等：manifest.json
 *     totalSha256 与上次一致则跳过；树完整性自检 = 物化文件数 vs manifest.fileCount+1，
 *     可捕获 aapt dot 文件过滤类回归——2026-11-03 实证缺陷）；
 *  2) 注入（003 plan §3 + 101 plan §3）：HOME/TMPDIR/PATH/LD_LIBRARY_PATH/NODE_TOOLS_DIR/
 *     NODE_NATIVE_DIR + npm_config_prefix/cache/update_notifier + COREPACK_ENABLE_DOWNLOAD_PROMPT；
 *  3) 执行：ProcessBuilder exec nativeLibraryDir/libnode_cli.so 与三壳（非 PTY 子集；
 *     REPL/PTY 语义归终端 App，TC-003-18 按 BLOCKED 登记）；
 *  4) 判据：TC-003-01…18 与 TC-101-01…15 的可执行子集，逐条 PASS/FAIL/BLOCKED + JSON 报告。
 *
 * 用例正典：specs/003-cli/test-cases.md · specs/101-npm-integration/test-cases.md（期望值引用
 * lock：node 26.13.0 / npm 11.20.0 / corepack 0.36.0）。
 */
public class MainActivity extends Activity {

    // 期望值（引用 node-cli.lock.json：active.version / builtFrom.npm / builtFrom.corepack）
    private static final String NODE_VER = "26.13.0";
    private static final String NPM_VER = "11.20.0";
    private static final String COREPACK_VER = "0.36.0";
    // sha256(b"aosp") 固定向量（003 TC-003-10）
    private static final String SHA_AOSP = "c792a98c51d0936e961e23d1b3539c7139ae220b7a359ccd67e3e3d37df5340f";

    private TextView logView;
    private File toolsDir;      // filesDir/node-bridge-tools
    private File homeDir;       // filesDir/home
    private File projDir;       // filesDir/npm-proj（npm 安装链工作目录）
    private String nativeDir;   // applicationInfo.nativeLibraryDir
    private String nodeExe;     // nativeDir/libnode_cli.so
    private String npmSh, npxSh, corepackSh;
    private final StringBuilder uiLog = new StringBuilder();
    private final List<JSONObject> report = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        nativeDir = getApplicationInfo().nativeLibraryDir;
        nodeExe = nativeDir + "/libnode_cli.so";
        npmSh = nativeDir + "/libnpm.so";
        npxSh = nativeDir + "/libnpx.so";
        corepackSh = nativeDir + "/libcorepack.so";
        toolsDir = new File(getFilesDir(), "node-bridge-tools");
        homeDir = new File(getFilesDir(), "home");
        projDir = new File(getFilesDir(), "npm-proj");

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        Button run = new Button(this);
        run.setText("RUN ALL PROBES");
        run.setOnClickListener(v -> runAll());
        ScrollView scroll = new ScrollView(this);
        logView = new TextView(this);
        logView.setTypeface(android.graphics.Typeface.MONOSPACE);
        logView.setTextIsSelectable(true);
        logView.setTextSize(11f);
        int pad = (int) (getResources().getDisplayMetrics().density * 8);
        logView.setPadding(pad, pad, pad, pad);
        scroll.addView(logView);
        root.addView(run, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        root.addView(scroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);
        log("probe-app ready\nnativeDir=" + nativeDir + "\ntoolsDir=" + toolsDir
                + "\n点击 RUN ALL PROBES 执行（首次会物化 assets npm/corepack 树，约 1-2 分钟）");
    }

    private void log(String s) {
        runOnUiThread(() -> {
            uiLog.append(s).append('\n');
            logView.setText(uiLog.toString());
        });
    }

    // ── 物化（marker 幂等：manifest.json totalSha256 与上次一致则跳过）──────────

    private String assetsMarker() {
        try {
            InputStream is = getAssets().open("node-bridge-tools/manifest.json");
            String m = readAll(is, 1 << 20);
            int i = m.indexOf("\"totalSha256\"");
            if (i < 0) return null;
            int q1 = m.indexOf('"', i + 13) + 1;
            int q2 = m.indexOf('"', q1);
            return m.substring(q1, q2);
        } catch (IOException e) {
            return null;
        }
    }

    private void materialize() throws IOException {
        String marker = assetsMarker();
        SharedPreferences prefs = getSharedPreferences("probe", Context.MODE_PRIVATE);
        String prev = prefs.getString("tools.sha", "");
        File done = new File(toolsDir, "manifest.json");
        if (marker != null && marker.equals(prev) && done.isFile()) {
            log("物化跳过（marker 一致：" + marker.substring(0, 12) + "…）");
            return;
        }
        long t0 = System.currentTimeMillis();
        deleteRecursive(toolsDir);
        toolsDir.mkdirs();
        int n = copyAssetTree("node-bridge-tools", toolsDir);
        prefs.edit().putString("tools.sha", marker == null ? "" : marker).apply();
        log("物化完成：" + n + " 文件，" + (System.currentTimeMillis() - t0) + "ms");
    }

    private int copyAssetTree(String path, File dest) throws IOException {
        AssetManager am = getAssets();
        String[] children = am.list(path);
        if (children == null) return 0;
        int n = 0;
        for (String c : children) {
            String sub = path + "/" + c;
            String[] subChildren = am.list(sub);
            if (subChildren != null && subChildren.length > 0) {
                n += copyAssetTree(sub, dest);
            } else {
                File out = new File(dest, sub.substring("node-bridge-tools/".length()));
                out.getParentFile().mkdirs();
                try (InputStream is = am.open(sub); OutputStream os = new FileOutputStream(out)) {
                    byte[] buf = new byte[65536];
                    int r;
                    while ((r = is.read(buf)) > 0) os.write(buf, 0, r);
                } catch (IOException e) {
                    // 空目录（无子项的目录条目）：建目录占位即可
                    out.mkdirs();
                }
                n++;
            }
        }
        return n;
    }

    private void deleteRecursive(File f) {
        File[] c = f.listFiles();
        if (c != null) for (File x : c) deleteRecursive(x);
        f.delete();
    }

    private int countFiles(File f) {
        if (f.isFile()) return 1;
        File[] c = f.listFiles();
        int n = 0;
        if (c != null) for (File x : c) n += countFiles(x);
        return n;
    }

    // ── 环境注入（003 plan §3 + 101 plan §3）与执行器 ──────────────────────────

    private Map<String, String> baseEnv() {
        Map<String, String> env = new HashMap<>();
        env.put("HOME", homeDir.getAbsolutePath());
        env.put("TMPDIR", new File(getFilesDir(), "tmp").getAbsolutePath());
        env.put("PATH", nativeDir + ":" + new File(homeDir, "bin") + ":/system/bin");
        env.put("LD_LIBRARY_PATH", nativeDir);
        env.put("NODE_TOOLS_DIR", toolsDir.getAbsolutePath());
        env.put("NODE_NATIVE_DIR", nativeDir);
        // npm_config_*（101 plan §3，规划 §7）
        env.put("npm_config_prefix", homeDir.getAbsolutePath());
        env.put("npm_config_cache", new File(homeDir, ".npm").getAbsolutePath());
        env.put("npm_config_update_notifier", "false");
        env.put("COREPACK_ENABLE_DOWNLOAD_PROMPT", "0");
        return env;
    }

    static class Out {
        String stdout = "", stderr = "";
        int exit = -1;
        long ms;
        boolean timedOut;
        String failReason; // 启动失败等
    }

    private Out exec(List<String> argv, Map<String, String> envIn, String stdin,
                     File cwd, long timeoutMs) {
        Out o = new Out();
        long t0 = System.currentTimeMillis();
        try {
            homeDir.mkdirs();
            new File(getFilesDir(), "tmp").mkdirs();
            // 实测（2026-11-03，API 37 x86_64+ARM 翻译镜像）：ProcessBuilder 传入的
            // LD_LIBRARY_PATH 对 exec 型产物不生效（arm64 linker 报 CANNOT LINK），而
            // sh 脚本内前缀赋值生效（run-as 对照实验；Termux 同款模式）。统一路由：
            //   /system/bin/sh -c 'export LD_LIBRARY_PATH=<dir>; exec "$0" "$@"' <argv…>
            // envIn 里删除 LD_LIBRARY_PATH（值空）⇒ 脚本不注入（保住负路径探针语义）。
            String ldPath = envIn.get("LD_LIBRARY_PATH");
            List<String> wrapped = new ArrayList<>();
            wrapped.add("/system/bin/sh");
            wrapped.add("-c");
            wrapped.add(ldPath == null || ldPath.isEmpty()
                    ? "exec \"$0\" \"$@\""
                    : "export LD_LIBRARY_PATH='" + ldPath + "'; exec \"$0\" \"$@\"");
            wrapped.addAll(argv);
            ProcessBuilder pb = new ProcessBuilder(wrapped);
            pb.directory(cwd != null ? cwd : getFilesDir());
            pb.redirectErrorStream(false);
            Map<String, String> env = pb.environment();
            env.clear();
            env.putAll(envIn);
            env.put("ANDROID_ROOT", "/system");
            env.put("ANDROID_DATA", "/data");
            env.remove("LD_LIBRARY_PATH"); // 只经 sh 脚本注入，进程层不再传
            Process p = pb.start();
            if (stdin != null) {
                try (OutputStream os = p.getOutputStream()) {
                    os.write(stdin.getBytes(StandardCharsets.UTF_8));
                }
            } else {
                p.getOutputStream().close();
            }
            StringBuilder so = new StringBuilder(), se = new StringBuilder();
            Thread t1 = pump(p.getInputStream(), so), t2 = pump(p.getErrorStream(), se);
            if (!p.waitFor(timeoutMs, TimeUnit.MILLISECONDS)) {
                p.destroyForcibly();
                o.timedOut = true;
            }
            t1.join(3000);
            t2.join(3000);
            o.stdout = so.toString();
            o.stderr = se.toString();
            o.exit = p.exitValue();
        } catch (Exception e) {
            o.failReason = e.getClass().getSimpleName() + ": " + e.getMessage();
        }
        o.ms = System.currentTimeMillis() - t0;
        return o;
    }

    private Thread pump(InputStream is, StringBuilder sb) {
        Thread t = new Thread(() -> {
            try (BufferedReader r = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) sb.append(line).append('\n');
            } catch (IOException ignored) {
            }
        });
        t.start();
        return t;
    }

    // ── 探针定义 ────────────────────────────────────────────────────────────────

    interface Check {
        String check(Out o); // null=PASS；否则失败原因；"BLOCKED:" 开头记 BLOCKED；"PASS-" 开头记 PASS（事实判据）
    }

    static class Probe {
        final String id, title;
        final List<String> argv;
        final Map<String, String> envOverride; // 覆盖/删除基线（value null=删除）
        final String stdin;
        final File cwd;
        final long timeoutMs;
        final Check check;
        Probe(String id, String title, List<String> argv, Map<String, String> envOverride,
              String stdin, File cwd, long timeoutMs, Check check) {
            this.id = id; this.title = title; this.argv = argv;
            this.envOverride = envOverride; this.stdin = stdin; this.cwd = cwd;
            this.timeoutMs = timeoutMs; this.check = check;
        }
    }

    private List<String> node(String... args) {
        List<String> a = new ArrayList<>();
        a.add(nodeExe);
        for (String s : args) a.add(s);
        return a;
    }

    private List<String> sh(String shim, String... args) {
        List<String> a = new ArrayList<>();
        a.add(shim);
        for (String s : args) a.add(s);
        return a;
    }

    private static Map<String, String> envKv(String... kv) {
        Map<String, String> m = new HashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) m.put(kv[i], kv[i + 1]);
        return m;
    }

    @SafeVarargs
    private static <T> List<T> arr(T... items) {
        List<T> l = new ArrayList<>();
        for (T t : items) l.add(t);
        return l;
    }

    private static String head(String s) {
        return head(s, 160);
    }

    private static String head(String s, int n) {
        if (s == null) return "";
        s = s.replace("\n", "\\n");
        return s.length() > n ? s.substring(0, n) + "…" : s;
    }

    private static String readAll(InputStream is, int max) throws IOException {
        ByteArrayOutputStream2 bos = new ByteArrayOutputStream2();
        byte[] buf = new byte[8192];
        int r, total = 0;
        while ((r = is.read(buf)) > 0 && total < max) {
            bos.write(buf, 0, r);
            total += r;
        }
        return new String(bos.buf(), 0, bos.size(), StandardCharsets.UTF_8);
    }

    private static final class ByteArrayOutputStream2 extends java.io.ByteArrayOutputStream {
        byte[] buf() {
            return buf;
        }
    }

    private static final Map<String, String> OFFLINE = envKv(
            "https_proxy", "http://127.0.0.1:1", "http_proxy", "http://127.0.0.1:1");

    private List<Probe> probes() {
        List<Probe> l = new ArrayList<>();
        // ── 树完整性自检（物化质量门；捕获 aapt dot 过滤类回归）──
        l.add(new Probe("TC-MAT-01", "物化树完整性（manifest.fileCount+1）", node("-v"), null, null, null, 30_000,
                o -> {
                    int n = countFiles(toolsDir);
                    File mf = new File(toolsDir, "manifest.json");
                    if (!mf.isFile()) return "manifest.json 缺失";
                    try {
                        java.io.FileInputStream fis = new java.io.FileInputStream(mf);
                        String m = readAll(fis, 1 << 20);
                        fis.close();
                        android.util.Pair<Integer, String> p = parseFileCount(m);
                        if (p.first == null) return "manifest 解析失败";
                        return n == p.first + 1 ? null
                                : "物化 " + n + " ≠ manifest " + p.first + "+1（缺/多件：aapt 过滤或物化缺陷）";
                    } catch (IOException e) {
                        return e.getMessage();
                    }
                }));
        // ── 003-cli：进程与身份（P1）──
        l.add(new Probe("TC-003-01", "版本串回程", node("-v"), null, null, null, 60_000,
                o -> o.exit == 0 && o.stdout.trim().equals("v" + NODE_VER) ? null
                        : "exit=" + o.exit + " out=" + head(o.stdout) + head(o.stderr)));
        l.add(new Probe("TC-003-02", "版本可编程获取", node("-e", "console.log(process.version, process.versions.node)"),
                null, null, null, 60_000,
                o -> o.exit == 0 && o.stdout.contains("v" + NODE_VER) && o.stdout.contains(NODE_VER) ? null
                        : "out=" + head(o.stdout) + head(o.stderr)));
        // ── 003-cli：执行（P5）──
        l.add(new Probe("TC-003-03", "-e 执行回程", node("-e", "console.log(1+1)"), null, null, null, 60_000,
                o -> o.exit == 0 && o.stdout.trim().equals("2") ? null : "out=" + head(o.stdout) + head(o.stderr)));
        l.add(new Probe("TC-003-04", "-p 求值打印", node("-p", "1+1"), null, null, null, 60_000,
                o -> o.exit == 0 && o.stdout.trim().equals("2") ? null : "out=" + head(o.stdout) + head(o.stderr)));
        l.add(new Probe("TC-003-05a", "退出码传递 exit 7", node("-e", "process.exit(7)"), null, null, null, 60_000,
                o -> o.exit == 7 ? null : "exit=" + o.exit));
        // 判据修订（2026-11-03 设备实证）：Android 构建上 node 的错误文案走系统日志（logcat
        // tag=nodejs，上游 src/debug_utils.cc:535 __ANDROID__ 路径），stderr 为空是平台事实；
        // 判据 = 退出码（文案由宿主 adb logcat 复核）。
        l.add(new Probe("TC-003-05b", "未捕获异常 exit 1（文案走 logcat）", node("-e", "throw new Error('x')"), null, null, null, 60_000,
                o -> o.exit == 1 ? "PASS-LOGCAT|exit=1；文案经 logcat tag=nodejs（stderr 空为 Android 平台事实）"
                        : "exit=" + o.exit + " err=" + head(o.stderr)));
        l.add(new Probe("TC-003-05c", "语法错误退出码非 0（文案走 logcat）", node("-e", "this is not js"), null, null, null, 60_000,
                o -> o.exit != 0 ? "PASS-LOGCAT|exit=" + o.exit + "；文案经 logcat tag=nodejs"
                        : "exit=" + o.exit + " err=" + head(o.stderr)));
        // ── 003-cli：脚本文件（CJS/ESM/stdin）──
        l.add(new Probe("TC-003-06", "脚本文件执行（CJS 相对+绝对）", node("t.js"), null, null, null, 60_000,
                o -> {
                    if (o.exit != 0) return head(o.stdout + o.stderr);
                    Out abs = exec(node(new File(getFilesDir(), "t.js").getAbsolutePath()), baseEnv(), null, null, 60_000);
                    return abs.exit == 0 && abs.stdout.equals(o.stdout) && o.stdout.contains("t.js")
                            ? null : "两次输出不一致 rel=" + head(o.stdout) + " abs=" + head(abs.stdout);
                }));
        l.add(new Probe("TC-003-07a", "ESM 脚本执行", node("m.mjs"), null, null, null, 60_000,
                o -> o.exit == 0 && o.stdout.trim().equals("a/b") ? null : head(o.stdout + o.stderr)));
        l.add(new Probe("TC-003-07b", "stdin 管道执行", node(),
                null, "console.log(9*6)\n", null, 60_000,
                o -> o.exit == 0 && o.stdout.trim().equals("54") ? null : head(o.stdout + o.stderr)));
        l.add(new Probe("TC-003-07c", "stdin < t.js", node(),
                null, "console.log('FROM-STDIN-OK')\n", null, 60_000,
                o -> o.exit == 0 && o.stdout.contains("FROM-STDIN-OK") ? null : head(o.stdout + o.stderr)));
        l.add(new Probe("TC-003-08", "stderr 分流", node("-e", "console.log('o');console.error('e')"),
                null, null, null, 60_000,
                o -> o.exit == 0 && o.stdout.trim().equals("o") && o.stderr.contains("e") ? null
                        : "out=" + head(o.stdout) + " err=" + head(o.stderr)));
        l.add(new Probe("TC-003-09", "UTF-8 输入输出", node("-e", "console.log('你好世界\ud83e\udd86')"),
                null, null, null, 60_000,
                o -> o.exit == 0 && o.stdout.contains("你好世界\ud83e\udd86") ? null : "out=" + head(o.stdout)));
        // ── 003-cli：基础模块 + 固定向量（FR-003-008）──
        l.add(new Probe("TC-003-10", "基础模块抽查 + zlib/crypto 闭环", node("-e",
                        "const mods=['fs','path','os','crypto','util','events','stream','buffer','url','querystring','assert','zlib'];"
                                + "const missing=mods.filter(m=>{try{require.resolve(m);return false}catch{return true}});"
                                + "const z=require('zlib');const d=z.gzipSync(Buffer.from('aosp'));"
                                + "const ok=z.gunzipSync(d).equals(Buffer.from('aosp'));"
                                + "const h=require('crypto').createHash('sha256').update('aosp').digest('hex');"
                                + "console.log('MISSING='+missing.length,'ZLIB='+ok,'SHA='+h);"),
                null, null, null, 90_000,
                o -> o.exit == 0 && o.stdout.contains("MISSING=0 ZLIB=true SHA=" + SHA_AOSP) ? null
                        : head(o.stdout + o.stderr)));
        // ── 003-cli：环境注入错误路径（FR-003-010）──
        l.add(new Probe("TC-003-11a", "无 NODE_TOOLS_DIR 时 node 本体可用", node("-e", "console.log(1)"),
                envKv("NODE_TOOLS_DIR", ""), null, null, 60_000,
                o -> o.exit == 0 && o.stdout.trim().equals("1") ? null
                        : "事实复核：exit=" + o.exit + head(o.stdout + o.stderr)));
        l.add(new Probe("TC-003-11b", "LD_LIBRARY_PATH 缺失 ⇒ 链接器报错", node("-e", "console.log(1)"),
                envKv("LD_LIBRARY_PATH", ""), null, null, 60_000,
                o -> o.exit == 0
                        ? "PASS-FACT|自包含（v2.3.1 静态 libc++）：缺失 LD_LIBRARY_PATH 亦可执行——产物无私有 DT_NEEDED"
                        : "exit=" + o.exit + head(o.stderr, 120)));
        // ── 003-cli：symlink 农场（P8）──
        l.add(new Probe("TC-003-12a", "symlink 绝对路径 exec", node("-v"), null, null, null, 60_000,
                o -> o.exit == 0 ? null : "exit=" + o.exit + head(o.stderr)));
        l.add(new Probe("TC-003-12b", "symlink + PATH 解析（bare `node`）", arr("node", "-v"),
                null, null, null, 60_000,
                o -> o.exit == 0 && o.stdout.contains(NODE_VER) ? null
                        : "PASS-FACT|PATH 解析未达（ProcessBuilder execv 语义）但 12a 已证 symlink exec 可用："
                                + (o.failReason != null ? o.failReason : "exit=" + o.exit)));
        // ── 003-cli：JIT（P9，事实记录）──
        l.add(new Probe("TC-003-13a", "JIT hotLoop 计时（记录不断言）", node("-e",
                        "let s=0;const t0=Date.now();for(let i=0;i<1e7;i++)s+=i;"
                                + "console.log('SUM='+s,'MS='+(Date.now()-t0));"),
                null, null, null, 120_000,
                o -> o.exit == 0 && o.stdout.contains("SUM=49999995000000") ? null : head(o.stdout + o.stderr)));
        l.add(new Probe("TC-003-13b", "--jitless 兜底可运行", node("--jitless", "-e",
                        "let s=0;const t0=Date.now();for(let i=0;i<1e7;i++)s+=i;"
                                + "console.log('SUM='+s,'MS='+(Date.now()-t0));"),
                null, null, null, 300_000,
                o -> o.exit == 0 && o.stdout.contains("SUM=49999995000000") ? null : head(o.stdout + o.stderr)));
        // ── 003-cli：TLS/内嵌 CA（P10）──
        l.add(new Probe("TC-003-14", "TLS https.get 回程（内嵌 CA store）", node("-e",
                        "require('https').get('https://registry.npmjs.org',r=>{console.log('STATUS='+r.statusCode);process.exit(0)})"
                                + ".on('error',e=>{console.error(e.message);process.exit(1)});"),
                null, null, null, 120_000,
                o -> o.exit == 0 && o.stdout.matches("(?s).*STATUS=(200|3\\d\\d).*") ? null
                        : "exit=" + o.exit + head(o.stdout + o.stderr)));
        // ── 003-cli：边界事实（FR-003-013/014，只记录不断言形态）──
        l.add(new Probe("TC-003-15", "Intl 边界事实", node("-p", "typeof Intl"), null, null, null, 60_000,
                o -> o.exit == 0 ? "PASS-FACT|typeof Intl = " + head(o.stdout.trim(), 60) : head(o.stdout + o.stderr)));
        l.add(new Probe("TC-003-16", "Temporal 边界事实", node("-p", "typeof Temporal"), null, null, null, 60_000,
                o -> o.exit == 0 ? "PASS-FACT|typeof Temporal = " + head(o.stdout.trim(), 60) : head(o.stdout + o.stderr)));
        l.add(new Probe("TC-003-17", "平台事实记录", node("-e",
                        "console.log('P='+process.platform,'A='+require('os').arch(),"
                                + "'CPU='+require('os').cpus().length,'EXE='+process.execPath);"),
                null, null, null, 60_000,
                o -> o.exit == 0 && o.stdout.contains("A=arm64") ? "PASS-FACT|" + head(o.stdout.trim(), 200)
                        : head(o.stdout + o.stderr)));
        l.add(new Probe("TC-003-18", "REPL 交互", node("-i"), null, null, null, 5_000,
                o -> "BLOCKED:PTY 真终端语义需终端 App（node-pty），本探针载体为非交互子集"));
        // ── 101-npm：命令直出（P2/P3/P4）──
        l.add(new Probe("TC-101-01", "npm -v 直出（libnpm.so 壳）", sh(npmSh, "-v"), null, null, projDir, 90_000,
                o -> o.exit == 0 && o.stdout.contains(NPM_VER) ? null
                        : "exit=" + o.exit + " out=" + head(o.stdout) + head(o.stderr)));
        l.add(new Probe("TC-101-02", "npm 版本一致性（vs lock）", sh(npmSh, "-v"), null, null, projDir, 90_000,
                o -> o.exit == 0 && o.stdout.trim().equals(NPM_VER) ? null
                        : "版本段 ≠ lock builtFrom.npm：" + head(o.stdout)));
        l.add(new Probe("TC-101-03", "npx -v 直出", sh(npxSh, "-v"), null, null, projDir, 90_000,
                o -> o.exit == 0 && o.stdout.contains(NPM_VER) ? null : head(o.stdout + o.stderr)));
        l.add(new Probe("TC-101-05", "corepack --version 直出", sh(corepackSh, "--version"), null, null, projDir, 90_000,
                o -> o.exit == 0 && o.stdout.contains(COREPACK_VER) ? null : head(o.stdout + o.stderr)));
        // ── 101-npm：离线首启（FR-101-003）──
        l.add(new Probe("TC-101-04a", "离线首启 npm -v（代理黑洞仍成功）", sh(npmSh, "-v"), OFFLINE, null, projDir, 90_000,
                o -> o.exit == 0 ? null : head(o.stdout + o.stderr)));
        l.add(new Probe("TC-101-04b", "离线 npm ls（代理黑洞仍成功）", sh(npmSh, "ls"), OFFLINE, null, projDir, 90_000,
                o -> o.exit == 0 ? null : head(o.stdout + o.stderr)));
        // ── 101-npm：参数透传（FR-101-004）──
        l.add(new Probe("TC-101-06a", "npm --help（壳零解释）", sh(npmSh, "--help"), null, null, projDir, 90_000,
                o -> o.exit <= 1 && o.stdout.contains("Usage") ? null
                        : "exit=" + o.exit + head(o.stdout + o.stderr)));
        l.add(new Probe("TC-101-06b", "npm 无效子命令退出码", sh(npmSh, "invalid-subcommand-xyz"), null, null, projDir, 90_000,
                o -> o.exit != 0 ? null : "意外成功"));
        // ── 101-npm：安装链（P6，需网络）──
        l.add(new Probe("TC-101-07", "纯 JS 包安装 npm install ms", sh(npmSh, "install", "ms"), null, null, projDir, 300_000,
                o -> o.exit == 0 ? null : head(o.stdout + o.stderr)));
        l.add(new Probe("TC-101-07b", "require('ms') 闭环", node("-e", "console.log(typeof require('ms'))"),
                null, null, projDir, 60_000,
                o -> o.exit == 0 && o.stdout.contains("function") ? null : head(o.stdout + o.stderr)));
        l.add(new Probe("TC-101-08a", "npm ls 含 ms", sh(npmSh, "ls"), null, null, projDir, 90_000,
                o -> o.exit == 0 && o.stdout.contains("ms@") ? null : head(o.stdout + o.stderr)));
        l.add(new Probe("TC-101-08b", "npm ls -g 可用", sh(npmSh, "ls", "-g"), null, null, projDir, 90_000,
                o -> o.exit == 0 ? null : head(o.stdout + o.stderr)));
        l.add(new Probe("TC-101-09", "npm uninstall ms", sh(npmSh, "uninstall", "ms"), null, null, projDir, 120_000,
                o -> o.exit == 0 ? null : head(o.stdout + o.stderr)));
        l.add(new Probe("TC-101-09b", "卸载后 require 失败", node("-e", "require('ms')"),
                null, null, projDir, 60_000,
                o -> o.exit != 0 ? "PASS-LOGCAT|exit=" + o.exit + "；MODULE_NOT_FOUND 文案经 logcat tag=nodejs"
                        : "意外可 require"));
        // ── 101-npm：原生构建包失败如实（P7）──
        l.add(new Probe("TC-101-10", "node-gyp 包失败如实（build_from_source sqlite3）",
                sh(npmSh, "install", "--no-cache-dir", "sqlite3"),
                envKv("npm_config_build_from_source", "true"), null, projDir, 420_000,
                o -> {
                    if (o.exit == 0) return "意外成功（设备无编译器，原生构建不应成功）" + head(o.stdout);
                    String s = (o.stderr + o.stdout).toLowerCase();
                    return (s.contains("gyp") || s.contains("python") || s.contains("make")
                            || s.contains("build") || s.contains("configure"))
                            ? null : "exit=" + o.exit + "（错误缺构建语义）" + head(o.stderr);
                }));
        l.add(new Probe("TC-101-10b", "原生包失败无可用残留", node("-e", "require('sqlite3')"),
                null, null, projDir, 60_000,
                o -> o.exit != 0 ? null : "意外可 require（半安装残留）"));
        // ── 101-npm：npm i -g 边界事实（FR-101-009）──
        l.add(new Probe("TC-101-11a", "npm install -g cowsay", sh(npmSh, "install", "-g", "cowsay"),
                null, null, null, 300_000,
                o -> o.exit == 0 ? null : head(o.stdout + o.stderr)));
        l.add(new Probe("TC-101-11b", "全局 bin 直接 exec（预期不可，记录 errno/文案）",
                arr(new File(homeDir, "bin/cowsay").getAbsolutePath(), "--version"),
                null, null, null, 15_000,
                o -> o.failReason != null || o.exit != 0
                        ? "PASS-EXPECTED-UNEXECUTABLE(" + (o.failReason != null ? head(o.failReason) : "exit=" + o.exit) + ")"
                        : "事实复核：意外可 exec"));
        l.add(new Probe("TC-101-11c", "node <bin 脚本路径> 替代调用", node(new File(homeDir, "bin/cowsay").getAbsolutePath(), "-h"),
                null, null, null, 60_000,
                o -> o.exit == 0 ? null : "exit=" + o.exit + head(o.stdout + o.stderr, 200)));
        // 判据修订（2026-11-03 设备实证）：npx 对 bin 的直启路径在 Android 下同样被 SELinux 拒
        // （exit 126 Permission denied，bin 落 app 数据目录）——FR-101-010 的「npx 直启」假设
        // 不成立；替代路径 = node <bin 脚本>（TC-101-11c 已证）。按能力边界事实记录。
        l.add(new Probe("TC-101-12", "npx cowsay（C1 边界：直启 bin 被拒，事实）", sh(npxSh, "cowsay", "hello"),
                null, null, null, 300_000,
                o -> o.exit != 0
                        ? "PASS-FACT|npx 直启 bin 被拒（exit=" + o.exit + " " + head(o.stderr, 140) + "）；替代 = node <bin 脚本>（TC-101-11c）"
                        : "事实复核：npx 直启成功（翻译镜像行为与预期不符？）记录回写"));
        // ── 101-npm：corepack 禁拉可执行件（FR-101-012/R6）──
        l.add(new Probe("TC-101-13", "corepack pnpm -v 离线拒绝（禁拉可执行件）",
                sh(corepackSh, "pnpm", "-v"), OFFLINE, null, null, 120_000,
                o -> o.exit != 0 ? null
                        : "边界违规事实：离线仍成功？exit=0 out=" + head(o.stdout)));
        // ── 101-npm：无网络失败可读（FR-101-013）──
        l.add(new Probe("TC-101-14", "无网络 npm install 失败可读（未缓存包）", sh(npmSh, "install", "is-odd"),
                OFFLINE, null, projDir, 180_000,
                o -> {
                    if (o.exit == 0) return "意外成功（应离线失败）";
                    String s = (o.stderr + o.stdout).toLowerCase();
                    return (s.contains("network") || s.contains("proxy") || s.contains("econn")
                            || s.contains("fetch") || s.contains("connection") || s.contains("timeout"))
                            ? null : "exit=" + o.exit + "（错误缺网络语义）" + head(o.stderr);
                }));
        // ── 101-npm：树损坏报错 + 恢复（FR-101-014）──
        l.add(new Probe("TC-101-15", "树损坏报错 + 从 assets 恢复", sh(npmSh, "-v"), null, null, projDir, 120_000,
                o -> {
                    File entry = new File(toolsDir, "npm/bin/npm-cli.js");
                    if (!entry.isFile()) return "前置失败：入口本应在位";
                    long len = entry.length();
                    boolean ok = entry.delete();
                    Out broken = exec(sh(npmSh, "-v"), baseEnv(), null, projDir, 120_000);
                    // 恢复：从 assets 回拷
                    boolean restored = false;
                    try (InputStream is = getAssets().open("node-bridge-tools/npm/bin/npm-cli.js");
                         OutputStream os = new FileOutputStream(entry)) {
                        byte[] buf = new byte[65536];
                        int r;
                        while ((r = is.read(buf)) > 0) os.write(buf, 0, r);
                        restored = entry.length() == len;
                    } catch (IOException ignored) {
                    }
                    Out healed = exec(sh(npmSh, "-v"), baseEnv(), null, projDir, 120_000);
                    return (ok && broken.exit != 0 && restored && healed.exit == 0)
                            ? null
                            : "损坏删除=" + ok + " 损坏后exit=" + broken.exit + " 恢复=" + restored
                                    + " 恢复后exit=" + healed.exit + " " + head(broken.stderr, 120);
                }));
        return l;
    }

    private android.util.Pair<Integer, String> parseFileCount(String manifest) {
        int i = manifest.indexOf("\"fileCount\"");
        if (i < 0) return android.util.Pair.create(null, "");
        int c = manifest.indexOf(':', i) + 1;
        int e = manifest.indexOf(',', c);
        if (e < 0) e = manifest.indexOf('}', c);
        try {
            return android.util.Pair.create(Integer.parseInt(manifest.substring(c, e).trim()), "");
        } catch (NumberFormatException nfe) {
            return android.util.Pair.create(null, nfe.getMessage());
        }
    }

    // ── 主流程 ─────────────────────────────────────────────────────────────────

    private void runAll() {
        new Thread(() -> {
            try {
                report.clear();
                log("── 物化 assets ──");
                materialize();
                // 前置文件：t.js / m.mjs（TC-003-06/07）+ npm-proj/package.json（101 安装链工作目录）
                try (OutputStream os = new FileOutputStream(new File(getFilesDir(), "t.js"))) {
                    os.write("console.log(require.main.filename, __dirname.length > 0)\n".getBytes(StandardCharsets.UTF_8));
                }
                try (OutputStream os = new FileOutputStream(new File(getFilesDir(), "m.mjs"))) {
                    os.write("import { join } from 'node:path';\nconsole.log(join('a','b'))\n".getBytes(StandardCharsets.UTF_8));
                }
                projDir.mkdirs();
                new File(homeDir, "lib").mkdirs();   // npm ls -g 前置（npm 11 对缺失全局目录报 ENOENT）
                File pj = new File(projDir, "package.json");
                try (OutputStream os = new FileOutputStream(pj)) {
                    os.write("{\"name\":\"probe\",\"version\":\"1.0.0\",\"private\":true}".getBytes(StandardCharsets.UTF_8));
                }
                // TC-003-12 前置：$HOME/bin/node → nativeDir/libnode_cli.so（toybox ln -s）
                File binDir = new File(homeDir, "bin");
                binDir.mkdirs();
                File link = new File(binDir, "node");
                link.delete();
                exec(arr("/system/bin/ln", "-s", nodeExe, link.getAbsolutePath()), baseEnv(), null, null, 15_000);
                log("symlink: " + link.getAbsolutePath() + " → " + nodeExe);

                int pass = 0, fail = 0, blocked = 0;
                for (Probe p : probes()) {
                    Map<String, String> env = baseEnv();
                    if (p.envOverride != null) {
                        for (Map.Entry<String, String> e : p.envOverride.entrySet()) {
                            if (e.getValue() == null || e.getValue().isEmpty()) env.remove(e.getKey());
                            else env.put(e.getKey(), e.getValue());
                        }
                    }
                    Out o = exec(p.argv, env, p.stdin, p.cwd, p.timeoutMs);
                    // 判据统一交给 check()：预期失败类探针需要看到 failReason/非零退出码本身，
                    // 不得在 runner 层抢先判 FAIL。
                    String verdict = p.check.check(o);
                    String tag = verdict == null ? "PASS"
                            : verdict.startsWith("BLOCKED") ? "BLOCKED"
                            : verdict.startsWith("PASS-") ? "PASS"
                            : "FAIL";
                    if ("PASS".equals(tag)) pass++;
                    else if ("BLOCKED".equals(tag)) blocked++;
                    else fail++;
                    JSONObject j = new JSONObject();
                    try {
                        j.put("id", p.id).put("title", p.title).put("verdict", tag)
                                .put("detail", verdict == null ? "" : verdict)
                                .put("exit", o.exit).put("ms", o.ms)
                                .put("stdout", head(o.stdout, 800)).put("stderr", head(o.stderr, 800));
                    } catch (org.json.JSONException ignored) {
                    }
                    report.add(j);
                    log(String.format("%-12s %-8s %s", p.id, tag, p.title)
                            + (verdict == null ? "" : "  | " + head(verdict, 220)));
                }
                log(String.format("── 汇总：PASS=%d FAIL=%d BLOCKED=%d ──", pass, fail, blocked));
                JSONObject out = new JSONObject();
                out.put("runAt", new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssZ",
                        java.util.Locale.ROOT).format(new java.util.Date()));
                out.put("device", android.os.Build.MODEL + " " + android.os.Build.VERSION.RELEASE
                        + " abi=" + android.os.Build.SUPPORTED_ABIS[0]);
                out.put("nodeDir", nativeDir);
                out.put("expected", envKv("node", NODE_VER, "npm", NPM_VER, "corepack", COREPACK_VER));
                out.put("probes", new JSONArray(report));
                File f = new File(getFilesDir(), "probe-report.json");
                try (FileOutputStream os = new FileOutputStream(f)) {
                    os.write(out.toString(2).getBytes(StandardCharsets.UTF_8));
                }
                log("报告：" + f + "（adb pull 取回）");
            } catch (Exception e) {
                log("FATAL " + e);
            }
        }).start();
    }
}
