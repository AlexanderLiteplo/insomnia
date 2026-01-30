import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { authenticateReadRequest } from '../../lib/auth';
import { BRIDGE_DIR, MANAGER_REGISTRY, ORCHESTRATOR_DIR, PROJECTS_DIR, CONFIG_PATH } from '../../lib/paths';

interface TelegramBridgeStatus {
  running: boolean;
  pid: number | null;
  uptime: string;
  healthy: boolean;
  lastPollTime: string | null;
  botUsername: string | null;
  errorMessage: string | null;
}

function getBridgeStatus(): TelegramBridgeStatus {
  const status: TelegramBridgeStatus = {
    running: false,
    pid: null,
    uptime: '—',
    healthy: false,
    lastPollTime: null,
    botUsername: null,
    errorMessage: null,
  };

  try {
    // Check for telegram-server.js process
    const result = execSync('ps aux | grep "node dist/telegram-server.js" | grep -v grep', {
      encoding: 'utf8',
      timeout: 5000,
    });

    const match = result.match(/\s+(\d+)\s+/);
    status.pid = match ? parseInt(match[1]) : null;
    status.running = true;

    if (status.pid) {
      try {
        const psResult = execSync(`ps -o etime= -p ${status.pid}`, { encoding: 'utf8' }).trim();
        status.uptime = psResult;
      } catch {
        // Ignore uptime errors
      }
    }

    // Check bridge health from log file
    const logFile = path.join(BRIDGE_DIR, 'bridge.log');
    if (fs.existsSync(logFile)) {
      try {
        // Read last few lines of log
        const logContent = execSync(`tail -20 "${logFile}"`, { encoding: 'utf8', timeout: 2000 });

        // Check for recent activity (within last 2 minutes)
        const lines = logContent.split('\n').filter(l => l.trim());
        if (lines.length > 0) {
          const lastLine = lines[lines.length - 1];
          const timestampMatch = lastLine.match(/^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
          if (timestampMatch) {
            const lastLogTime = new Date(timestampMatch[1]);
            const now = new Date();
            const diffMs = now.getTime() - lastLogTime.getTime();

            // Consider healthy if log activity within last 2 minutes
            if (diffMs < 120000) {
              status.healthy = true;
              status.lastPollTime = lastLogTime.toISOString();
            }
          }

          // Extract bot username if available
          const usernameMatch = logContent.match(/Connected as @(\w+)/);
          if (usernameMatch) {
            status.botUsername = usernameMatch[1];
          }

          // Check for recent errors
          const errorLines = lines.filter(l => l.includes('error') || l.includes('Error') || l.includes('❌'));
          if (errorLines.length > 0) {
            const lastError = errorLines[errorLines.length - 1];
            // Only report error if it's recent
            const errorTimestamp = lastError.match(/^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
            if (errorTimestamp) {
              const errorTime = new Date(errorTimestamp[1]);
              const diffMs = new Date().getTime() - errorTime.getTime();
              if (diffMs < 60000) { // Error within last minute
                status.errorMessage = lastError.replace(/^\[[^\]]+\]\s*/, '').substring(0, 100);
              }
            }
          }
        }
      } catch {
        // Ignore log reading errors
      }
    }

    // Also check config for bot info
    const configFile = path.join(BRIDGE_DIR, 'config.json');
    if (fs.existsSync(configFile) && !status.botUsername) {
      try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        if (config.telegramBotToken) {
          status.healthy = status.running; // If configured and running, consider healthy
        }
      } catch {
        // Ignore config errors
      }
    }

  } catch {
    // Process not running
    status.running = false;
    status.healthy = false;
  }

  return status;
}

function getManagers() {
  try {
    if (!fs.existsSync(MANAGER_REGISTRY)) {
      return [];
    }
    const data = JSON.parse(fs.readFileSync(MANAGER_REGISTRY, 'utf8'));
    return data.managers || [];
  } catch {
    return [];
  }
}

interface ClaudeProcess {
  pid: number;
  cpu: number;
  memory: number;
  runtime: string;
  command: string;
  status: 'running' | 'paused';
  workingDir?: string;
  prompt?: string;
}

