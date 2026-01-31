# Insomnia: Inner Workings

A comprehensive technical guide to how the Insomnia autonomous AI agent system operates, from message receipt to task execution.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Stage 1: Message Receipt](#stage-1-message-receipt)
4. [Stage 2: Responder Classification](#stage-2-responder-classification)
5. [Stage 3: Manager Execution](#stage-3-manager-execution)
6. [Stage 4: Orchestrator System](#stage-4-orchestrator-system)
7. [State Files & Storage](#state-files--storage)
8. [Communication Patterns](#communication-patterns)
9. [Error Handling & Recovery](#error-handling--recovery)

---

## System Overview

Insomnia is a multi-agent autonomous system that enables users to command Claude AI agents via Telegram. The system consists of two main layers:

| Layer | Purpose | Location |
|-------|---------|----------|
| **Telegram Bridge** | Human interface - receives messages, routes to managers | `/bridge/` |
| **Orchestrator** | Autonomous project building with Worker/Manager coordination | `/orchestrator/` |

### Key Design Principles

1. **Parallelization First**: Every new request spawns a new manager for parallel execution
2. **Separation of Concerns**: Fast classification (Haiku) vs. deep work (Opus)
3. **Persistence**: All state is file-based for crash recovery
4. **Self-Healing**: Automatic restart of failed orchestrators with pending tasks

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER (Telegram)                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TELEGRAM BRIDGE LAYER                                │
│  ┌───────────────────┐     ┌─────────────────────┐     ┌─────────────────┐  │
│  │  telegram-server  │────▶│  telegram-responder │────▶│ manager-registry│  │
│  │  (Long Polling)   │     │  (Haiku Classifier) │     │  (State Store)  │  │
│  └───────────────────┘     └─────────────────────┘     └─────────────────┘  │
│           │                          │                          │           │
│           │                          ▼                          │           │
│           │                ┌─────────────────────┐              │           │
│           │                │ telegram-manager-   │◀─────────────┘           │
│           │                │ agent (Opus Spawner)│                          │
│           │                └─────────────────────┘                          │
│           │                          │                                      │
│           │              ┌───────────┼───────────┐                          │
│           │              ▼           ▼           ▼                          │
│           │         ┌─────────┐ ┌─────────┐ ┌─────────┐                     │
│           │         │Manager 1│ │Manager 2│ │Manager N│  (Parallel Opus)   │
│           │         └─────────┘ └─────────┘ └─────────┘                     │
└───────────│─────────────────────────│───────────────────────────────────────┘
            │                         │
            │                         ▼ (if building a project)
┌───────────│─────────────────────────────────────────────────────────────────┐
│           │              ORCHESTRATOR LAYER                                  │
│           │    ┌────────────────────────────────────────┐                   │
│           │    │           orchestrator.sh               │                   │
│           │    │  (Coordinates Worker + Manager Claude)  │                   │
│           │    └────────────────────────────────────────┘                   │
│           │              │                    │                              │
│           ▼              ▼                    ▼                              │
│    ┌─────────────┐ ┌─────────────┐     ┌─────────────┐                      │
│    │   Health    │ │  worker.sh  │◀───▶│ manager.sh  │                      │
│    │   Monitor   │ │   (Opus)    │     │   (Opus)    │                      │
│    │  (60s loop) │ │ Implements  │     │  Validates  │                      │
│    └─────────────┘ └─────────────┘     └─────────────┘                      │
│                           │                    │                             │
│                           └────────┬───────────┘                             │
│                                    ▼                                         │
│                           ┌─────────────┐                                    │
│                           │ tasks.json  │                                    │
│                           │ (Shared DB) │                                    │
│                           └─────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Stage 1: Message Receipt

**File:** `bridge/src/telegram-server.ts`

### Process Flow

```
User sends Telegram message
         │
         ▼
┌─────────────────────────┐
│   Long Polling Loop     │
│   (30 second timeout)   │
│   bot.getUpdates()      │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│    processUpdate()      │
│  - Extract chatId       │
│  - Extract userId       │
│  - Extract text         │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│   Authorization Check   │────▶│  isTelegramUserAllowed  │
│   (if configured)       │     │  Check config.json      │
└───────────┬─────────────┘     └─────────────────────────┘
            │
            ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│  Skip Bot Messages      │────▶│  isBotMessage()         │
│  (starts with 🤖)       │     │  Prefix detection       │
└───────────┬─────────────┘     └─────────────────────────┘
            │
            ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│  Deduplication Check    │────▶│  wasRecentlyProcessed() │
│  (30 second window)     │     │  .processed-messages    │
└───────────┬─────────────┘     └─────────────────────────┘
            │
            ▼
┌─────────────────────────┐
│  markAsProcessed()      │
│  Add to dedup store     │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ handleIncomingMessage() │
│ (Responder takes over)  │
└─────────────────────────┘
```

### Key State Files Used

| File | Purpose | TTL |
|------|---------|-----|
| `.bridge.lock` | Prevents multiple bridge instances | Until shutdown |
| `.telegram-state.json` | Stores `lastUpdateId` for resumption | Persistent |
| `.processed-messages.json` | Deduplication of incoming messages | 30 seconds |

### Lock File Management

```typescript
// Acquire lock on startup
acquireLock() {
  if (existsSync(LOCK_FILE)) {
    // Check if PID is still running
    const pid = readFileSync(LOCK_FILE);
    if (process.kill(pid, 0)) {
      // Another instance running - exit
      process.exit(1);
    }
    // Stale lock - remove it
    unlinkSync(LOCK_FILE);
  }
  writeFileSync(LOCK_FILE, process.pid);
}
```

### Health Monitoring

The bridge also monitors orchestrator health every 60 seconds:

```typescript
checkAndRestartOrchestrator() {
  if (!isOrchestratorAvailable()) return;
  if (!hasPendingTasks()) return;

  const status = isOrchestratorRunning();
  if (!status.worker || !status.manager) {
    // Restart orchestrator with pending tasks
    execSync('orchestrator.sh start');
  }
}
```

---

## Stage 2: Responder Classification

**File:** `bridge/src/telegram-responder.ts`

### Purpose

The responder uses Claude Haiku (fast, cheap) to classify incoming messages and decide how to route them. This keeps response time fast (~2-5 seconds for classification).

### Decision Types

| Action | When Used | Result |
|--------|-----------|--------|
| `create` | New topic/project not covered by existing managers | Spawns new Opus manager |
| `queue` | Message relates to existing manager's topic | Adds to manager's queue |
| `interrupt` | Urgent change to ongoing work ("stop", "actually", "instead") | Kills current manager, restarts with new message |
| `direct` | Pure greetings/thanks with no request | Responds immediately, no manager |

### Classification Flow

```
handleIncomingMessage(chatId, message, userId)
                │
                ▼
┌─────────────────────────┐
│  Load Active Managers   │
│  getAllManagers()       │
└───────────┬─────────────┘
                │
                ▼
┌─────────────────────────┐
│ Load Conversation History│
│ Last 25 messages        │
│ formatForPrompt()       │
└───────────┬─────────────┘
                │
                ▼
┌─────────────────────────┐
│ Build Classifier Prompt │
│ getClassifierPrompt()   │
│ - Manager list          │
│ - Conversation context  │
│ - Decision rules        │
└───────────┬─────────────┘
                │
                ▼
┌─────────────────────────┐
│ Run Haiku Classifier    │
│ spawn('claude',         │
│   ['--model', 'haiku']) │
│ Timeout: 30 seconds     │
└───────────┬─────────────┘
                │
                ▼
┌─────────────────────────┐
│ Parse JSON Response     │
│ parseClassifierResponse │
│ Extract: action, name,  │
│ description, topics     │
└───────────┬─────────────┘
                │
                ▼
┌─────────────────────────┐
│ Send ACK Immediately    │
│ "Creating manager X..." │
│ "Queuing to manager Y"  │
└───────────┬─────────────┘
                │
                ▼
┌─────────────────────────┐
│ Execute Decision        │
│ executeDecision()       │
└─────────────────────────┘
```

### Classifier Prompt Structure

```markdown
You are a message router. Classify this message and decide how to handle it.

## Active Managers
- "api-development" (processing): Handles API work | Topics: api, backend
- "frontend-fixes" (idle): UI bug fixes | Topics: ui, frontend, css

## Previous conversation
---
Alexander: Can you check the API status?
Claude: Checking API now...
---

## User Message
"Actually, work on the frontend instead"

## Decision Rules
1. CREATE new manager if: NEW project/topic...
2. QUEUE to existing manager if: relates to existing topic...
3. INTERRUPT a manager if: urgent changes, "stop", "actually"...
4. DIRECT response if: pure greetings only...

## Output Format
{
  "action": "interrupt",
  "managerId": "mgr_123456",
  "managerName": "api-development",
  ...
}
```

### Execute Decision Logic

```typescript
switch (decision.action) {
  case 'create':
    // Create new manager in registry
    const manager = createManager(name, description, topics);
    // Spawn Opus process
    const proc = spawnTelegramManager({ manager, initialMessage, chatId });
    // Track process reference
    setManagerProcess(manager.id, proc);
    break;

  case 'queue':
    // Add message to manager's queue
    queueMessageToManager(managerId, message, 'normal');
    // If manager is idle, wake it up
    if (manager.status === 'idle') {
      const proc = spawnTelegramManager({ manager, initialMessage, chatId });
      setManagerProcess(manager.id, proc);
    }
    break;

  case 'interrupt':
    // Kill current process
    interruptManager(managerId, message, chatId);
    // interruptManager will respawn with new message
    break;

  case 'direct':
    // Already sent ACK message, nothing more to do
    break;
}
```

---

## Stage 3: Manager Execution

**File:** `bridge/src/telegram-manager-agent.ts`

### Manager Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                      Manager Lifecycle                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   createManager()                                                │
│        │                                                         │
│        ▼                                                         │
│   ┌─────────┐                                                    │
│   │  IDLE   │◀───────────────────────────────────────┐          │
│   └────┬────┘                                         │          │
│        │ spawnTelegramManager()                       │          │
│        ▼                                              │          │
│   ┌──────────┐                                        │          │
│   │ ACTIVE   │                                        │          │
│   └────┬─────┘                                        │          │
│        │                                              │          │
│        ▼                                              │          │
│   ┌────────────┐                                      │          │
│   │ PROCESSING │───────────────────────┐              │          │
│   └────────────┘                       │              │          │
│        │                               ▼              │          │
│        │                      ┌─────────────────┐     │          │
│        │                      │  On Completion  │     │          │
│        │                      │  getNextMessage │     │          │
│        │                      └────────┬────────┘     │          │
│        │                               │              │          │
│        │                    ┌──────────┴──────────┐   │          │
│        │                    │                     │   │          │
│        │              Has Queue              Empty Queue         │
│        │                    │                     │   │          │
│        │                    ▼                     ▼   │          │
│        │              Spawn Again          Set IDLE   │          │
│        │              with next msg       ─────────────┘          │
│        │                    │                                    │
│        └────────────────────┘                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Manager Prompt Generation

Each spawned manager receives a detailed prompt with capabilities:

```typescript
function getManagerPrompt(manager: Manager, message: string, chatId: number): string {
  return `You are "${manager.name}" - a specialized manager agent for Alexander.

## Your Role
${manager.description}

## Topics You Handle
${manager.topics.map(t => `- ${t}`).join('\n')}

## Current Task
Alexander sent: "${message}"

## Your Capabilities

### 1. Send Telegram Responses
\`\`\`bash
node /path/to/telegram-send-cli.js ${chatId} "Your message"
\`\`\`

### 2. Manage Orchestrator Sessions
\`\`\`bash
cd /path/to/orchestrator && ./scripts/orchestrator.sh start
\`\`\`

### 3. Spawn Subagents for Code Work
\`\`\`bash
claude --model opus --dangerously-skip-permissions --add-dir <directory> -p "task"
\`\`\`

### 4. Create New Projects
[Instructions for creating tasks.json]

## Manager ID
Your manager ID is: ${manager.id}
`;
}
```

### Process Spawning

```typescript
function spawnTelegramManager(context: TelegramManagerContext): ChildProcess {
  const { manager, initialMessage, chatId } = context;

  // Update status to processing
  updateManager(manager.id, {
    status: 'processing',
    currentTask: initialMessage.substring(0, 100),
  });

  // Spawn Claude CLI process
  const claude = spawn('claude', [
    '--model', managerModel,  // Usually 'opus'
    '--dangerously-skip-permissions',
    '--add-dir', process.env.HOME
  ], {
    cwd: process.env.HOME,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Send prompt to stdin
  claude.stdin.write(prompt + '\n');
  claude.stdin.end();

  // Handle completion
  claude.on('close', (code) => {
    removeManagerProcess(manager.id);

    // Check for queued messages
    const nextMsg = getNextMessage(manager.id);
    if (nextMsg) {
      // Recursively spawn for next message
      const proc = spawnTelegramManager({
        manager: updatedManager,
        initialMessage: nextMsg.content,
        chatId
      });
      setManagerProcess(manager.id, proc);
    } else {
      // No more work - go idle
      updateManager(manager.id, { status: 'idle', currentTask: null });
    }
  });

  return claude;
}
```

### Interrupt Handling

```typescript
function interruptManager(managerId: string, message: string, chatId: number): boolean {
  const proc = getManagerProcess(managerId);

  if (proc) {
    // Kill the running process
    proc.kill('SIGTERM');
    removeManagerProcess(managerId);
  }

  // Queue the interrupt message with HIGH PRIORITY (goes to front)
  queueMessageToManager(managerId, message, 'interrupt');

  // Immediately spawn new process with interrupt message
  const manager = updateManager(managerId, { status: 'active' });
  const newProc = spawnTelegramManager({ manager, initialMessage: message, chatId });
  setManagerProcess(managerId, newProc);

  return true;
}
```

---

## Stage 4: Orchestrator System

**Files:** `orchestrator/scripts/orchestrator.sh`, `worker.sh`, `manager.sh`

### When Orchestrators Are Used

Managers spawn orchestrators when building substantial projects. The orchestrator provides:
- Coordinated Worker/Manager Claude loop
- Automatic test validation
- Retry logic with feedback
- Skill generation from learnings

### Orchestrator Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     orchestrator.sh                              │
│                  (Coordinator Script)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│    ┌─────────────────┐              ┌─────────────────┐         │
│    │    worker.sh    │              │   manager.sh    │         │
│    │   (Opus CLI)    │              │   (Opus CLI)    │         │
│    │                 │              │                 │         │
│    │  Implements     │              │  Validates      │         │
│    │  tasks from     │◀────────────▶│  worker's       │         │
│    │  tasks.json     │   Shared     │  completions    │         │
│    │                 │   File       │                 │         │
│    └────────┬────────┘              └────────┬────────┘         │
│             │                                │                   │
│             │         ┌──────────┐           │                   │
│             └────────▶│tasks.json│◀──────────┘                   │
│                       │  (Shared │                               │
│                       │ Database)│                               │
│                       └──────────┘                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Task Status Flow

```
┌──────────┐     ┌─────────────┐     ┌─────────────┐     ┌───────────┐
│ pending  │────▶│ in_progress │────▶│ worker_done │────▶│ completed │
└──────────┘     └─────────────┘     └─────────────┘     └───────────┘
     ▲                                      │
     │                                      │
     │                                      ▼
     │                              ┌──────────────┐
     └──────────────────────────────│Manager Review│
                                    │ Tests FAIL   │
                                    │ + feedback   │
                                    └──────────────┘
```

### Worker Loop (`worker.sh`)

```bash
main() {
  while true; do
    # 1. Get next pending task
    task_id=$(get_next_task)  # status == "pending" or "in_progress"

    if [[ -z "$task_id" ]]; then
      # No more tasks
      break
    fi

    # 2. Mark as in_progress
    update_task_status "$task_id" "in_progress" "false" ""

    # 3. Build prompt with:
    #    - Task requirements
    #    - Test command
    #    - Manager feedback (if retry)
    #    - Loaded skills
    prompt=$(build_worker_prompt "$task_id")

    # 4. Run Claude
    echo "$prompt" | claude -p --dangerously-skip-permissions --model opus

    # Claude updates tasks.json to "worker_done" when tests pass

    sleep $ITERATION_DELAY
  done
}
```

### Worker Prompt Structure

```markdown
# Worker Claude - Task Implementation

## Task ID: task-001
## Iteration: 5

## Manager Feedback (Fix This)
Tests failing because the API endpoint returns 404. Check route registration.

## Project: my-app
**Directory:** /Users/alexander/Documents/my-app

## Task: Implement User Authentication

Add JWT-based user authentication to the API.

### Requirements
- Create /auth/login endpoint
- Validate credentials against database
- Return JWT token on success

### Test Command
`npm test`

## Instructions

1. Navigate to: `/Users/alexander/Documents/my-app`
2. Implement the requirements
3. Run: `npm test`
4. If tests pass, mark complete:
   ```bash
   jq '(.tasks[] | select(.id == "task-001")) |= . + {status: "worker_done", testsPassing: true}' tasks.json > tmp && mv tmp tasks.json
   ```
```

### Manager Loop (`manager.sh`)

```bash
main() {
  while true; do
    # 1. Find task needing review (status == "worker_done")
    task_id=$(get_task_needing_review)

    if [[ -n "$task_id" ]]; then
      # 2. Run tests and validate
      run_manager_review "$task_id"
      # Manager updates to "completed" or back to "pending" with feedback
    fi

    # 3. Check if all complete
    if check_all_tasks_complete; then
      break
    fi

    sleep $REVIEW_INTERVAL
  done

  # 4. Generate skills from problem tasks
  run_skill_generation
  generate_final_report
}
```

### Manager Review Prompt

```markdown
# Validate: Implement User Authentication (task-001)

Run: `cd /Users/alexander/Documents/my-app && npm test`

If tests PASS:
```bash
jq '(.tasks[] | select(.id == "task-001")) |= . + {status: "completed", managerReview: "Tests pass"}' tasks.json > tmp && mv tmp tasks.json
```

If tests FAIL (update managerReview with 1-2 sentence fix instruction):
```bash
jq '(.tasks[] | select(.id == "task-001")) |= . + {status: "pending", managerReview: "BRIEF_FIX_INSTRUCTION", retryCount: ((.retryCount // 0) + 1)}' tasks.json > tmp && mv tmp tasks.json
```
```

### Skill Generation

When the orchestrator shuts down, if any tasks required retries, it generates skill files:

```bash
build_skill_generation_prompt() {
  # Get tasks that had retries
  problem_tasks=$(jq -r '.tasks[] | select((.retryCount // 0) > 0)' tasks.json)

  cat <<EOF
# Skill Generation for my-app

These tasks required retries:
- Implement User Auth (retried 2x): Route registration was missing
- Add Validation (retried 1x): Schema was incorrect

Review the code and create concise skill files to help future workers.
EOF
}
```

Skills are saved to `orchestrator/skills/*.md` and loaded by future worker sessions.

---

## State Files & Storage

### Bridge State Files

| File | Location | Purpose | Persistence |
|------|----------|---------|-------------|
| `config.json` | `/bridge/` | Bot token, allowed users, model config | Permanent |
| `.manager-registry.json` | `/bridge/` | All managers, their state, message queues | Runtime |
| `.conversation-history.json` | `/bridge/` | Last 25 messages for context | Runtime |
| `.telegram-state.json` | `/bridge/` | Last processed update ID | Persistent |
| `.processed-messages.json` | `/bridge/` | Incoming message deduplication | 30s TTL |
| `.sent-messages.json` | `/bridge/` | Outgoing message deduplication | 120s TTL |
| `.bridge.lock` | `/bridge/` | Single instance lock | Runtime |
| `.human-tasks.json` | `/bridge/` | Tasks requiring human action | Persistent |

### Manager Registry Structure

```json
{
  "managers": [
    {
      "id": "mgr_1706543210000",
      "name": "api-development",
      "description": "Handles API development work",
      "topics": ["api", "backend", "endpoint"],
      "status": "processing",
      "currentTask": "Implement user authentication...",
      "pid": 12345,
      "orchestratorSessionId": null,
      "messageQueue": [
        {
          "id": "msg_1706543220000",
          "content": "Also add rate limiting",
          "timestamp": "2024-01-29T10:00:20.000Z",
          "priority": "normal"
        }
      ],
      "createdAt": "2024-01-29T10:00:10.000Z",
      "lastActiveAt": "2024-01-29T10:05:30.000Z"
    }
  ],
  "version": 1
}
```

### Orchestrator State Files

| File | Location | Purpose |
|------|----------|---------|
| `prds/tasks.json` | `/orchestrator/` | Project definition and task list |
| `projects.json` | `/orchestrator/` | Multi-project registry |
| `.state/worker.pid` | `/orchestrator/` | Worker process ID |
| `.state/manager.pid` | `/orchestrator/` | Manager process ID |
| `.state/worker_iteration` | `/orchestrator/` | Current iteration count |
| `.state/manager_reviews` | `/orchestrator/` | Review count |
| `.state/worker_status` | `/orchestrator/` | Worker status ("running", "stopping") |
| `.state/current_task` | `/orchestrator/` | Currently processing task ID |
| `skills/*.md` | `/orchestrator/` | Generated skills from learnings |

### Tasks.json Structure

```json
{
  "project": {
    "name": "my-app",
    "description": "A sample application",
    "outputDir": "~/Documents/my-app"
  },
  "tasks": [
    {
      "id": "task-001",
      "name": "Implement User Authentication",
      "description": "Add JWT-based authentication",
      "requirements": [
        "Create /auth/login endpoint",
        "Validate credentials",
        "Return JWT token"
      ],
      "testCommand": "npm test",
      "status": "completed",
      "testsPassing": true,
      "workerNotes": "Implemented using jsonwebtoken library",
      "managerReview": "Tests pass",
      "retryCount": 1
    }
  ]
}
```

### Session Logs

| Directory | Contents |
|-----------|----------|
| `/bridge/manager-sessions/` | Per-manager session logs (`mgr_123_timestamp.log`) |
| `/bridge/responder-sessions/` | Responder decision logs (`resp_timestamp.log`) |
| `/orchestrator/logs/` | Worker and Manager stdout/stderr logs |

---

## Communication Patterns

### Pattern 1: Telegram → Manager

```
User sends message
       │
       ▼
Long polling receives
       │
       ▼
Responder classifies (Haiku)
       │
       ▼
ACK sent to user immediately
       │
       ▼
Manager spawned (Opus)
       │
       ▼
Manager works autonomously
       │
       ▼
Manager sends updates via telegram-send-cli.js
       │
       ▼
On completion, checks queue for next message
```

### Pattern 2: Manager → Orchestrator

```
Manager receives project request
       │
       ▼
Creates prds/tasks.json with task definitions
       │
       ▼
Runs: orchestrator.sh start
       │
       ▼
Orchestrator spawns Worker + Manager scripts
       │
       ▼
Worker implements tasks
       │
       ▼
Manager validates via tests
       │
       ▼
Tasks progress: pending → completed
       │
       ▼
Bridge monitors orchestrator health (60s interval)
       │
       ▼
Auto-restarts if crashed with pending tasks
```

### Pattern 3: Worker ↔ Manager (Orchestrator)

```
Worker picks task (status: pending)
       │
       ▼
Worker marks as in_progress
       │
       ▼
Worker implements and runs tests
       │
       ▼
Worker marks as worker_done
       │
       ▼
Manager picks up for review
       │
       ▼
Manager runs tests independently
       │
       ├──── Tests PASS ────▶ Marks as completed
       │
       └──── Tests FAIL ────▶ Marks as pending + adds managerReview
                                       │
                                       ▼
                              Worker picks up again with feedback
```

---

## Error Handling & Recovery

### Bridge Level

1. **Lock File Management**: Stale locks are detected and removed
2. **Consecutive Failures**: After 3 consecutive classifier failures, falls back to general manager
3. **Process Tracking**: In-memory process references with cleanup on exit
4. **Deduplication**: Time-based expiry prevents stale entries

### Orchestrator Level

1. **Auto-Restart**: Bridge monitors orchestrator every 60 seconds, restarts if crashed with pending tasks
2. **Max Iterations**: Worker stops after MAX_ITERATIONS (default: 1000) to prevent infinite loops
3. **Consecutive Failures**: After 3 consecutive worker failures, system stops
4. **Auto-Approval**: If manager review fails, task is auto-approved to prevent blocking
5. **Graceful Shutdown**: On SIGTERM/SIGINT, generates skills and final report before exit

### Health Checker

On bridge startup, `health-checker.ts` runs:

```typescript
runStartupHealthCheck() {
  // 1. Validate all required paths exist
  validatePaths();

  // 2. Remove invalid managers (undefined names, duplicates)
  cleanInvalidManagers();

  // 3. Fix stuck managers (status=processing but PID dead)
  fixStuckManagers();

  // 4. Clean up stale PID files
  cleanStalePids();

  // 5. Validate config file
  validateConfig();
}
```

---

## Configuration

### Model Selection

Models are configurable in `bridge/config.json`:

```json
{
  "telegramBotToken": "123456:ABC...",
  "telegramAllowedUserIds": [123456789],
  "models": {
    "responder": "haiku",
    "defaultManager": "opus",
    "orchestratorWorker": "opus",
    "orchestratorManager": "opus"
  }
}
```

| Role | Default Model | Purpose |
|------|---------------|---------|
| Responder | Haiku | Fast message classification (~2-5s) |
| Default Manager | Opus | Complex task execution |
| Orchestrator Worker | Opus | Code implementation |
| Orchestrator Manager | Opus | Code review and validation |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_ITERATIONS` | 1000 | Max worker iterations before stopping |
| `WORKER_MODEL` | opus | Model for orchestrator worker |
| `MANAGER_MODEL` | opus | Model for orchestrator manager |
| `ITERATION_DELAY` | 5 | Seconds between worker iterations |
| `REVIEW_INTERVAL` | 60 | Seconds between manager reviews |
| `PROJECT_OUTPUT_DIR` | ~/Documents | Default project output directory |

---

## Summary

The Insomnia system is a sophisticated multi-agent pipeline that:

1. **Receives** user commands via Telegram long polling
2. **Classifies** messages quickly using Haiku for routing decisions
3. **Spawns** parallel Opus managers for complex task execution
4. **Coordinates** autonomous project building with Worker/Manager orchestrators
5. **Persists** all state to JSON files for crash recovery
6. **Self-heals** by monitoring and restarting failed components
7. **Learns** by generating skills from problem tasks

The key insight is the separation between fast classification (Haiku) and deep work (Opus), combined with aggressive parallelization through the multi-manager architecture.
