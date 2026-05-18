#!/usr/bin/env node
/**
 * Must-b Extension Pack Builder (Phase F — Themed Packs)
 *
 * Groups extension source files from src/core/extensions/ into themed
 * distribution packs. Each pack becomes a publishable npm package:
 *
 *   @must-b/pack-channels  — messaging channel extensions
 *   @must-b/pack-finance   — trading & financial extensions
 *   @must-b/pack-system    — memory, tools & AI provider extensions
 *
 * Output: dist/packs/must-b-pack-<name>/
 *   index.cjs          — CJS bundle that boots all extensions in the pack
 *   package.json       — publishable npm manifest
 *   extensions/<id>/   — per-extension CJS bundles
 *
 * Usage:
 *   node scripts/build-packs.mjs                # build all packs
 *   node scripts/build-packs.mjs --pack=channels  # build one pack
 *   node scripts/build-packs.mjs --publish-all    # build + npm + GitHub all
 *   npm run build:packs
 *   npm run publish:packs
 */

import { execSync, spawnSync } from "child_process";
import {
  existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync,
  copyFileSync, rmSync, statSync,
} from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import os from "os";

const ROOT    = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXT_SRC = join(ROOT, "src", "core", "extensions");
const PKG_OUT = join(ROOT, "dist", "packs");

// Relative path is intentional: absolute paths with "C:" after "=" break the
// Windows shell parser inside spawnSync({ shell: true }) — keep it relative.
const SDK_ALIAS_REL = "src/core/source/plugin-sdk";

