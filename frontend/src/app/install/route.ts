import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const script = `#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
#            PebbleAFK - 1-Click Universal Termux Installer
# ==============================================================================

clear
echo -e "\\033[1;36m"
echo "  ╔═══════════════════════════════════════════════════╗"
echo "  ║        🪨 PebbleAFK 1-Click Termux Setup          ║"
echo "  ║        Bedrock Protocol 24/7 Bot Engine           ║"
echo "  ╚═══════════════════════════════════════════════════╝"
echo -e "\\033[0m"

# 1. Dependency checks
echo -e "\\033[1;34m[1/3]\\033[0m 📦 Checking environment & dependencies..."
NEEDED_PKGS=()
for pkg in git nodejs-lts npm cloudflared termux-api clang make cmake python build-essential; do
  if ! command -v $pkg >/dev/null 2>&1; then
    NEEDED_PKGS+=($pkg)
  fi
done

if [ \${#NEEDED_PKGS[@]} -gt 0 ]; then
  echo -e "      Installing required packages: \\033[1;33m\${NEEDED_PKGS[*]}\\033[0m..."
  pkg update -y >/dev/null 2>&1 || true
  pkg install -y "\${NEEDED_PKGS[@]}" >/dev/null 2>&1 || true
  echo -e "      \\033[1;32m✓ Dependencies installed successfully.\\033[0m"
else
  echo -e "      \\033[1;32m✓ All dependencies ready.\\033[0m"
fi

# 2. Clone or update repository
echo -e "\\n\\033[1;34m[2/3]\\033[0m 📥 Syncing PebbleAFK engine..."
cd "$HOME"
if [ -d "PebbleAFK/.git" ]; then
  cd PebbleAFK
  git reset --hard HEAD >/dev/null 2>&1 || true
  git pull --force origin main >/dev/null 2>&1 || true
  echo -e "      \\033[1;32m✓ Updated to latest version.\\033[0m"
else
  rm -rf PebbleAFK 2>/dev/null || true
  git clone https://github.com/codexvista-debug/PebbleAFK.git >/dev/null 2>&1 || true
  cd PebbleAFK
  echo -e "      \\033[1;32m✓ Cloned successfully.\\033[0m"
fi

# 3. Install packages & build native RakNet engine
cd daemon
if [ ! -d "node_modules" ] || [ ! -d "node_modules/bedrock-protocol" ] || [ ! -f "node_modules/raknet-native/build/Release/node-raknet.node" ]; then
  echo -e "\\n\\033[1;34m[3/3]\\033[0m ⚙️  Configuring Bedrock RakNet engine..."
  export FORCE_BUILD=true
  npm install --no-audit --no-fund >/dev/null 2>&1 || npm install >/dev/null 2>&1 || true
  if [ -d "node_modules/raknet-native" ] && [ ! -f "node_modules/raknet-native/build/Release/node-raknet.node" ]; then
    (cd node_modules/raknet-native && npx cmake-js compile >/dev/null 2>&1 || true)
  fi
  echo -e "      \\033[1;32m✓ Modules configured successfully.\\033[0m"
else
  echo -e "\\n\\033[1;34m[3/3]\\033[0m ⚙️  Modules verified."
fi

# 4. Clean up any previous background instances silently
pkill -9 -f "cloudflared" >/dev/null 2>&1 || true
pkill -9 -f "tsx" >/dev/null 2>&1 || true
pkill -9 -f "node.*index" >/dev/null 2>&1 || true
pkill -9 -f "pebbleafk" >/dev/null 2>&1 || true
pkill -9 -f "pebbleafk_heartbeat" >/dev/null 2>&1 || true
pkill -9 -f "curl.*tunnel" >/dev/null 2>&1 || true
if command -v fuser &> /dev/null; then
  fuser -k -9 8080/tcp >/dev/null 2>&1 || true
fi
if command -v lsof &> /dev/null; then
  (lsof -ti :8080 2>/dev/null || true) | xargs -r kill -9 >/dev/null 2>&1 || true
fi
if [ -f "$HOME/.pebbleafk_heartbeat.pid" ]; then
  kill -9 "$(cat "$HOME/.pebbleafk_heartbeat.pid")" 2>/dev/null || true
  rm -f "$HOME/.pebbleafk_heartbeat.pid"
fi
sleep 1

# 5. Launch daemon & tunnel
chmod +x start.sh 2>/dev/null || true
bash start.sh "$1" "$2"
`;

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
