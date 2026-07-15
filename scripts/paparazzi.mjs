/**
 * paparazzi.mjs — Must-b UI Screenshot Utility
 *
 * Usage: node scripts/paparazzi.mjs
 *
 * Requires Must-b to be running on localhost:4309.
 * Saves screenshots to screenshots/<route_name>.png (git + npm ignored).
 */

import { chromium }      from 'playwright';
import fs                from 'fs';
import path              from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const OUT_DIR   = path.join(ROOT, 'screenshots');
const BASE_URL  = 'http://localhost:4309';

const ROUTES = [
  { name: 'browser',     path: '/app/browser'     },
  { name: 'automations', path: '/app/automations'  },
  { name: 'skills',      path: '/app/skills'       },
  { name: 'plugins',     path: '/app/plugins'      },
  { name: 'files',       path: '/app/files'        },
  { name: 'memory',      path: '/app/memory'       },
  { name: 'settings',    path: '/app/settings'     },
  { name: 'keys',        path: '/app/settings'     },  // settings hosts API keys
];

// ── Wait for server ──────────────────────────────────────────────────────────
async function waitForServer(timeoutMs = 20_000) {
  const start = Date.now();
  process.stdout.write(`  Waiting for ${BASE_URL} `);
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE_URL}/api/setup/status`, { signal: AbortSignal.timeout(1200) });
      if (r.status < 500) { process.stdout.write(' ready!\n'); return; }
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 400));
    process.stdout.write('.');
  }
  process.stdout.write('\n');
  throw new Error(`Server not responding after ${timeoutMs}ms — start Must-b first.`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n  Must-b Paparazzi\n  ─────────────────────────');

  await waitForServer();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport:          { width: 1440, height: 900 },
    colorScheme:       'dark',
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // Dismiss any JS alerts automatically
  page.on('dialog', d => d.dismiss().catch(() => {}));

  let ok = 0, fail = 0;

  for (const route of ROUTES) {
    const url     = BASE_URL + route.path;
    const outFile = path.join(OUT_DIR, `${route.name}.png`);
    process.stdout.write(`  → ${(route.path).padEnd(24)}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 25_000 });
      // Extra settle for animations and deferred fetches
      await page.waitForTimeout(1800);
      await page.screenshot({ path: outFile, fullPage: false });
      process.stdout.write(` ✓  screenshots/${route.name}.png\n`);
      ok++;
    } catch (e) {
      process.stdout.write(` ✗  ${String(e.message).split('\n')[0]}\n`);
      fail++;
    }
  }

  await browser.close();

  console.log(`\n  ─────────────────────────`);
  console.log(`  Done — ${ok} captured, ${fail} failed.`);
  if (ok > 0) console.log(`  Folder: ${OUT_DIR}`);
  console.log();
}

main().catch(err => { console.error('\n  Error:', err.message); process.exit(1); });
