import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { log } from './logger';
import { DATA_DIR } from './config';
import { sendMessage } from './imessage';
import { loadConfig } from './config';
import {
  Manager,
  updateManager,
  getNextMessage,
  setManagerProcess,
  removeManagerProcess,
  getManagerProcess,
  queueMessageToManager,
} from './manager-registry';

const MANAGER_SESSIONS_DIR = path.join(DATA_DIR, 'manager-sessions');
const ORCHESTRATOR_DIR = process.env.ORCHESTRATOR_DIR || path.join(__dirname, '..', '..', 'orchestrator');

// Ensure sessions directory exists
fs.mkdirSync(MANAGER_SESSIONS_DIR, { recursive: true });

export interface ManagerContext {
  manager: Manager;
  initialMessage: string;
}

function getManagerPrompt(manager: Manager, message: string): string {
  return `You are "${manager.name}" - a specialized manager agent for Alexander.

## Your Role
${manager.description}

## Topics You Handle
${manager.topics.map(t => `- ${t}`).join('\n')}

## Current Task
Alexander sent: "${message}"

## Your Capabilities

### 1. Send iMessage Responses
Always communicate progress and results via iMessage:
\`\`\`bash
node ${path.join(DATA_DIR, 'dist', 'send-cli.js')} "Your message to Alexander"
\`\`\`

### 2. Manage Orchestrator Sessions
You can start/stop/check orchestrator sessions for building projects:

**Start an orchestrator for a project:**
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

### 3. Spawn Subagents for Code Work
For specific coding tasks, spawn Opus subagents:
\`\`\`bash
claude --model opus --dangerously-skip-permissions --add-dir <directory> -p "task description"
\`\`\`

### 4. Create New Projects
Create tasks.json files and register with the orchestrator system.

## Important Rules
1. ALWAYS send an iMessage when you complete a task or need input
2. ALWAYS send an iMessage if you encounter an error
3. Keep Alexander informed of progress on long-running tasks
4. When done with this task, send a completion message

## Manager ID
Your manager ID is: ${manager.id}
This is used by the system to track your state.

Now handle the request above.`;
}

export function spawnManager(context: ManagerContext): ChildProcess {
  const { manager, initialMessage } = context;
  const sessionId = `${manager.id}_${Date.now()}`;
  const logPath = path.join(MANAGER_SESSIONS_DIR, `${sessionId}.log`);

  log(`[Manager ${manager.name}] Spawning for: "${initialMessage.substring(0, 50)}..."`);

  // Update manager status
  updateManager(manager.id, {
    status: 'processing',
    currentTask: initialMessage.substring(0, 100),
  });

  const prompt = getManagerPrompt(manager, initialMessage);

  const claude = spawn(
    'claude',
    ['--model', 'opus', '--dangerously-skip-permissions', '--add-dir', process.env.HOME || require('os').homedir()],
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
      // Update manager and spawn for next message
      const updatedManager = updateManager(manager.id, { status: 'active' });
      if (updatedManager) {
        const proc = spawnManager({ manager: updatedManager, initialMessage: nextMsg.content });
        setManagerProcess(manager.id, proc);
      }
    } else {
      // No more messages, go idle
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

export function interruptManager(managerId: string, message: string): boolean {
  const proc = getManagerProcess(managerId);

  if (proc) {
    log(`[Manager] Interrupting manager ${managerId}`);
    // Kill current process
    proc.kill('SIGTERM');
    removeManagerProcess(managerId);
  }

  // Queue the interrupt message with high priority
  queueMessageToManager(managerId, message, 'interrupt');

  // Get manager and spawn new process for interrupt
  const manager = updateManager(managerId, { status: 'active' });
  if (manager) {
    const newProc = spawnManager({ manager, initialMessage: message });
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

// Get all manager session logs
export function getManagerSessions(): string[] {
  if (!fs.existsSync(MANAGER_SESSIONS_DIR)) return [];
  return fs.readdirSync(MANAGER_SESSIONS_DIR)
    .filter(f => f.endsWith('.log'))
    .sort()
    .reverse();
}
