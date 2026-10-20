# 🪨 PebbleAFK

**PebbleAFK** is a lightweight, 24/7 Minecraft Bedrock AFK bot management system powered by `bedrock-protocol` with a modern Next.js dashboard.

---

## 🌟 Architecture

* **Bedrock Native Protocol:** Powered by `bedrock-protocol` and `prismarine-auth` for reliable RakNet UDP transport, Xbox Live auth, Bedrock modal forms, and continuous bot presence.
* **Bi-directional WebSocket Engine:** Low-latency communication between the Bedrock bot daemon and frontend.
* **Next.js Web UI:** Modern, responsive dashboard matching the PocketAFK ecosystem.

---

## 📁 Repository Structure

```text
PebbleAFK/
├── daemon/               # Node.js + bedrock-protocol bot daemon
│   ├── src/
│   │   ├── bot/          # BedrockBotInstance & BotManager
│   │   ├── utils/        # Bedrock formatting & parser helpers
│   │   ├── index.ts      # WebSocket server & token auth
│   │   └── types.ts      # Bi-directional WebSocket protocol
│   └── package.json
└── frontend/             # Next.js 14 App Router + TailwindCSS web UI
    ├── src/
    └── package.json
```
