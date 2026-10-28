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
for pkg in git nodejs-lts npm cloudflared termux-api procps coreutils; do
  if ! command -v $pkg >/dev/null 2>&1; then
    NEEDED_PKGS+=($pkg)
  fi
done

if [ \${#NEEDED_PKGS[@]} -gt 0 ]; then
  echo -e "      Installing required packages: \\033[1;33m\${NEEDED_PKGS[*]}\\033[0m..."
  pkg update -y >/dev/null 2>&1 || true
  if ! pkg install -y "\${NEEDED_PKGS[@]}" >/dev/null 2>&1; then
    echo -e "      \\033[1;31m✗ Termux could not install one or more required packages. Run 'pkg update && pkg upgrade' and retry.\\033[0m"
    exit 1
  fi
  echo -e "      \\033[1;32m✓ Dependencies installed successfully.\\033[0m"
else
  echo -e "      \\033[1;32m✓ All dependencies ready.\\033[0m"
fi

# command -v can find a stale node binary whose Android linker dependencies
# are broken (common after restoring an old Termux package state). Reinstall
# Node/npm through Termux so the executable and its shared libraries match.
if ! node --version >/dev/null 2>&1 || ! npm --version >/dev/null 2>&1; then
  echo -e "      \\033[1;33m⚠ Node/npm is present but cannot run; repairing Termux Node packages...\\033[0m"
  pkg update -y >/dev/null 2>&1 || true
  if ! apt-get install -y --reinstall nodejs-lts npm; then
    echo -e "      \\033[1;31m✗ Node could not be repaired. In Termux run 'pkg update && pkg upgrade -y && pkg reinstall nodejs-lts npm', then rerun this command.\\033[0m"
    exit 1
  fi
fi
if ! node --version >/dev/null 2>&1 || ! npm --version >/dev/null 2>&1; then
  echo -e "      \\033[1;31m✗ Termux Node/npm still cannot start. Update Termux packages and retry the 1-click command.\\033[0m"
  exit 1
fi

# 2. Clone or update repository
echo -e "\\n\\033[1;34m[2/3]\\033[0m 📥 Syncing PebbleAFK engine..."
cd "$HOME"
if [ -d "PebbleAFK/.git" ]; then
  cd PebbleAFK
  if timeout 12s git -c http.lowSpeedLimit=1024 -c http.lowSpeedTime=8 fetch --prune origin main >/dev/null 2>&1; then
    LOCAL_HEAD=$(git rev-parse HEAD 2>/dev/null || true)
    REMOTE_HEAD=$(git rev-parse FETCH_HEAD 2>/dev/null || true)
    if [ -n "$LOCAL_HEAD" ] && [ -n "$REMOTE_HEAD" ] && [ "$LOCAL_HEAD" != "$REMOTE_HEAD" ]; then
      if git merge-base --is-ancestor "$LOCAL_HEAD" "$REMOTE_HEAD"; then
        TRACKED_EDITS=$(git status --porcelain --untracked-files=no 2>/dev/null || true)
        if [ -n "$TRACKED_EDITS" ]; then
          if git stash push -m "PebbleAFK pre-installer update tracked edits $(date +%s)" >/dev/null 2>&1 && [ -z "$(git status --porcelain --untracked-files=no 2>/dev/null)" ]; then
            echo -e "      \\033[1;33m✓ Preserved tracked device edits in a recoverable Git stash.\\033[0m"
          else
            echo -e "      \\033[1;33m⚠ Could not safely preserve local edits; leaving this checkout unchanged.\\033[0m"
            LOCAL_HEAD="$REMOTE_HEAD"
          fi
        fi
        if [ "$LOCAL_HEAD" != "$REMOTE_HEAD" ] && git merge --ff-only "$REMOTE_HEAD" >/dev/null 2>&1; then
          echo -e "      \\033[1;32m✓ Updated to latest version.\\033[0m"
        elif [ "$LOCAL_HEAD" != "$REMOTE_HEAD" ]; then
          echo -e "      \\033[1;33m⚠ Fast-forward sync failed safely; continuing with the installed version.\\033[0m"
        fi
      else
        echo -e "      \\033[1;33m⚠ Local commits are not on GitHub main; leaving this checkout unchanged.\\033[0m"
      fi
    else
      echo -e "      \\033[1;32m✓ Already at the latest version.\\033[0m"
    fi
  else
    echo -e "      \\033[1;33m⚠ Quick sync was unavailable; continuing with the installed version (use Update Engine after startup).\\033[0m"
  fi
else
  rm -rf PebbleAFK 2>/dev/null || true
  git clone https://github.com/codexvista-debug/PebbleAFK.git >/dev/null 2>&1 || true
  cd PebbleAFK
  echo -e "      \\033[1;32m✓ Cloned successfully.\\033[0m"
fi

# 3. Install or synchronize packages when the dependency lock changes.
cd daemon
LOCAL_DEPS_HASH=$(node -e 'const fs=require("fs"),crypto=require("crypto"); process.stdout.write(crypto.createHash("sha256").update(fs.readFileSync("package.json")).update(fs.readFileSync("package-lock.json")).digest("hex"))' 2>/dev/null || true)
INSTALLED_DEPS_HASH=$(cat .pebbleafk-deps.sha256 2>/dev/null || true)
if [ ! -d "node_modules" ] || [ ! -d "node_modules/bedrock-protocol" ] || [ -z "$LOCAL_DEPS_HASH" ] || [ "$LOCAL_DEPS_HASH" != "$INSTALLED_DEPS_HASH" ]; then
  echo -e "\\n\\033[1;34m[3/3]\\033[0m ⚙️  Installing Node modules..."
  if ! npm install --ignore-scripts --no-audit --no-fund >/dev/null 2>&1; then
    echo -e "      \\033[1;33m⚠ Fast dependency install failed; retrying with standard npm settings.\\033[0m"
    if ! npm install --ignore-scripts; then
      echo -e "      \\033[1;31m✗ Dependencies could not be updated. The existing daemon was left running.\\033[0m"
      exit 1
    fi
  fi
  node ./scripts/patch-mobile-raknet.cjs >/dev/null 2>&1 || true
  LOCAL_DEPS_HASH=$(node -e 'const fs=require("fs"),crypto=require("crypto"); process.stdout.write(crypto.createHash("sha256").update(fs.readFileSync("package.json")).update(fs.readFileSync("package-lock.json")).digest("hex"))')
  printf '%s\\n' "$LOCAL_DEPS_HASH" > .pebbleafk-deps.sha256
  echo -e "      \\033[1;32m✓ Modules configured successfully.\\033[0m"
else
  node ./scripts/patch-mobile-raknet.cjs >/dev/null 2>&1 || true
  echo -e "\\n\\033[1;34m[3/3]\\033[0m ⚙️  Modules verified."
fi

# 4. Stop only legacy PebbleAFK processes from this daemon directory.
# Scope migration cleanup to this checkout and known commands; never kill
# unrelated cloudflared/Node processes or every listener on port 8080.
stop_legacy_pebbleafk() {
  local daemon_path proc pid proc_cwd proc_cmd
  daemon_path=$(pwd -P)
  for proc in /proc/[0-9]*; do
    [ -r "$proc/cmdline" ] || continue
    pid=\${proc##*/}
    [ "$pid" = "$$" ] && continue
    [ "$pid" = "$PPID" ] && continue
    proc_cwd=$(readlink "$proc/cwd" 2>/dev/null || true)
    [ "$proc_cwd" = "$daemon_path" ] || continue
    proc_cmd=$(tr '\0' ' ' < "$proc/cmdline" 2>/dev/null || true)
    case "$proc_cmd" in
      *"start.sh"*|*"npm run start"*|*"tsx src/index.ts"*|*"node_modules/.bin/tsx"*|*"cloudflared tunnel"*|*"tail -f daemon.log"*)
        echo "      Stopping legacy PebbleAFK process $pid ($proc_cmd)"
        kill -KILL "$pid" 2>/dev/null || true
        ;;
    esac
  done
}
stop_legacy_pebbleafk
sleep 1

# 5. Run the daemon supervisor in this Termux session.
# Keeping the supervisor in the foreground preserves its wake lock and live log
# stream, and lets Ctrl+C reach start.sh's graceful cleanup handler.
chmod +x start.sh 2>/dev/null || true
echo -e "\\n      \\033[1;32m✓ Starting PebbleAFK in this Termux session. Keep Termux running to retain the wake lock and live chat/log stream.\\033[0m"
exec bash start.sh "$1" "$2"
`;

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
