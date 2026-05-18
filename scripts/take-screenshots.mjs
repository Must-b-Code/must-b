/**
 * take-screenshots.mjs — Must-b local screenshot utility
 *
 * Usage: node scripts/take-screenshots.mjs
 *
 * Requires the Must-b server to be running on localhost:4309.
 * Saves PNG files to local_screenshots/ (git + npm ignored).
 */

import { chromium } from 'playwright';
import fs            from 'fs';
import path          from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const OUT_DIR    = path.join(ROOT, 'local_screenshots');
const BASE_URL   = 'http://localhost:4309';
const WAIT_MS    = 2000;   // extra settle time after networkidle

const ROUTES = [
  { name: 'dashboard',   path: '/app' },
  { name: 'automations', path: '/app/automations' },
  { name: 'skills',      path: '/app/skills' },
  { name: 'plugins',     path: '/app/plugins' },
  { name: 'files',       path: '/app/files' },
  { name: 'settings',    path: '/app/settings' },
  { name: 'memory',      path: '/app/memory' },
  { name: 'browser',     path: '/app/browser' },
];

// ── Preflight: ensure server is reachable ────────────────────────────────────
async function waitForServer(timeoutMs = 15_000) {
  const start = Date.now();
  process.stdout.write('  Waiting for server at ' + BASE_URL + ' …');
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/api/setup/status`, { signal: AbortSignal.timeout(1000) });
      if (res.status < 500) { process.stdout.write(' ready!\n'); return; }
    } catch { /* not ready */ }
    await new Promise(r => setTimeout(r, 400));
    process.stdout.write('.');
  }
  process.stdout.write('\n');
  throw new Error('Server did not respond within ' + timeoutMs + 'ms — is "must-b" running?');
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n  Must-b Screenshot Tool\n  ─────────────────────');

  await waitForServer();

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport:        { width: 1440, height: 900 },
    colorScheme:     'dark',
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  let ok = 0;
  let fail = 0;

  for (const route of ROUTES) {
    const url    = BASE_URL + route.path;
    const outFile = path.join(OUT_DIR, `${route.name}.png`);
    process.stdout.write(`  → ${route.path.padEnd(22)}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
      // Extra settle for animations / deferred data fetches
      await page.waitForTimeout(WAIT_MS);
      await page.screenshot({ path: outFile, fullPage: false });
      process.stdout.write(` ✓  saved: local_screenshots/${route.name}.png\n`);
      ok++;
    } catch (e) {
      process.stdout.write(` ✗  ${e.message.split('\n')[0]}\n`);
      fail++;
    }
  }

  await browser.close();

  console.log(`\n  ─────────────────────`);
  console.log(`  Done — ${ok} captured, ${fail} failed.`);
  console.log(`  Screenshots saved to: ${OUT_DIR}\n`);
}

main().catch(err => { console.error('\n  Error:', err.message); process.exit(1); });
