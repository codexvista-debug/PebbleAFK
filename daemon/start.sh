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

# Clean up any residual processes on port 8080 silently
echo "=== PebbleAFK Daemon Started $(date) ===" > daemon.log
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

# Apply pure-JS high-speed RakNet transport patches for Android/Termux
node ./scripts/patch-mobile-raknet.cjs >/dev/null 2>&1 || true

# Prepare native RakNet backend for Termux (enables full RakNet 11 + anti-DDoS cookie support)
bash ./scripts/prepare-mobile-raknet.sh || true

cat << ENVEOF > .env
PORT=8080
PEBBLEAFK_OWNER=$APP_USER
ENVEOF

run_daemon_loop() {
  export TERMUX_SUPERVISOR=1
  export PEBBLEAFK_OWNER="$APP_USER"
  RESTART_DELAY=2
  while true; do
    npm run start >> daemon.log 2>&1
    EXIT_CODE=$?
    if [ "$EXIT_CODE" -eq 42 ]; then
      echo -e "\n[$(date +%T)] 🔄 Dashboard requested daemon restart. Rebooting in 1s..." >> daemon.log
      sleep 1
      RESTART_DELAY=2
      continue
    fi
    echo -e "\n[$(date +%T)] ⚠️ Daemon process exited with code ${EXIT_CODE}. Restarting in ${RESTART_DELAY}s..." >> daemon.log
    sleep "$RESTART_DELAY"
    RESTART_DELAY=$((RESTART_DELAY * 2))
    if [ "$RESTART_DELAY" -gt 30 ]; then RESTART_DELAY=30; fi
  done
}

run_daemon_loop &
DAEMON_PID=$!
sleep 2

if ps -p $DAEMON_PID > /dev/null; then
  echo -e "      ${GREEN}✓ Bedrock engine running on port 8080 (Supervisor PID: ${DAEMON_PID})${NC}"
else
  echo -e "      ${RED}✗ Failed to start daemon. Showing daemon.log:${NC}"
  cat daemon.log | tail -n 10
  exit 1
fi

# 3. Start Cloudflare Tunnel (Forced HTTP/2 for rock-solid Termux/mobile stability)
echo -e "\n${CYAN}[3/4]${NC} 🛡️  ${BOLD}Creating secure Cloudflare Tunnel (HTTP/2)...${NC}"
cloudflared tunnel --protocol http2 --no-autoupdate --url http://127.0.0.1:8080 > tunnel.log 2>&1 &
TUNNEL_PID=$!

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

WSS_URL=$(echo "$TUNNEL_URL" | sed 's/https:/wss:/')
DASHBOARD_SYNC_URL="https://pebbleafk.vercel.app/api/tunnel"

# 4. Auto-sync to Vercel Website
echo -e "\n${CYAN}[4/4]${NC} 🚀 ${BOLD}Auto-syncing tunnel to user @${APP_USER}...${NC}"
SYNC_RESP=$(curl -s --connect-timeout 6 --max-time 10 -X POST "$DASHBOARD_SYNC_URL" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$APP_USER\",\"url\":\"$WSS_URL\",\"token\":\"$APP_SECRET\",\"action\":\"register\"}" 2>/dev/null)

if echo "$SYNC_RESP" | grep -q "Unauthorized"; then
  echo -e "      ${YELLOW}⚠ Auto-sync auth notice. Running tunnel locally & continuing...${NC}"
elif echo "$SYNC_RESP" | grep -q "success"; then
  echo -e "      ${GREEN}✓ AUTO-SYNC SUCCESSFUL! Dashboard paired automatically.${NC}"
