#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
#            PebbleAFK - 1-Click Universal Termux Installer
# ==============================================================================

clear
echo -e "\033[1;36m"
echo "  ╔═══════════════════════════════════════════════════╗"
echo "  ║        🪨 PebbleAFK 1-Click Termux Setup          ║"
echo "  ║        Bedrock Protocol 24/7 Bot Engine           ║"
echo "  ╚═══════════════════════════════════════════════════╝"
echo -e "\033[0m"

# 1. Dependency checks
echo -e "\033[1;34m[1/3]\033[0m 📦 Checking environment & dependencies..."
NEEDED_PKGS=()
for pkg in git nodejs-lts npm cloudflared termux-api procps; do
  if ! command -v $pkg >/dev/null 2>&1; then
    NEEDED_PKGS+=($pkg)
  fi
done

if [ ${#NEEDED_PKGS[@]} -gt 0 ]; then
  echo -e "      Installing required packages: \033[1;33m${NEEDED_PKGS[*]}\033[0m..."
  pkg update -y >/dev/null 2>&1 || true
  pkg install -y "${NEEDED_PKGS[@]}" >/dev/null 2>&1 || true
  echo -e "      \033[1;32m✓ Dependencies installed successfully.\033[0m"
else
  echo -e "      \033[1;32m✓ All dependencies ready.\033[0m"
fi

# 2. Clone or update repository
echo -e "\n\033[1;34m[2/3]\033[0m 📥 Syncing PebbleAFK engine..."
cd "$HOME"
if [ -d "PebbleAFK/.git" ]; then
  cd PebbleAFK
  git reset --hard HEAD >/dev/null 2>&1 || true
  git pull --force origin main >/dev/null 2>&1 || true
  echo -e "      \033[1;32m✓ Updated to latest version.\033[0m"
else
  rm -rf PebbleAFK 2>/dev/null || true
  git clone https://github.com/codexvista-debug/PebbleAFK.git >/dev/null 2>&1 || true
  cd PebbleAFK
  echo -e "      \033[1;32m✓ Cloned successfully.\033[0m"
fi

# 3. Install packages if needed (use --ignore-scripts for pure JS RakNet on Android)
cd daemon
if [ ! -d "node_modules" ] || [ ! -d "node_modules/bedrock-protocol" ]; then
  echo -e "\n\033[1;34m[3/3]\033[0m ⚙️  Installing Node modules (Bedrock Protocol)..."
  npm install --ignore-scripts --no-audit --no-fund >/dev/null 2>&1 || npm install --ignore-scripts >/dev/null 2>&1 || true
  echo -e "      \033[1;32m✓ Modules configured successfully.\033[0m"
else
  echo -e "\n\033[1;34m[3/3]\033[0m ⚙️  Modules verified."
fi

# 4. Stop only legacy PebbleAFK processes from this daemon directory.
# Older launchers did not record their supervisor PID and used broad pkill
# patterns, which could leave a restart loop behind or terminate unrelated
# Termux services. Scope migration cleanup to this checkout and known commands.
stop_legacy_pebbleafk() {
  local daemon_path proc pid proc_cwd proc_cmd
  daemon_path=$(pwd -P)
  for proc in /proc/[0-9]*; do
    [ -r "$proc/cmdline" ] || continue
    pid=${proc##*/}
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

# 5. Launch daemon & tunnel
chmod +x start.sh 2>/dev/null || true
bash start.sh "$1" "$2"