function getClaudeProcessDetails(): ClaudeProcess[] {
  const processes: ClaudeProcess[] = [];

  try {
    // Get detailed process info for Claude CLI processes
    // Use ps with custom format to get PID, CPU, MEM, ELAPSED, and COMMAND
    const result = execSync(
      `ps -eo pid,pcpu,pmem,etime,stat,args | grep -E "\\bclaude\\s+(--|\\-p|$)" | grep -v grep`,
      {
        encoding: 'utf8',
        timeout: 5000,
      }
    );

    const lines = result.trim().split('\n').filter(l => l.trim());

    for (const line of lines) {
      // Parse the ps output: PID %CPU %MEM ELAPSED STAT COMMAND
      const parts = line.trim().split(/\s+/);
      if (parts.length < 6) continue;

      const pid = parseInt(parts[0]);
      const cpu = parseFloat(parts[1]) || 0;
      const memory = parseFloat(parts[2]) || 0;
      const runtime = parts[3]; // Format like 00:05:23 or 1-02:03:04
      const stat = parts[4];
      const command = parts.slice(5).join(' ');

      // Determine if process is paused (T = stopped, S = sleeping)
      const status: 'running' | 'paused' = stat.includes('T') ? 'paused' : 'running';

      // Extract prompt from command if present (-p flag or positional arg after --)
      let prompt: string | undefined;

      // Try -p flag - capture everything after -p until end or next flag pattern
      // Pattern 1: -p "quoted content" or -p 'quoted content'
      const promptMatchQuoted = command.match(/-p\s+["']([^"']+)["']/);
      // Pattern 2: -p followed by unquoted content (capture until end of command)
      // The -p flag typically comes at the end, so capture everything after it
      // But make sure it's not immediately followed by another flag (like -p --other-flag)
      const promptMatchUnquoted = command.match(/-p\s+([^"'\-][^]*?)$/);

      if (promptMatchQuoted) {
        prompt = promptMatchQuoted[1].substring(0, 300);
      } else if (promptMatchUnquoted) {
        // Clean up the captured content - it might have trailing garbage
        let captured = promptMatchUnquoted[1].trim();
        // Remove any trailing flags that might have been captured (unlikely but safe)
        captured = captured.replace(/\s+--?\w+(?:\s+|$).*$/, '').trim();
        // Make sure we didn't capture just a flag
        if (captured.length > 3 && !captured.startsWith('-')) {
          prompt = captured.substring(0, 300);
        }
      }

      // If no -p flag, look for content after standalone -- (common pattern: claude -- "prompt")
      if (!prompt) {
        const ddMatch = command.match(/\s--\s+["']?([^"']+?)["']?$/);
        if (ddMatch) {
          prompt = ddMatch[1].trim().substring(0, 300);
        }
      }

      // Try to get working directory for the process
      let workingDir: string | undefined;
      try {
        const cwdResult = execSync(`lsof -p ${pid} 2>/dev/null | grep cwd | awk '{print $NF}'`, {
          encoding: 'utf8',
          timeout: 2000,
        });
        workingDir = cwdResult.trim() || undefined;
      } catch {
        // Ignore errors getting working directory
      }

      processes.push({
        pid,
        cpu,
        memory,
        runtime,
        command: command.substring(0, 200),
        status,
        workingDir,
        prompt,
      });
    }
  } catch {
    // No Claude processes running
  }

  // Sort by CPU usage descending
  processes.sort((a, b) => b.cpu - a.cpu);

  return processes;
}

function getClaudeProcessCount(): number {
  try {
    // Count actual claude CLI processes (not paths containing "claude")
    // Match processes where the command starts with "claude " or is exactly "claude"
    const result = execSync(
      `ps aux | grep -E "^[^ ]+\\s+[0-9]+.*\\bclaude\\s+(--|\\-p|$)" | grep -v grep | wc -l`,
      {
        encoding: 'utf8',
        timeout: 5000,
      }
    );
    return parseInt(result.trim()) || 0;
  } catch {
    return 0;
  }
}

interface Task {
  id: string;
  name: string;
  description?: string;
  status: string;
  requirements?: string[];
  testCommand?: string;
  testsPassing?: boolean;
  workerNotes?: string;
  managerReview?: string;
}

interface Project {
  name: string;
  description: string;
  completed: number;
  total: number;
  status: 'complete' | 'active' | 'paused';
  currentTask: string | null;
  lastCompletedTask: string | null;
  outputDir: string | null;
  tasks: Task[];
}

interface OrchestratorStatus {
  workerRunning: boolean;
  workerPid: number | null;
  managerRunning: boolean;
  managerPid: number | null;
}

function getOrchestratorStatus(): OrchestratorStatus {
  const WORKER_PID_FILE = path.join(ORCHESTRATOR_DIR, '.state', 'worker.pid');
  const MANAGER_PID_FILE = path.join(ORCHESTRATOR_DIR, '.state', 'manager.pid');

  let workerRunning = false;
  let workerPid: number | null = null;
  let managerRunning = false;
  let managerPid: number | null = null;

  // Check worker status
  if (fs.existsSync(WORKER_PID_FILE)) {
    try {
      workerPid = parseInt(fs.readFileSync(WORKER_PID_FILE, 'utf8').trim());
      // Check if process is actually running
      execSync(`ps -p ${workerPid} > /dev/null 2>&1`);
      workerRunning = true;
    } catch {
      workerRunning = false;
    }
  }

  // Check manager status
  if (fs.existsSync(MANAGER_PID_FILE)) {
    try {
      managerPid = parseInt(fs.readFileSync(MANAGER_PID_FILE, 'utf8').trim());
      // Check if process is actually running
      execSync(`ps -p ${managerPid} > /dev/null 2>&1`);
      managerRunning = true;
    } catch {
      managerRunning = false;
    }
  }

  return { workerRunning, workerPid, managerRunning, managerPid };
}

function parseTasksFile(tasksFile: string, fallbackName: string): Project | null {
  if (!fs.existsSync(tasksFile)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
    const tasks: Task[] = data.tasks || [];

    const completedTasks = tasks.filter(t => t.status === 'completed');
    const inProgressTask = tasks.find(t => t.status === 'in_progress' || t.status === 'worker_done');
    const pendingTasks = tasks.filter(t => t.status === 'pending');

    // Find last completed task (last one in the completed list)
    const lastCompleted = completedTasks.length > 0
      ? completedTasks[completedTasks.length - 1].name
      : null;

    // Determine status
    let status: 'complete' | 'active' | 'paused' = 'paused';
    if (completedTasks.length === tasks.length && tasks.length > 0) {
      status = 'complete';
    } else if (inProgressTask) {
      status = 'active';
    }

    return {
      name: data.project?.name || fallbackName,
      description: data.project?.description || '',
      completed: completedTasks.length,
      total: tasks.length,
      status,
      currentTask: inProgressTask?.name || (pendingTasks.length > 0 ? `${pendingTasks.length} pending` : null),
      lastCompletedTask: lastCompleted,
      outputDir: data.project?.outputDir || null,
      tasks: tasks.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        status: t.status as 'pending' | 'in_progress' | 'worker_done' | 'completed',
        requirements: t.requirements,
        testCommand: t.testCommand,
        testsPassing: t.testsPassing,
        workerNotes: t.workerNotes,
        managerReview: t.managerReview,
      })),
    };
  } catch (err) {
    console.error(`Error reading ${tasksFile}:`, err);
    return null;
  }
}

