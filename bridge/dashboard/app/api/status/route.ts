import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { authenticateReadRequest } from '../../lib/auth';

const BRIDGE_DIR = process.env.BRIDGE_DIR || path.join(process.env.HOME || '', 'claude-automation-system', 'bridge');
const MANAGER_REGISTRY = path.join(BRIDGE_DIR, '.manager-registry.json');
const ORCHESTRATOR_DIR = process.env.ORCHESTRATOR_DIR || path.join(BRIDGE_DIR, '..', 'orchestrator');
const PROJECTS_DIR = path.join(ORCHESTRATOR_DIR, 'projects');

function getBridgeStatus() {
  try {
    const result = execSync('ps aux | grep "node dist/server.js" | grep -v grep', {
      encoding: 'utf8',
      timeout: 5000,
    });

    const match = result.match(/(\d+)\s+[\d.]+\s+[\d.]+/);
    const pid = match ? parseInt(match[1]) : null;

    let uptime = '—';
    if (pid) {
      try {
        const psResult = execSync(`ps -o etime= -p ${pid}`, { encoding: 'utf8' }).trim();
        uptime = psResult;
      } catch {
        // Ignore uptime errors
      }
    }

    return { running: true, pid, uptime };
  } catch {
    return { running: false, pid: null, uptime: '—' };
  }
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
  status: string;
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

function getProjects(): Project[] {
  const projects: Project[] = [];

  // Scan projects directory
  if (!fs.existsSync(PROJECTS_DIR)) {
    return projects;
  }

  const projectDirs = fs.readdirSync(PROJECTS_DIR).filter(d => {
    const fullPath = path.join(PROJECTS_DIR, d);
    return fs.statSync(fullPath).isDirectory();
  });

  for (const dir of projectDirs) {
    const tasksFile = path.join(PROJECTS_DIR, dir, 'tasks.json');

    if (!fs.existsSync(tasksFile)) continue;

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

      projects.push({
        name: data.project?.name || dir,
        description: data.project?.description || '',
        completed: completedTasks.length,
        total: tasks.length,
        status,
        currentTask: inProgressTask?.name || (pendingTasks.length > 0 ? `${pendingTasks.length} pending` : null),
        lastCompletedTask: lastCompleted,
        outputDir: data.project?.outputDir || null,
      });
    } catch (err) {
      // Skip invalid project files
      console.error(`Error reading ${tasksFile}:`, err);
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

export async function GET(request: Request) {
  // Authenticate the request (read-only, more permissive)
  const auth = authenticateReadRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  const status = {
    bridge: getBridgeStatus(),
    managers: getManagers(),
    projects: getProjects(),
    orchestrator: getOrchestratorStatus(),
    claudeProcesses: getClaudeProcessCount(),
    lastUpdated: new Date().toISOString(),
  };

  return NextResponse.json(status);
}
