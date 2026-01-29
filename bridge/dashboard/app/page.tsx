'use client';

import { useState, useEffect } from 'react';

interface Manager {
  id: string;
  name: string;
  description: string;
  topics: string[];
  status: 'active' | 'idle' | 'processing';
  currentTask: string | null;
  messageQueue: { id: string; content: string }[];
  lastActiveAt: string;
}

interface Project {
  name: string;
  description: string;
  completed: number;
  total: number;
  status: 'active' | 'paused' | 'complete';
  currentTask?: string | null;
  lastCompletedTask?: string | null;
  outputDir?: string | null;
}

interface BridgeStatus {
  running: boolean;
  pid: number | null;
  uptime: string;
}

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

interface SystemStatus {
  bridge: BridgeStatus;
  managers: Manager[];
  projects: Project[];
  claudeProcesses: number;
  lastUpdated: string;
}

function StatusDot({ status }: { status: 'online' | 'offline' | 'processing' }) {
  const colors = {
    online: 'bg-green-500',
    offline: 'bg-red-500',
    processing: 'bg-blue-500',
  };
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status]} ${status === 'processing' ? 'pulse-glow' : ''}`} />
  );
}

function Card({ title, children, status, count, badge, badgeColor }: {
  title: string;
  children: React.ReactNode;
  status?: 'online' | 'offline' | 'processing';
  count?: number;
  badge?: string;
  badgeColor?: string;
}) {
  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        {status && <StatusDot status={status} />}
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {count !== undefined && (
          <span className="text-xs bg-[var(--card-border)] px-2 py-0.5 rounded-full text-gray-400">
            {count}
          </span>
        )}
        {badge && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${badgeColor || 'bg-yellow-500/20 text-yellow-400'}`}>
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function ProgressBar({ value, max, color }: { value: number; max: number; color?: string }) {
  const percent = max > 0 ? (value / max) * 100 : 0;
  const bgColor = color || (percent === 100 ? 'bg-green-500' : 'bg-[var(--accent)]');
  return (
    <div className="w-full bg-[var(--card-border)] rounded-full h-2">
      <div
        className={`${bgColor} h-2 rounded-full transition-all duration-500`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function PriorityBadge({ priority }: { priority: HumanTask['priority'] }) {
  const styles = {
    low: 'bg-gray-500/20 text-gray-400',
    medium: 'bg-blue-500/20 text-blue-400',
    high: 'bg-yellow-500/20 text-yellow-400',
    urgent: 'bg-red-500/20 text-red-400',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full uppercase font-medium ${styles[priority]}`}>
      {priority}
    </span>
  );
}

function formatTimeAgo(isoString: string): string {
  const now = new Date();
  const date = new Date(isoString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export default function Dashboard() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [tasks, setTasks] = useState<HumanTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) throw new Error('Failed to fetch status');
      const data = await res.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks');
      if (!res.ok) throw new Error('Failed to fetch tasks');
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    }
  };

  const updateTask = async (id: string, updates: Partial<HumanTask>) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
      if (!res.ok) throw new Error('Failed to update task');
      await fetchTasks();
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchTasks();
    const statusInterval = setInterval(fetchStatus, 5000);
    const tasksInterval = setInterval(fetchTasks, 10000);
    return () => {
      clearInterval(statusInterval);
      clearInterval(tasksInterval);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full spin mx-auto mb-4" />
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const completedTasks = tasks.filter(t => t.status === 'completed' || t.status === 'dismissed');
  const urgentCount = pendingTasks.filter(t => t.priority === 'urgent').length;
  const highCount = pendingTasks.filter(t => t.priority === 'high').length;

  const completedProjects = status?.projects.filter(p => p.status === 'complete') || [];
  const activeProjects = status?.projects.filter(p => p.status !== 'complete') || [];

  return (
    <main className="min-h-screen p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Claude Dashboard</h1>
          <p className="text-gray-400 mt-1">System monitoring</p>
        </div>
        <div className="flex items-center gap-6">
          {/* Claude Process Counter */}
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl px-5 py-3 text-center">
            <div className="text-3xl font-bold text-[var(--accent)]">
              {status?.claudeProcesses ?? 0}
            </div>
            <div className="text-xs text-gray-400 mt-1">Claudes Running</div>
          </div>
          <div className="text-right text-sm text-gray-500">
            {status?.lastUpdated && (
              <p>Updated: {new Date(status.lastUpdated).toLocaleTimeString()}</p>
            )}
            {error && <p className="text-red-400">{error}</p>}
          </div>
        </div>
      </div>

      {/* Human Tasks - Prominent at top when there are pending tasks */}
      {pendingTasks.length > 0 && (
        <div className="mb-6">
          <Card
            title="Human Tasks Required"
            status="processing"
            count={pendingTasks.length}
            badge={urgentCount > 0 ? `${urgentCount} urgent` : highCount > 0 ? `${highCount} high priority` : undefined}
            badgeColor={urgentCount > 0 ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}
          >
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {pendingTasks.map((task) => (
                <div key={task.id} className="border border-[var(--card-border)] rounded-lg p-4 bg-[var(--background)]">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <PriorityBadge priority={task.priority} />
                      <span className="font-medium text-white">{task.title}</span>
                    </div>
                    <span className="text-xs text-gray-500">{formatTimeAgo(task.createdAt)}</span>
                  </div>

                  {task.description && (
                    <p className="text-sm text-gray-400 mb-3">{task.description}</p>
                  )}

                  {task.instructions.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 mb-1">Steps:</p>
                      <ol className="list-decimal list-inside text-sm text-gray-300 space-y-1">
                        {task.instructions.map((instruction, i) => (
                          <li key={i}>{instruction}</li>
                        ))}
                      </ol>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {task.project && (
                        <span className="text-xs bg-[var(--card-border)] px-2 py-0.5 rounded">
                          {task.project}
                        </span>
                      )}
                      {task.createdBy && (
                        <span className="text-xs text-gray-500">from {task.createdBy}</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => updateTask(task.id, { status: 'completed' })}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded text-sm font-medium transition-colors"
                      >
                        Complete
                      </button>
                      <button
                        onClick={() => updateTask(task.id, { status: 'dismissed' })}
                        className="px-3 py-1.5 bg-[var(--card-border)] hover:bg-gray-600 rounded text-sm font-medium transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Bridge Status */}
      <div className="mb-6">
        <Card
          title="iMessage Bridge"
          status={status?.bridge.running ? 'online' : 'offline'}
        >
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-400">Status</p>
              <p className={status?.bridge.running ? 'text-green-400' : 'text-red-400'}>
                {status?.bridge.running ? 'Running' : 'Stopped'}
              </p>
            </div>
            <div>
              <p className="text-gray-400">PID</p>
              <p className="text-white">{status?.bridge.pid || '—'}</p>
            </div>
            <div>
              <p className="text-gray-400">Uptime</p>
              <p className="text-white">{status?.bridge.uptime || '—'}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Managers */}
        <Card
          title="Managers"
          status={status?.managers.some(m => m.status === 'processing') ? 'processing' : 'online'}
          count={status?.managers.length}
        >
          {status?.managers.length === 0 ? (
            <p className="text-gray-500 text-sm">No managers active</p>
          ) : (
            <div className="space-y-4 max-h-80 overflow-y-auto">
              {status?.managers.map((manager) => (
                <div key={manager.id} className="border-b border-[var(--card-border)] pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <StatusDot status={manager.status === 'processing' ? 'processing' : manager.status === 'active' ? 'online' : 'offline'} />
                      <span className="font-medium text-white">{manager.name}</span>
                    </div>
                    <span className="text-xs text-gray-500 capitalize">{manager.status}</span>
                  </div>
                  {manager.currentTask && (
                    <p className="text-sm text-gray-400 truncate">{manager.currentTask}</p>
                  )}
                  {manager.messageQueue.length > 0 && (
                    <p className="text-xs text-yellow-500 mt-1">
                      {manager.messageQueue.length} queued
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {manager.topics.map((topic, i) => (
                      <span key={i} className="text-xs bg-[var(--card-border)] px-2 py-0.5 rounded">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Active Projects */}
        <Card
          title="Active Projects"
          status={activeProjects.some(p => p.status === 'active') ? 'processing' : 'online'}
          count={activeProjects.length}
        >
          {activeProjects.length === 0 ? (
            <p className="text-gray-500 text-sm">No active projects</p>
          ) : (
            <div className="space-y-4 max-h-80 overflow-y-auto">
              {activeProjects.map((project, i) => (
                <div key={i} className="border-b border-[var(--card-border)] pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {project.status === 'active' ? (
                        <StatusDot status="processing" />
                      ) : (
                        <StatusDot status="offline" />
                      )}
                      <span className="font-medium text-white">{project.name}</span>
                    </div>
                    <span className="text-sm text-gray-400">
                      {project.completed}/{project.total}
                    </span>
                  </div>
                  <ProgressBar value={project.completed} max={project.total} />
                  {project.currentTask && (
                    <p className="text-xs text-blue-400 mt-2 truncate">→ {project.currentTask}</p>
                  )}
                  {project.lastCompletedTask && (
                    <p className="text-xs text-gray-500 mt-1 truncate">✓ {project.lastCompletedTask}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Completed Projects */}
      <div className="mt-6">
        <Card
          title="Completed Projects"
          status="online"
          count={completedProjects.length}
        >
          {completedProjects.length === 0 ? (
            <p className="text-gray-500 text-sm">No completed projects</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {completedProjects.map((project, i) => (
                <div key={i} className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-green-400 text-lg">✓</span>
                    <span className="font-medium text-white">{project.name}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-green-400">{project.completed}/{project.total} tasks</span>
                    <span className="text-gray-500">100%</span>
                  </div>
                  <ProgressBar value={project.completed} max={project.total} color="bg-green-500" />
                  {project.lastCompletedTask && (
                    <p className="text-xs text-gray-500 mt-3 truncate" title={project.lastCompletedTask}>
                      Last: {project.lastCompletedTask}
                    </p>
                  )}
                  {project.description && (
                    <p className="text-xs text-gray-600 mt-1 truncate" title={project.description}>
                      {project.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Completed Human Tasks (Collapsible) */}
      {completedTasks.length > 0 && (
        <div className="mt-6">
          <Card title="Completed Tasks" count={completedTasks.length}>
            <button
              onClick={() => setShowCompletedTasks(!showCompletedTasks)}
              className="text-sm text-gray-400 hover:text-white mb-3 flex items-center gap-1"
            >
              <span className={`transition-transform ${showCompletedTasks ? 'rotate-90' : ''}`}>▶</span>
              {showCompletedTasks ? 'Hide' : 'Show'} completed tasks
            </button>
            {showCompletedTasks && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {completedTasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between py-2 border-b border-[var(--card-border)] last:border-0">
                    <div className="flex items-center gap-2">
                      <span className={task.status === 'completed' ? 'text-green-400' : 'text-gray-500'}>
                        {task.status === 'completed' ? '✓' : '✗'}
                      </span>
                      <span className="text-sm text-gray-400">{task.title}</span>
                    </div>
                    <span className="text-xs text-gray-600">
                      {task.completedAt ? formatTimeAgo(task.completedAt) : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Quick Actions */}
      <div className="mt-6">
        <Card title="Quick Actions">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => fetch('/api/bridge/restart', { method: 'POST' }).then(fetchStatus)}
              className="px-4 py-2 bg-[var(--accent)] hover:bg-blue-600 rounded-lg text-sm font-medium transition-colors"
            >
              Restart Bridge
            </button>
            <button
              onClick={() => fetch('/api/orchestrators/restart', { method: 'POST' }).then(fetchStatus)}
              className="px-4 py-2 bg-[var(--card-border)] hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors"
            >
              Restart Orchestrator
            </button>
            <button
              onClick={() => { fetchStatus(); fetchTasks(); }}
              className="px-4 py-2 bg-[var(--card-border)] hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors"
            >
              Refresh
            </button>
          </div>
        </Card>
      </div>
    </main>
  );
}
