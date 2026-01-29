# Telegram Bot Bridge

The Telegram Bot Bridge is the communication layer of the Claude Automation System. It monitors your Telegram bot for messages and routes them to specialized Claude agents.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Telegram Bot Bridge                       │
│                                                               │
│  ┌─────────┐     ┌──────────────┐     ┌─────────────────┐    │
│  │  Poll   │────►│  Responder   │────►│    Manager      │    │
│  │Telegram │     │  (Haiku)     │     │   Registry      │    │
│  │  Bot    │     │              │     │                 │    │
│  └─────────┘     │  Classifies  │     │  Routes to      │    │
│                  │  & routes    │     │  Opus agents    │    │
│                  └──────────────┘     └─────────────────┘    │
│                         │                      │              │
│                         ▼                      ▼              │
│                   Quick ACK            Long-running          │
│                   to user              Claude sessions       │
└──────────────────────────────────────────────────────────────┘
```

## Components

### Server (`src/telegram-server.ts`)
Main entry point. Uses Telegram Bot API long polling to receive messages.

### Responder (`src/telegram-responder.ts`)
Fast Haiku-based classifier that decides how to route each message:
- **CREATE** - Spawn a new manager for a new topic
- **QUEUE** - Add to an existing manager's queue
- **INTERRUPT** - Stop current work and switch focus

### Manager Agent (`src/telegram-manager-agent.ts`)
Spawns and manages long-running Claude (Opus) sessions.

### Manager Registry (`src/manager-registry.ts`)
Tracks all active managers, their topics, and message queues.

### Telegram Client (`src/telegram.ts`)
Wrapper for the Telegram Bot API.

## Setup

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run setup wizard
npm run setup
```

The setup wizard will:
1. Guide you to create a bot with @BotFather on Telegram
2. Verify your bot token
3. Optionally restrict access to your Telegram user ID
4. Save configuration and start the bridge

## Configuration

The setup wizard creates `config.json`:

```json
{
  "telegram": {
    "botToken": "your-bot-token",
    "allowedUserIds": [123456789]
  },
  "claudeWorkDir": "~/Documents/claude-work",
  "pollInterval": 2000
}
```

## Bot Commands

- `/status` - Show bridge and manager status
- `/managers` - List all active managers
- `/help` - Show help information

## Dashboard

The bridge includes a real-time monitoring dashboard:

```bash
cd dashboard
npm install
npm run dev
# Open http://localhost:3333
```

See [Dashboard README](dashboard/README.md) for more details.

## Commands

```bash
# Start the bridge
npm start

# Run setup wizard
npm run setup

# Check manager status
npm run status

# List all orchestrators/projects
npm run orchestrators

# View manager sessions
npm run sessions

# View logs for a manager
npm run managers logs <name>

# Delete a manager
npm run managers delete <name>

# Send a message manually (requires chat_id)
node dist/telegram-send-cli.js <chat_id> "message"
```

## Logs

- Main log: `bridge.log`
- Manager sessions: `manager-sessions/`
- Responder sessions: `responder-sessions/`

## Key Files

```
~/claude-automation-system/bridge/
├── src/                            # TypeScript source
│   ├── telegram-server.ts          # Main entry, Telegram long polling
│   ├── telegram-responder.ts       # Routes messages to managers
│   ├── telegram-manager-agent.ts   # Spawns/manages Opus agents
│   ├── telegram.ts                 # Telegram Bot API client
│   ├── manager-registry.ts         # Tracks managers, queues, topics
│   └── setup.ts                    # Interactive setup wizard
├── dist/                           # Compiled JS
├── config.json                     # Bot token and settings
├── .manager-registry.json          # Persisted manager state
├── .telegram-state.json            # Last processed update ID
├── .conversation-history.json      # Last 25 messages
├── bridge.log                      # Main activity log
├── manager-sessions/               # Per-manager session logs
└── responder-sessions/             # Responder decision logs
```
