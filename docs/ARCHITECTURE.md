# Architecture

## System Overview

The Claude Automation System consists of two main components that work together:

1. **Telegram Bridge** - Human interface layer
2. **Orchestrator** - Autonomous work layer

## Telegram Bridge

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Telegram Bridge                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  telegram-server.ts                                         │
│  ├── Connects to Telegram via long polling                  │
│  ├── Filters messages from allowed users                    │
│  ├── Calls responder for each new message                   │
│  └── Monitors orchestrator health                           │
│                                                             │
│  telegram-responder.ts                                      │
│  ├── Runs quick Haiku classifier                            │
│  ├── Decides: CREATE | QUEUE | INTERRUPT | DIRECT           │
│  └── Sends immediate ACK to user                            │
│                                                             │
│  telegram-manager-agent.ts                                  │
│  ├── Spawns long-running Opus agents                        │
│  ├── Manages process lifecycle                              │
│  └── Handles interruptions                                  │
│                                                             │
│  manager-registry.ts                                        │
│  ├── Tracks all active managers                             │
│  ├── Persists state to JSON                                 │
│  └── Manages message queues                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Message Flow

1. **Message arrives** via Telegram
2. **Server** receives message via long polling
3. **Responder** (Haiku) classifies message quickly (~2-5 sec)
4. **ACK sent** immediately to user
5. **Manager** (Opus) processes and responds fully

### Manager States

```
created → active → idle → (reactivated on new message)
              ↓
         processing
```

## Orchestrator

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                       Orchestrator                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  orchestrator.sh                                            │
│  ├── Starts worker and manager processes                    │
│  ├── Monitors health                                        │
│  └── Handles restarts                                       │
│                                                             │
│  Worker (claude --resume)                                   │
│  ├── Picks up pending tasks                                 │
│  ├── Implements code                                        │
│  ├── Runs tests                                             │
│  └── Marks task as worker_done                              │
│                                                             │
│  Manager (claude --resume)                                  │
│  ├── Reviews worker_done tasks                              │
│  ├── Approves or requests changes                           │
│  ├── Generates skills from patterns                         │
│  └── Marks task as completed                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Task Lifecycle

```
pending → in_progress → worker_done → completed
              ↑             │
              └─────────────┘
           (changes requested)
```

### Skills System

As the Manager reviews completed work, it identifies reusable patterns and saves them as skill files. Future Workers can reference these skills.

## Dashboard

The Next.js dashboard provides real-time monitoring:

- **Bridge Status** - Running/stopped, PID, uptime
- **Managers** - All active managers and their queues
- **Projects** - Progress on all orchestrator projects
- **Human Tasks** - Tasks requiring manual action

## Data Flow

```
User ──Telegram──► Bridge ──spawn──► Manager (Opus)
                                         │
                                         ▼
                               Orchestrator (if project work)
                                         │
                                         ▼
                              Worker ◄──► Manager
                                         │
                                         ▼
                                    Skills learned
```

## File Locations

### Bridge State Files
- `.manager-registry.json` - Active managers
- `.conversation-history.json` - Recent messages
- `.telegram-state.json` - Last processed update ID
- `.human-tasks.json` - Pending human tasks

### Orchestrator State Files
- `prds/tasks.json` - Current project tasks
- `.state/worker.pid` - Worker process ID
- `.state/manager.pid` - Manager process ID
- `skills/*.md` - Learned patterns

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ORCHESTRATOR_DIR` | Auto-detected | Orchestrator directory path |
| `BRIDGE_DIR` | Auto-detected | Bridge directory path |
| `HOME` | System | User home directory |

## Security Considerations

### Private Data

The following should NEVER be committed:
- `config.json` (contains bot token)
- `*-sessions/` (contain conversations)
- `.manager-registry.json` (runtime state)
- `*.log` files

### Claude CLI

All Claude operations use the official CLI with `--dangerously-skip-permissions` for automation. Ensure you trust the system before running.
