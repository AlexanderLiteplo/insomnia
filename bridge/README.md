# iMessage Bridge

The iMessage Bridge is the communication layer of Insomnia. It monitors your iMessage database and routes incoming messages to specialized Claude agents.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       iMessage Bridge                         │
│                                                               │
│  ┌─────────┐     ┌──────────────┐     ┌─────────────────┐    │
│  │  Poll   │────►│  Responder   │────►│    Manager      │    │
│  │ iMessage│     │  (Haiku)     │     │   Registry      │    │
│  │   DB    │     │              │     │                 │    │
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

### Server (`src/server.ts`)
Main entry point. Polls the iMessage database and processes new messages.

### Responder (`src/responder.ts`)
Fast Haiku-based classifier that decides how to route each message:
- **CREATE** - Spawn a new manager for a new topic
- **QUEUE** - Add to an existing manager's queue
- **INTERRUPT** - Stop current work and switch focus

### Manager Agent (`src/manager-agent.ts`)
Spawns and manages long-running Claude (Opus) sessions.

### Manager Registry (`src/manager-registry.ts`)
Tracks all active managers, their topics, and message queues.

## Setup

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Configure
cp config.example.json config.json
# Edit config.json with your details

# Start
npm start
```

## Configuration

Create `config.json` from the example:

```json
{
  "yourPhoneNumber": "+1234567890",
  "yourEmail": "your@email.com",
  "claudeWorkDir": "~/Documents/claude-work",
  "pollInterval": 2000
}
```

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

# Check manager status
npm run status

# View logs for a manager
npm run managers logs <name>

# Delete a manager
npm run managers delete <name>
```

## Logs

- Main log: `imessage-server.log`
- Manager sessions: `manager-sessions/`
- Responder sessions: `responder-sessions/`
