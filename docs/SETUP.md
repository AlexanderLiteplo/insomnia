# Setup Guide

Complete instructions for setting up Insomnia.

## Prerequisites

### System Requirements

- macOS, Linux, or Windows with Node.js
- Node.js 18 or later
- npm 9 or later

### Claude CLI

Install the Claude CLI and authenticate:

```bash
# Install Claude CLI
npm install -g @anthropic-ai/claude-code

# Authenticate
claude login
```

### Telegram Bot

1. Open Telegram and search for @BotFather
2. Send `/newbot` and follow the prompts
3. Save your bot token

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/AlexanderLiteplo/insomnia.git
cd insomnia
```

### 2. Set Up the Bridge

```bash
cd bridge

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run the setup wizard (recommended)
npm run setup
```

The setup wizard will guide you through:
- Entering your Telegram bot token
- Optionally restricting the bot to your user ID
- Verifying the bot works

#### Manual Configuration

If you prefer manual setup, create `config.json`:

```json
{
  "telegramBotToken": "your-bot-token-from-botfather",
  "telegramAllowedUserIds": [123456789],
  "claudeWorkDir": "~/Documents/claude-work",
  "pollInterval": 2000
}
```

- `telegramBotToken`: Your bot token from @BotFather
- `telegramAllowedUserIds`: (Optional) Restrict to specific Telegram user IDs
- `claudeWorkDir`: Directory for Claude to work in
- `pollInterval`: How often to poll for updates (ms)

### 3. Set Up the Dashboard

```bash
cd bridge/dashboard

# Install dependencies
npm install
```

### 4. Set Up the Orchestrator

```bash
cd orchestrator

# Make scripts executable
chmod +x scripts/*.sh
```

## Running the System

### Start the Bridge

```bash
cd bridge
npm start
```

The bridge will:
- Connect to Telegram via long polling
- Route messages to appropriate managers
- Send responses back via Telegram

### Start the Dashboard

```bash
cd bridge/dashboard
npm run dev
```

Open http://localhost:3333 to view:
- Bridge status
- Active managers
- Project progress
- Human tasks queue

### Start the Orchestrator

First, create a project:

```bash
cd orchestrator
cp prds/tasks.example.json prds/tasks.json
# Edit prds/tasks.json with your project details
```

Then start:

```bash
./scripts/orchestrator.sh start
```

## Verification

### Check Bridge Status

```bash
ps aux | grep "node dist/telegram-server.js"
```

### Check Orchestrator Status

```bash
cd orchestrator
./scripts/orchestrator.sh status
```

### View Logs

```bash
# Bridge logs
tail -f bridge/bridge.log

# Orchestrator logs
cd orchestrator
./scripts/orchestrator.sh logs
```

## Troubleshooting

### Bridge not receiving messages

1. Verify your bot token is correct
2. Check that the bot is started (send /start to your bot)
3. If using user restrictions, verify your user ID is in the list

### Claude CLI not found

1. Verify installation: `which claude`
2. Ensure it's in your PATH
3. Re-authenticate: `claude login`

### Permission denied on scripts

```bash
chmod +x orchestrator/scripts/*.sh
```

## Next Steps

- Read the [Architecture documentation](../ARCHITECTURE.md)
- Create your first project in `orchestrator/prds/tasks.json`
- Send a message to your Telegram bot to test
