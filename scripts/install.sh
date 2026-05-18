#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────────────
#  Must-b Installer — Linux / macOS
#  Usage:   curl -fsSL https://must-b.com/install.sh | bash
#           — or —
#           bash scripts/install.sh
# ────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="https://github.com/aytac43-0/Must-b"
INSTALL_DIR="$HOME/.must-b"
NODE_MIN_MAJOR=20
BOLD="\033[1m"
ORANGE="\033[38;5;208m"
GREEN="\033[0;32m"
RED="\033[0;31m"
RESET="\033[0m"

header() { echo -e "\n${ORANGE}${BOLD}▸ $*${RESET}"; }
ok()     { echo -e "  ${GREEN}✓${RESET} $*"; }
fail()   { echo -e "  ${RED}✗ $*${RESET}"; exit 1; }

echo -e "\n${ORANGE}${BOLD}"
cat <<'BANNER'
  __  __           _          _
 |  \/  |_   _ ___| |_       | |__
 | |\/| | | | / __| __|  __  | '_ \
 | |  | | |_| \__ \ |_  /  \ | |_) |
 |_|  |_|\__,_|___/\__| \__/ |_.__/
           Autonomous AI Platform
BANNER
echo -e "${RESET}"

# ── Prerequisites ─────────────────────────────────────────────────────────
header "Checking prerequisites…"

# Node.js
if ! command -v node &>/dev/null; then
  fail "Node.js not found. Install Node.js ${NODE_MIN_MAJOR}+ from https://nodejs.org and re-run."
fi
NODE_MAJOR=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")
if [ "$NODE_MAJOR" -lt "$NODE_MIN_MAJOR" ]; then
  fail "Node.js ${NODE_MIN_MAJOR}+ required (found v${NODE_MAJOR}). Please upgrade."
fi
ok "Node.js $(node --version)"

# Git
if ! command -v git &>/dev/null; then
  fail "git not found. Please install git and re-run."
fi
ok "git $(git --version | awk '{print $3}')"

# npm
if ! command -v npm &>/dev/null; then
  fail "npm not found."
fi
ok "npm $(npm --version)"

# ── Clone / update ────────────────────────────────────────────────────────
header "Installing Must-b to ${INSTALL_DIR}…"

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "  Existing installation found — pulling latest…"
  git -C "$INSTALL_DIR" pull --ff-only
else
  git clone --depth 1 "$REPO" "$INSTALL_DIR"
fi
ok "Repository ready"

# ── Install dependencies ──────────────────────────────────────────────────
header "Installing backend dependencies…"
cd "$INSTALL_DIR"
npm install --prefer-offline --omit=dev
ok "Backend dependencies installed"

header "Installing frontend dependencies…"
cd "$INSTALL_DIR/public/must-b-ui"
npm install --prefer-offline --omit=dev
ok "Frontend dependencies installed"

# ── Create launcher ───────────────────────────────────────────────────────
header "Creating launcher…"
LAUNCHER="$HOME/.local/bin/must-b"
mkdir -p "$(dirname "$LAUNCHER")"

cat > "$LAUNCHER" <<EOF
#!/usr/bin/env bash
cd "$INSTALL_DIR"
exec node --experimental-specifier-resolution=node dist/index.js "\$@"
EOF
chmod +x "$LAUNCHER"

# Add ~/.local/bin to PATH hint
SHELL_RC=""
case "$SHELL" in
  */zsh)  SHELL_RC="$HOME/.zshrc" ;;
  */bash) SHELL_RC="$HOME/.bashrc" ;;
esac
if [ -n "$SHELL_RC" ] && ! grep -q '.local/bin' "$SHELL_RC" 2>/dev/null; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
  echo "  Added ~/.local/bin to PATH in ${SHELL_RC}"
fi
ok "Launcher created at ${LAUNCHER}"

# ── Done ─────────────────────────────────────────────────────────────────
echo -e "\n${GREEN}${BOLD}Must-b installed successfully!${RESET}\n"
echo "  Start the gateway:   must-b"
echo "  Open in browser:     http://localhost:4309"
echo "  Run setup wizard:    must-b onboard"
echo ""
echo "  Tip: restart your terminal (or run: source ${SHELL_RC:-~/.bashrc})"
echo ""
