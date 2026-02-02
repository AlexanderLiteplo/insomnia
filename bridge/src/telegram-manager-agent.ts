/**
 * Telegram Manager Agent
 * Spawns and manages Opus agents for Telegram messages
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { log } from './logger';
import { DATA_DIR, getModel } from './config';
import {
  Manager,
  updateManager,
  getNextMessage,
  setManagerProcess,
  removeManagerProcess,
  getManagerProcess,
  queueMessageToManager,
} from './manager-registry';
import { PATHS, getOrchestratorDir, getSendCliPath } from './paths';

const MANAGER_SESSIONS_DIR = PATHS.bridge.managerSessions;
const ORCHESTRATOR_DIR = getOrchestratorDir();

// Ensure sessions directory exists
fs.mkdirSync(MANAGER_SESSIONS_DIR, { recursive: true });

export interface TelegramManagerContext {
  manager: Manager;
  initialMessage: string;
  chatId: number;
}

// Track chat IDs for managers (for sending responses)
const managerChatIds = new Map<string, number>();

function getManagerPrompt(manager: Manager, message: string, chatId: number): string {
  const BRIDGE_DIR = PATHS.bridge.root;
  const projectsDir = PATHS.bridge.projects;
  const prdsDir = PATHS.bridge.prds;

  return `You are "${manager.name}" - a specialized manager agent for Alexander.

## Your Role
${manager.description}

## Topics You Handle
${manager.topics.map(t => `- ${t}`).join('\n')}

## Current Task
Alexander sent: "${message}"

## System Architecture (IMPORTANT)
You are part of a hierarchical multi-agent system:
- **Responder** routes messages to managers (you)
- **Managers** (you) handle topics and spawn orchestrators for projects
- **Orchestrators** execute PRD-based workflows (Worker implements, Manager reviews)

**CRITICAL: All project work MUST go through an orchestrator with a PRD.**
Never directly implement features - always create a PRD first, then start an orchestrator.

## Your Capabilities

### 1. Send Telegram Responses
Always communicate progress and results via Telegram:
\`\`\`bash
node ${path.join(DATA_DIR, 'dist', 'telegram-send-cli.js')} ${chatId} "Your message to Alexander"
\`\`\`

### 2. Query System State (Use This First!)
Fast queries for messages, managers, and projects:
\`\`\`bash
cd ${BRIDGE_DIR} && npm run query help              # Show all commands
cd ${BRIDGE_DIR} && npm run query stats             # Quick system overview
cd ${BRIDGE_DIR} && npm run query messages list 10  # Last 10 messages
cd ${BRIDGE_DIR} && npm run query messages search "keyword"
cd ${BRIDGE_DIR} && npm run query managers list     # All managers with status
cd ${BRIDGE_DIR} && npm run query managers search "keyword"
cd ${BRIDGE_DIR} && npm run query managers get <name>  # Details for one manager
cd ${BRIDGE_DIR} && npm run query projects list
cd ${BRIDGE_DIR} && npm run query projects search "keyword"
\`\`\`

### 3. Access Raw Registries (if needed)
Read the project registry to find existing projects:
\`\`\`bash
cat ${PATHS.bridge.projectRegistry}
\`\`\`

Read the manager registry to see all managers:
\`\`\`bash
cat ${PATHS.bridge.managerRegistry}
\`\`\`

### 4. PRD-Based Workflow (MANDATORY for all project work)

**For NEW Projects:**
1. Create a PRD document:
\`\`\`bash
PROJECT_NAME="my-project"  # Use kebab-case

cat > ${prdsDir}/$PROJECT_NAME.md << 'PRDEOF'
# Project: $PROJECT_NAME

## Overview
<description of the project>

## Goals
- Goal 1
- Goal 2

## Requirements
### Must Have
- Requirement 1

### Nice to Have
- Optional feature

## Technical Approach
<how to implement>

## Success Criteria
- Tests pass
- Feature works as specified
PRDEOF
\`\`\`

2. Create project directory and tasks.json from the PRD:
\`\`\`bash
mkdir -p ${projectsDir}/$PROJECT_NAME

cat > ${projectsDir}/$PROJECT_NAME/tasks.json << 'TASKEOF'
{
  "project": {
    "name": "my-project",
    "description": "Brief description",
    "outputDir": "/path/to/where/code/lives",
    "prdFile": "prds/my-project.md"
  },
  "tasks": [
    {
      "id": "task-001",
      "name": "Task derived from PRD",
      "description": "What needs to be done",
      "requirements": ["req1", "req2"],
      "testCommand": "npm test",
      "status": "pending",
      "testsPassing": false,
      "workerNotes": "",
      "managerReview": ""
    }
  ]
}
TASKEOF
\`\`\`

3. Start the orchestrator:
\`\`\`bash
cd ${ORCHESTRATOR_DIR} && ./scripts/orchestrator.sh start
\`\`\`

**For EXISTING Projects:**
1. Check if project exists in registry
2. Read existing PRD and tasks
3. Update PRD if requirements changed
4. Add new tasks or modify existing ones
5. Restart orchestrator if needed

**For Bug Fixes:**
1. Find the project in registry
2. Add a bug fix task to tasks.json
3. Ensure orchestrator is running

### 4. Orchestrator Control
**Start an orchestrator:**
\`\`\`bash
cd ${ORCHESTRATOR_DIR} && ./scripts/orchestrator.sh start
\`\`\`

**Check orchestrator status:**
\`\`\`bash
cd ${ORCHESTRATOR_DIR} && ./scripts/orchestrator.sh status
\`\`\`

**Check all projects:**
\`\`\`bash
${ORCHESTRATOR_DIR}/scripts/projects.sh status
\`\`\`

### 5. Spawn Subagents (for quick tasks only)
For simple tasks that don't need full orchestration:
\`\`\`bash
claude --model opus --dangerously-skip-permissions --add-dir <directory> -p "task description"
\`\`\`

## Important Rules
1. **PRD FIRST** - Never start coding without a PRD document
2. **Orchestrator for all project work** - Use the rigid workflow
3. ALWAYS send a Telegram message when you complete a task or need input
4. ALWAYS send a Telegram message if you encounter an error
5. Keep Alexander informed of progress on long-running tasks
6. When done with this task, send a completion message

## File Locations
- Project Registry: ${PATHS.bridge.projectRegistry}
- Manager Registry: ${PATHS.bridge.managerRegistry}
- PRD Documents: ${prdsDir}/
- Project Tasks: ${projectsDir}/<project-name>/tasks.json
- Orchestrator: ${ORCHESTRATOR_DIR}

## Manager ID
Your manager ID is: ${manager.id}
This is used by the system to track your state.

Now handle the request above.`;
}

export function spawnTelegramManager(context: TelegramManagerContext): ChildProcess {
  const { manager, initialMessage, chatId } = context;
  const sessionId = `${manager.id}_${Date.now()}`;
  const logPath = path.join(MANAGER_SESSIONS_DIR, `${sessionId}.log`);

  // Store chat ID for this manager
  managerChatIds.set(manager.id, chatId);

  log(`[Manager ${manager.name}] Spawning for: "${initialMessage.substring(0, 50)}..."`);

  // Update manager status
  updateManager(manager.id, {
    status: 'processing',
    currentTask: initialMessage.substring(0, 100),
  });

  const prompt = getManagerPrompt(manager, initialMessage, chatId);

  // Get configured model for managers
  const managerModel = getModel('defaultManager');
  log(`[Manager ${manager.name}] Using model: ${managerModel}`);

  const claude = spawn(
    'claude',
    ['--model', managerModel, '--dangerously-skip-permissions', '--add-dir', process.env.HOME || require('os').homedir()],
    {
      cwd: process.env.HOME || require('os').homedir(),
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );

  claude.stdin.write(prompt + '\n');
  claude.stdin.end();

  // Log output
  claude.stdout.on('data', (data) => {
    const text = data.toString().trim();
    fs.appendFileSync(logPath, `[STDOUT] ${text}\n`);
    if (text.length > 0) {
      log(`[Manager ${manager.name}] ${text.substring(0, 100)}`);
    }
  });

  claude.stderr.on('data', (data) => {
    fs.appendFileSync(logPath, `[STDERR] ${data}`);
  });

  claude.on('close', (code) => {
    log(`[Manager ${manager.name}] Session ${sessionId} finished with code ${code}`);
    removeManagerProcess(manager.id);

    // Check for queued messages
    const nextMsg = getNextMessage(manager.id);
    if (nextMsg) {
      log(`[Manager ${manager.name}] Processing next queued message`);
      const updatedManager = updateManager(manager.id, { status: 'active' });
      if (updatedManager) {
        const storedChatId = managerChatIds.get(manager.id) || chatId;
        const proc = spawnTelegramManager({ manager: updatedManager, initialMessage: nextMsg.content, chatId: storedChatId });
        setManagerProcess(manager.id, proc);
      }
    } else {
      updateManager(manager.id, {
        status: 'idle',
        currentTask: null,
      });
      log(`[Manager ${manager.name}] Now idle`);
    }
  });

  claude.on('error', (err) => {
    log(`[Manager ${manager.name}] Error: ${err.message}`);
    fs.appendFileSync(logPath, `[ERROR] ${err.message}\n`);
    removeManagerProcess(manager.id);
    updateManager(manager.id, { status: 'idle', currentTask: null });
  });

  // Store process reference
  setManagerProcess(manager.id, claude);
  updateManager(manager.id, { pid: claude.pid || null });

  return claude;
}

export function interruptManager(managerId: string, message: string, chatId: number): boolean {
  const proc = getManagerProcess(managerId);

  if (proc) {
    log(`[Manager] Interrupting manager ${managerId}`);
    proc.kill('SIGTERM');
    removeManagerProcess(managerId);
  }

  // Queue the interrupt message with high priority
  queueMessageToManager(managerId, message, 'interrupt');

  // Update chat ID
  managerChatIds.set(managerId, chatId);

  // Get manager and spawn new process for interrupt
  const manager = updateManager(managerId, { status: 'active' });
  if (manager) {
    const newProc = spawnTelegramManager({ manager, initialMessage: message, chatId });
    setManagerProcess(managerId, newProc);
    return true;
  }

  return false;
}

// Check if a manager's process is still running
export function isManagerRunning(managerId: string): boolean {
  const proc = getManagerProcess(managerId);
  return proc !== undefined && !proc.killed;
}

// Get chat ID for a manager
export function getManagerChatId(managerId: string): number | undefined {
  return managerChatIds.get(managerId);
}

// Get all manager session logs
export function getManagerSessions(): string[] {
  if (!fs.existsSync(MANAGER_SESSIONS_DIR)) return [];
  return fs.readdirSync(MANAGER_SESSIONS_DIR)
    .filter(f => f.endsWith('.log'))
    .sort()
    .reverse();
}
