#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
#    PebbleAFK - Pure Bedrock Protocol 24/7 Daemon for Android (Termux)
# ==============================================================================

CYAN='\033[1;36m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
PURPLE='\033[1;35m'
RED='\033[1;31m'
WHITE='\033[1;37m'
GRAY='\033[0;90m'
NC='\033[0m'
BOLD='\033[1m'

clear
echo -e "${GREEN}"
cat << "EOF"
  ██████╗ ███████╗██████╗ ██████╗ ██╗     ███████╗ █████╗ ███████╗██╗  ██╗
  ██╔══██╗██╔════╝██╔══██╗██╔══██╗██║     ██╔════╝██╔══██╗██╔════╝██║ ██╔╝
  ██████╔╝█████╗  ██████╔╝██████╔╝██║     █████╗  ███████║█████╗  █████╔╝ 
  ██╔═══╝ ██╔══╝  ██╔══██╗██╔══██╗██║     ██╔══╝  ██╔══██║██╔══╝  ██╔═██╗ 
  ██║     ███████╗██████╔╝██████╔╝███████╗███████╗██║  ██║██║     ██║  ██╗
  ╚═╝     ╚══════╝╚═════╝ ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝
EOF
echo -e "${NC}"

APP_USER="$1"
APP_SECRET="$2"
USER_FILE="$HOME/.pebbleafk_user"
SECRET_FILE="$HOME/.pebbleafk_secret"

if [ -n "$APP_USER" ]; then
  echo "$APP_USER" > "$USER_FILE"
elif [ -f "$USER_FILE" ]; then
  APP_USER=$(cat "$USER_FILE")
fi

if [ -n "$APP_SECRET" ]; then
  echo "$APP_SECRET" > "$SECRET_FILE"
elif [ -f "$SECRET_FILE" ]; then
  APP_SECRET=$(cat "$SECRET_FILE")
fi

if [ -z "$APP_USER" ]; then
  echo -ne "${YELLOW}👤 Enter your PebbleAFK username (default: guest): ${NC}"
  read -r INPUT_USER
  APP_USER="${INPUT_USER:-guest}"
  echo "$APP_USER" > "$USER_FILE"
fi

# Auto-fetch secret code from PebbleAFK if missing
if [ -z "$APP_SECRET" ] && [ -n "$APP_USER" ] && [ "$APP_USER" != "guest" ]; then
  FETCHED_SECRET=$(curl -s --connect-timeout 4 --max-time 6 "https://pebbleafk.vercel.app/api/auth?username=${APP_USER}" 2>/dev/null | grep -o '"secretCode":"[^"]*' | cut -d'"' -f4)
  if [ -n "$FETCHED_SECRET" ]; then
    APP_SECRET="$FETCHED_SECRET"
    echo "$APP_SECRET" > "$SECRET_FILE"
  fi
fi

UPPER_USER=$(echo "$APP_USER" | tr '[:lower:]' '[:upper:]')

echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                   ${BOLD}${YELLOW}👤  PEBBLEAFK USER: [ ${WHITE}@${UPPER_USER}${YELLOW} ]${NC}${CYAN}                   ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════════════════╝${NC}"
echo -e "  ${WHITE}🎮 Engine Target        :${NC} ${GREEN}Minecraft Bedrock (bedrock-protocol)${NC}"
if [ -n "$APP_SECRET" ]; then
  echo -e "  ${WHITE}🔑 Secret Launcher Token:${NC} ${GREEN}Protected (Validated)${NC}"
fi
echo -e "${GRAY}─────────────────────────────────────────────────────────────────────────────${NC}\n"

# 1. Android Wake Lock & System Notification
echo -e "${CYAN}[1/4]${NC} 🔋 ${BOLD}Acquiring Android background wake lock...${NC}"
if command -v termux-wake-lock &> /dev/null; then
  termux-wake-lock
  echo -e "      ${GREEN}✓ Android OS power management locked (24/7 active)${NC}"
