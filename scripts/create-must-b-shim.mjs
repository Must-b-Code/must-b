/**
 * Recreates node_modules/must-b/ after every npm install.
 * The must-b package shim maps ./plugin-sdk/* to the internal TypeScript
 * source tree so that channel extensions can import from "must-b/plugin-sdk/*"
 * without a separate published npm package.
 *
 * Global installs (npm install -g) run postinstall with elevated file-system
 * restrictions — writing to node_modules may be denied with EACCES or EPERM.
 * The shim is best-effort: a permission failure is logged as a warning and the
 * install continues cleanly. Channel extensions will not load without the shim,
 * but all core Must-b features remain fully operational.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root   = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shimDir = path.join(root, 'node_modules', 'must-b');

const shimPkg = JSON.stringify({
  name: 'must-b',
  version: '1.0.0',
  exports: {
    './plugin-sdk/*': '../../src/core/source/plugin-sdk/*.ts',
  },
}, null, 2);

try {
  fs.mkdirSync(shimDir, { recursive: true });
  fs.writeFileSync(path.join(shimDir, 'package.json'), shimPkg);
  console.log('[postinstall] must-b plugin-sdk shim written →', shimDir);
} catch (err) {
  const code = err && err.code;
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
    console.warn(
      '[postinstall] WARNING: Could not write must-b shim to node_modules ' +
      `(${code} — likely a global npm install with strict permissions).\n` +
      '  Channel extensions may not load. All core Must-b features are unaffected.\n' +
      '  To enable extensions, run: npm install --prefix <your-project-dir>'
    );
  } else {
    // Unexpected error — surface it but still don't crash the install
    console.warn('[postinstall] WARNING: must-b shim creation failed:', err && err.message || err);
  }
}
