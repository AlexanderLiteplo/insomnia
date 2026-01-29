import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { loadHistory, formatForPrompt, addMessage } from './history';
import { log } from './logger';
import { DATA_DIR } from './config';

const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const SEND_SCRIPT = path.join(DATA_DIR, 'dist', 'send-cli.js');

// Message queue and processing state
interface QueuedMessage {
  message: string;
  workDir: string;
  timestamp: number;
}

const messageQueue: QueuedMessage[] = [];
let isProcessing = false;
let currentAgent: ChildProcess | null = null;

export function getQueueStatus(): { processing: boolean; queueLength: number } {
  return { processing: isProcessing, queueLength: messageQueue.length };
}

export function queueMessage(message: string, workDir: string): void {
  messageQueue.push({ message, workDir, timestamp: Date.now() });
  log(`Message queued. Queue length: ${messageQueue.length}, Processing: ${isProcessing}`);
  processNextMessage();
}

function processNextMessage(): void {
  // Don't start if already processing or queue is empty
  if (isProcessing || messageQueue.length === 0) {
    return;
  }

  const next = messageQueue.shift()!;
  isProcessing = true;
  log(`Processing message from queue. Remaining: ${messageQueue.length}`);
  spawnAgentInternal(next.message, next.workDir);
}

function spawnAgentInternal(message: string, workDir: string): void {
  const sessionId = `imsg_${Date.now()}`;
  const logPath = path.join(SESSIONS_DIR, `${sessionId}.log`);

  fs.mkdirSync(SESSIONS_DIR, { recursive: true });

  addMessage('user', message);

  const history = loadHistory();
  const historyContext = formatForPrompt(history);

  const prompt = `You received an iMessage from Alexander: "${message}"
${historyContext}

Your task: Respond to this message and complete any request.

You can:
1. Send iMessage back using: node ${SEND_SCRIPT} "your message"
2. Perform any tasks needed (code, research, deploy, etc.)
3. Ask for clarification if needed

## Checking Project Status

When Alexander asks about project progress or status, run:
\`\`\`bash
~/Documents/claude-manager/scripts/projects.sh status
\`\`\`

This will show all active projects and their completion status. Send the output back via iMessage.

For JSON format (if needed for parsing):
\`\`\`bash
~/Documents/claude-manager/scripts/projects.sh status-json
\`\`\`

## Creating New Projects

When Alexander asks you to build a new app/project from scratch:

1. Create a unique tasks file (use project name):
\`\`\`bash
# Create tasks file at ~/Documents/claude-manager/projects/<project-name>/tasks.json
mkdir -p ~/Documents/claude-manager/projects/<project-name>
\`\`\`

2. Write the tasks.json file:
\`\`\`json
{
  "project": {
    "name": "project-name",
    "description": "What the project does",
    "outputDir": "~/Documents/project-name"
  },
  "tasks": [
    {
      "id": "task-001",
      "name": "Setup project",
      "description": "Initialize the project structure",
      "requirements": ["Requirement 1", "Requirement 2"],
      "testCommand": "npm run build",
      "status": "pending",
      "testsPassing": false,
      "workerNotes": "",
      "managerReview": ""
    }
  ]
}
\`\`\`

3. Register the project:
\`\`\`bash
~/Documents/claude-manager/scripts/projects.sh add "project-name" "~/Documents/claude-manager/projects/project-name/tasks.json"
\`\`\`

4. Copy to active tasks and start:
\`\`\`bash
cp ~/Documents/claude-manager/projects/project-name/tasks.json ~/Documents/claude-manager/prds/tasks.json
cd ~/Documents/claude-manager && ./scripts/orchestrator.sh start
\`\`\`

5. Send Alexander an iMessage confirming the project has been started

The Worker Claude (Sonnet) will implement tasks and the Manager Claude (Opus) will review quality.

## Stopping Projects

To stop a running project:
\`\`\`bash
cd ~/Documents/claude-manager && ./scripts/orchestrator.sh stop
\`\`\`

## Modifying Existing Code (Not New Projects)

When Alexander asks you to update, fix, search, or modify EXISTING code (not build something from scratch), spawn an Opus subagent to handle it:

\`\`\`bash
# Spawn a subagent to work on a specific directory
claude --model opus --dangerously-skip-permissions --add-dir <target-directory> -p "<task description>"
\`\`\`

Examples of when to use subagents:
- "Fix the bug in my API" → spawn subagent with the project directory
- "Add a new endpoint to the server" → spawn subagent
- "Search for where X is defined" → spawn subagent
- "Refactor the authentication code" → spawn subagent
- "Update the config to use Y" → spawn subagent

Example:
\`\`\`bash
# Fix a bug in an existing project
claude --model opus --dangerously-skip-permissions --add-dir ~/Documents/my-app -p "Find and fix the bug causing login failures. After fixing, run the tests to verify. Report back what you found and fixed."

# Search for something in a codebase
claude --model opus --dangerously-skip-permissions --add-dir ~/Documents/my-app -p "Search for all usages of the UserService class and summarize how it's being used."

# Add a feature to existing code
claude --model opus --dangerously-skip-permissions --add-dir ~/Documents/my-app -p "Add a /health endpoint to the Express server that returns {status: 'ok'}. Run the build to verify it compiles."
\`\`\`

The subagent will complete the task and exit. Its output will show you what it did. Then send Alexander an iMessage summarizing the results.

Use subagents for existing code work. Use the claude-manager system (above) only for building entirely new projects from scratch.

IMPORTANT: The conversation history above shows our previous messages. Use this context to provide relevant, informed responses.

Respond appropriately to the request.`;

  log(`Spawning Claude agent for: "${message.substring(0, 50)}..."`);

  const claude = spawn(
    'claude',
    ['--model', 'opus', '--dangerously-skip-permissions', '--add-dir', workDir],
    {
      cwd: workDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );

  claude.stdin.write(prompt + '\n');
  claude.stdin.end();

  claude.stdout.on('data', (data) => {
    fs.appendFileSync(logPath, data);
    log(`[Agent] ${data.toString().trim().substring(0, 100)}`);
  });

  claude.stderr.on('data', (data) => {
    fs.appendFileSync(logPath, `[STDERR] ${data}`);
  });

  claude.on('close', (code) => {
    log(`Agent session ${sessionId} finished with code ${code}`);
    currentAgent = null;
    isProcessing = false;
    // Process next message in queue
    processNextMessage();
  });

  claude.on('error', (err) => {
    log(`Agent error: ${err.message}`);
    currentAgent = null;
    isProcessing = false;
    // Try next message even on error
    processNextMessage();
  });

  currentAgent = claude;
}

// Legacy export for backwards compatibility - now queues instead of spawning immediately
export function spawnAgent(message: string, workDir: string): void {
  queueMessage(message, workDir);
}

// Graceful shutdown - kill current agent if running
export function shutdownAgent(): void {
  if (currentAgent) {
    log(`Shutting down current agent (PID: ${currentAgent.pid})`);
    currentAgent.kill('SIGTERM');
    currentAgent = null;
  }
  isProcessing = false;
  const dropped = messageQueue.length;
  messageQueue.length = 0;
  if (dropped > 0) {
    log(`Dropped ${dropped} queued messages on shutdown`);
  }
}
