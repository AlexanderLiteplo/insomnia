import * as fs from 'fs';
import * as path from 'path';
import { ChildProcess } from 'child_process';
import { DATA_DIR } from './config';
import { log } from './logger';

const REGISTRY_FILE = path.join(DATA_DIR, '.manager-registry.json');

export interface QueuedMessage {
  id: string;
  content: string;
  timestamp: string;
  priority: 'normal' | 'interrupt';
}

export interface Manager {
  id: string;
  name: string;
  description: string;
  topics: string[];  // Keywords/topics this manager handles
  status: 'active' | 'idle' | 'processing';
  currentTask: string | null;
  pid: number | null;
  orchestratorSessionId: string | null;
  messageQueue: QueuedMessage[];
  createdAt: string;
  lastActiveAt: string;
}

export interface ManagerRegistry {
  managers: Manager[];
  version: number;
}

// In-memory process references (not persisted)
const managerProcesses: Map<string, ChildProcess> = new Map();

export function loadRegistry(): ManagerRegistry {
  if (!fs.existsSync(REGISTRY_FILE)) {
    return { managers: [], version: 1 };
  }
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
  } catch {
    return { managers: [], version: 1 };
  }
}

export function saveRegistry(registry: ManagerRegistry): void {
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
}

export function getManager(id: string): Manager | undefined {
  const registry = loadRegistry();
  return registry.managers.find(m => m.id === id);
}

export function getManagerByName(name: string): Manager | undefined {
  const registry = loadRegistry();
  return registry.managers.find(m => m.name.toLowerCase() === name.toLowerCase());
}

export function getActiveManagers(): Manager[] {
  const registry = loadRegistry();
  return registry.managers.filter(m => m.status === 'active' || m.status === 'processing');
}

export function getAllManagers(): Manager[] {
  const registry = loadRegistry();
  return registry.managers;
}

export function createManager(name: string, description: string, topics: string[]): Manager {
  const registry = loadRegistry();

  const manager: Manager = {
    id: `mgr_${Date.now()}`,
    name,
    description,
    topics,
    status: 'idle',
    currentTask: null,
    pid: null,
    orchestratorSessionId: null,
    messageQueue: [],
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };

  registry.managers.push(manager);
  saveRegistry(registry);
  log(`[Registry] Created manager: ${name} (${manager.id})`);

  return manager;
}

export function updateManager(id: string, updates: Partial<Manager>): Manager | null {
  const registry = loadRegistry();
  const index = registry.managers.findIndex(m => m.id === id);

  if (index === -1) return null;

  registry.managers[index] = {
    ...registry.managers[index],
    ...updates,
    lastActiveAt: new Date().toISOString(),
  };

  saveRegistry(registry);
  return registry.managers[index];
}

export function deleteManager(id: string): boolean {
  const registry = loadRegistry();
  const index = registry.managers.findIndex(m => m.id === id);

  if (index === -1) return false;

  const manager = registry.managers[index];
  log(`[Registry] Deleting manager: ${manager.name} (${id})`);

  // Kill process if running
  const proc = managerProcesses.get(id);
  if (proc) {
    proc.kill('SIGTERM');
    managerProcesses.delete(id);
  }

  registry.managers.splice(index, 1);
  saveRegistry(registry);
  return true;
}

export function queueMessageToManager(managerId: string, message: string, priority: 'normal' | 'interrupt' = 'normal'): boolean {
  const registry = loadRegistry();
  const manager = registry.managers.find(m => m.id === managerId);

  if (!manager) return false;

  const queuedMsg: QueuedMessage = {
    id: `msg_${Date.now()}`,
    content: message,
    timestamp: new Date().toISOString(),
    priority,
  };

  if (priority === 'interrupt') {
    // Interrupt goes to front of queue
    manager.messageQueue.unshift(queuedMsg);
  } else {
    manager.messageQueue.push(queuedMsg);
  }

  saveRegistry(registry);
  log(`[Registry] Queued message to ${manager.name} (priority: ${priority}, queue size: ${manager.messageQueue.length})`);

  return true;
}

export function getNextMessage(managerId: string): QueuedMessage | null {
  const registry = loadRegistry();
  const manager = registry.managers.find(m => m.id === managerId);

  if (!manager || manager.messageQueue.length === 0) return null;

  const message = manager.messageQueue.shift()!;
  saveRegistry(registry);

  return message;
}

export function setManagerProcess(managerId: string, process: ChildProcess): void {
  managerProcesses.set(managerId, process);
}

export function getManagerProcess(managerId: string): ChildProcess | undefined {
  return managerProcesses.get(managerId);
}

export function removeManagerProcess(managerId: string): void {
  managerProcesses.delete(managerId);
}

// Find best matching manager for a message based on topics
export function findMatchingManager(message: string): Manager | null {
  const registry = loadRegistry();
  const msgLower = message.toLowerCase();

  let bestMatch: Manager | null = null;
  let bestScore = 0;

  for (const manager of registry.managers) {
    let score = 0;

    // Check topic matches
    for (const topic of manager.topics) {
      if (msgLower.includes(topic.toLowerCase())) {
        score += 10;
      }
    }

    // Check name match
    if (msgLower.includes(manager.name.toLowerCase())) {
      score += 20;
    }

    // Prefer active/processing managers for continuity
    if (manager.status === 'processing') score += 5;
    if (manager.status === 'active') score += 3;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = manager;
    }
  }

  // Only return if we have a reasonable match
  return bestScore >= 10 ? bestMatch : null;
}

// Get summary of all managers for status display
export function getManagersSummary(): string {
  const managers = getAllManagers();

  if (managers.length === 0) {
    return 'No active managers';
  }

  const lines = managers.map(m => {
    const queueInfo = m.messageQueue.length > 0 ? ` (${m.messageQueue.length} queued)` : '';
    const taskInfo = m.currentTask ? `: ${m.currentTask.substring(0, 30)}...` : '';
    return `• ${m.name} [${m.status}]${taskInfo}${queueInfo}`;
  });

  return lines.join('\n');
}