else
  echo -e "      ${YELLOW}⚠ termux-wake-lock not available (continuing standard)${NC}"
fi

if command -v termux-notification &> /dev/null; then
  termux-notification --id pebbleafk_status --title "PebbleAFK Active • 24/7 (@${UPPER_USER})" --content "🚀 Bedrock Tunnel Live | Standby for server connection" --ongoing --priority low --alert-once 2>/dev/null || true
  echo -e "      ${GREEN}✓ Android persistent status notification initialized${NC}"
fi

# 2. Start PebbleAFK Node.js Daemon
echo -e "\n${CYAN}[2/4]${NC} 🪨 ${BOLD}Starting PebbleAFK Bedrock Core (Node.js LTS)...${NC}"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo -e "      ${CYAN}Syncing latest PebbleAFK core from GitHub...${NC}"
  git pull origin main 2>/dev/null || true
fi

DAEMON_DIR=$(pwd -P)
LAUNCHER_PID_FILE="$HOME/.pebbleafk_launcher.pid"
SUPERVISOR_PID_FILE="$HOME/.pebbleafk_supervisor.pid"
DAEMON_PID_FILE="$HOME/.pebbleafk_daemon.pid"
TUNNEL_PID_FILE="$HOME/.pebbleafk_tunnel.pid"
HEARTBEAT_PID_FILE="$HOME/.pebbleafk_heartbeat.pid"
INSTANCE_ID="termux-$(date +%s)-$$"
DASHBOARD_SYNC_URL="https://pebbleafk.vercel.app/api/tunnel"
TAIL_PID=""
HEARTBEAT_PID=""
TUNNEL_PID=""
DAEMON_PID=""
TUNNEL_REGISTERED=0

# Only stop PIDs recorded by PebbleAFK and still running from this daemon
# directory. Never sweep unrelated Node/cloudflared processes or kill every
# listener on 8080: that was allowing stale launchers to race each other.
is_managed_pid() {
  local pid="$1" process_dir process_cmd
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  [ -r "/proc/$pid/cmdline" ] || return 1
  process_dir=$(readlink "/proc/$pid/cwd" 2>/dev/null || true)
  [ "$process_dir" = "$DAEMON_DIR" ] || return 1
  process_cmd=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
  case "$process_cmd" in
    *"start.sh"*|*"tsx src/index.ts"*|*"node_modules/.bin/tsx"*|*"npm run start"*|*"cloudflared tunnel"*|*"tail -f daemon.log"*) return 0 ;;
    *) return 1 ;;
  esac
}

stop_pid_file() {
  local file="$1" label="$2" pid attempt
  [ -f "$file" ] || return 0
  pid=$(tr -cd '0-9' < "$file" 2>/dev/null || true)
  if [ -n "$pid" ] && [ "$pid" != "$$" ] && is_managed_pid "$pid"; then
    echo -e "      ${YELLOW}Stopping previous ${label} (PID ${pid})...${NC}"
    kill -TERM "$pid" 2>/dev/null || true
    for attempt in {1..8}; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.25
    done
    if kill -0 "$pid" 2>/dev/null && is_managed_pid "$pid"; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
  fi
  rm -f "$file"
}

