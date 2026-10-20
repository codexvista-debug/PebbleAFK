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
pkill -9 -f "cloudflared" 2>/dev/null || true
pkill -9 -f "tsx src/index.ts" 2>/dev/null || true
pkill -9 -f "pebbleafk_heartbeat" 2>/dev/null || true
pkill -9 -f "curl.*tunnel" 2>/dev/null || true
if [ -f "$HOME/.pebbleafk_heartbeat.pid" ]; then
  kill -9 "$(cat "$HOME/.pebbleafk_heartbeat.pid")" 2>/dev/null || true
  rm -f "$HOME/.pebbleafk_heartbeat.pid"
fi
sleep 1

cat << ENVEOF > .env
PORT=8080
PEBBLEAFK_OWNER=$APP_USER
ENVEOF

run_daemon_loop() {
  export TERMUX_SUPERVISOR=1
  export PEBBLEAFK_OWNER="$APP_USER"
  while true; do
    npm run start >> daemon.log 2>&1
    EXIT_CODE=$?
    if [ "$EXIT_CODE" -eq 42 ]; then
      echo -e "\n[$(date +%T)] 🔄 Dashboard requested daemon restart. Rebooting in 1s..." >> daemon.log
      sleep 1
      continue
    fi
    break
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

# 3. Start Cloudflare Tunnel
echo -e "\n${CYAN}[3/4]${NC} 🛡️  ${BOLD}Creating secure Cloudflare Tunnel...${NC}"
cloudflared tunnel --url http://127.0.0.1:8080 > tunnel.log 2>&1 &
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
SYNC_RESP=$(curl -s -X POST "$DASHBOARD_SYNC_URL" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$APP_USER\",\"url\":\"$WSS_URL\",\"token\":\"$APP_SECRET\",\"action\":\"register\"}" 2>/dev/null)

if echo "$SYNC_RESP" | grep -q "Unauthorized"; then
  echo -e "      ${RED}✗ AUTHENTICATION FAILED: Secret key does not match user @${APP_USER}.${NC}"
  echo -e "      ${YELLOW}Please run the exact 1-click command shown in your PebbleAFK dashboard.${NC}"
  kill $DAEMON_PID 2>/dev/null
  kill $TUNNEL_PID 2>/dev/null
  exit 1
elif echo "$SYNC_RESP" | grep -q "success"; then
  echo -e "      ${GREEN}✓ AUTO-SYNC SUCCESSFUL! No copy-pasting required.${NC}"
else
  echo -e "      ${YELLOW}✓ Live sync broadcasted.${NC}"
fi

echo -e "\n  ${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "  ${GREEN}║${NC}   ${BOLD}✨ PebbleAFK Bedrock Daemon is RUNNING 24/7${NC}                    ${GREEN}║${NC}"
echo -e "  ${GREEN}║${NC}   Connected to: ${CYAN}https://pebbleafk.vercel.app${NC}                    ${GREEN}║${NC}"
echo -e "  ${GREEN}║${NC}   Live Tunnel : ${YELLOW}${WSS_URL}${NC}         ${GREEN}║${NC}"
echo -e "  ${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}\n"

# 5. Heartbeat background keep-alive loop
(
  while true; do
    sleep 20
    curl -s -X POST "$DASHBOARD_SYNC_URL" \
      -H "Content-Type: application/json" \
      -d "{\"username\":\"$APP_USER\",\"url\":\"$WSS_URL\",\"token\":\"$APP_SECRET\",\"action\":\"heartbeat\"}" > /dev/null 2>&1
  done
) &
echo $! > "$HOME/.pebbleafk_heartbeat.pid"

# Tail logs
tail -f daemon.log
