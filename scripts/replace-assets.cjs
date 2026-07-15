#!/usr/bin/env node
/**
 * Must-b Asset Replacement — Windows PowerShell GDI+ edition
 * ─────────────────────────────────────────────────────────────────────────
 * Zero npm dependencies. Uses Windows' built-in System.Drawing (GDI+)
 * via PowerShell to resize and copy the mascot image to every target.
 *
 * Usage:
 *   node scripts/replace-assets.cjs "<path-to-image.png>"
 * ─────────────────────────────────────────────────────────────────────────
 */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

const src = process.argv[2];
if (!src) {
  console.error('\n  Usage: node scripts/replace-assets.cjs "<path-to-image.png>"\n');
  process.exit(1);
}
if (!fs.existsSync(src)) {
  console.error(`\n  File not found: ${src}\n`);
  process.exit(1);
}

const root   = path.resolve(__dirname, '..');
const srcAbs = path.resolve(src);

const cyan  = s => `\x1b[38;2;0;204;255m${s}\x1b[0m`;
const green = s => `\x1b[32m${s}\x1b[0m`;
const red   = s => `\x1b[31m${s}\x1b[0m`;
const dim   = s => `\x1b[2m${s}\x1b[0m`;

// ── Target list ────────────────────────────────────────────────────────────
const TARGETS = [
  // Web app
  { file: 'public/Luma/public/logo.png',              w: 512,  h: 512  },
  { file: 'public/Luma/public/apple-touch-icon.png',  w: 180,  h: 180  },
  { file: 'public/Luma/public/favicon-96x96.png',     w: 96,   h: 96   },
  { file: 'public/Luma/public/favicon-48x48.png',     w: 48,   h: 48   },
  { file: 'public/Luma/public/favicon-32x32.png',     w: 32,   h: 32   },
  // macOS
  { file: 'apps/macos/Icon.icon/Assets/must-b-mac.png', w: 1024, h: 1024 },
  // Android
  { file: 'apps/android/app/src/main/res/mipmap-mdpi/ic_launcher.png',            w: 48,  h: 48  },
  { file: 'apps/android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png', w: 48,  h: 48  },
  { file: 'apps/android/app/src/main/res/mipmap-hdpi/ic_launcher.png',            w: 72,  h: 72  },
  { file: 'apps/android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png', w: 72,  h: 72  },
  { file: 'apps/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png',           w: 96,  h: 96  },
  { file: 'apps/android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png',w: 96,  h: 96  },
  { file: 'apps/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png',          w: 144, h: 144 },
  { file: 'apps/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png',w:144, h: 144 },
  { file: 'apps/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png',         w: 192, h: 192 },
  { file: 'apps/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png',w:192,h: 192 },
  // iOS app icons
  { file: 'apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/29.png',   w: 29,   h: 29   },
  { file: 'apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/40.png',   w: 40,   h: 40   },
  { file: 'apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/48.png',   w: 48,   h: 48   },
  { file: 'apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/55.png',   w: 55,   h: 55   },
  { file: 'apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/57.png',   w: 57,   h: 57   },
  { file: 'apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/58.png',   w: 58,   h: 58   },
  { file: 'apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/60.png',   w: 60,   h: 60   },
  { file: 'apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/66.png',   w: 66,   h: 66   },
  { file: 'apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/80.png',   w: 80,   h: 80   },
  { file: 'apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/87.png',   w: 87,   h: 87   },
  { file: 'apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/88.png',   w: 88,   h: 88   },
  { file: 'apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/92.png',   w: 92,   h: 92   },
  { file: 'apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/100.png',  w: 100,  h: 100  },
  { file: 'apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/102.png',  w: 102,  h: 102  },
  { file: 'apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/108.png',  w: 108,  h: 108  },
  { file: 'apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/114.png',  w: 114,  h: 114  },
  { file: 'apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/120.png',  w: 120,  h: 120  },
  { file: 'apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/172.png',  w: 172,  h: 172  },
  { file: 'apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/180.png',  w: 180,  h: 180  },
  { file: 'apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/196.png',  w: 196,  h: 196  },
  { file: 'apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/216.png',  w: 216,  h: 216  },
  { file: 'apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/234.png',  w: 234,  h: 234  },
  { file: 'apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/258.png',  w: 258,  h: 258  },
  { file: 'apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/1024.png', w: 1024, h: 1024 },
  // iOS Watch
  { file: 'apps/ios/WatchApp/Assets.xcassets/AppIcon.appiconset/watch-app-38@2x.png',          w: 76,   h: 76   },
  { file: 'apps/ios/WatchApp/Assets.xcassets/AppIcon.appiconset/watch-app-40@2x.png',          w: 80,   h: 80   },
  { file: 'apps/ios/WatchApp/Assets.xcassets/AppIcon.appiconset/watch-app-41@2x.png',          w: 82,   h: 82   },
  { file: 'apps/ios/WatchApp/Assets.xcassets/AppIcon.appiconset/watch-app-44@2x.png',          w: 88,   h: 88   },
  { file: 'apps/ios/WatchApp/Assets.xcassets/AppIcon.appiconset/watch-app-45@2x.png',          w: 90,   h: 90   },
  { file: 'apps/ios/WatchApp/Assets.xcassets/AppIcon.appiconset/watch-companion-29@2x.png',    w: 58,   h: 58   },
  { file: 'apps/ios/WatchApp/Assets.xcassets/AppIcon.appiconset/watch-companion-29@3x.png',    w: 87,   h: 87   },
  { file: 'apps/ios/WatchApp/Assets.xcassets/AppIcon.appiconset/watch-marketing-1024.png',     w: 1024, h: 1024 },
  { file: 'apps/ios/WatchApp/Assets.xcassets/AppIcon.appiconset/watch-notification-38@2x.png', w: 48,   h: 48   },
  { file: 'apps/ios/WatchApp/Assets.xcassets/AppIcon.appiconset/watch-notification-42@2x.png', w: 48,   h: 48   },
  { file: 'apps/ios/WatchApp/Assets.xcassets/AppIcon.appiconset/watch-quicklook-38@2x.png',    w: 76,   h: 76   },
  { file: 'apps/ios/WatchApp/Assets.xcassets/AppIcon.appiconset/watch-quicklook-42@2x.png',    w: 84,   h: 84   },
  { file: 'apps/ios/WatchApp/Assets.xcassets/AppIcon.appiconset/watch-quicklook-44@2x.png',    w: 88,   h: 88   },
  { file: 'apps/ios/WatchApp/Assets.xcassets/AppIcon.appiconset/watch-quicklook-45@2x.png',    w: 90,   h: 90   },
  // Chrome extension
  { file: 'src/core/assets/chrome-extension/icons/icon16.png',  w: 16,  h: 16  },
  { file: 'src/core/assets/chrome-extension/icons/icon32.png',  w: 32,  h: 32  },
  { file: 'src/core/assets/chrome-extension/icons/icon48.png',  w: 48,  h: 48  },
  { file: 'src/core/assets/chrome-extension/icons/icon128.png', w: 128, h: 128 },
  // DMG backgrounds
  { file: 'src/core/assets/dmg-background.png',       w: 800, h: 600 },
  { file: 'src/core/assets/dmg-background-small.png', w: 400, h: 300 },
];