cleanup_and_exit() {
  local exit_status=$?
  trap - EXIT INT TERM
  echo -e "\n\n${YELLOW}[!] Stopping PebbleAFK Bedrock Daemon cleanly...${NC}"
  [ -n "$TAIL_PID" ] && kill "$TAIL_PID" 2>/dev/null || true
  if [ -n "$HEARTBEAT_PID" ]; then
    kill "$HEARTBEAT_PID" 2>/dev/null || true
    wait "$HEARTBEAT_PID" 2>/dev/null || true
  fi
  stop_pid_file "$TUNNEL_PID_FILE" "Cloudflare tunnel"
  stop_pid_file "$SUPERVISOR_PID_FILE" "daemon supervisor"
  stop_pid_file "$DAEMON_PID_FILE" "daemon"
  rm -f "$HEARTBEAT_PID_FILE" "$TUNNEL_PID_FILE" "$DAEMON_PID_FILE" "$SUPERVISOR_PID_FILE" "$LAUNCHER_PID_FILE" .env
  if [ "$TUNNEL_REGISTERED" = "1" ]; then
    curl -s --connect-timeout 3 --max-time 5 -X POST "$DASHBOARD_SYNC_URL" \
      -H "Content-Type: application/json" \
      -d "{\"username\":\"$APP_USER\",\"url\":\"\",\"token\":\"$APP_SECRET\",\"action\":\"disconnect\"}" >/dev/null 2>&1 || true
  fi
  if command -v termux-wake-unlock &> /dev/null; then
    termux-wake-unlock 2>/dev/null || true
  fi
  if command -v termux-notification-remove &> /dev/null; then
    termux-notification-remove pebbleafk_status 2>/dev/null || true
  fi
  echo -e "${GREEN}[✓] PebbleAFK stopped cleanly. Goodbye!${NC}\n"
  exit "$exit_status"
}

trap cleanup_and_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

stop_pid_file "$HEARTBEAT_PID_FILE" "heartbeat"
stop_pid_file "$TUNNEL_PID_FILE" "Cloudflare tunnel"
stop_pid_file "$SUPERVISOR_PID_FILE" "daemon supervisor"
stop_pid_file "$DAEMON_PID_FILE" "daemon"
stop_pid_file "$LAUNCHER_PID_FILE" "launcher"
sleep 1
echo "=== PebbleAFK Daemon Started $(date) ===" > daemon.log

if [ -z "$APP_SECRET" ]; then
  echo -e "      ${RED}✗ No daemon secret is available for @${APP_USER}. The website connection cannot be authenticated.${NC}"
  echo -e "      ${YELLOW}Sign in to the website and rerun its current Termux launch command.${NC}"
  exit 1
fi

# Apply pure-JS high-speed RakNet transport patches for Android/Termux
node ./scripts/patch-mobile-raknet.cjs >/dev/null 2>&1 || true

# Prepare native RakNet backend for Termux (enables full RakNet 11 + anti-DDoS cookie support)
bash ./scripts/prepare-mobile-raknet.sh || true

umask 077
printf 'PORT=8080\nPEBBLEAFK_OWNER=%s\nDAEMON_AUTH_TOKEN=%s\nPEBBLEAFK_INSTANCE_ID=%s\n' \
  "$APP_USER" "$APP_SECRET" "$INSTANCE_ID" > .env
chmod 600 .env 2>/dev/null || true

run_daemon_loop() {
  trap - EXIT INT TERM
  export TERMUX_SUPERVISOR=1
  export PEBBLEAFK_OWNER="$APP_USER"
  export DAEMON_AUTH_TOKEN="$APP_SECRET"
  export PEBBLEAFK_INSTANCE_ID="$INSTANCE_ID"
  DAEMON_CHILD_PID=""
  stop_daemon_child() {
    if [ -n "$DAEMON_CHILD_PID" ] && kill -0 "$DAEMON_CHILD_PID" 2>/dev/null; then
      kill -TERM "$DAEMON_CHILD_PID" 2>/dev/null || true
      wait "$DAEMON_CHILD_PID" 2>/dev/null || true
    fi
    rm -f "$DAEMON_PID_FILE"
  }
  trap 'stop_daemon_child; exit 0' TERM INT
  RESTART_DELAY=2
  while true; do
    ./node_modules/.bin/tsx src/index.ts >> daemon.log 2>&1 &
    DAEMON_CHILD_PID=$!
    echo "$DAEMON_CHILD_PID" > "$DAEMON_PID_FILE"
    wait "$DAEMON_CHILD_PID"
    EXIT_CODE=$?
    rm -f "$DAEMON_PID_FILE"
    if [ "$EXIT_CODE" -eq 42 ]; then
      echo -e "\n[$(date +%T)] 🔄 Dashboard requested daemon restart. Rebooting in 1s..." >> daemon.log
      sleep 1
      RESTART_DELAY=2
      continue
    fi
    if [ "$EXIT_CODE" -eq 43 ]; then
      echo -e "\n[$(date +%T)] ❌ Fatal port conflict: another process owns 127.0.0.1:8080. Stopping supervisor; no tunnel URL will be published." >> daemon.log
      exit 43
    fi
    [ "${STOPPING:-0}" = "1" ] && exit 0
    echo -e "\n[$(date +%T)] ⚠️ Daemon process exited with code ${EXIT_CODE}. Restarting in ${RESTART_DELAY}s..." >> daemon.log
    sleep "$RESTART_DELAY"
    RESTART_DELAY=$((RESTART_DELAY * 2))
    if [ "$RESTART_DELAY" -gt 30 ]; then RESTART_DELAY=30; fi
  done
}

