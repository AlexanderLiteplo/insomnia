import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR, loadConfig } from './config';
import { sendTelegramMessage } from './telegram-send';
import { log } from './logger';

const TASKS_FILE = path.join(DATA_DIR, '.human-tasks.json');

// Store the last known chat ID for notifications
const CHAT_ID_FILE = path.join(DATA_DIR, '.last-chat-id.json');

export interface HumanTask {
  id: string;
  title: string;
  description: string;
  instructions: string[];
  project?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'dismissed';
  createdAt: string;
  completedAt?: string;
  createdBy?: string;  // Which manager/agent created this
  notified: boolean;
}

export interface HumanTasksStore {
  tasks: HumanTask[];
  version: number;
}

function loadTasks(): HumanTasksStore {
  if (!fs.existsSync(TASKS_FILE)) {
    return { tasks: [], version: 1 };
  }
  try {
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
  } catch {
    return { tasks: [], version: 1 };
  }
}

function saveTasks(store: HumanTasksStore): void {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(store, null, 2));
}

function getLastChatId(): number | null {
  try {
    if (fs.existsSync(CHAT_ID_FILE)) {
      const data = JSON.parse(fs.readFileSync(CHAT_ID_FILE, 'utf8'));
      return data.chatId || null;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

export function setLastChatId(chatId: number): void {
  fs.writeFileSync(CHAT_ID_FILE, JSON.stringify({ chatId, updatedAt: new Date().toISOString() }, null, 2));
}

export function getAllTasks(): HumanTask[] {
  return loadTasks().tasks;
}

export function getPendingTasks(): HumanTask[] {
  return loadTasks().tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
}

export function getTaskById(id: string): HumanTask | undefined {
  return loadTasks().tasks.find(t => t.id === id);
}

export async function createTask(
  title: string,
  description: string,
  options: {
    instructions?: string[];
    project?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    createdBy?: string;
    notify?: boolean;
    chatId?: number;
  } = {}
): Promise<HumanTask> {
  const store = loadTasks();

  const task: HumanTask = {
    id: `htask_${Date.now()}`,
    title,
    description,
    instructions: options.instructions || [],
    project: options.project,
    priority: options.priority || 'medium',
    status: 'pending',
    createdAt: new Date().toISOString(),
    createdBy: options.createdBy,
    notified: false,
  };

  store.tasks.unshift(task);  // Add to beginning
  saveTasks(store);

  log(`[HumanTasks] Created task: ${title} (${task.id})`);

  // Send notification if requested (default true)
  if (options.notify !== false) {
    const chatId = options.chatId || getLastChatId();
    if (chatId) {
      await notifyTask(task, chatId);
    } else {
      log('[HumanTasks] No chat ID available for notification');
    }
  }

  return task;
}

export function updateTask(id: string, updates: Partial<HumanTask>): HumanTask | null {
  const store = loadTasks();
  const index = store.tasks.findIndex(t => t.id === id);

  if (index === -1) return null;

  // If completing, add completedAt
  if (updates.status === 'completed' && store.tasks[index].status !== 'completed') {
    updates.completedAt = new Date().toISOString();
  }

  store.tasks[index] = { ...store.tasks[index], ...updates };
  saveTasks(store);

  log(`[HumanTasks] Updated task ${id}: ${JSON.stringify(updates)}`);

  return store.tasks[index];
}

export function deleteTask(id: string): boolean {
  const store = loadTasks();
  const index = store.tasks.findIndex(t => t.id === id);

  if (index === -1) return false;

  store.tasks.splice(index, 1);
  saveTasks(store);

  log(`[HumanTasks] Deleted task ${id}`);

  return true;
}

async function notifyTask(task: HumanTask, chatId: number): Promise<void> {
  const priorityEmoji = {
    low: '📋',
    medium: '📌',
    high: '⚠️',
    urgent: '🚨',
  };

  let message = `${priorityEmoji[task.priority]} Human Task Required\n\n`;
  message += `${task.title}\n`;
  message += `${task.description}\n`;

  if (task.instructions.length > 0) {
    message += `\nSteps:\n`;
    task.instructions.forEach((instr, i) => {
      message += `${i + 1}. ${instr}\n`;
    });
  }

  if (task.project) {
    message += `\nProject: ${task.project}`;
  }

  message += `\n\nView all tasks: http://localhost:3333`;

  try {
    await sendTelegramMessage(chatId, message);
    updateTask(task.id, { notified: true });
    log(`[HumanTasks] Notified user about task: ${task.title}`);
  } catch (err) {
    log(`[HumanTasks] Failed to notify: ${err}`);
  }
}

// Get summary for display
export function getTasksSummary(): string {
  const tasks = getPendingTasks();

  if (tasks.length === 0) {
    return 'No pending human tasks';
  }

  const urgent = tasks.filter(t => t.priority === 'urgent').length;
  const high = tasks.filter(t => t.priority === 'high').length;

  let summary = `${tasks.length} pending task(s)`;
  if (urgent > 0) summary += ` (${urgent} urgent)`;
  else if (high > 0) summary += ` (${high} high priority)`;

  return summary;
}

// CLI interface for adding tasks from command line
export async function addTaskFromCLI(args: string[]): Promise<void> {
  if (args.length < 2) {
    console.log('Usage: human-task add "Title" "Description" [--priority high] [--project name]');
    return;
  }

  const title = args[0];
  const description = args[1];

  let priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium';
  let project: string | undefined;
  let instructions: string[] = [];

  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--priority' && args[i + 1]) {
      priority = args[++i] as 'low' | 'medium' | 'high' | 'urgent';
    } else if (args[i] === '--project' && args[i + 1]) {
      project = args[++i];
    } else if (args[i] === '--instruction' && args[i + 1]) {
      instructions.push(args[++i]);
    }
  }

  const task = await createTask(title, description, { priority, project, instructions });
  console.log(`✅ Created task: ${task.id}`);
}