// ── PowerShell resize helper ───────────────────────────────────────────────
function resizeWithPowerShell(srcFile, destFile, w, h) {
  const ps = `
Add-Type -AssemblyName System.Drawing
$src = New-Object System.Drawing.Bitmap([string]'${srcFile.replace(/'/g, "''")}')
$dst = New-Object System.Drawing.Bitmap([int]${w}, [int]${h})
$g   = [System.Drawing.Graphics]::FromImage($dst)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.DrawImage($src, 0, 0, [int]${w}, [int]${h})
$g.Dispose()
$dst.Save([string]'${destFile.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
$src.Dispose()
$dst.Dispose()
`.trim();

  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command', ps
  ], { encoding: 'utf-8' });

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'PowerShell error').trim().slice(0, 200));
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
console.log('');
console.log(cyan('  Must-b — Red Panda Asset Replacement'));
console.log(cyan('  ─────────────────────────────────────────────'));
console.log(dim(`  Source : ${srcAbs}`));
console.log(dim(`  Engine : Windows PowerShell GDI+ (zero npm deps)`));
console.log('');

let ok = 0, skipped = 0, failed = 0;

for (const t of TARGETS) {
  const dest    = path.join(root, t.file);
  const destWin = dest.replace(/\//g, '\\');
  const srcWin  = srcAbs.replace(/\//g, '\\');

  if (!fs.existsSync(dest)) {
    skipped++;
    continue;
  }

  try {
    resizeWithPowerShell(srcWin, destWin, t.w, t.h);
    console.log(`  ${green('✓')}  ${t.file}  ${dim(`${t.w}×${t.h}`)}`);
    ok++;
  } catch (err) {
    console.log(`  ${red('✗')}  ${t.file}  ${dim(String(err.message).split('\n')[0])}`);
    failed++;
  }
}

// favicon.ico — copy 32×32 as PNG-encoded ico
const icoPath = path.join(root, 'public', 'Luma', 'public', 'favicon.ico');
if (fs.existsSync(icoPath)) {
  try {
    resizeWithPowerShell(
      srcAbs.replace(/\//g, '\\'),
      icoPath.replace(/\//g, '\\'),
      32, 32
    );
    console.log(`  ${green('✓')}  public/Luma/public/favicon.ico  ${dim('32×32')}`);
    ok++;
  } catch (err) {
    console.log(`  ${red('✗')}  favicon.ico  ${dim(String(err.message).split('\n')[0])}`);
    failed++;
  }
}

console.log('');
if (failed === 0) {
  console.log(green(`  ✔  Done!  ${ok} file(s) replaced with Red Panda mascot.`));
} else {
  console.log(`  ${green(ok + ' replaced')} · ${dim(skipped + ' skipped')} · ${red(failed + ' failed')}`);
}
console.log('');