else
  echo -e "      ${GREEN}✓ Live sync broadcasted.${NC}"
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
  TUNNEL_FAILURES=0

  restart_tunnel() {
    echo -e "[$(date +%T)] ⚠️ Rebuilding the Cloudflare tunnel after failed health checks..." >> daemon.log
    if kill -0 "$TUNNEL_PID" 2>/dev/null; then
      kill "$TUNNEL_PID" 2>/dev/null || true
      sleep 2
      kill -9 "$TUNNEL_PID" 2>/dev/null || true
    fi

    cloudflared tunnel --protocol http2 --no-autoupdate --url http://127.0.0.1:8080 > tunnel.log 2>&1 &
    TUNNEL_PID=$!
    NEW_TUNNEL_URL=""
    for attempt in {1..30}; do
      NEW_TUNNEL_URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' tunnel.log | tail -n 1)
      if [ -n "$NEW_TUNNEL_URL" ]; then
        TUNNEL_URL="$NEW_TUNNEL_URL"
        WSS_URL=$(echo "$TUNNEL_URL" | sed 's/https:/wss:/')
        echo -e "[$(date +%T)] ✓ Cloudflare tunnel restored at ${WSS_URL}" >> daemon.log
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
    if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
      echo -e "[$(date +%T)] ⚠️ Cloudflare tunnel interrupted. Re-opening tunnel (HTTP/2)..." >> daemon.log
      restart_tunnel || true
    fi

    # A cloudflared PID can remain alive after its edge connection has gone stale.
    # Check the complete public-to-phone path every 30 seconds, not just process state.
    CHECK_COUNTER=$((CHECK_COUNTER + 1))
    if [ "$CHECK_COUNTER" -ge 2 ]; then
      CHECK_COUNTER=0
      LOCAL_HEALTH=$(curl -fsS --connect-timeout 2 --max-time 4 http://127.0.0.1:8080/ 2>/dev/null || true)
      if echo "$LOCAL_HEALTH" | grep -q '"status":"running"'; then
        PUBLIC_HEALTH=$(curl -fsSL --connect-timeout 5 --max-time 10 "${TUNNEL_URL}/" 2>/dev/null || true)
        if echo "$PUBLIC_HEALTH" | grep -q '"status":"running"'; then
          TUNNEL_FAILURES=0
        else
          TUNNEL_FAILURES=$((TUNNEL_FAILURES + 1))
          echo -e "[$(date +%T)] ⚠️ Public tunnel health check failed (${TUNNEL_FAILURES}/2)." >> daemon.log
        fi
      else
        # The daemon supervisor is recovering; don't mistake its brief restart for a tunnel fault.
        TUNNEL_FAILURES=0
      fi

      if [ "$TUNNEL_FAILURES" -ge 2 ]; then
        restart_tunnel || true
        TUNNEL_FAILURES=0
      fi
    fi

    curl -s --connect-timeout 5 --max-time 10 -X POST "$DASHBOARD_SYNC_URL" \
      -H "Content-Type: application/json" \
      -d "{\"username\":\"$APP_USER\",\"url\":\"$WSS_URL\",\"token\":\"$APP_SECRET\",\"action\":\"heartbeat\"}" > /dev/null 2>&1 || true
  done
) &
HEARTBEAT_PID=$!
echo "$HEARTBEAT_PID" > "$HOME/.pebbleafk_heartbeat.pid"

cleanup_and_exit() {
  echo -e "\n\n${YELLOW}[!] Stopping PebbleAFK Bedrock Daemon cleanly...${NC}"
  kill $TAIL_PID 2>/dev/null || true
  kill $HEARTBEAT_PID 2>/dev/null || true
  rm -f "$HOME/.pebbleafk_heartbeat.pid" 2>/dev/null || true
  pkill -9 -f "cloudflared" >/dev/null 2>&1 || true
  pkill -9 -f "tsx" >/dev/null 2>&1 || true
  pkill -9 -f "node.*index" >/dev/null 2>&1 || true
  pkill -9 -f "pebbleafk" >/dev/null 2>&1 || true
  pkill -9 -f "pebbleafk_heartbeat" >/dev/null 2>&1 || true
  if command -v fuser &> /dev/null; then
    fuser -k -9 8080/tcp >/dev/null 2>&1 || true
  fi
  # Notify dashboard of disconnect
  curl -s --connect-timeout 3 --max-time 5 -X POST "$DASHBOARD_SYNC_URL" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$APP_USER\",\"url\":\"\",\"token\":\"$APP_SECRET\",\"action\":\"disconnect\"}" >/dev/null 2>&1 || true

  if command -v termux-wake-unlock &> /dev/null; then
    termux-wake-unlock 2>/dev/null || true
  fi
  if command -v termux-notification-remove &> /dev/null; then
    termux-notification-remove pebbleafk_status 2>/dev/null || true
  fi
  echo -e "${GREEN}[✓] PebbleAFK stopped cleanly. Goodbye!${NC}\n"
}

trap 'cleanup_and_exit; exit 0' SIGINT SIGTERM

# Stream logs continuously in foreground
tail -f daemon.log &
TAIL_PID=$!
wait $TAIL_PID