// ── Colour helpers ─────────────────────────────────────────────────────────────
const c = {
  orange: (s) => `\x1b[38;2;234;88;12m${s}\x1b[0m`,
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

const OK   = c.green("  ✓");
const WARN = c.yellow("  ⚠");
const FAIL = c.red("  ✗");

// ── Node built-ins (for esbuild external list) ────────────────────────────────
const NODE_BUILTINS = [
  "assert","async_hooks","buffer","child_process","cluster","console",
  "constants","crypto","dgram","diagnostics_channel","dns","domain",
  "events","fs","fs/promises","http","http2","https","inspector","module",
  "net","os","path","path/posix","path/win32","perf_hooks","process",
  "punycode","querystring","readline","repl","stream","stream/consumers",
  "stream/promises","stream/web","string_decoder","sys","timers",
  "timers/promises","tls","trace_events","tty","url","util","util/types",
  "v8","vm","wasi","worker_threads","zlib",
];

// ── Pack definitions ──────────────────────────────────────────────────────────
/**
 * Each pack maps a distribution name to:
 *   extensions  — array of extension IDs from src/core/extensions/
 *   description — npm package description
 *   keywords    — npm keywords
 */
const PACKS = {
  channels: {
    description: "Must-b Channels Pack — Telegram, WhatsApp, Discord, Slack, Signal, iMessage, and 15+ more messaging integrations",
    keywords: ["messaging", "telegram", "whatsapp", "discord", "slack", "signal", "imessage"],
    extensions: [
      "telegram", "whatsapp", "discord", "slack", "signal", "imessage",
      "matrix", "msteams", "line", "feishu", "googlechat", "irc",
      "nostr", "twitch", "zalo", "zalouser", "bluebubbles",
      "mattermost", "synology-chat", "nextcloud-talk", "tlon",
    ],
  },

  finance: {
    description: "Must-b Finance Pack — Trading signals, MetaTrader bridge, and financial data integrations (placeholder for upcoming trading extensions)",
    keywords: ["trading", "finance", "metatrader", "forex", "crypto"],
    // No trading extension sources exist yet — pack is a manifest placeholder.
    // When @must-b/trading is created, add it here and re-run build:packs.
    extensions: [],
  },

  system: {
    description: "Must-b System Pack — Memory (LanceDB), diagnostics, device pairing, voice, diffs viewer, AI model providers (Ollama, vLLM, SGLang) and more",
    keywords: ["memory", "system", "diagnostics", "voice", "ollama", "lancedb", "tools"],
    extensions: [
      "memory-lancedb", "memory-core", "acpx", "diffs", "diagnostics-otel",
      "device-pair", "phone-control", "talk-voice", "voice-call", "open-prose",
      "thread-ownership", "lobster", "ollama", "sglang", "vllm", "llm-task",
      "copilot-proxy", "google-gemini-cli-auth", "minimax-portal-auth",
      "qwen-portal-auth",
    ],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function tryRun(cmd, cwd = ROOT) {
  const result = spawnSync(cmd, { cwd, shell: true, stdio: "pipe" });
  return result.status === 0;
}

function readPkg(dir) {
  try { return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")); }
  catch { return null; }
}

// ── Read root version ─────────────────────────────────────────────────────────
const ROOT_PKG  = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const VERSION   = "1.0.0"; // Packs use their own independent versioning
const ESBUILD   = join(ROOT, "node_modules/.bin/esbuild");

if (!existsSync(ESBUILD)) {
  console.error(c.red("  esbuild not found — run: npm install\n"));
  process.exit(1);
}

// ── CLI args ──────────────────────────────────────────────────────────────────
const packArg     = process.argv.find(a => a.startsWith("--pack="))?.slice(7) ?? null;
const PUBLISH_ALL = process.argv.includes("--publish-all");
const targetPacks = packArg
  ? (PACKS[packArg] ? [packArg] : (() => { console.error(`Unknown pack: ${packArg}`); process.exit(1); })())
  : Object.keys(PACKS);

let GIT_HASH = "unknown";
try { GIT_HASH = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(); }
catch { /* not in git */ }

// ── Banner ────────────────────────────────────────────────────────────────────
console.log(`\n${c.orange(c.bold("  Must-b Extension Pack Builder"))}`);
console.log(c.dim(`  v${ROOT_PKG.version} · ${new Date().toISOString().slice(0, 10)} · ${GIT_HASH}\n`));

// ── Dual-publish helper ───────────────────────────────────────────────────────

/**
 * Publish a pack directory to npm AND force-push it to a Must-b-Code GitHub repo.
 * Requires: npm login (or NPM_TOKEN env var) + MUSTB_GITHUB_TOKEN or GITHUB_TOKEN.
 */
function dualPublishPack(packName, packDir, version) {
  const pkgName = `@must-b/pack-${packName}`;

  // ── npm publish ──────────────────────────────────────────────────────────
  const npmEnv = process.env.NPM_TOKEN
    ? { ...process.env, NODE_AUTH_TOKEN: process.env.NPM_TOKEN }
    : process.env;

  console.log(c.dim(`  $ npm publish --access public   [cwd: dist/packs/must-b-pack-${packName}]`));
  const npmResult = spawnSync("npm publish --access public", {
    cwd:   packDir,
    shell: true,
    stdio: "inherit",
    env:   npmEnv,
  });
  if (npmResult.status !== 0) {
    console.error(`${FAIL} npm publish failed for ${pkgName}`);
  } else {
    console.log(`${OK} Published ${pkgName}@${version} to npm`);
  }

  // ── GitHub force-push ────────────────────────────────────────────────────
  const token   = process.env.MUSTB_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? "";
  const repoUrl = token
    ? `https://${token}@github.com/Must-b-Code/pack-${packName}.git`
    : `https://github.com/Must-b-Code/pack-${packName}.git`;

  const tmpDir = join(os.tmpdir(), `mustb-pack-${packName}-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  // Copy entire pack dist into the temp repo
  const entries = readdirSync(packDir, { withFileTypes: true });
  for (const e of entries) {
    const src = join(packDir, e.name);
    const dst = join(tmpDir, e.name);
    if (e.isDirectory()) {
      mkdirSync(dst, { recursive: true });
      // Simple recursive copy
      const sub = spawnSync(
        process.platform === "win32"
          ? `xcopy "${src}" "${dst}" /E /I /Y /Q`
          : `cp -r "${src}/." "${dst}"`,
        { shell: true, stdio: "pipe" },
      );
      if (sub.status !== 0 && process.platform !== "win32") {
        console.warn(c.dim(`  ⚠ copy of ${e.name} partial`));
      }
    } else {
      copyFileSync(src, dst);
    }
  }

  // Write commit message to a file — blank line before trailer must be literal,
  // shell -m flags mangle newlines on Windows and break GitHub's parser.
  const commitMsgFile = join(tmpDir, "COMMIT_MSG.txt");
  writeFileSync(
    commitMsgFile,
    `chore: publish ${pkgName}@${version}`,
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
    console.log(`${OK} Synced → github.com/Must-b-Code/pack-${packName} (force-push main)`);
  } else {
    console.error(`${FAIL} GitHub sync failed for pack-${packName} — check MUSTB_GITHUB_TOKEN`);
    console.error(c.dim("  Tip: export MUSTB_GITHUB_TOKEN=<PAT with contents:write>"));
  }
}

// ── Build each pack ───────────────────────────────────────────────────────────
const summary = [];

for (const packName of targetPacks) {
  const pack    = PACKS[packName];
  const packDir = join(PKG_OUT, `must-b-pack-${packName}`);
  const extOut  = join(packDir, "extensions");

  console.log(`${c.orange(c.bold(`\n  Pack: ${packName}`))}`);
  console.log(c.dim(`  ${pack.description}\n`));

  rmSync(packDir, { recursive: true, force: true });
  mkdirSync(extOut, { recursive: true });

  const compiled  = [];
  const skipped   = [];
  const failed    = [];

  for (const extId of pack.extensions) {
    const srcDir  = join(EXT_SRC, extId);
    const entryTs = join(srcDir, "index.ts");
    const outDir  = join(extOut, extId);
    const outFile = join(outDir, "index.cjs");

    if (!existsSync(srcDir)) {
      console.log(`${WARN} ${extId}: source directory not found — skipping`);
      skipped.push(extId);
      continue;
    }

    const extPkg = readPkg(srcDir);
    if (!extPkg || !Array.isArray(extPkg["must-b"]?.extensions)) {
      console.log(`${WARN} ${extId}: no must-b.extensions manifest — skipping`);
      skipped.push(extId);
      continue;
    }

    if (!existsSync(entryTs)) {
      console.log(`${WARN} ${extId}: index.ts not found — skipping`);
      skipped.push(extId);
      continue;
    }

    mkdirSync(outDir, { recursive: true });

    // Collect deps from the extension's package.json for external list
    const extDeps = Object.keys(extPkg.dependencies ?? {});

    const flags = [
      `"${entryTs}"`,
      "--bundle",
      "--platform=node",
      "--target=node20",
      "--format=cjs",
      `--outfile="${outFile}"`,
      "--packages=external",
      // Alias must-b/plugin-sdk/* → local source tree (avoids INVALID_PACKAGE_TARGET).
      // MUST be a relative path: absolute "C:\..." paths break Windows shell parsing.
      `--alias:must-b/plugin-sdk=${SDK_ALIAS_REL}`,
      "--log-level=error",
      ...NODE_BUILTINS.map(m => `--external:${m}`),
      ...NODE_BUILTINS.map(m => `--external:node:${m}`),
      // Make the extension's own deps external (they'll be installed alongside the pack)
      ...extDeps.map(d => `--external:${d}`),
    ].join(" ");

    process.stdout.write(c.dim(`  bundling ${extId}…`));
    const ok = tryRun(`"${ESBUILD}" ${flags}`);

    if (ok && existsSync(outFile)) {
      process.stdout.write(`\r${OK} ${extId.padEnd(30)} ${c.dim("→ extensions/" + extId + "/index.cjs")}\n`);
      compiled.push(extId);

      // Write per-extension package.json inside the pack
      writeFileSync(join(outDir, "package.json"), JSON.stringify({
        name:        `@must-b/pack-${packName}-ext-${extId}`,
        version:     VERSION,
        description: extPkg.description ?? `${extId} extension (bundled in @must-b/pack-${packName})`,
        main:        "index.cjs",
        private:     true,
      }, null, 2));
    } else {
      process.stdout.write(`\r${WARN} ${extId.padEnd(30)} ${c.dim("bundle failed — metadata only")}\n`);
      failed.push(extId);
    }
  }

  // ── Pack-level index.cjs ───────────────────────────────────────────────────
  const requireLines = compiled.map(id =>
    `try { require('./extensions/${id}/index.cjs'); } catch(e) { console.warn('[pack-${packName}] ${id} load error:', e.message); }`
  );

  const indexCjs = [
    `'use strict';`,
    `// @must-b/pack-${packName} — auto-generated by scripts/build-packs.mjs`,
    `// Extensions: ${compiled.join(", ") || "none compiled"}`,
    ``,
    ...requireLines,
    ``,
    `module.exports = { packName: '${packName}', extensions: ${JSON.stringify(compiled)} };`,
  ].join("\n");

  writeFileSync(join(packDir, "index.cjs"), indexCjs);

  // ── Pack package.json ──────────────────────────────────────────────────────
  // Collect deps from all compiled extension package.jsons
  const allDeps = {};
  for (const extId of compiled) {
    const extPkg = readPkg(join(EXT_SRC, extId));
    Object.assign(allDeps, extPkg?.dependencies ?? {});
  }

  const packPkg = {
    name:        `@must-b/pack-${packName}`,
    version:     VERSION,
    description: pack.description,
    license:     "UNLICENSED",
    author:      "Must-b Inc.",
    homepage:    "https://must-b.com",
    keywords:    ["must-b", "extension-pack", packName, ...pack.keywords],
    main:        "index.cjs",
    "must-b": {
      pack:       packName,
      extensions: compiled,
      allExtensions: pack.extensions,
    },
    dependencies: allDeps,
    engines: { node: ">=20.0.0" },
  };

  writeFileSync(join(packDir, "package.json"), JSON.stringify(packPkg, null, 2));

  // ── Summary for this pack ──────────────────────────────────────────────────
  console.log(`\n  ${c.bold("Results:")}`);
  console.log(`    ${c.green("compiled:")} ${compiled.length}  ${c.yellow("skipped:")} ${skipped.length}  ${c.red("failed:")} ${failed.length}`);
  console.log(`    ${c.dim("output:")} dist/packs/must-b-pack-${packName}/`);

  if (pack.extensions.length === 0) {
    console.log(`    ${WARN} No extensions defined for '${packName}' — placeholder pack created.`);
  } else if (compiled.length === 0) {
    console.log(`    ${WARN} No extensions bundled. Pack manifest created (publish when sources are ready).`);
  }

  // ── Dual-publish (opt-in via --publish-all) ────────────────────────────────
  if (PUBLISH_ALL) {
    console.log(`\n  ${c.orange(c.bold("Publishing pack-" + packName + "…"))}`);
    dualPublishPack(packName, packDir, VERSION);
  }

  summary.push({ packName, compiled: compiled.length, skipped: skipped.length, failed: failed.length, total: pack.extensions.length });
}

// ── Final summary ─────────────────────────────────────────────────────────────
console.log(`\n${c.dim("  " + "─".repeat(54))}`);
console.log(`  ${c.orange(c.bold("Pack Build Summary"))}\n`);
for (const s of summary) {
  const ratio   = s.total > 0 ? `${s.compiled}/${s.total}` : "placeholder";
  const status  = s.compiled === s.total && s.total > 0
    ? c.green(ratio)
    : s.compiled > 0 ? c.yellow(ratio) : c.dim(ratio);
  console.log(`  @must-b/pack-${s.packName.padEnd(12)} ${status} ${c.dim("extensions bundled")}`);
}
console.log(`\n  ${c.dim("Publish: cd dist/packs/must-b-pack-<name> && npm publish --access public")}\n`);
