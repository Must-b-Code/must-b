#Requires -Version 5.1
<#
.SYNOPSIS
    Must-b Installer for Windows (PowerShell)
.DESCRIPTION
    Downloads and installs Must-b — the Autonomous AI Platform.
    Usage: iex (irm https://must-b.com/install.ps1)
           — or —
           pwsh scripts/install.ps1
#>

$ErrorActionPreference = "Stop"

$REPO       = "https://github.com/aytac43-0/Must-b"
$INSTALL_DIR = Join-Path $env:USERPROFILE ".must-b"
$NODE_MIN    = 20

# ── UI helpers ───────────────────────────────────────────────────────────
function Header($msg) { Write-Host "`n  $msg" -ForegroundColor DarkYellow }
function Ok($msg)     { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Fail($msg)   { Write-Host "  [ERROR] $msg" -ForegroundColor Red; exit 1 }

Write-Host @"

  __  __           _          _
 |  \/  |_   _ ___| |_       | |__
 | |\/| | | | / __| __|  __  | '_ \
 | |  | | |_| \__ \ |_  /  \ | |_) |
 |_|  |_|\__,_|___/\__| \__/ |_.__/
           Autonomous AI Platform

"@ -ForegroundColor DarkYellow

# ── Prerequisites ─────────────────────────────────────────────────────────
Header "Checking prerequisites..."

# Node.js
$nodePath = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodePath) {
    Fail "Node.js not found. Install Node.js $NODE_MIN+ from https://nodejs.org and re-run."
}
$nodeVersion = (node -e "process.stdout.write(process.version.slice(1))").Trim()
$nodeMajor   = [int]($nodeVersion.Split(".")[0])
if ($nodeMajor -lt $NODE_MIN) {
    Fail "Node.js $NODE_MIN+ required (found v$nodeVersion). Please upgrade."
}
Ok "Node.js v$nodeVersion"

# Git
$gitPath = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitPath) {
    Fail "git not found. Install Git from https://git-scm.com and re-run."
}
Ok "git $(git --version)"

# npm
$npmPath = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmPath) { Fail "npm not found." }
Ok "npm $(npm --version)"

# ── Clone / update ────────────────────────────────────────────────────────
Header "Installing Must-b to $INSTALL_DIR..."

if (Test-Path (Join-Path $INSTALL_DIR ".git")) {
    Write-Host "  Existing installation found — pulling latest..."
    git -C $INSTALL_DIR pull --ff-only
} else {
    git clone --depth 1 $REPO $INSTALL_DIR
}
Ok "Repository ready"

# ── Install dependencies ──────────────────────────────────────────────────
Header "Installing backend dependencies..."
Set-Location $INSTALL_DIR
npm install --prefer-offline --omit=dev
Ok "Backend dependencies installed"

Header "Installing frontend dependencies..."
Set-Location (Join-Path $INSTALL_DIR "public\must-b-ui")
npm install --prefer-offline --omit=dev
Ok "Frontend dependencies installed"

# ── Create launcher (must-b.cmd) ──────────────────────────────────────────
Header "Creating launcher..."
$binDir   = Join-Path $env:USERPROFILE "AppData\Local\Programs\must-b\bin"
$launcher = Join-Path $binDir "must-b.cmd"
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

@"
@echo off
cd /d "$INSTALL_DIR"
node --experimental-specifier-resolution=node dist/index.js %*
"@ | Set-Content $launcher -Encoding ASCII

# Add to user PATH if not already present
$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($userPath -notlike "*$binDir*") {
    [Environment]::SetEnvironmentVariable("PATH", "$userPath;$binDir", "User")
    Write-Host "  Added $binDir to user PATH"
}
Ok "Launcher created at $launcher"

# ── Done ─────────────────────────────────────────────────────────────────
Set-Location $INSTALL_DIR
Write-Host ""
Write-Host "  Must-b installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "  Start the gateway:   must-b"
Write-Host "  Open in browser:     http://localhost:4309"
Write-Host "  Run setup wizard:    must-b onboard"
Write-Host ""
Write-Host "  Tip: restart your terminal for the PATH change to take effect."
Write-Host ""