function getProjects(): Project[] {
  const projects: Project[] = [];
  const seenNames = new Set<string>();

  // 1. First, check legacy prds/tasks.json location (single-project mode)
  const legacyTasksFile = path.join(ORCHESTRATOR_DIR, 'prds', 'tasks.json');
  const legacyProject = parseTasksFile(legacyTasksFile, 'default');
  if (legacyProject && legacyProject.total > 0) {
    projects.push(legacyProject);
    seenNames.add(legacyProject.name);
  }

  // 2. Check projects.json registry (used by projects.sh script)
  const projectsRegistry = path.join(ORCHESTRATOR_DIR, 'projects.json');
  if (fs.existsSync(projectsRegistry)) {
    try {
      const registry = JSON.parse(fs.readFileSync(projectsRegistry, 'utf8'));
      if (registry.projects && Array.isArray(registry.projects)) {
        for (const entry of registry.projects) {
          if (entry.tasksFile && entry.name) {
            // Expand ~ in path
            const tasksFile = entry.tasksFile.replace(/^~/, process.env.HOME || '');
            const project = parseTasksFile(tasksFile, entry.name);
            if (project && !seenNames.has(project.name)) {
              projects.push(project);
              seenNames.add(project.name);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error reading projects registry:', err);
    }
  }

  // 3. Scan projects directory for multi-project mode
  if (fs.existsSync(PROJECTS_DIR)) {
    const projectDirs = fs.readdirSync(PROJECTS_DIR).filter(d => {
      const fullPath = path.join(PROJECTS_DIR, d);
      return fs.statSync(fullPath).isDirectory();
    });

    for (const dir of projectDirs) {
      const tasksFile = path.join(PROJECTS_DIR, dir, 'tasks.json');
      const project = parseTasksFile(tasksFile, dir);

      // Skip if we already have a project with this name (avoid duplicates)
      if (project && !seenNames.has(project.name)) {
        projects.push(project);
        seenNames.add(project.name);
      }
    }
  }

  // Sort: active first, then by completion percentage descending
  projects.sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (b.status === 'active' && a.status !== 'active') return 1;
    const aPercent = a.total > 0 ? a.completed / a.total : 0;
    const bPercent = b.total > 0 ? b.completed / b.total : 0;
    return bPercent - aPercent;
  });

  return projects;
}

function getModelConfig() {
  const defaultModels = {
    responder: 'haiku' as const,
    defaultManager: 'opus' as const,
    orchestratorWorker: 'opus' as const,
    orchestratorManager: 'opus' as const,
  };

  if (!fs.existsSync(CONFIG_PATH)) {
    return defaultModels;
  }

  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return {
      responder: config.models?.responder || defaultModels.responder,
      defaultManager: config.models?.defaultManager || defaultModels.defaultManager,
      orchestratorWorker: config.models?.orchestratorWorker || defaultModels.orchestratorWorker,
      orchestratorManager: config.models?.orchestratorManager || defaultModels.orchestratorManager,
    };
  } catch {
    return defaultModels;
  }
}

export async function GET(request: Request) {
  // Authenticate the request (read-only, more permissive)
  const auth = authenticateReadRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  const claudeProcessDetails = getClaudeProcessDetails();

  const status = {
    bridge: getBridgeStatus(),
    managers: getManagers(),
    projects: getProjects(),
    orchestrator: getOrchestratorStatus(),
    claudeProcesses: claudeProcessDetails.length,
    claudeProcessDetails,
    models: getModelConfig(),
    lastUpdated: new Date().toISOString(),
  };

  return NextResponse.json(status);
}
