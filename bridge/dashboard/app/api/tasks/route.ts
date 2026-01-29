import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { authenticateRequest, authenticateReadRequest } from '../../lib/auth';

const BRIDGE_DIR = path.join(process.env.HOME || '', 'claude-automation-system', 'bridge');
const TASKS_FILE = path.join(BRIDGE_DIR, '.human-tasks.json');

interface HumanTask {
  id: string;
  title: string;
  description: string;
  instructions: string[];
  project?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'dismissed';
  createdAt: string;
  completedAt?: string;
  createdBy?: string;
  notified: boolean;
}

interface TasksStore {
  tasks: HumanTask[];
  version: number;
}

function loadTasks(): TasksStore {
  if (!fs.existsSync(TASKS_FILE)) {
    return { tasks: [], version: 1 };
  }
  try {
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
  } catch {
    return { tasks: [], version: 1 };
  }
}

function saveTasks(store: TasksStore): void {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(store, null, 2));
}

// GET - List all tasks (read-only, more permissive auth)
export async function GET(request: Request) {
  const auth = authenticateReadRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  const store = loadTasks();
  return NextResponse.json(store.tasks);
}

// POST - Create new task (requires full auth)
export async function POST(request: Request) {
  const auth = authenticateRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  try {
    const body = await request.json();

    const task: HumanTask = {
      id: `htask_${Date.now()}`,
      title: body.title,
      description: body.description || '',
      instructions: body.instructions || [],
      project: body.project,
      priority: body.priority || 'medium',
      status: 'pending',
      createdAt: new Date().toISOString(),
      createdBy: body.createdBy || 'dashboard',
      notified: false,
    };

    const store = loadTasks();
    store.tasks.unshift(task);
    saveTasks(store);

    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}

// PATCH - Update task (requires full auth)
export async function PATCH(request: Request) {
  const auth = authenticateRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Task ID required' }, { status: 400 });
    }

    const store = loadTasks();
    const index = store.tasks.findIndex(t => t.id === id);

    if (index === -1) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // If completing, add completedAt
    if (updates.status === 'completed' && store.tasks[index].status !== 'completed') {
      updates.completedAt = new Date().toISOString();
    }

    store.tasks[index] = { ...store.tasks[index], ...updates };
    saveTasks(store);

    return NextResponse.json(store.tasks[index]);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}

// DELETE - Delete task (requires full auth)
export async function DELETE(request: Request) {
  const auth = authenticateRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Task ID required' }, { status: 400 });
    }

    const store = loadTasks();
    const index = store.tasks.findIndex(t => t.id === id);

    if (index === -1) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    store.tasks.splice(index, 1);
    saveTasks(store);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
