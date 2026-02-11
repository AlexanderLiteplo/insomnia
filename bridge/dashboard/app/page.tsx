'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { HumanTask, SystemStatus } from '../lib/types';
import { ArchitectureTree } from '../components/diagram/ArchitectureTree';
import { DonutAnimation } from '../components/ascii/DonutAnimation';
import { ModelSelector } from '../components/ModelSelector';
import { QuickAgentSpawner } from '../components/QuickAgentSpawner';
import { ManagerSpawner } from '../components/ManagerSpawner';
import { ClaudesPanel } from '../components/ClaudesPanel';
import { NightlyBuilds, NightlyBuildsButton } from '../components/NightlyBuilds';
import { Tooltip, TooltipContent } from '../components/ui/Tooltip';

// Section expansion types - now includes 'tasks' for the horizontal grid layout
type ExpandedSection = 'managers' | 'projects' | 'claudes' | 'tasks' | null;

// Selected task for detailed view
type SelectedTask = string | null;

// Selected manager for detailed view
type SelectedManager = string | null;

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
  const [showQuickAgentSpawner, setShowQuickAgentSpawner] = useState(false);
  const [showManagerSpawner, setShowManagerSpawner] = useState(false);
  const [showNightlyBuilds, setShowNightlyBuilds] = useState(false);
  const [nightlyConfig, setNightlyConfig] = useState<{ enabled: boolean; nextRun?: string | null } | null>(null);
  const [expandedSection, setExpandedSection] = useState<ExpandedSection>(null);
  const [selectedTask, setSelectedTask] = useState<SelectedTask>(null);
  const [selectedManager, setSelectedManager] = useState<SelectedManager>(null);
  const [isHealing, setIsHealing] = useState(false);
  const [healStatus, setHealStatus] = useState<string | null>(null);
  const [showAddProject, setShowAddProject] = useState(false);
  const [addProjectName, setAddProjectName] = useState('');
  const [addProjectPath, setAddProjectPath] = useState('');
  const [addProjectError, setAddProjectError] = useState<string | null>(null);
  const [addingProject, setAddingProject] = useState(false);
  const [browsingFinder, setBrowsingFinder] = useState(false);
  const [selectedFolders, setSelectedFolders] = useState<Array<{ path: string; name: string; projectType: string; importing?: boolean; imported?: boolean; error?: string }>>([]);

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

  const fetchNightlyConfig = async () => {
    try {
      const res = await fetch('/api/nightly-builds');
      if (res.ok) {
        const data = await res.json();
        setNightlyConfig({ enabled: data.config?.enabled, nextRun: data.config?.nextRun });
      }
    } catch (err) {
      console.error('Failed to fetch nightly config:', err);
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

  const addProject = async () => {
    if (!addProjectName.trim()) {
      setAddProjectError('Project name is required');
      return;
    }

    setAddingProject(true);
    setAddProjectError(null);

    try {
      const body: { name: string; tasksFile?: string } = { name: addProjectName.trim() };
      if (addProjectPath.trim()) {
        body.tasksFile = addProjectPath.trim();
      }

      const res = await secureFetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setAddProjectError(data.message || 'Failed to add project');
        return;
      }

      // Success - close modal and refresh
      setShowAddProject(false);
      setAddProjectName('');
      setAddProjectPath('');
      fetchStatus();
    } catch (err) {
      setAddProjectError('Failed to add project');
    } finally {
      setAddingProject(false);
    }
  };

  const browseForFolders = async () => {
    setBrowsingFinder(true);
    setAddProjectError(null);

    try {
      const res = await secureFetch('/api/projects/browse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startPath: process.env.HOME || '/Users', multiple: true }),
      });

      const data = await res.json();

      if (data.cancelled) {
        return;
      }

      if (!data.success) {
        setAddProjectError(data.error || 'Failed to browse folders');
        return;
      }

      // Add new folders to selection (avoid duplicates)
      setSelectedFolders(prev => {
        const existingPaths = new Set(prev.map(f => f.path));
        const newFolders = data.folders.filter((f: { path: string }) => !existingPaths.has(f.path));
        return [...prev, ...newFolders];
      });
    } catch (err) {
      setAddProjectError('Failed to open folder picker');
    } finally {
      setBrowsingFinder(false);
    }
  };

  const importSelectedFolders = async () => {
    if (selectedFolders.length === 0) return;

    // Import each folder one by one
    for (let i = 0; i < selectedFolders.length; i++) {
      const folder = selectedFolders[i];
      if (folder.imported) continue;

      // Mark as importing
      setSelectedFolders(prev => prev.map((f, idx) =>
        idx === i ? { ...f, importing: true, error: undefined } : f
      ));

      try {
        // Convert folder name to kebab-case for project name
        const projectName = folder.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

        const res = await secureFetch('/api/projects/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            folderPath: folder.path,
            projectName,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          setSelectedFolders(prev => prev.map((f, idx) =>
            idx === i ? { ...f, importing: false, error: data.error || 'Import failed' } : f
          ));
        } else {
          setSelectedFolders(prev => prev.map((f, idx) =>
            idx === i ? { ...f, importing: false, imported: true } : f
          ));
        }
      } catch {
        setSelectedFolders(prev => prev.map((f, idx) =>
          idx === i ? { ...f, importing: false, error: 'Import failed' } : f
        ));
      }
    }

    // Refresh status after all imports
    fetchStatus();
  };

  const removeSelectedFolder = (index: number) => {
    setSelectedFolders(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    fetchStatus();
    fetchTasks();
    fetchHealth();
    fetchNightlyConfig();
    const statusInterval = setInterval(fetchStatus, 5000);
    const tasksInterval = setInterval(fetchTasks, 10000);
    const healthInterval = setInterval(fetchHealth, 15000);
    const nightlyInterval = setInterval(fetchNightlyConfig, 60000); // Check every minute
    return () => {
      clearInterval(statusInterval);
      clearInterval(tasksInterval);
      clearInterval(healthInterval);
      clearInterval(nightlyInterval);
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
  const selectedTaskData = selectedTask ? tasks.find(t => t.id === selectedTask) : null;
  const selectedManagerData = selectedManager && status?.managers
    ? status.managers.find(m => m?.id === selectedManager)
    : null;

  // Helper for panel flex animation - avoids TypeScript narrowing issues
  const getPanelFlex = (section: 'managers' | 'projects' | 'claudes' | 'tasks') => {
    if (expandedSection === section) return '2 1 0%';
    if (expandedSection !== null) return '0.5 1 0%';
    return '1 1 0%';
  };
  const getPanelOpacity = (section: 'managers' | 'projects' | 'claudes' | 'tasks') => {
    if (expandedSection !== null && expandedSection !== section) return 0.7;
    return 1;
  };

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

          {/* Nightly Builds Button */}
          <NightlyBuildsButton
            onClick={() => setShowNightlyBuilds(!showNightlyBuilds)}
            enabled={nightlyConfig?.enabled}
            nextRun={nightlyConfig?.nextRun}
          />

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
                        rentahumanApi: 'RentAHuman.ai marketplace - external API uptime check',
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
                               name === 'rentahumanApi' ? 'RentAHuman.ai' :
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

          {/* Quick Agent Spawner */}
          <QuickAgentSpawner
            isOpen={showQuickAgentSpawner}
            onClose={() => setShowQuickAgentSpawner(false)}
            getCsrfToken={getCsrfToken}
            onSpawn={() => fetchStatus()}
          />

          {/* Manager Spawner */}
          <ManagerSpawner
            isOpen={showManagerSpawner}
            onClose={() => setShowManagerSpawner(false)}
            getCsrfToken={getCsrfToken}
            onSpawn={() => fetchStatus()}
          />

          {/* Nightly Builds Modal */}
          <NightlyBuilds
            isOpen={showNightlyBuilds}
            onClose={() => { setShowNightlyBuilds(false); fetchNightlyConfig(); }}
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

      {/* Main Content: Horizontal Grid Layout - Managers | Projects | Claudes | Tasks */}
      <div className="flex-1 flex min-h-0">
        {/* Left Column: System Architecture (Bridge, Responder, Orchestrator) */}
        <motion.div
          className="flex-shrink-0 overflow-hidden border-r border-[var(--card-border)]"
          animate={{
            width: expandedSection ? 160 : 200,
            opacity: expandedSection ? 0.85 : 1
          }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        >
          {status && (
            <ArchitectureTree
              bridge={status.bridge}
              managers={status.managers || []}
              projects={status.projects || []}
              orchestrator={status.orchestrator}
              responderActive={Array.isArray(status.managers) && status.managers.some(m => m?.status === 'processing')}
              models={status.models}
              expandedSection={expandedSection}
              onSectionClick={setExpandedSection}
              compactMode={!!expandedSection}
              hideManagers={true}
            />
          )}
        </motion.div>

        {/* Middle Detail Panel - Task Details */}
        <AnimatePresence>
          {selectedTaskData && (
            <motion.div
              className="overflow-hidden border-r border-[var(--neon-green)] bg-[var(--card)] flex flex-col flex-shrink-0"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 400, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              <div className="p-3 border-b border-[var(--card-border)] bg-[var(--neon-green)]/5 flex items-center justify-between">
                <h2 className="font-medium text-sm text-[var(--neon-green)]">Task Details</h2>
                <button
                  onClick={() => setSelectedTask(null)}
                  className="text-gray-500 hover:text-gray-300 text-xs"
                >
                  Close ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <PriorityBadge priority={selectedTaskData.priority} />
                    {selectedTaskData.project && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-900/50 text-blue-400 border border-blue-800">
                        {selectedTaskData.project}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-medium text-white mb-1">{selectedTaskData.title}</h3>
                  <p className="text-xs text-gray-500">Created {formatTimeAgo(selectedTaskData.createdAt)}</p>
                  {selectedTaskData.createdBy && (
                    <p className="text-xs text-gray-600">By: {selectedTaskData.createdBy}</p>
                  )}
                </div>

                {selectedTaskData.description && (
                  <div className="mb-4">
                    <h4 className="text-xs font-medium text-gray-400 mb-1">Description</h4>
                    <p className="text-sm text-gray-300">{selectedTaskData.description}</p>
                  </div>
                )}

                {selectedTaskData.instructions && selectedTaskData.instructions.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-xs font-medium text-gray-400 mb-2">Instructions</h4>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
                      {selectedTaskData.instructions.map((inst: string, idx: number) => (
                        <li key={idx} className="leading-relaxed">{inst}</li>
                      ))}
                    </ol>
                  </div>
                )}

                <div className="flex flex-col gap-2 mt-6">
                  <button
                    onClick={() => {
                      updateTask(selectedTaskData.id, { status: 'completed' });
                      setSelectedTask(null);
                    }}
                    className="w-full px-4 py-2 bg-green-900/30 hover:bg-green-900/50 text-green-500 border border-green-900 rounded font-medium text-sm"
                  >
                    Mark as Complete
                  </button>
                  <button
                    onClick={() => {
                      updateTask(selectedTaskData.id, { status: 'dismissed' });
                      setSelectedTask(null);
                    }}
                    className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 rounded text-sm"
                  >
                    Dismiss Task
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Middle Detail Panel - Manager Details */}
        <AnimatePresence>
          {selectedManagerData && (
            <motion.div
              className="overflow-hidden border-r border-purple-500/50 bg-[var(--card)] flex flex-col flex-shrink-0"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 400, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              <div className="p-3 border-b border-[var(--card-border)] bg-purple-900/10 flex items-center justify-between">
                <h2 className="font-medium text-sm text-purple-400">Manager Details</h2>
                <button
                  onClick={() => setSelectedManager(null)}
                  className="text-gray-500 hover:text-gray-300 text-xs"
                >
                  Close ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded ${
                      selectedManagerData.status === 'processing'
                        ? 'bg-blue-900/50 text-blue-400 border border-blue-800'
                        : 'bg-gray-800 text-gray-400 border border-gray-700'
                    }`}>
                      {selectedManagerData.status.toUpperCase()}
                    </span>
                    {(selectedManagerData.messageQueue?.length ?? 0) > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-900/50 text-yellow-500 border border-yellow-800">
                        {selectedManagerData.messageQueue?.length ?? 0} queued
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-medium text-white mb-1">{selectedManagerData.name}</h3>
                  <p className="text-xs text-gray-500">Last active {formatTimeAgo(selectedManagerData.lastActiveAt)}</p>
                  <p className="text-xs text-gray-600 font-mono mt-1">{selectedManagerData.id}</p>
                </div>

                {selectedManagerData.description && (
                  <div className="mb-4">
                    <h4 className="text-xs font-medium text-gray-400 mb-1">Description</h4>
                    <p className="text-sm text-gray-300">{selectedManagerData.description}</p>
                  </div>
                )}

                {selectedManagerData.topics && selectedManagerData.topics.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-xs font-medium text-gray-400 mb-2">Topics</h4>
                    <div className="flex flex-wrap gap-1">
                      {selectedManagerData.topics.map((topic: string, idx: number) => (
                        <span key={idx} className="text-[10px] px-2 py-1 rounded bg-purple-900/30 text-purple-400 border border-purple-800">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedManagerData.currentTask && (
                  <div className="mb-4">
                    <h4 className="text-xs font-medium text-gray-400 mb-1">Current Task</h4>
                    <p className="text-sm text-blue-300 bg-blue-900/20 p-2 rounded border border-blue-900">
                      {selectedManagerData.currentTask}
                    </p>
                  </div>
                )}

                {selectedManagerData.messageQueue && selectedManagerData.messageQueue.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-xs font-medium text-gray-400 mb-2">Message Queue</h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {selectedManagerData.messageQueue.map((msg: { id: string; content: string }, idx: number) => (
                        <div key={msg.id || idx} className="text-[11px] text-gray-400 bg-[var(--background)] p-2 rounded border border-[var(--card-border)]">
                          {msg.content}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedManagerData.orchestrators && selectedManagerData.orchestrators.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-xs font-medium text-gray-400 mb-1">Orchestrators</h4>
                    <p className="text-sm text-gray-300">{selectedManagerData.orchestrators.join(', ')}</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Managers Panel */}
        <motion.div
          className="overflow-hidden border-r border-[var(--card-border)] bg-[var(--card)]/20 flex flex-col cursor-pointer"
          animate={{
            flex: getPanelFlex('managers'),
            opacity: getPanelOpacity('managers')
          }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          onClick={() => setExpandedSection(expandedSection === 'managers' ? null : 'managers')}
          style={{
            borderColor: expandedSection === 'managers' ? 'rgba(0, 204, 136, 0.5)' : undefined
          }}
        >
          <div className={`p-3 border-b border-[var(--card-border)] flex items-center justify-between transition-colors ${
            expandedSection === 'managers' ? 'bg-[var(--neon-green)]/5' : ''
          }`}>
            <div className="flex items-center gap-2">
              <Tooltip
                content={
                  <TooltipContent
                    title="Managers"
                    description="Long-running Opus agents that handle specific topics. Click to expand."
                  />
                }
                position="bottom"
              >
                <h2 className={`font-medium text-sm transition-colors ${
                  expandedSection === 'managers' ? 'text-[var(--neon-green)]' : 'text-white hover:text-[var(--neon-green)]'
                }`}>
                  Managers
                </h2>
              </Tooltip>
              <Tooltip
                content={
                  <TooltipContent
                    title="New Manager"
                    description="Create a new long-running manager agent"
                  />
                }
                position="bottom"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowManagerSpawner(true);
                  }}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400 hover:bg-purple-900/50 transition-colors font-bold"
                >
                  +
                </button>
              </Tooltip>
              {status && Array.isArray(status.managers) && status.managers.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400">
                  {status.managers.length}
                </span>
              )}
              {status && Array.isArray(status.managers) && status.managers.filter(m => m?.status === 'processing').length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-900/30 text-green-400">
                  {status.managers.filter(m => m?.status === 'processing').length} active
                </span>
              )}
            </div>
            {expandedSection === 'managers' && (
              <span className="text-[9px] text-gray-500">Click to collapse</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {status && (!Array.isArray(status.managers) || status.managers.length === 0) ? (
              <div className="text-center py-6">
                <div className="text-2xl mb-1 opacity-50">🤖</div>
                <p className="text-gray-600 text-xs">No active managers</p>
              </div>
            ) : (
              // Sort managers: processing first, then by lastActiveAt (most recent first), then by ID for stability
              [...(Array.isArray(status?.managers) ? status.managers : [])].filter(m => m != null).sort((a, b) => {
                // Processing managers always come first
                const aProcessing = a?.status === 'processing';
                const bProcessing = b?.status === 'processing';
                if (aProcessing && !bProcessing) return -1;
                if (!aProcessing && bProcessing) return 1;

                // Then sort by lastActiveAt (most recent first)
                const aTime = a?.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
                const bTime = b?.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
                if (aTime !== bTime) return bTime - aTime;

                // Use ID as stable tiebreaker to prevent random swapping
                return (a?.id || '').localeCompare(b?.id || '');
              }).map((manager, i) => {
                if (!manager) return null;
                const isProcessing = manager.status === 'processing';
                // Only show as "active" if actually processing - idle managers are not active
                const isActive = isProcessing;
                const hasQueue = (manager.messageQueue?.length ?? 0) > 0;
                const MANAGER_COLORS = [
                  '#cc6688', '#66aa88', '#aa8866', '#8866aa', '#66aaaa',
                  '#aaaa66', '#aa6666', '#6688aa', '#88aa66', '#aa66aa',
                ];
                // Use hash of manager ID for stable color assignment (prevents color changes on re-sort)
                const idHash = manager.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                const color = MANAGER_COLORS[idHash % MANAGER_COLORS.length];

                const isSelected = selectedManager === manager.id;

                return (
                  <motion.div
                    key={manager.id}
                    className={`p-2 mb-2 border rounded bg-[var(--background)] transition-all cursor-pointer hover:border-purple-500/50 ${
                      isSelected
                        ? 'border-purple-500 bg-purple-900/10'
                        : isProcessing ? 'border-blue-800 bg-blue-900/10' : 'border-[var(--card-border)]'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedManager(isSelected ? null : manager.id);
                    }}
                    whileHover={{ scale: 1.01 }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-xs truncate font-medium text-white">
                          {manager.name}
                        </span>
                        {isProcessing && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />}
                      </div>
                      <div className="flex items-center gap-1">
                        {hasQueue && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-yellow-900/50 text-yellow-500">
                            {manager.messageQueue?.length ?? 0}
                          </span>
                        )}
                        <span className="text-[9px] text-gray-600">
                          {formatTimeAgo(manager.lastActiveAt)}
                        </span>
                        <span className={`text-[10px] ${
                          isProcessing ? 'text-blue-400' : 'text-gray-500'
                        }`}>
                          {isProcessing ? '●' : '○'}
                        </span>
                      </div>
                    </div>
                    {/* Show topics when expanded */}
                    <AnimatePresence>
                      {expandedSection === 'managers' && manager.topics && manager.topics.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-1 pt-1 border-t border-[var(--card-border)]"
                        >
                          <div className="text-[9px] text-gray-500">
                            Topics: {manager.topics.join(', ')}
                          </div>
                          {manager.currentTask && (
                            <div className="text-[9px] text-blue-400 mt-0.5 truncate">
                              Working on: {manager.currentTask}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })
            )}
          </div>
        </motion.div>

        {/* Center: Projects Panel */}
        <motion.div
          className="overflow-hidden border-r border-[var(--card-border)] bg-[var(--card)]/20 flex flex-col cursor-pointer"
          animate={{
            flex: getPanelFlex('projects'),
            opacity: getPanelOpacity('projects')
          }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          onClick={() => setExpandedSection(expandedSection === 'projects' ? null : 'projects')}
          style={{
            borderColor: expandedSection === 'projects' ? 'rgba(0, 204, 136, 0.5)' : undefined
          }}
        >
          <div className={`p-3 border-b border-[var(--card-border)] flex items-center justify-between transition-colors ${
            expandedSection === 'projects' ? 'bg-[var(--neon-green)]/5' : ''
          }`}>
            <div className="flex items-center gap-2">
              <Tooltip
                content={
                  <TooltipContent
                    title="Projects"
                    description="Active projects being built by the orchestrator system. Click to expand."
                  />
                }
                position="bottom"
              >
                <h2 className={`font-medium text-sm transition-colors ${
                  expandedSection === 'projects' ? 'text-[var(--neon-green)]' : 'text-white hover:text-[var(--neon-green)]'
                }`}>
                  Projects
                </h2>
              </Tooltip>
              {status && Array.isArray(status.projects) && status.projects.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400">
                  {status.projects.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {expandedSection === 'projects' && (
                <span className="text-[9px] text-gray-500">Click to collapse</span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAddProject(true);
                }}
                className="text-[10px] px-2 py-1 rounded bg-[var(--neon-green)]/10 text-[var(--neon-green)] hover:bg-[var(--neon-green)]/20 transition-colors"
              >
                + Add
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {status && (!Array.isArray(status.projects) || status.projects.length === 0) ? (
              <div className="text-center py-6">
                <div className="text-2xl mb-1 opacity-50">📁</div>
                <p className="text-gray-600 text-xs">No active projects</p>
              </div>
            ) : (
              (Array.isArray(status?.projects) ? status.projects : []).filter(p => p != null).map((project, i) => {
                const percent = project.total > 0 ? Math.round((project.completed / project.total) * 100) : 0;
                const isActive = project.status === 'active';
                const isComplete = percent === 100;
                return (
                  <motion.div
                    key={i}
                    className={`p-2 mb-2 border rounded bg-[var(--background)] transition-colors ${
                      isActive ? 'border-blue-800 bg-blue-900/10' : isComplete ? 'border-green-900/50' : 'border-[var(--card-border)]'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                    whileHover={{ scale: 1.01 }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className={`text-xs truncate font-medium ${isComplete ? 'text-green-400' : 'text-white'}`}>
                          {project.name}
                        </span>
                        {isActive && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />}
                        {isComplete && <span className="text-[9px] text-green-500">✓</span>}
                      </div>
                      <span className="text-[10px] text-gray-500 ml-2">{percent}%</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded h-1.5">
                      <div
                        className={`h-1.5 rounded transition-all ${
                          isComplete ? 'bg-green-600' : isActive ? 'bg-blue-500' : 'bg-gray-600'
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <div className="text-[9px] text-gray-600 mt-1">
                      {project.completed}/{project.total} tasks
                    </div>
                    {/* Show tasks when expanded */}
                    <AnimatePresence>
                      {expandedSection === 'projects' && Array.isArray(project.tasks) && project.tasks.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-2 pt-2 border-t border-[var(--card-border)] space-y-1"
                        >
                          {project.tasks.slice(0, 5).map((task, j) => (
                            <div key={j} className="flex items-center gap-2 text-[10px]">
                              <span className={
                                task.status === 'completed' ? 'text-green-500' :
                                task.status === 'in_progress' ? 'text-blue-400' :
                                task.status === 'worker_done' ? 'text-yellow-500' : 'text-gray-500'
                              }>
                                {task.status === 'completed' ? '✓' : task.status === 'in_progress' ? '●' : task.status === 'worker_done' ? '◐' : '○'}
                              </span>
                              <span className={task.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-300'}>
                                {task.name}
                              </span>
                            </div>
                          ))}
                          {project.tasks.length > 5 && (
                            <div className="text-[9px] text-gray-600">+{project.tasks.length - 5} more</div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })
            )}
          </div>
        </motion.div>

        {/* Center-Right: Claudes Panel - Always visible */}
        <motion.div
          className="overflow-hidden border-r border-[var(--card-border)] flex flex-col"
          animate={{
            flex: getPanelFlex('claudes'),
            opacity: getPanelOpacity('claudes')
          }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          style={{
            borderColor: expandedSection === 'claudes' ? 'rgba(0, 204, 136, 0.5)' : undefined
          }}
        >
          {status && (
            <ClaudesPanel
              processes={status.claudeProcessDetails || []}
              onRefresh={fetchStatus}
              getCsrfToken={getCsrfToken}
              isExpanded={expandedSection === 'claudes'}
              onHeaderClick={() => setExpandedSection(expandedSection === 'claudes' ? null : 'claudes')}
              onQuickAgentSpawn={() => setShowQuickAgentSpawner(true)}
            />
          )}
        </motion.div>

        {/* Right: Human Tasks Panel */}
        <motion.div
          className="overflow-hidden bg-[var(--card)]/30 flex flex-col cursor-pointer"
          animate={{
            flex: getPanelFlex('tasks'),
            opacity: getPanelOpacity('tasks')
          }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          onClick={() => setExpandedSection(expandedSection === 'tasks' ? null : 'tasks')}
          style={{
            borderColor: expandedSection === 'tasks' ? 'rgba(0, 204, 136, 0.5)' : undefined
          }}
        >
          <div className={`p-3 border-b border-[var(--card-border)] flex items-center justify-between transition-colors ${
            expandedSection === 'tasks' ? 'bg-[var(--neon-green)]/5' : ''
          }`}>
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
                <h2 className={`font-medium text-sm transition-colors ${
                  expandedSection === 'tasks' ? 'text-[var(--neon-green)]' : 'text-white hover:text-[var(--neon-green)]'
                }`}>
                  Human Tasks
                </h2>
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
            {expandedSection === 'tasks' && (
              <span className="text-[9px] text-gray-500">Click to collapse</span>
            )}
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
                  className={`border rounded p-2 bg-[var(--background)] cursor-pointer transition-all hover:border-[var(--neon-green)] ${
                    selectedTask === task.id
                      ? 'border-[var(--neon-green)] bg-[var(--neon-green)]/5'
                      : task.priority === 'urgent'
                      ? 'border-red-900'
                      : task.priority === 'high'
                        ? 'border-yellow-900'
                        : 'border-[var(--card-border)]'
                  }`}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  whileHover={{ scale: 1.01 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTask(task.id);
                  }}
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

                  {task.description && !expandedSection && (
                    <p className="text-[10px] text-gray-500 mb-1.5 line-clamp-1">{task.description}</p>
                  )}

                  {/* Show description and buttons when expanded or selected */}
                  {expandedSection === 'tasks' && (
                    <>
                      {task.description && (
                        <p className="text-[10px] text-gray-500 mb-2 line-clamp-2">{task.description}</p>
                      )}

                      <div className="flex gap-1 mt-2">
                        <Tooltip content="Mark this task as completed - you've done what was requested" position="top">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateTask(task.id, { status: 'completed' });
                              if (selectedTask === task.id) setSelectedTask(null);
                            }}
                            className="flex-1 px-2 py-1 bg-green-900/30 hover:bg-green-900/50 text-green-500 border border-green-900 rounded text-[10px] font-medium"
                          >
                            Done
                          </button>
                        </Tooltip>
                        <Tooltip content="Dismiss this task - no longer needed or not applicable" position="top">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateTask(task.id, { status: 'dismissed' });
                              if (selectedTask === task.id) setSelectedTask(null);
                            }}
                            className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded text-[10px]"
                          >
                            Skip
                          </button>
                        </Tooltip>
                      </div>
                    </>
                  )}

                  {/* Collapsed view - just show click hint */}
                  {!expandedSection && (
                    <div className="text-[9px] text-gray-600 mt-1">Click for details</div>
                  )}
                </motion.div>
              ))
            )}
          </div>
        </motion.div>
      </div>

      {/* Click outside to close dropdowns */}
      {(showActions || showHealth || showModels || showQuickAgentSpawner || showManagerSpawner) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowActions(false);
            setShowHealth(false);
            setShowModels(false);
            setShowQuickAgentSpawner(false);
            setShowManagerSpawner(false);
          }}
        />
      )}

      {/* Add Project Modal */}
      <AnimatePresence>
        {showAddProject && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowAddProject(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-white mb-4">Add Projects</h3>

              {/* Finder Import Section */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm text-gray-400">Import from Finder</label>
                  <button
                    onClick={browseForFolders}
                    disabled={browsingFinder}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {browsingFinder ? (
                      <>
                        <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                        Opening Finder...
                      </>
                    ) : (
                      <>
                        <span>📂</span>
                        Browse Finder
                      </>
                    )}
                  </button>
                </div>

                {/* Selected folders list */}
                {selectedFolders.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {selectedFolders.map((folder, index) => (
                      <div
                        key={folder.path}
                        className={`flex items-center justify-between p-2 rounded border ${
                          folder.imported
                            ? 'border-green-800 bg-green-900/20'
                            : folder.error
                            ? 'border-red-800 bg-red-900/20'
                            : 'border-[var(--card-border)] bg-[var(--background)]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-lg">
                            {folder.projectType === 'node' ? '📦' :
                             folder.projectType === 'python' ? '🐍' :
                             folder.projectType === 'rust' ? '🦀' :
                             folder.projectType === 'go' ? '🐹' :
                             folder.projectType === 'ios' ? '📱' : '📁'}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-white truncate">{folder.name}</div>
                            <div className="text-[10px] text-gray-500 truncate">{folder.path}</div>
                            {folder.error && (
                              <div className="text-[10px] text-red-400">{folder.error}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          {folder.importing && (
                            <span className="w-3 h-3 border border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                          )}
                          {folder.imported && (
                            <span className="text-green-400 text-sm">✓</span>
                          )}
                          {!folder.imported && !folder.importing && (
                            <button
                              onClick={() => removeSelectedFolder(index)}
                              className="text-gray-500 hover:text-red-400 transition-colors p-1"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {selectedFolders.length > 0 && selectedFolders.some(f => !f.imported) && (
                  <button
                    onClick={importSelectedFolders}
                    disabled={selectedFolders.every(f => f.imported || f.importing)}
                    className="w-full px-4 py-2 text-sm bg-[var(--neon-green)] text-black rounded hover:bg-[var(--neon-green)]/90 transition-colors disabled:opacity-50"
                  >
                    {selectedFolders.some(f => f.importing)
                      ? 'Importing...'
                      : `Import ${selectedFolders.filter(f => !f.imported).length} Project${selectedFolders.filter(f => !f.imported).length !== 1 ? 's' : ''}`
                    }
                  </button>
                )}

                {selectedFolders.length > 0 && selectedFolders.every(f => f.imported) && (
                  <div className="text-center text-green-400 text-sm py-2">
                    All projects imported successfully!
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[var(--card-border)]"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-[var(--card)] text-gray-500">or add manually</span>
                </div>
              </div>

              {/* Manual Add Section */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Project Name *</label>
                  <input
                    type="text"
                    value={addProjectName}
                    onChange={(e) => setAddProjectName(e.target.value)}
                    placeholder="my-awesome-project"
                    className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded text-white text-sm focus:outline-none focus:border-[var(--neon-green)]"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">Will be converted to kebab-case</p>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Tasks File Path (optional)</label>
                  <input
                    type="text"
                    value={addProjectPath}
                    onChange={(e) => setAddProjectPath(e.target.value)}
                    placeholder="~/path/to/tasks.json"
                    className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded text-white text-sm focus:outline-none focus:border-[var(--neon-green)]"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">Leave empty to create a new project</p>
                </div>

                {addProjectError && (
                  <p className="text-red-400 text-sm">{addProjectError}</p>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowAddProject(false);
                    setAddProjectName('');
                    setAddProjectPath('');
                    setAddProjectError(null);
                    setSelectedFolders([]);
                  }}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  {selectedFolders.some(f => f.imported) ? 'Done' : 'Cancel'}
                </button>
                <button
                  onClick={addProject}
                  disabled={addingProject || !addProjectName.trim()}
                  className="px-4 py-2 text-sm bg-[var(--neon-green)] text-black rounded hover:bg-[var(--neon-green)]/90 transition-colors disabled:opacity-50"
                >
                  {addingProject ? 'Adding...' : 'Add Manually'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Note: NightlyBuilds modal has its own backdrop handling */}
    </div>
  );
}
