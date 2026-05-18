#!/usr/bin/env node
/**
 * Must-b Production Build Script (v1.0)
 *
 * Steps:
 *   1. Clean dist/
 *   2. Build React frontend (Vite — minified, tree-shaken) → dist/public/
 *   3. Bundle backend to ESM (esbuild --minify) → dist/index.js
 *   4. Mirror dist/index.js → dist/index.cjs
 *   5. Write dist/BUILD.json with version + git hash + timestamp
 *   6. Verify dist/ layout (no secrets, required files present)
 *   7. [--binary]  Package standalone executables via @yao-pkg/pkg
 *   8. [--publish] npm publish + force-push dist/ to Must-b-Code/must-b.git
 *
 * Note: Extensions are NOT bundled here. Must-b uses a dynamic DLC model
 * where extensions are installed separately via the App Store / plugin registry.
 *
 * Usage:
 *   node scripts/build-prod.mjs              # build dist/ only
 *   node scripts/build-prod.mjs --binary     # also create standalone executables
 *   node scripts/build-prod.mjs --publish    # build + npm publish + GitHub sync
 *   npm run build:prod
 *   npm run build:bin
 *   npm run publish:core
 */

import { execSync, spawnSync } from "child_process";
import {
  cpSync, copyFileSync, rmSync, existsSync, mkdirSync,
  writeFileSync, readFileSync, readdirSync, statSync,
} from "fs";
import { join, dirname } from "path";
import { fileURLToPath }  from "url";
import os from "os";

const ROOT    = join(dirname(fileURLToPath(import.meta.url)), "..");
const BINARY  = process.argv.includes("--binary");
const PUBLISH = process.argv.includes("--publish");

// ── Colour helpers ─────────────────────────────────────────────────────────
const c = {
  orange: (s) => `\x1b[38;2;234;88;12m${s}\x1b[0m`,
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
};

const OK   = c.green("  ✓");
const FAIL = c.red("  ✗");

function header(step, total, msg) {
  console.log(`\n${c.orange(`[${step}/${total}]`)} ${c.bold(msg)}`);
}

