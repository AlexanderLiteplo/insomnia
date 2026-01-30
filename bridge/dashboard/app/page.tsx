'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { HumanTask, SystemStatus } from '../lib/types';
import { ArchitectureTree } from '../components/diagram/ArchitectureTree';
import { DonutAnimation } from '../components/ascii/DonutAnimation';
import { ModelSelector } from '../components/ModelSelector';
import { AgentSpawner } from '../components/AgentSpawner';
import { ClaudesPanel } from '../components/ClaudesPanel';
import { Tooltip, TooltipContent } from '../components/ui/Tooltip';

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

const PRIORITY_TOOLTIPS = {
  low: 'Nice to have, no rush - can be done when time allows',
  medium: 'Should be done soon - standard priority task',
  high: 'Important task - needed for progress, prioritize this',
  urgent: 'Blocking critical work - requires immediate attention',
};

function PriorityBadge({ priority }: { priority: HumanTask['priority'] }) {
  const styles = {
    low: 'bg-gray-800 text-gray-400 border border-gray-700',
    medium: 'bg-blue-900/50 text-blue-400 border border-blue-800',
    high: 'bg-yellow-900/50 text-yellow-500 border border-yellow-800',
    urgent: 'bg-red-900/50 text-red-400 border border-red-800',
  };
  return (
    <Tooltip content={PRIORITY_TOOLTIPS[priority]} position="top">
      <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-medium ${styles[priority]}`}>
        {priority}
      </span>
    </Tooltip>
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
  const [showSpawner, setShowSpawner] = useState(false);
  const [showClaudes, setShowClaudes] = useState(false);
  const [isHealing, setIsHealing] = useState(false);
  const [healStatus, setHealStatus] = useState<string | null>(null);

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

  const triggerHeal = async () => {
    if (isHealing) return;

    setIsHealing(true);
    setHealStatus('Spawning healer agent...');

    try {
      const res = await secureFetch('/api/health/heal', { method: 'POST' });
      const data = await res.json();

      if (res.ok) {
        setHealStatus('Healer agent spawned! Investigating issues in background...');
        setTimeout(() => {
          setHealStatus(null);
          fetchHealth();
        }, 5000);
      } else {
        setHealStatus(`Failed: ${data.error || 'Unknown error'}`);
        setTimeout(() => setHealStatus(null), 5000);
      }
    } catch (err) {
      setHealStatus('Failed to spawn healer agent');
      setTimeout(() => setHealStatus(null), 5000);
    } finally {
      setIsHealing(false);
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
          <Tooltip
            content={
              <TooltipContent
                title="System Health"
                description={
                  health?.status === 'healthy'
                    ? '● Healthy: All services are running normally'
                    : health?.status === 'degraded'
                      ? '◐ Degraded: Some services have issues or warnings'
                      : '○ Unhealthy: Critical services are down'
                }
              />
            }
            position="bottom"
          >
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
          </Tooltip>

          {/* Model Config Button */}
          <Tooltip
            content={
              <TooltipContent
                title="AI Model Configuration"
                description="Configure which AI models are used for different system roles (Responder, Managers, Workers)"
              />
            }
            position="bottom"
          >
            <button
              onClick={() => setShowModels(!showModels)}
              className="bg-[var(--card)] border border-[var(--card-border)] rounded px-3 py-1.5 text-center cursor-pointer hover:border-gray-600 transition-colors"
            >
              <div className="text-lg">🤖</div>
              <div className="text-[9px] text-gray-500">Models</div>
            </button>
          </Tooltip>

          {/* Quick Agent Spawn Button */}
          <Tooltip
            content={
              <TooltipContent
                title="Quick Agent Spawn"
                description="Instantly spawn a new Claude Code agent to help with any task"
              />
            }
            position="bottom"
          >
            <button
              onClick={() => setShowSpawner(!showSpawner)}
              className="bg-[var(--card)] border border-[var(--card-border)] rounded px-3 py-1.5 text-center cursor-pointer hover:border-gray-600 transition-colors hover:border-[var(--neon-green)]/50"
            >
              <div className="text-lg font-bold text-[var(--neon-green)]">+</div>
              <div className="text-[9px] text-gray-500">Spawn</div>
            </button>
          </Tooltip>

          <Tooltip
            content={
              <TooltipContent
                title="Active Claude Processes"
                description="Click to view and manage running Claude Code processes - see their status, resource usage, pause, resume, or terminate them"
              />
            }
            position="bottom"
          >
            <button
              onClick={() => setShowClaudes(!showClaudes)}
              className={`bg-[var(--card)] border rounded px-3 py-1.5 text-center cursor-pointer hover:border-gray-600 transition-colors ${
                showClaudes ? 'border-[var(--neon-green)]/50' : 'border-[var(--card-border)]'
              }`}
            >
              <div className="text-lg font-medium text-[var(--neon-green)]">
                {status?.claudeProcesses ?? 0}
              </div>
              <div className="text-[9px] text-gray-500">Claudes</div>
            </button>
          </Tooltip>

          <Tooltip
            content={
              <TooltipContent
                title="Quick Actions"
                description="Restart services, refresh data, and other system maintenance actions"
              />
            }
            position="bottom"
          >
            <button
              onClick={() => setShowActions(!showActions)}
              className="bg-[var(--card)] border border-[var(--card-border)] rounded px-3 py-2.5 hover:border-gray-600 transition-colors relative"
            >
              <span className="text-gray-500 text-sm">•••</span>
            </button>
          </Tooltip>

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
                    {Object.entries(health.checks).map(([name, check]) => {
                      const descriptions: Record<string, string> = {
                        telegramBridge: 'Handles incoming Telegram messages and routes them to the system',
                        orchestratorWorker: 'Executes tasks from the task queue - implements features and fixes',
                        orchestratorManager: 'Reviews worker output, approves changes, and manages task flow',
                        dashboard: 'This web interface for monitoring the system',
                      };
                      return (
                        <Tooltip
                          key={name}
                          content={descriptions[name]}
                          position="left"
                        >
                          <div className="flex items-center justify-between text-[10px] cursor-help">
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
                        </Tooltip>
                      );
                    })}
                  </div>
                  {/* Heal Button - only show when not healthy */}
                  {health.status !== 'healthy' && (
                    <div className="mt-3 pt-2 border-t border-[var(--card-border)]">
                      <Tooltip
                        content={
                          <TooltipContent
                            title="Auto-Heal"
                            description="Spawns a Claude Code agent in the background to investigate and fix unhealthy services automatically"
                          />
                        }
                        position="top"
                      >
                        <button
                          onClick={triggerHeal}
                          disabled={isHealing}
                          className={`w-full px-3 py-2 rounded text-xs font-medium transition-colors ${
                            isHealing
                              ? 'bg-purple-900/30 text-purple-400 cursor-wait'
                              : 'bg-purple-900/50 hover:bg-purple-900/70 text-purple-300 border border-purple-800'
                          }`}
                        >
                          {isHealing ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="w-3 h-3 border border-purple-400 border-t-transparent rounded-full animate-spin" />
                              Healing...
                            </span>
                          ) : (
                            <span className="flex items-center justify-center gap-2">
                              <span>🩹</span>
                              Auto-Heal
                            </span>
                          )}
                        </button>
                      </Tooltip>
                      {healStatus && (
                        <p className="text-[10px] text-purple-400 mt-2 text-center">{healStatus}</p>
                      )}
                    </div>
                  )}

                  <div className={`mt-3 pt-2 border-t border-[var(--card-border)] ${health.status !== 'healthy' ? '' : ''}`}>
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

          {/* Agent Spawner */}
          <AgentSpawner
            isOpen={showSpawner}
            onClose={() => setShowSpawner(false)}
            getCsrfToken={getCsrfToken}
            onSpawn={() => fetchStatus()}
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
                  <Tooltip
                    content="Stop and restart the Telegram bridge process. Use when bridge is unresponsive or stuck."
                    position="left"
                  >
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
                  </Tooltip>
                  <Tooltip
                    content="Stop and restart the orchestrator worker/manager processes. Use when tasks are stuck."
                    position="left"
                  >
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
                  </Tooltip>
                  <Tooltip
                    content="Manually refresh all dashboard data including status, tasks, and health checks."
                    position="left"
                  >
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
                  </Tooltip>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main Content: Architecture Tree + Claudes Panel + Human Tasks */}
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

        {/* Claudes Panel - Right side, toggleable */}
        <AnimatePresence>
          {showClaudes && status && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <ClaudesPanel
                processes={status.claudeProcessDetails || []}
                onRefresh={fetchStatus}
                getCsrfToken={getCsrfToken}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Human Tasks Panel - Right side */}
        <div className="w-72 flex-shrink-0 border-l border-[var(--card-border)] bg-[var(--card)]/30 flex flex-col">
          <div className="p-3 border-b border-[var(--card-border)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tooltip
                content={
                  <TooltipContent
                    title="Human Tasks"
                    description="Tasks that require human action - things Claude cannot do autonomously (like deploying to stores, physical actions, or decisions needed)"
                  />
                }
                position="left"
              >
                <h2 className="font-medium text-white text-sm cursor-help">Tasks</h2>
              </Tooltip>
              {pendingTasks.length > 0 && (
                <Tooltip
                  content={`${pendingTasks.length} pending task${pendingTasks.length > 1 ? 's' : ''} requiring your attention`}
                  position="bottom"
                >
                  <span className={`text-[10px] px-1.5 py-0.5 rounded cursor-help ${
                    urgentCount > 0
                      ? 'bg-red-900/50 text-red-400'
                      : highCount > 0
                        ? 'bg-yellow-900/50 text-yellow-500'
                        : 'bg-gray-800 text-gray-400'
                  }`}>
                    {pendingTasks.length}
                  </span>
                </Tooltip>
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
                    <Tooltip content="Mark this task as completed - you've done what was requested" position="top">
                      <button
                        onClick={() => updateTask(task.id, { status: 'completed' })}
                        className="flex-1 px-2 py-1 bg-green-900/30 hover:bg-green-900/50 text-green-500 border border-green-900 rounded text-[10px] font-medium"
                      >
                        Done
                      </button>
                    </Tooltip>
                    <Tooltip content="Dismiss this task - no longer needed or not applicable" position="top">
                      <button
                        onClick={() => updateTask(task.id, { status: 'dismissed' })}
                        className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded text-[10px]"
                      >
                        Skip
                      </button>
                    </Tooltip>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Click outside to close dropdowns */}
      {(showActions || showHealth || showModels || showSpawner) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowActions(false);
            setShowHealth(false);
            setShowModels(false);
            setShowSpawner(false);
          }}
        />
      )}
    </div>
  );
}
