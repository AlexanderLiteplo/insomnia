# Amphetamine

Autonomous AI agents that never sleep. They work while you don't.

## Overview

Amphetamine is a system of tireless AI agents that operate autonomously via iMessage, building your projects around the clock without human intervention.

1. **iMessage Bridge** - Command your agents via text. They respond, they execute, they deliver.
2. **Orchestrator** - Worker agents implement. Manager agents review. Skills compound. Progress is relentless.

Send a message. Walk away. Come back to shipped code.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     iMessage Bridge                         │
│  ┌──────────┐    ┌───────────┐    ┌──────────────────────┐ │
│  │ Responder│───►│  Manager  │───►│ Claude CLI (Opus)    │ │
│  │ (Haiku)  │    │  Registry │    │ Long-running agents  │ │
│  └──────────┘    └───────────┘    └──────────────────────┘ │
│       │                                      │              │
│       ▼                                      ▼              │
│  Quick ACK                           Full responses via    │
│  via iMessage                             iMessage          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Orchestrator                          │
│  ┌──────────┐    ┌──────────┐    ┌────────────────────────┐│
│  │  Worker  │───►│ Manager  │───►│ Skills (learned        ││
│  │ (Opus)   │    │ (Opus)   │    │ patterns)              ││
│  └──────────┘    └──────────┘    └────────────────────────┘│
│       │                │                                    │
│       ▼                ▼                                    │
│  Implements        Reviews work,                           │
│  tasks, runs       generates skills                        │
│  tests                                                      │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- macOS (for iMessage integration)
- Node.js 18+
- [Claude CLI](https://github.com/anthropics/claude-code) installed and authenticated
- Full Disk Access for Terminal (to read iMessage database)

### Installation

```bash
# Clone the repository
git clone https://github.com/AlexanderLiteplo/amphetamine.git
cd amphetamine

# Install bridge dependencies
cd bridge
npm install
npm run build

# Configure the bridge
cp config.example.json config.json
# Edit config.json with your phone number
```

### Running the Bridge

```bash
cd bridge
npm start
```

### Running the Dashboard

```bash
cd bridge/dashboard
npm install
npm run dev
# Open http://localhost:3333
```

### Running the Orchestrator

```bash
cd orchestrator

# Create your project tasks
cp prds/tasks.example.json prds/tasks.json
# Edit prds/tasks.json with your project

# Start the orchestrator
./scripts/orchestrator.sh start
```

## Components

### Bridge (`/bridge`)

The iMessage bridge monitors your iMessage database and routes messages to specialized Claude agents.

- **Responder** (Haiku) - Fast classifier that routes messages
- **Managers** (Opus) - Long-running agents that handle specific topics
- **Dashboard** - Real-time monitoring UI

See [bridge documentation](bridge/README.md) for details.

### Orchestrator (`/orchestrator`)

The worker/manager system that autonomously builds projects.

- **Worker** - Implements tasks, runs tests
- **Manager** - Reviews work, approves or requests changes
- **Skills** - Learned patterns saved for future use

See [orchestrator documentation](orchestrator/README.md) for details.

## Configuration

### Bridge Config (`bridge/config.json`)

```json
{
  "yourPhoneNumber": "+1234567890",
  "yourEmail": "",
  "claudeWorkDir": "~/Documents/claude-work",
  "pollInterval": 2000
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ORCHESTRATOR_DIR` | Path to orchestrator directory |
| `BRIDGE_DIR` | Path to bridge directory |

## Documentation

- [Setup Guide](docs/SETUP.md) - Detailed installation instructions
- [Architecture](docs/ARCHITECTURE.md) - System design and components

## License

MIT - See [LICENSE](LICENSE) for details.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
