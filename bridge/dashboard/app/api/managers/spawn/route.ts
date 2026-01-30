import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { authenticateRequest, checkRateLimit, getRateLimitIdentifier } from '../../../lib/auth';
import { BRIDGE_DIR, MANAGER_REGISTRY, CONFIG_PATH } from '../../../lib/paths';

const MANAGER_SESSIONS_DIR = path.join(BRIDGE_DIR, 'manager-sessions');

interface Manager {
  id: string;
  name: string;
  description: string;
  topics: string[];
  status: 'active' | 'idle' | 'processing';
  currentTask: string | null;
  pid: number | null;
  orchestratorSessionId: string | null;
  messageQueue: Array<{
    id: string;
    content: string;
    timestamp: string;
    priority: 'normal' | 'interrupt';
  }>;
  createdAt: string;
  lastActiveAt: string;
}

interface ManagerRegistry {
  managers: Manager[];
  version: number;
}

function loadRegistry(): ManagerRegistry {
  if (!fs.existsSync(MANAGER_REGISTRY)) {
    return { managers: [], version: 1 };
  }
  try {
    return JSON.parse(fs.readFileSync(MANAGER_REGISTRY, 'utf8'));
  } catch {
    return { managers: [], version: 1 };
  }
}

function saveRegistry(registry: ManagerRegistry): void {
  fs.writeFileSync(MANAGER_REGISTRY, JSON.stringify(registry, null, 2));
}

function getModel(role: string): string {
  const defaultModels: Record<string, string> = {
    responder: 'haiku',
    defaultManager: 'opus',
    orchestratorWorker: 'opus',
    orchestratorManager: 'opus',
  };

  if (!fs.existsSync(CONFIG_PATH)) {
    return defaultModels[role] || 'opus';
  }

  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return config.models?.[role] || defaultModels[role] || 'opus';
  } catch {
    return defaultModels[role] || 'opus';
  }
}

function getManagerPrompt(manager: Manager, message: string): string {
  const sendCliPath = path.join(BRIDGE_DIR, 'dist', 'telegram-send-cli.js');
  const orchestratorDir = path.join(BRIDGE_DIR, '..', 'orchestrator');

  return `You are "${manager.name}" - a specialized manager agent for Alexander.

## Your Role
${manager.description}

## Topics You Handle
${manager.topics.map(t => `- ${t}`).join('\n') || '- General tasks'}

## Current Task
Alexander wants you to: "${message}"

## Your Capabilities

### 1. Spawn Subagents for Code Work
For specific coding tasks, spawn Opus subagents:
\`\`\`bash
claude --model opus --dangerously-skip-permissions --add-dir <directory> -p "task description"
\`\`\`

### 2. Manage Orchestrator Sessions
You can start/stop/check orchestrator sessions for building projects:

**Start an orchestrator for a project:**
\`\`\`bash
cd ${orchestratorDir} && ./scripts/orchestrator.sh start
\`\`\`

**Check orchestrator status:**
\`\`\`bash
cd ${orchestratorDir} && ./scripts/orchestrator.sh status
\`\`\`

### 3. Create New Projects
Create tasks.json files and register with the orchestrator system.

## Important Rules
1. Work autonomously to complete the task
2. If you need to wait for something, explain what and why
3. When done with this task, clearly state what was accomplished

## Manager ID
Your manager ID is: ${manager.id}
This is used by the system to track your state.

Now handle the request above.`;
}

export async function POST(request: Request) {
  // Rate limiting check first
  const rateLimitId = getRateLimitIdentifier(request);
  if (!checkRateLimit(rateLimitId)) {
    return NextResponse.json(
      { success: false, message: 'Rate limit exceeded. Try again later.' },
      { status: 429 }
    );
  }

  // Authenticate the request
  const auth = authenticateRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  try {
    const body = await request.json();
    const { name, description, topics = [], initialMessage } = body;

    // Validate required fields
    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Manager name is required' },
        { status: 400 }
      );
    }

    if (!initialMessage || typeof initialMessage !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Initial message/task is required' },
        { status: 400 }
      );
    }

    // Sanitize name (similar to telegram bridge)
    const sanitizedName = name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);

    if (!sanitizedName) {
      return NextResponse.json(
        { success: false, message: 'Invalid manager name after sanitization' },
        { status: 400 }
      );
    }

    // Check if manager with same name exists
    const registry = loadRegistry();
    const existingManager = registry.managers.find(
      m => m.name.toLowerCase() === sanitizedName.toLowerCase()
    );

    if (existingManager) {
      return NextResponse.json(
        { success: false, message: `Manager "${sanitizedName}" already exists` },
        { status: 409 }
      );
    }

    // Create the manager
    const manager: Manager = {
      id: `mgr_${Date.now()}`,
      name: sanitizedName,
      description: description || `Manager for ${sanitizedName}`,
      topics: Array.isArray(topics) ? topics : [],
      status: 'processing',
      currentTask: initialMessage.substring(0, 100),
      pid: null,
      orchestratorSessionId: null,
      messageQueue: [],
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };

    // Add to registry
    registry.managers.push(manager);
    saveRegistry(registry);

    // Ensure sessions directory exists
    fs.mkdirSync(MANAGER_SESSIONS_DIR, { recursive: true });

    // Spawn the manager process
    const sessionId = `${manager.id}_${Date.now()}`;
    const logPath = path.join(MANAGER_SESSIONS_DIR, `${sessionId}.log`);
    const prompt = getManagerPrompt(manager, initialMessage);
    const managerModel = getModel('defaultManager');

    const homeDir = process.env.HOME || require('os').homedir();

    const claude = spawn(
      'claude',
      ['--model', managerModel, '--dangerously-skip-permissions', '--add-dir', homeDir],
      {
        cwd: homeDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true,
      }
    );

    // Write prompt to stdin
    claude.stdin.write(prompt + '\n');
    claude.stdin.end();

    // Log output to file
    claude.stdout.on('data', (data) => {
      fs.appendFileSync(logPath, `[STDOUT] ${data}`);
    });

    claude.stderr.on('data', (data) => {
      fs.appendFileSync(logPath, `[STDERR] ${data}`);
    });

    claude.on('close', (code) => {
      // Update manager status when process exits
      const currentRegistry = loadRegistry();
      const managerIndex = currentRegistry.managers.findIndex(m => m.id === manager.id);
      if (managerIndex !== -1) {
        currentRegistry.managers[managerIndex].status = 'idle';
        currentRegistry.managers[managerIndex].currentTask = null;
        currentRegistry.managers[managerIndex].pid = null;
        currentRegistry.managers[managerIndex].lastActiveAt = new Date().toISOString();
        saveRegistry(currentRegistry);
      }
      fs.appendFileSync(logPath, `\n[SYSTEM] Process exited with code ${code}\n`);
    });

    claude.on('error', (err) => {
      fs.appendFileSync(logPath, `[ERROR] ${err.message}\n`);
    });

    // Update manager with PID
    const updatedRegistry = loadRegistry();
    const managerIndex = updatedRegistry.managers.findIndex(m => m.id === manager.id);
    if (managerIndex !== -1) {
      updatedRegistry.managers[managerIndex].pid = claude.pid || null;
      saveRegistry(updatedRegistry);
    }

    // Unref to allow the dashboard process to exit independently
    claude.unref();

    return NextResponse.json({
      success: true,
      message: 'Manager created and spawned successfully',
      manager: {
        id: manager.id,
        name: manager.name,
        description: manager.description,
        topics: manager.topics,
        status: manager.status,
      },
      pid: claude.pid,
      model: managerModel,
      sessionLog: logPath,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