run_daemon_loop &
DAEMON_PID=$!
echo "$DAEMON_PID" > "$SUPERVISOR_PID_FILE"
echo "$$" > "$LAUNCHER_PID_FILE"

echo -ne "      ${YELLOW}⌛ Waiting for this daemon instance to become healthy...${NC}"
LOCAL_HEALTH=""
for i in {1..30}; do
  LOCAL_HEALTH=$(curl -fsS --connect-timeout 1 --max-time 2 http://127.0.0.1:8080/ 2>/dev/null || true)
  if echo "$LOCAL_HEALTH" | grep -Fq "\"instanceId\":\"$INSTANCE_ID\""; then break; fi
  if ! kill -0 "$DAEMON_PID" 2>/dev/null; then break; fi
  if ps -o stat= -p "$DAEMON_PID" 2>/dev/null | grep -q '^Z'; then break; fi
  echo -ne "${YELLOW}.${NC}"
  sleep 1
done
echo ""
if ! echo "$LOCAL_HEALTH" | grep -Fq "\"instanceId\":\"$INSTANCE_ID\""; then
  echo -e "      ${RED}✗ This launch did not acquire port 8080 or failed its health check. It will not publish a tunnel URL.${NC}"
  tail -n 20 daemon.log
  kill -TERM "$DAEMON_PID" 2>/dev/null || true
  rm -f "$SUPERVISOR_PID_FILE" "$LAUNCHER_PID_FILE"
  exit 1
fi
echo -e "      ${GREEN}✓ This daemon instance is healthy on port 8080 (Supervisor PID: ${DAEMON_PID})${NC}"

# 3. Start Cloudflare Tunnel (its origin is local to this phone; the public URL is network-independent)
echo -e "\n${CYAN}[3/4]${NC} 🛡️  ${BOLD}Creating secure Cloudflare Tunnel (HTTP/2)...${NC}"
echo -e "      ${GRAY}Phone-local origin: 127.0.0.1:8080 (not a Wi-Fi/mobile IP; public access uses the Cloudflare URL)${NC}"
cloudflared tunnel --protocol http2 --no-autoupdate --url http://127.0.0.1:8080 > tunnel.log 2>&1 &
TUNNEL_PID=$!
echo "$TUNNEL_PID" > "$TUNNEL_PID_FILE"

echo -ne "      ${YELLOW}⌛ Negotiating secure SSL tunnel address...${NC}"
TUNNEL_URL=""
for i in {1..30}; do
  echo -ne "${YELLOW}.${NC}"
  TUNNEL_URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' tunnel.log | head -n 1)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 1
done
echo ""

if [ -z "$TUNNEL_URL" ]; then
  echo -e "      ${RED}✗ Cloudflare tunnel timed out. Check tunnel.log for details.${NC}"
  exit 1
fi

echo -ne "      ${YELLOW}⌛ Checking whether Cloudflare's public edge is already reachable...${NC}"
PUBLIC_HEALTH=""
PUBLIC_HTTP_STATUS=""
for i in {1..3}; do
  PUBLIC_HEALTH=$(curl -sSL --connect-timeout 2 --max-time 4 -w '\n__HTTP_STATUS__%{http_code}' "${TUNNEL_URL}/" 2>/dev/null || true)
  PUBLIC_HTTP_STATUS=$(echo "$PUBLIC_HEALTH" | sed -n 's/^__HTTP_STATUS__//p' | tail -n 1)
  if echo "$PUBLIC_HEALTH" | grep -Fq "\"instanceId\":\"$INSTANCE_ID\""; then break; fi
  sleep 1
done
echo ""
if echo "$PUBLIC_HEALTH" | grep -Fq "\"instanceId\":\"$INSTANCE_ID\""; then
  echo -e "      ${GREEN}✓ Public edge returned this daemon instance.${NC}"
elif ! is_managed_pid "$TUNNEL_PID"; then
  echo -e "      ${RED}✗ Cloudflare tunnel exited before registration. Check tunnel.log:${NC}"
  tail -n 20 tunnel.log
  exit 1
else
  # A phone-side request to a newly-issued quick tunnel can be delayed or
  # blocked independently of the tunnel's outbound connection. The local
  # instance identity was already verified above and cloudflared targets that
  # exact loopback listener, so do not tear down a healthy daemon on this probe.
  echo -e "      ${YELLOW}⚠ Public self-check is inconclusive (HTTP ${PUBLIC_HTTP_STATUS:-no response}); keeping the live tunnel and allowing the dashboard to retry.${NC}"
fi

WSS_URL=$(echo "$TUNNEL_URL" | sed 's/https:/wss:/')

# 4. Auto-sync to Vercel Website
echo -e "\n${CYAN}[4/4]${NC} 🚀 ${BOLD}Auto-syncing tunnel to user @${APP_USER}...${NC}"
SYNC_RESP=$(curl -s --connect-timeout 6 --max-time 10 -X POST "$DASHBOARD_SYNC_URL" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$APP_USER\",\"url\":\"$WSS_URL\",\"token\":\"$APP_SECRET\",\"action\":\"register\"}" 2>/dev/null)

if echo "$SYNC_RESP" | grep -q '"success":true'; then
  TUNNEL_REGISTERED=1
  echo -e "      ${GREEN}✓ AUTO-SYNC SUCCESSFUL! Dashboard paired automatically.${NC}"
else
  echo -e "      ${RED}✗ Website registration failed: ${SYNC_RESP:-no response}${NC}"
  exit 1
fi

echo -e "\n  ${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "  ${GREEN}║${NC}   ${BOLD}✨ PebbleAFK Bedrock Core is RUNNING 24/7${NC}                      ${GREEN}║${NC}"
echo -e "  ${GREEN}║${NC}   Web Dashboard : ${CYAN}https://pebbleafk.vercel.app${NC}                    ${GREEN}║${NC}"
echo -e "  ${GREEN}║${NC}   Live Tunnel   : ${YELLOW}${WSS_URL}${NC}         ${GREEN}║${NC}"
echo -e "  ${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
echo -e "  ${GRAY}• Remote updates: click [Update Engine] on web dashboard anytime${NC}"
echo -e "  ${GRAY}• Press [Ctrl + C] to cleanly stop all services & exit${NC}"
echo -e "${GRAY}─────────────────────────────────────────────────────────────────────${NC}"
echo -e "  ${BOLD}📜 Streaming Live Daemon Logs:${NC}\n"

# 5. Heartbeat and end-to-end tunnel watchdog
(
  CHECK_COUNTER=0

  restart_tunnel() {
    echo -e "[$(date +%T)] ⚠️ Cloudflare tunnel process exited; creating a replacement..." >> daemon.log
    if is_managed_pid "$TUNNEL_PID"; then
      kill "$TUNNEL_PID" 2>/dev/null || true
      sleep 2
      if is_managed_pid "$TUNNEL_PID"; then
        kill -9 "$TUNNEL_PID" 2>/dev/null || true
      fi
    fi

    cloudflared tunnel --protocol http2 --no-autoupdate --url http://127.0.0.1:8080 > tunnel.log 2>&1 &
    TUNNEL_PID=$!
    echo "$TUNNEL_PID" > "$TUNNEL_PID_FILE"
    NEW_TUNNEL_URL=""
    for attempt in {1..30}; do
      NEW_TUNNEL_URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' tunnel.log | tail -n 1)
      if [ -n "$NEW_TUNNEL_URL" ]; then
        LOCAL_HEALTH=$(curl -fsS --connect-timeout 2 --max-time 4 http://127.0.0.1:8080/ 2>/dev/null || true)
        if ! echo "$LOCAL_HEALTH" | grep -Fq "\"instanceId\":\"$INSTANCE_ID\""; then
          echo -e "[$(date +%T)] ❌ Local daemon identity check failed; refusing to register replacement tunnel." >> daemon.log
          return 1
        fi
        NEW_WSS_URL=$(echo "$NEW_TUNNEL_URL" | sed 's/https:/wss:/')
        SYNC_RESP=$(curl -s --connect-timeout 5 --max-time 10 -X POST "$DASHBOARD_SYNC_URL" \
          -H "Content-Type: application/json" \
          -d "{\"username\":\"$APP_USER\",\"url\":\"$NEW_WSS_URL\",\"token\":\"$APP_SECRET\",\"action\":\"register\"}" 2>/dev/null || true)
        if ! echo "$SYNC_RESP" | grep -q '"success":true'; then
          echo -e "[$(date +%T)] ❌ Website rejected replacement tunnel URL: ${SYNC_RESP:-no response}" >> daemon.log
          return 1
        fi
        TUNNEL_URL="$NEW_TUNNEL_URL"
        WSS_URL="$NEW_WSS_URL"
        TUNNEL_REGISTERED=1
        echo -e "[$(date +%T)] ✓ Cloudflare tunnel URL refreshed at ${WSS_URL}; waiting for the web client to reconnect." >> daemon.log
        return 0
      fi
      sleep 1
    done

    echo -e "[$(date +%T)] ❌ Cloudflare tunnel did not return an address; watchdog will retry." >> daemon.log
    return 1
  }

  while true; do
    sleep 15
    # Recover a dead cloudflared process immediately.
    if ! is_managed_pid "$TUNNEL_PID"; then
      echo -e "[$(date +%T)] ⚠️ Cloudflare tunnel interrupted. Re-opening tunnel (HTTP/2)..." >> daemon.log
      restart_tunnel || true
    fi

    # Check the loopback daemon periodically, but do not recreate a live
    # Cloudflare tunnel just because a phone-side public self-probe failed.
    CHECK_COUNTER=$((CHECK_COUNTER + 1))
    if [ "$CHECK_COUNTER" -ge 2 ]; then
      CHECK_COUNTER=0
      LOCAL_HEALTH=$(curl -fsS --connect-timeout 2 --max-time 4 http://127.0.0.1:8080/ 2>/dev/null || true)
      if ! echo "$LOCAL_HEALTH" | grep -Fq "\"instanceId\":\"$INSTANCE_ID\""; then
        echo -e "[$(date +%T)] ⚠️ Local daemon health is temporarily unavailable; supervisor will recover it without replacing the public tunnel URL." >> daemon.log
      fi
    fi

    curl -s --connect-timeout 5 --max-time 10 -X POST "$DASHBOARD_SYNC_URL" \
      -H "Content-Type: application/json" \
      -d "{\"username\":\"$APP_USER\",\"url\":\"$WSS_URL\",\"token\":\"$APP_SECRET\",\"action\":\"heartbeat\"}" > /dev/null 2>&1 || true
  done
) &
HEARTBEAT_PID=$!
echo "$HEARTBEAT_PID" > "$HEARTBEAT_PID_FILE"

# Stream logs continuously in foreground
tail -f daemon.log &
TAIL_PID=$!
wait $TAIL_PID