function run(cmd, cwd = ROOT) {
  console.log(c.dim(`  $ ${cmd.slice(0, 120)}`));
  const result = spawnSync(cmd, { cwd, shell: true, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`${FAIL} Command failed (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
}

function fmtSize(bytes) {
  if (bytes < 1024)          return `${bytes} B`;
  if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileSize(p) {
  try { return statSync(p).size; } catch { return 0; }
}

// ── Read package.json metadata ─────────────────────────────────────────────
const pkg     = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const VERSION = pkg.version ?? "1.0.0";
const NAME    = pkg.name    ?? "must-b";

let GIT_HASH = "unknown";
try {
  GIT_HASH = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
} catch { /* git not available in CI */ }

const TOTAL_STEPS = BINARY ? 7 : 6;

console.log(`\n${c.orange(c.bold("  Must-b Production Build"))}`);
console.log(c.dim(`  v${VERSION} · ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC · ${GIT_HASH}\n`));

// ── 0. Compile embedded skills bundle ──────────────────────────────────────
console.log(`\n${c.orange("[0/0]")} ${c.bold("Compiling embedded skills bundle…")}`);
run("node scripts/bundle-skills.mjs");

// ── 1. Clean dist/ ─────────────────────────────────────────────────────────
header(1, TOTAL_STEPS, "Cleaning dist/…");
rmSync(join(ROOT, "dist"), { recursive: true, force: true });
mkdirSync(join(ROOT, "dist"),     { recursive: true });
mkdirSync(join(ROOT, "dist/bin"), { recursive: true });
console.log(`${OK} dist/ cleaned`);

// ── 2. Build frontend ──────────────────────────────────────────────────────
header(2, TOTAL_STEPS, "Building frontend (Vite)…");
const UI_DIR = join(ROOT, "public", "must-b-ui");
if (!existsSync(join(UI_DIR, "node_modules"))) {
  console.log("  Installing frontend dependencies…");
  run("npm install --prefer-offline", UI_DIR);
}
run("npx vite build --mode production", UI_DIR);

// Vite outputs to public/must-b-ui/out → copy to dist/public/
cpSync(join(UI_DIR, "out"), join(ROOT, "dist/public"), { recursive: true });
console.log(`${OK} Frontend → dist/public/ (${fmtSize(fileSize(join(ROOT, "dist/public/index.html")))} index.html)`);

// ── 3. Bundle backend — primary CJS bundle → dist/index.js ────────────────
header(3, TOTAL_STEPS, "Bundling backend → dist/index.js…");

if (!existsSync(join(ROOT, "node_modules/esbuild"))) {
  console.log("  Installing esbuild…");
  run("npm install --save-dev esbuild --prefer-offline");
}

const ESBUILD = join(ROOT, "node_modules/.bin/esbuild");

const NODE_BUILTINS = [
  "assert", "async_hooks", "buffer", "child_process", "cluster",
  "console", "constants", "crypto", "dgram", "diagnostics_channel",
  "dns", "domain", "events", "fs", "fs/promises", "http", "http2",
  "https", "inspector", "module", "net", "os", "path", "path/posix",
  "path/win32", "perf_hooks", "process", "punycode", "querystring",
  "readline", "repl", "stream", "stream/consumers", "stream/promises",
  "stream/web", "string_decoder", "sys", "timers", "timers/promises",
  "tls", "trace_events", "tty", "url", "util", "util/types", "v8",
  "vm", "wasi", "worker_threads", "zlib",
];

const BASE_FLAGS = [
  "src/index.ts",
  "--bundle",
  "--platform=node",
  "--target=node20",
  "--minify",
  "--sourcemap=external",
  // Explicit 3rd-party native / non-bundleable packages
  "--external:sharp",
  "--external:fsevents",
  "--external:onnxruntime-node",
  "--external:chromium-bidi",
  // playwright bundles its own binaries and uses require.resolve() for relative
  // paths that break when inlined — must stay external
  "--external:playwright",
  "--external:playwright-core",
  // inquirer is kept external so Node resolves it from node_modules at runtime
  "--external:inquirer",
  // All Node.js built-ins (prevents CJS require() shim errors in ESM output)
  ...NODE_BUILTINS.map((m) => `--external:${m}`),
  ...NODE_BUILTINS.map((m) => `--external:node:${m}`),
  `--define:__VERSION__='"${VERSION}"'`,
  `--define:__GIT_HASH__='"${GIT_HASH}"'`,
  "--log-level=warning",
].join(" ");

run(`"${ESBUILD}" ${BASE_FLAGS} --format=cjs --outfile=dist/index.js`);

const jsSize = fileSize(join(ROOT, "dist/index.js"));
console.log(`${OK} CJS bundle → dist/index.js (${fmtSize(jsSize)})`);

// Guard: abort if the bundle is suspiciously small (esbuild write truncated)
const MIN_BUNDLE_BYTES = 1_000_000; // 1 MB minimum for a healthy bundle
if (jsSize < MIN_BUNDLE_BYTES) {
  console.error(c.red(`\n  FATAL: dist/index.js is only ${fmtSize(jsSize)} — bundle appears truncated.`));
  console.error(c.red("  Possible cause: antivirus scanning mid-write. Retry or add dist/ to AV exclusions.\n"));
  process.exit(1);
}

// Copy embedded skills JSON into dist/ so runtime require() resolves it
const embeddedSrc  = join(ROOT, "src", "core", "embedded-skills.json");
const embeddedDest = join(ROOT, "dist", "embedded-skills.json");
if (existsSync(embeddedSrc)) {
  copyFileSync(embeddedSrc, embeddedDest);
  console.log(`${OK} dist/embedded-skills.json (${fmtSize(fileSize(embeddedDest))})`);
} else {
  console.warn("  ⚠ embedded-skills.json not found — run bundle-skills.mjs first");
}

// ── 4. Mirror dist/index.js → dist/index.cjs (single source of truth) ─────
// Both files are identical CJS bundles. Copying (not re-running esbuild) avoids
// the Windows write-truncation race condition that affected the previous approach.
header(4, TOTAL_STEPS, "Mirroring dist/index.js → dist/index.cjs…");
copyFileSync(join(ROOT, "dist/index.js"),     join(ROOT, "dist/index.cjs"));
copyFileSync(join(ROOT, "dist/index.js.map"), join(ROOT, "dist/index.cjs.map"));
console.log(`${OK} CJS bundle → dist/index.cjs (${fmtSize(fileSize(join(ROOT, "dist/index.cjs")))})`);

// ── 5. Write BUILD.json ────────────────────────────────────────────────────
header(5, TOTAL_STEPS, "Writing build metadata…");
const buildMeta = {
  name:      NAME,
  version:   VERSION,
  gitHash:   GIT_HASH,
  buildTime: new Date().toISOString(),
  node:      process.version,
  platform:  process.platform,
};
writeFileSync(join(ROOT, "dist/BUILD.json"), JSON.stringify(buildMeta, null, 2));
console.log(`${OK} dist/BUILD.json`);
console.log(c.dim(`     ${JSON.stringify(buildMeta)}`));

// ── 6. Verify dist/ layout ────────────────────────────────────────────────
header(6, TOTAL_STEPS, "Verifying dist/ layout…");

const REQUIRED = [
  "dist/index.js",
  "dist/index.cjs",
  "dist/BUILD.json",
  "dist/embedded-skills.json",
  "dist/public/index.html",
];

// Patterns that must NOT appear inside dist/
const BLOCKED_PATTERNS = [
  // Secrets & environment
  ".env",
  // Runtime databases — user data must stay in storage/, not ship with dist/
  ".db",
  "vectors.db",
  // Session / history files — generated at runtime
  "history.json",
  "sessions.json",
  // Log reports — written by Guard/NightOwl at runtime
  "logs/",
  // Dev / test artefacts
  "visual-audit",
  "tsconfig.json",
  "playwright.config",
  ".test.",
  ".spec.",
];

let verifyOk = true;

for (const f of REQUIRED) {
  const abs  = join(ROOT, f);
  const size = fileSize(abs);
  if (!existsSync(abs)) {
    console.log(`${FAIL} MISSING: ${f}`);
    verifyOk = false;
  } else if ((f === "dist/index.js" || f === "dist/index.cjs") && size < MIN_BUNDLE_BYTES) {
    console.log(`${FAIL} TRUNCATED: ${f} (${fmtSize(size)} — expected ≥ ${fmtSize(MIN_BUNDLE_BYTES)})`);
    verifyOk = false;
  } else {
    console.log(`${OK} ${f} (${fmtSize(size)})`);
  }
}

// Flatten all paths under dist/ and look for blocked patterns
const distFiles = readdirSync(join(ROOT, "dist"), { recursive: true }).map((f) =>
  String(f).replace(/\\/g, "/")
);
for (const pattern of BLOCKED_PATTERNS) {
  const leaked = distFiles.filter((f) => f.includes(pattern));
  if (leaked.length > 0) {
    console.log(`${FAIL} Blocked pattern "${pattern}" found in dist/: ${leaked.join(", ")}`);
    verifyOk = false;
  }
}

if (!verifyOk) {
  console.error(c.red("\n  Build verification FAILED — fix the issues above before releasing.\n"));
  process.exit(1);
}
console.log(`${OK} dist/ is clean — no secrets or dev artefacts detected`);

// ── 7. [Optional] Package standalone binaries ─────────────────────────────
if (BINARY) {
  header(7, TOTAL_STEPS, "Packaging standalone binaries via @yao-pkg/pkg…");

  const pkgBin = join(ROOT, "node_modules/.bin/pkg");
  if (!existsSync(pkgBin)) {
    console.log("  Installing @yao-pkg/pkg…");
    run("npm install --save-dev @yao-pkg/pkg --prefer-offline");
  }

  // pkg reads targets + assets from package.json#pkg
  run(`"${pkgBin}" dist/index.cjs --config package.json --out-path dist/bin --compress GZip`);

  const bins = existsSync(join(ROOT, "dist/bin"))
    ? readdirSync(join(ROOT, "dist/bin"))
        .filter((f) => !f.endsWith(".map"))
        .map((f) => `dist/bin/${f}`)
    : [];

  if (bins.length === 0) {
    console.log(c.red("  Warning: no binaries produced — check pkg output above."));
  } else {
    for (const b of bins) {
      console.log(`${OK} ${b} (${fmtSize(fileSize(join(ROOT, b)))})`);
    }
  }
}

// ── 8. [Optional] Dual-publish: npm + GitHub ──────────────────────────────
if (PUBLISH) {
  const STEP = BINARY ? 9 : 8;
  header(STEP, STEP, "Publishing: npm + GitHub (Must-b-Code/must-b)…");

  // ── npm publish ────────────────────────────────────────────────────────
  // Uses NPM_TOKEN env var when set (CI); otherwise relies on npm login.
  const npmEnv = process.env.NPM_TOKEN
    ? { ...process.env, NODE_AUTH_TOKEN: process.env.NPM_TOKEN }
    : process.env;

  console.log(c.dim("  $ npm publish --access public"));
  const npmResult = spawnSync("npm publish --access public", {
    cwd:   ROOT,
    shell: true,
    stdio: "inherit",
    env:   npmEnv,
  });
  if (npmResult.status !== 0) {
    console.error(`${FAIL} npm publish failed — check credentials / version conflict`);
    process.exit(npmResult.status ?? 1);
  }
  console.log(`${OK} Published ${NAME}@${VERSION} to npm`);

  // ── GitHub sync ────────────────────────────────────────────────────────
  // Pushes only the NPM-publishable files (dist/, bin/, scripts/, README.md,
  // package.json) to a dedicated public dist repo — no src/ leaks.
  const token   = process.env.MUSTB_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? "";
  const repoUrl = token
    ? `https://${token}@github.com/Must-b-Code/must-b.git`
    : "https://github.com/Must-b-Code/must-b.git";

  const tmpDir = join(os.tmpdir(), `mustb-core-publish-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  // Copy exactly what npm publishes (mirrors the "files" field in package.json)
  const npmFiles = ["dist", "bin", "scripts", "README.md", "package.json"];
  for (const f of npmFiles) {
    const src = join(ROOT, f);
    if (!existsSync(src)) continue;
    const dst = join(tmpDir, f);
    if (statSync(src).isDirectory()) {
      cpSync(src, dst, { recursive: true });
    } else {
      copyFileSync(src, dst);
    }
  }

  // Write the commit message to a temp file so the blank line before the
  // Co-authored-by trailer is preserved exactly — shell -m flags mangle
  // newlines on Windows and break GitHub's trailer parser.
  const commitMsgFile = join(tmpDir, "COMMIT_MSG.txt");
  writeFileSync(
    commitMsgFile,
    `chore: publish ${NAME}@${VERSION}`,
    "utf-8",
  );

  const gitCmds = [
    "git init -b main",
    'git config user.email "280143655+Must-bCode@users.noreply.github.com"',
    'git config user.name "Must-bCode"',
    `git remote add origin "${repoUrl}"`,
    "git add .",
    `git commit -F "${commitMsgFile}"`,
    "git push --force origin main",
  ];

  let ghOk = true;
  for (const cmd of gitCmds) {
    const safeLog = cmd.includes(token) && token ? cmd.replace(token, "***") : cmd;
    console.log(c.dim(`  $ ${safeLog}`));
    const r = spawnSync(cmd, { cwd: tmpDir, shell: true, stdio: "inherit" });
    if (r.status !== 0) { ghOk = false; break; }
  }

  if (ghOk) {
    console.log(`${OK} Synced dist/ → github.com/Must-b-Code/must-b (main, force-push)`);
  } else {
    console.error(`${FAIL} GitHub sync failed — check MUSTB_GITHUB_TOKEN and repo access`);
    console.error(c.dim("  Tip: export MUSTB_GITHUB_TOKEN=<your-PAT-with-contents:write>"));
  }
}

// ── Summary ────────────────────────────────────────────────────────────────
const sep = c.dim("  " + "─".repeat(54));
console.log(`\n${sep}`);
console.log(`  ${c.orange(c.bold("Must-b v" + VERSION))} ${c.dim("— Release Candidate")}`);
console.log(sep);
console.log(`\n  ${c.bold("Run (ESM, recommended):")}`);
console.log(`    node dist/index.js web`);
console.log(`\n  ${c.bold("Run (custom port):")}`);
console.log(`    MUSTB_PORT=4309 node dist/index.js web`);
if (BINARY) {
  console.log(`\n  ${c.bold("Standalone executables:")}`);
  console.log(`    dist/bin/  (win-x64, linux-x64, macos-x64)`);
} else {
  console.log(`\n  ${c.dim("Standalone binaries:  npm run build:bin")}`);
}
console.log(`\n  ${c.dim("Built by Auto Step · https://must-b.com")}\n`);
