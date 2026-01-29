'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { HumanTask, SystemStatus } from '../lib/types';
import { ArchitectureTree } from '../components/diagram/ArchitectureTree';
import { DonutAnimation } from '../components/ascii/DonutAnimation';
import { ModelSelector } from '../components/ModelSelector';

// CSRF token management
let csrfToken: string | null = null;
let csrfTokenPromise: Promise<string> | null = null;

async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  if (csrfTokenPromise) return csrfTokenPromise;

  csrfTokenPromise = fetch('/api/csrf')
    .then(res => res.json())
    .then(data => {
      csrfToken = data.token;
      csrfTokenPromise = null;
      return data.token;
    })
    .catch(err => {
      csrfTokenPromise = null;
      throw err;
    });

  return csrfTokenPromise;
}

async function secureFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getCsrfToken();
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'x-csrf-token': token,
    },
  });
}

function PriorityBadge({ priority }: { priority: HumanTask['priority'] }) {
  const styles = {
    low: 'bg-gray-800 text-gray-400 border border-gray-700',
    medium: 'bg-blue-900/50 text-blue-400 border border-blue-800',
    high: 'bg-yellow-900/50 text-yellow-500 border border-yellow-800',
    urgent: 'bg-red-900/50 text-red-400 border border-red-800',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-medium ${styles[priority]}`}>
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

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  summary: string;
  timestamp: string;
  checks: {
    telegramBridge: { status: string; message: string };
    orchestratorWorker: { status: string; message: string };
    orchestratorManager: { status: string; message: string };
    dashboard: { status: string; message: string };
  };
}

export default function Dashboard() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [tasks, setTasks] = useState<HumanTask[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showActions, setShowActions] = useState(false);
  const [showHealth, setShowHealth] = useState(false);
  const [showModels, setShowModels] = useState(false);

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

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealth(data);
    } catch (err) {
      console.error('Failed to fetch health:', err);
    }
  };

  const updateTask = async (id: string, updates: Partial<HumanTask>) => {
    try {
      const res = await secureFetch('/api/tasks', {
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
    fetchHealth();
    const statusInterval = setInterval(fetchStatus, 5000);
    const tasksInterval = setInterval(fetchTasks, 10000);
    const healthInterval = setInterval(fetchHealth, 15000);
    return () => {
      clearInterval(statusInterval);
      clearInterval(tasksInterval);
      clearInterval(healthInterval);
    };
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-600 border-t-gray-400 rounded-full spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const urgentCount = pendingTasks.filter(t => t.priority === 'urgent').length;
  const highCount = pendingTasks.filter(t => t.priority === 'high').length;

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[var(--background)]">
      {/* Top Bar */}
      <div className="flex-shrink-0 flex items-center justify-between p-3 border-b border-[var(--card-border)]">
        {/* Left: Donut + Title */}
        <div className="flex items-center gap-4">
          <div className="opacity-70">
            <DonutAnimation width={28} height={14} />
          </div>
          <div>
            <h1 className="text-lg font-medium text-[var(--neon-green)]">Insomnia</h1>
            <p className="text-[10px] text-gray-600">
              {status?.lastUpdated && `${new Date(status.lastUpdated).toLocaleTimeString()}`}
              {error && <span className="text-red-500 ml-2">{error}</span>}
            </p>
          </div>
        </div>

        {/* Right: Health + Stats + Actions */}
        <div className="flex items-center gap-2">
          {/* Health Status */}
          <button
            onClick={() => setShowHealth(!showHealth)}
            className={`bg-[var(--card)] border rounded px-3 py-1.5 text-center cursor-pointer hover:border-gray-600 transition-colors ${
              health?.status === 'healthy'
                ? 'border-green-800'
                : health?.status === 'degraded'
                  ? 'border-yellow-800'
                  : 'border-red-800'
            }`}
          >
            <div className={`text-lg font-medium ${
              health?.status === 'healthy'
                ? 'text-green-500'
                : health?.status === 'degraded'
                  ? 'text-yellow-500'
                  : 'text-red-500'
            }`}>
              {health?.status === 'healthy' ? '●' : health?.status === 'degraded' ? '◐' : '○'}
            </div>
            <div className="text-[9px] text-gray-500">Health</div>
          </button>

          {/* Model Config Button */}
          <button
            onClick={() => setShowModels(!showModels)}
            className="bg-[var(--card)] border border-[var(--card-border)] rounded px-3 py-1.5 text-center cursor-pointer hover:border-gray-600 transition-colors"
          >
            <div className="text-lg">🤖</div>
            <div className="text-[9px] text-gray-500">Models</div>
          </button>

          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded px-3 py-1.5 text-center">
            <div className="text-lg font-medium text-[var(--neon-green)]">
              {status?.claudeProcesses ?? 0}
            </div>
            <div className="text-[9px] text-gray-500">Claudes</div>
          </div>

          <button
            onClick={() => setShowActions(!showActions)}
            className="bg-[var(--card)] border border-[var(--card-border)] rounded px-3 py-2.5 hover:border-gray-600 transition-colors relative"
          >
            <span className="text-gray-500 text-sm">•••</span>
          </button>

          {/* Health Dropdown */}
          <AnimatePresence>
            {showHealth && health && (
              <motion.div
                className="absolute top-14 right-28 bg-[var(--card)] border border-[var(--card-border)] rounded z-50 overflow-hidden w-64"
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
              >
                <div className="p-3">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-white text-sm">System Health</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded ${
                      health.status === 'healthy'
                        ? 'bg-green-900/50 text-green-500'
                        : health.status === 'degraded'
                          ? 'bg-yellow-900/50 text-yellow-500'
                          : 'bg-red-900/50 text-red-500'
                    }`}>
                      {health.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mb-3">{health.summary}</p>
                  <div className="space-y-2">
                    {Object.entries(health.checks).map(([name, check]) => (
                      <div key={name} className="flex items-center justify-between text-[10px]">
                        <span className="text-gray-400">
                          {name === 'telegramBridge' ? 'Telegram Bridge' :
                           name === 'orchestratorWorker' ? 'Orchestrator Worker' :
                           name === 'orchestratorManager' ? 'Orchestrator Manager' :
                           'Dashboard'}
                        </span>
                        <span className={`flex items-center gap-1 ${
                          check.status === 'pass'
                            ? 'text-green-500'
                            : check.status === 'warn'
                              ? 'text-yellow-500'
                              : 'text-red-500'
                        }`}>
                          {check.status === 'pass' ? '●' : check.status === 'warn' ? '◐' : '○'}
                          <span>{check.message}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-2 border-t border-[var(--card-border)]">
                    <span className="text-[9px] text-gray-600">
                      Last check: {new Date(health.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Model Selector */}
          <ModelSelector
            isOpen={showModels}
            onClose={() => setShowModels(false)}
            getCsrfToken={getCsrfToken}
          />

          {/* Actions Dropdown */}
          <AnimatePresence>
            {showActions && (
              <motion.div
                className="absolute top-14 right-3 bg-[var(--card)] border border-[var(--card-border)] rounded z-50 overflow-hidden"
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
              >
                <div className="p-1">
                  <button
                    onClick={() => {
                      secureFetch('/api/bridge/restart', { method: 'POST' }).then(() => {
                        fetchStatus();
                        fetchHealth();
                      });
                      setShowActions(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-xs text-green-500 hover:bg-green-900/20 rounded"
                  >
                    Restart Bridge
                  </button>
                  <button
                    onClick={() => {
                      secureFetch('/api/orchestrators/restart', { method: 'POST' }).then(() => {
                        fetchStatus();
                        fetchHealth();
                      });
                      setShowActions(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-xs text-pink-500 hover:bg-pink-900/20 rounded"
                  >
                    Restart Orchestrator
                  </button>
                  <button
                    onClick={() => {
                      fetchStatus();
                      fetchTasks();
                      fetchHealth();
                      setShowActions(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-xs text-gray-400 hover:bg-gray-800 rounded"
                  >
                    Refresh
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main Content: Architecture Tree + Human Tasks */}
      <div className="flex-1 flex min-h-0">
        {/* Architecture Tree - Takes most of the space */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {status && (
            <ArchitectureTree
              bridge={status.bridge}
              managers={status.managers}
              projects={status.projects}
              orchestrator={status.orchestrator}
              responderActive={status.managers.some(m => m.status === 'processing')}
            />
          )}
        </div>

        {/* Human Tasks Panel - Right side */}
        <div className="w-72 flex-shrink-0 border-l border-[var(--card-border)] bg-[var(--card)]/30 flex flex-col">
          <div className="p-3 border-b border-[var(--card-border)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-medium text-white text-sm">Tasks</h2>
              {pendingTasks.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  urgentCount > 0
                    ? 'bg-red-900/50 text-red-400'
                    : highCount > 0
                      ? 'bg-yellow-900/50 text-yellow-500'
                      : 'bg-gray-800 text-gray-400'
                }`}>
                  {pendingTasks.length}
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {pendingTasks.length === 0 ? (
              <div className="text-center py-6">
                <div className="text-2xl mb-1 opacity-50">✓</div>
                <p className="text-gray-600 text-xs">No pending tasks</p>
              </div>
            ) : (
              pendingTasks.map((task) => (
                <motion.div
                  key={task.id}
                  className={`border rounded p-2 bg-[var(--background)] ${
                    task.priority === 'urgent'
                      ? 'border-red-900'
                      : task.priority === 'high'
                        ? 'border-yellow-900'
                        : 'border-[var(--card-border)]'
                  }`}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap mb-0.5">
                        <PriorityBadge priority={task.priority} />
                        {task.project && (
                          <span className="text-[9px] text-gray-600">{task.project}</span>
                        )}
                      </div>
                      <h3 className="font-medium text-white text-xs leading-tight">{task.title}</h3>
                    </div>
                    <span className="text-[9px] text-gray-600 flex-shrink-0">
                      {formatTimeAgo(task.createdAt)}
                    </span>
                  </div>

                  {task.description && (
                    <p className="text-[10px] text-gray-500 mb-1.5 line-clamp-2">{task.description}</p>
                  )}

                  <div className="flex gap-1">
                    <button
                      onClick={() => updateTask(task.id, { status: 'completed' })}
                      className="flex-1 px-2 py-1 bg-green-900/30 hover:bg-green-900/50 text-green-500 border border-green-900 rounded text-[10px] font-medium"
                    >
                      Done
                    </button>
                    <button
                      onClick={() => updateTask(task.id, { status: 'dismissed' })}
                      className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded text-[10px]"
                    >
                      Skip
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Click outside to close dropdowns */}
      {(showActions || showHealth || showModels) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowActions(false);
            setShowHealth(false);
            setShowModels(false);
          }}
        />
      )}
    </div>
  );
}
