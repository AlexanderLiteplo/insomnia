# Setup Guide

Complete instructions for setting up the Claude Automation System.

## Prerequisites

### macOS Requirements

This system requires macOS because it integrates with iMessage.

### System Requirements

- macOS 12+ (Monterey or later)
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

### Full Disk Access

The bridge needs to read the iMessage database. Grant Full Disk Access to Terminal:

1. Open System Preferences > Privacy & Security > Full Disk Access
2. Add Terminal (or your terminal app)
3. Restart Terminal

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

# Create configuration
cp config.example.json config.json
```

Edit `config.json`:

```json
{
  "yourPhoneNumber": "+1234567890",
  "yourEmail": "your@email.com",
  "claudeWorkDir": "~/Documents/claude-work",
  "pollInterval": 2000
}
```

- `yourPhoneNumber`: Your phone number (for filtering iMessages)
- `yourEmail`: Your iCloud email (alternative filter)
- `claudeWorkDir`: Directory for Claude to work in
- `pollInterval`: How often to check for new messages (ms)

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
- Poll the iMessage database every 2 seconds
- Route messages to appropriate managers
- Send responses back via iMessage

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
ps aux | grep "node dist/server.js"
```

### Check Orchestrator Status

```bash
cd orchestrator
./scripts/orchestrator.sh status
```

### View Logs

```bash
# Bridge logs
tail -f bridge/imessage-server.log

# Orchestrator logs
cd orchestrator
./scripts/orchestrator.sh logs
```

## Troubleshooting

### Bridge not receiving messages

1. Verify Full Disk Access is granted
2. Check the phone number in config.json matches exactly
3. Ensure iMessage is signed in on your Mac

### Claude CLI not found

1. Verify installation: `which claude`
2. Ensure it's in your PATH
3. Re-authenticate: `claude login`

### Permission denied on scripts

```bash
chmod +x orchestrator/scripts/*.sh
```

## Next Steps

- Read the [Architecture documentation](ARCHITECTURE.md)
- Create your first project in `orchestrator/prds/tasks.json`
- Send a message to yourself via iMessage to test
