'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Robot } from '../robots/Robot';
import { StatusDot } from '../ui/StatusDot';
import { Tooltip, TooltipContent } from '../ui/Tooltip';
import type { BridgeStatus, Manager, Project, ProjectTask, SystemEvent, ModelConfig } from '../../lib/types';

interface OrchestratorStatus {
  workerRunning: boolean;
  workerPid?: number | null;
  managerRunning: boolean;
  managerPid?: number | null;
}

// Section expansion types
type ExpandedSection = 'managers' | 'projects' | 'claudes' | 'tasks' | null;

interface ArchitectureTreeProps {
  bridge: BridgeStatus;
  managers: Manager[];
  projects: Project[];
  orchestrator?: OrchestratorStatus;
  responderActive?: boolean;
  models: ModelConfig;
  expandedSection?: ExpandedSection;
  onSectionClick?: (section: ExpandedSection) => void;
  compactMode?: boolean;
}

// Activity event types for notifications
interface ActivityEvent {
  id: string;
  type: 'message_received' | 'manager_created' | 'orchestrator_spawned' | 'task_completed' | 'processing_started';
  message: string;
  color: string;
  timestamp: number;
}

// Event particles component for visual effects
function EventParticles({ active, color = '#00cc88' }: { active: boolean; color?: string }) {
  if (!active) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="absolute w-2 h-2 rounded-full particle-burst"
          style={{
            backgroundColor: color,
            left: '50%',
            top: '50%',
            animationDelay: `${i * 0.1}s`,
            transform: `rotate(${i * 60}deg) translateX(20px)`,
          }}
        />
      ))}
    </div>
  );
}

// Screen flash overlay for dramatic message received effect
function ScreenFlash({ active, color = '#00cc88' }: { active: boolean; color?: string }) {
  if (!active) return null;

  return (
    <div
      className="fixed inset-0 pointer-events-none z-50 screen-flash"
      style={{ backgroundColor: color }}
    />
  );
}

// Floating activity notification
function ActivityNotification({ event, onComplete }: { event: ActivityEvent; onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 3000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const icons: Record<string, string> = {
    message_received: '📨',
    manager_created: '🤖',
    orchestrator_spawned: '⚡',
    task_completed: '✅',
    processing_started: '🔄',
  };

  return (
    <motion.div
      initial={{ x: 100, opacity: 0, scale: 0.8 }}
      animate={{ x: 0, opacity: 1, scale: 1 }}
      exit={{ x: 100, opacity: 0, scale: 0.8 }}
      className="flex items-center gap-2 bg-[var(--card)] border rounded-lg px-3 py-2 shadow-lg"
      style={{ borderColor: event.color, boxShadow: `0 0 20px ${event.color}40` }}
    >
      <span className="text-lg">{icons[event.type]}</span>
      <span className="text-xs text-white font-medium">{event.message}</span>
    </motion.div>
  );
}

// Expanding ring effect for spawns
function ExpandingRings({ active, color = '#00cc88' }: { active: boolean; color?: string }) {
  if (!active) return null;

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="absolute w-12 h-12 rounded-full border-2 expand-ring"
          style={{
            borderColor: color,
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}

// Electric sparks for spawning
function ElectricSparks({ active, color = '#00cc88' }: { active: boolean; color?: string }) {
  if (!active) return null;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className="absolute electric-spark"
          style={{
            left: '50%',
            top: '50%',
            width: '2px',
            height: '10px',
            backgroundColor: color,
            boxShadow: `0 0 6px ${color}`,
            transformOrigin: 'center center',
            animationDelay: `${i * 0.05}s`,
          }}
        />
      ))}
    </div>
  );
}

// Animated connection line with energy beam
function ConnectionLine({ active, direction = 'right' }: { active: boolean; direction?: 'right' | 'down' }) {
  const isHorizontal = direction === 'right';

  return (
    <div
      className={`relative ${isHorizontal ? 'h-px w-8' : 'w-px h-8'} bg-gray-700 overflow-hidden`}
    >
      {active && (
        <div
          className={`absolute ${isHorizontal ? 'h-full w-4' : 'w-full h-4'} energy-beam`}
          style={{
            background: `linear-gradient(${isHorizontal ? '90deg' : '180deg'}, transparent, var(--neon-green), transparent)`,
            boxShadow: '0 0 10px var(--neon-green)',
          }}
        />
      )}
    </div>
  );
}

// Typing indicator for processing managers
function TypingIndicator() {
  return (
    <div className="flex gap-1 items-center">
      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full typing-dot-1" />
      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full typing-dot-2" />
      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full typing-dot-3" />
    </div>
  );
}

// Activity indicator for the bridge
function ActivityIndicator({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-800 overflow-hidden rounded-b-lg">
      <div className="h-full w-1/3 bg-[var(--neon-green)] activity-flow" />
    </div>
  );
}

// Color palette for managers - muted retro colors
const MANAGER_COLORS = [
  '#cc6688', // pink
  '#66aa88', // teal
  '#aa8866', // tan
  '#8866aa', // purple
  '#66aaaa', // cyan
  '#aaaa66', // olive
  '#aa6666', // red
  '#6688aa', // blue
  '#88aa66', // lime
  '#aa66aa', // magenta
];

const STATUS_TOOLTIPS = {
  processing: 'Currently processing a task - Claude is actively working',
  online: 'Manager is active and ready to receive new tasks',
  offline: 'Manager is idle/sleeping - will wake when needed',
};

function ManagerRow({
  manager,
  color,
  index,
  isNew = false,
  hasNewMessage = false,
  queueChanged = false,
}: {
  manager: Manager;
  color: string;
  index: number;
  isNew?: boolean;
  hasNewMessage?: boolean;
  queueChanged?: boolean;
}) {
  const isProcessing = manager.status === 'processing';
  const hasQueue = manager.messageQueue.length > 0;
  const robotState = isProcessing ? 'running' : manager.status === 'active' ? 'idle' : 'sleeping';
  const statusType = isProcessing ? 'processing' : manager.status === 'active' ? 'online' : 'offline';

  // Determine animation classes
  const animationClass = isNew
    ? 'power-up highlight-flash'
    : hasNewMessage
      ? 'message-ripple highlight-flash'
      : isProcessing
        ? 'processing-pulse'
        : '';

  return (
    <motion.div
      className={`flex items-center gap-2 py-1.5 px-1 border-b border-[var(--card-border)] last:border-0 relative ${animationClass}`}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.02 }}
      layout
      style={isNew || hasNewMessage ? { boxShadow: `0 0 10px ${color}30` } : {}}
    >
      {/* Expanding rings for new managers */}
      <ExpandingRings active={isNew} color={color} />
      {/* Particle effect for new managers */}
      <EventParticles active={isNew} color={color} />

      {/* Robot for this manager - smaller */}
      <Tooltip
        content={
          <TooltipContent
            title={manager.name}
            description={`Handles topics: ${manager.topics?.join(', ') || 'general'}`}
          />
        }
        position="right"
      >
        <div className={`relative flex-shrink-0 ${hasNewMessage ? 'robot-excited' : ''}`}>
          <Robot state={robotState} size={22} color={color} />
          {isProcessing && (
            <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full heartbeat" style={{ boxShadow: '0 0 4px #3b82f6' }} />
            </div>
          )}
        </div>
      </Tooltip>

      {/* Manager info - inline */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className="font-medium text-white text-[11px] truncate">{manager.name}</span>
        {hasQueue && (
          <Tooltip
            content={`${manager.messageQueue.length} queued`}
            position="top"
          >
            <motion.span
              className={`text-[9px] bg-yellow-900/50 text-yellow-500 px-1 py-0.5 rounded cursor-help ${queueChanged ? 'badge-pop' : ''}`}
              animate={queueChanged ? { scale: [1, 1.2, 1] } : {}}
            >
              {manager.messageQueue.length}
            </motion.span>
          </Tooltip>
        )}
        {isNew && (
          <motion.span
            className="text-[8px] bg-green-900/50 text-green-400 px-1 rounded"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            style={{ boxShadow: '0 0 6px #22c55e' }}
          >
            NEW
          </motion.span>
        )}
        {isProcessing && <TypingIndicator />}
      </div>

      {/* Status indicator */}
      <Tooltip content={STATUS_TOOLTIPS[statusType]} position="left">
        <div className={`flex-shrink-0 ${isProcessing ? 'heartbeat' : ''}`}>
          <StatusDot status={statusType} />
        </div>
      </Tooltip>
    </motion.div>
  );
}

function OrchestratorTeam({ orchestrator, workerJustSpawned = false, managerJustSpawned = false }: { orchestrator?: OrchestratorStatus; workerJustSpawned?: boolean; managerJustSpawned?: boolean }) {
  const workerState = orchestrator?.workerRunning ? 'running' : 'sleeping';
  const managerState = orchestrator?.managerRunning ? 'running' : 'sleeping';

  return (
    <div className="flex items-center gap-2">
      {/* Worker robot */}
      <Tooltip
        content={
          <TooltipContent
            title="Orchestrator Worker"
            description="Implements tasks from the queue - writes code, runs tests, and marks tasks done when tests pass"
          />
        }
        position="top"
      >
        <div className={`text-center relative ${workerJustSpawned ? 'power-up' : ''}`}>
          {/* Expanding rings on spawn */}
          <ExpandingRings active={workerJustSpawned} color="#66aa88" />
          {/* Electric sparks on spawn */}
          <ElectricSparks active={workerJustSpawned} color="#66aa88" />
          {/* Particles */}
          <EventParticles active={workerJustSpawned} color="#66aa88" />

          <div className={`relative ${workerJustSpawned ? 'glow-pulse' : ''}`} style={workerJustSpawned ? { borderRadius: '50%' } : {}}>
            <Robot state={workerState} size={28} color="#66aa88" />
          </div>
          <div className="text-[9px] text-gray-500 mt-1">Worker</div>
          {workerJustSpawned && (
            <motion.div
              className="absolute -top-2 -right-2"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 15 }}
            >
              <span className="text-sm bg-green-900/90 text-green-400 px-1.5 py-0.5 rounded shadow-lg" style={{ boxShadow: '0 0 10px #66aa88' }}>
                ⚡
              </span>
            </motion.div>
          )}
          {orchestrator?.workerRunning && !workerJustSpawned && (
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
              <div className="w-2 h-2 bg-green-500 rounded-full heartbeat" style={{ boxShadow: '0 0 6px #22c55e' }} />
            </div>
          )}
        </div>
      </Tooltip>

      {/* Manager robot */}
      <Tooltip
        content={
          <TooltipContent
            title="Orchestrator Manager"
            description="Reviews completed work, approves or requests changes, generates skills from learnings"
          />
        }
        position="top"
      >
        <div className={`text-center relative ${managerJustSpawned ? 'power-up' : ''}`}>
          {/* Expanding rings on spawn */}
          <ExpandingRings active={managerJustSpawned} color="#aa8866" />
          {/* Electric sparks on spawn */}
          <ElectricSparks active={managerJustSpawned} color="#aa8866" />
          {/* Particles */}
          <EventParticles active={managerJustSpawned} color="#aa8866" />

          <div className={`relative ${managerJustSpawned ? 'glow-pulse' : ''}`} style={managerJustSpawned ? { borderRadius: '50%' } : {}}>
            <Robot state={managerState} size={28} color="#aa8866" />
          </div>
          <div className="text-[9px] text-gray-500 mt-1">Manager</div>
          {managerJustSpawned && (
            <motion.div
              className="absolute -top-2 -right-2"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 15 }}
            >
              <span className="text-sm bg-yellow-900/90 text-yellow-400 px-1.5 py-0.5 rounded shadow-lg" style={{ boxShadow: '0 0 10px #aa8866' }}>
                ⚡
              </span>
            </motion.div>
          )}
          {orchestrator?.managerRunning && !managerJustSpawned && (
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
              <div className="w-2 h-2 bg-green-500 rounded-full heartbeat" style={{ boxShadow: '0 0 6px #22c55e' }} />
            </div>
          )}
        </div>
      </Tooltip>
    </div>
  );
}

// Task status icon helper
function getTaskStatusIcon(status: string) {
  switch (status) {
    case 'completed':
      return '✓';
    case 'in_progress':
      return '●';
    case 'worker_done':
      return '◐';
    default:
      return '○';
  }
}

// Task status color helper
function getTaskStatusColor(status: string) {
  switch (status) {
    case 'completed':
      return 'text-green-500';
    case 'in_progress':
      return 'text-blue-400';
    case 'worker_done':
      return 'text-yellow-500';
    default:
      return 'text-gray-500';
  }
}

// Import project modal component
function ImportProjectModal({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: () => void;
}) {
  const [folderPath, setFolderPath] = useState('');
  const [projectName, setProjectName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string>('');

  const handleBrowse = async () => {
    try {
      // Try to use the modern File System Access API if available
      if ('showDirectoryPicker' in window) {
        try {
          // @ts-ignore - showDirectoryPicker is not in all TypeScript definitions yet
          const dirHandle = await window.showDirectoryPicker();
          // Get the full path if possible, otherwise use the directory name
          // Note: Full path access is limited in browsers for security
          const dirName = dirHandle.name;

          // For local development, we'll ask the user to confirm the full path
          const fullPath = prompt(
            `Directory selected: "${dirName}"\n\nPlease enter the full absolute path to this directory:`,
            `${process.env.HOME || '/Users/username'}/Documents/${dirName}`
          );

          if (fullPath) {
            setFolderPath(fullPath);
            setProjectName(dirName);
          }
        } catch (err) {
          // User cancelled the picker or browser doesn't support it
          console.log('Directory picker cancelled or not supported');
          // Fall back to text input
          fallbackTextInput();
        }
      } else {
        // Fallback for browsers without File System Access API
        fallbackTextInput();
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
      fallbackTextInput();
    }
  };

  const fallbackTextInput = () => {
    const path = prompt(
      'Enter the full path to the project folder:\n\nExample: /Users/username/Documents/my-project'
    );
    if (path) {
      setFolderPath(path);
      // Extract project name from path
      const name = path.split('/').filter(Boolean).pop() || '';
      setProjectName(name);
    }
  };

  const handleImport = async () => {
    if (!folderPath || !projectName) {
      alert('Please select a folder and enter a project name');
      return;
    }

    setIsImporting(true);
    setImportStatus('Starting import...');

    try {
      // Get CSRF token first
      const csrfResponse = await fetch('/api/csrf');
      if (!csrfResponse.ok) {
        throw new Error('Failed to get CSRF token');
      }
      const { token: csrfToken } = await csrfResponse.json();

      // Now make the import request with CSRF token
      const response = await fetch('/api/projects/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ folderPath, projectName }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setImportStatus('Project imported successfully!');
      setTimeout(() => {
        onImport();
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Import error:', error);
      setImportStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsImporting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Import Project</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-2xl leading-none"
            disabled={isImporting}
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Project Folder
              <span className="text-[10px] text-gray-500 ml-2">(absolute path to existing project)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={folderPath}
                onChange={(e) => {
                  setFolderPath(e.target.value);
                  // Auto-extract project name from path if not manually set
                  if (!projectName || projectName === folderPath.split('/').filter(Boolean).pop()) {
                    const name = e.target.value.split('/').filter(Boolean).pop() || '';
                    setProjectName(name);
                  }
                }}
                placeholder="/Users/username/Documents/my-project"
                className="flex-1 px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded text-white text-sm focus:border-blue-500 focus:outline-none"
                disabled={isImporting}
              />
              <button
                onClick={handleBrowse}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isImporting}
                title="Browse for folder (will prompt for path)"
              >
                Browse
              </button>
            </div>
            <p className="text-[10px] text-gray-500 mt-1">
              Click Browse or type the full path to your project folder
            </p>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Project Name</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="my-awesome-project"
              className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded text-white text-sm"
              disabled={isImporting}
            />
          </div>

          {importStatus && (
            <div className={`text-sm p-3 rounded ${
              importStatus.startsWith('Error')
                ? 'bg-red-900/20 text-red-400 border border-red-900'
                : importStatus.includes('success')
                ? 'bg-green-900/20 text-green-400 border border-green-900'
                : 'bg-blue-900/20 text-blue-400 border border-blue-900'
            }`}>
              {importStatus}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
              disabled={isImporting}
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isImporting || !folderPath || !projectName}
            >
              {isImporting ? 'Importing...' : 'Import'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Project detail panel component
function ProjectDetailPanel({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const tasks = project.tasks || [];
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const percent = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="absolute inset-0 bg-[var(--card)] border border-[var(--card-border)] rounded-lg z-10 flex flex-col"
    >
      {/* Header */}
      <div className="p-3 border-b border-[var(--card-border)] flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-white text-sm truncate flex-1">{project.name}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-lg leading-none ml-2"
          >
            ×
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-gray-800 rounded h-1.5">
            <div
              className={`h-1.5 rounded transition-all ${
                percent === 100 ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-400">{percent}%</span>
        </div>
        <p className="text-[10px] text-gray-500 mt-1">
          {completedCount}/{tasks.length} tasks completed
        </p>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-2">
        {tasks.length === 0 ? (
          <div className="text-center py-4 text-gray-500 text-xs">No tasks</div>
        ) : (
          <div className="space-y-1">
            {tasks.map((task, i) => (
              <div
                key={task.id || i}
                className={`p-2 rounded border ${
                  task.status === 'in_progress'
                    ? 'border-blue-800 bg-blue-900/20'
                    : task.status === 'completed'
                      ? 'border-green-900/50 bg-green-900/10'
                      : 'border-[var(--card-border)] bg-[var(--background)]'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className={`flex-shrink-0 ${getTaskStatusColor(task.status)}`}>
                    {getTaskStatusIcon(task.status)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[11px] ${
                      task.status === 'completed' ? 'text-gray-500' : 'text-white'
                    }`}>
                      {task.name}
                    </p>
                    {task.status === 'in_progress' && (
                      <p className="text-[9px] text-blue-400 mt-0.5">In progress...</p>
                    )}
                    {task.status === 'worker_done' && (
                      <p className="text-[9px] text-yellow-500 mt-0.5">Awaiting review</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function ArchitectureTree({
  bridge,
  managers,
  projects,
  orchestrator,
  responderActive = false,
  models,
  expandedSection,
  onSectionClick,
  compactMode = false,
}: ArchitectureTreeProps) {
  // Track previous state for detecting changes
  const prevManagersRef = useRef<Manager[]>([]);
  const prevOrchestratorRef = useRef<OrchestratorStatus | undefined>(undefined);
  const prevBridgeRef = useRef<BridgeStatus | null>(null);

  // State for tracking which elements need animation
  const [newManagerIds, setNewManagerIds] = useState<Set<string>>(new Set());
  const [messageReceivedIds, setMessageReceivedIds] = useState<Set<string>>(new Set());
  const [queueChangedIds, setQueueChangedIds] = useState<Set<string>>(new Set());
  const [workerJustSpawned, setWorkerJustSpawned] = useState(false);
  const [managerJustSpawned, setManagerJustSpawned] = useState(false);
  const [bridgeReceivedMessage, setBridgeReceivedMessage] = useState(false);

  // Activity notifications
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [showScreenFlash, setShowScreenFlash] = useState(false);

  // Selected project for detail view
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Import project modal
  const [showImportModal, setShowImportModal] = useState(false);

  // Add activity event
  const addActivityEvent = useCallback((type: ActivityEvent['type'], message: string, color: string) => {
    const event: ActivityEvent = {
      id: `${Date.now()}-${Math.random()}`,
      type,
      message,
      color,
      timestamp: Date.now(),
    };
    setActivityEvents(prev => [...prev, event].slice(-5)); // Keep last 5

    // Screen flash for important events
    if (type === 'message_received' || type === 'manager_created' || type === 'orchestrator_spawned') {
      setShowScreenFlash(true);
      setTimeout(() => setShowScreenFlash(false), 600);
    }
  }, []);

  // Remove activity event
  const removeActivityEvent = useCallback((id: string) => {
    setActivityEvents(prev => prev.filter(e => e.id !== id));
  }, []);

  // Detect changes between updates
  useEffect(() => {
    const prevManagers = prevManagersRef.current;
    const prevOrchestrator = prevOrchestratorRef.current;
    const prevBridge = prevBridgeRef.current;

    // Skip if this is the first render (no previous state)
    const isFirstRender = prevManagers.length === 0 && prevOrchestrator === undefined;

    // Detect new managers
    const prevManagerIdSet = new Set(prevManagers.map(m => m.id));
    const newManagers = managers.filter(m => !prevManagerIdSet.has(m.id));
    if (newManagers.length > 0 && !isFirstRender) {
      setNewManagerIds(new Set(newManagers.map(m => m.id)));
      // Add activity notification for each new manager
      newManagers.forEach(m => {
        addActivityEvent('manager_created', `New manager: ${m.name}`, '#00cc88');
      });
      // Clear after animation
      setTimeout(() => setNewManagerIds(new Set()), 1500);
    }

    // Detect queue changes and message receipts
    const queueChanged = new Set<string>();
    const messageReceived = new Set<string>();

    for (const manager of managers) {
      const prevManager = prevManagers.find(m => m.id === manager.id);
      if (prevManager) {
        // Check if queue size increased (message received)
        if (manager.messageQueue.length > prevManager.messageQueue.length) {
          messageReceived.add(manager.id);
          queueChanged.add(manager.id);
        } else if (manager.messageQueue.length !== prevManager.messageQueue.length) {
          queueChanged.add(manager.id);
        }

        // Check if status changed to processing (started working)
        if (manager.status === 'processing' && prevManager.status !== 'processing') {
          messageReceived.add(manager.id);
          addActivityEvent('processing_started', `${manager.name} started processing`, '#3b82f6');
        }
      }
    }

    if (messageReceived.size > 0 && !isFirstRender) {
      setMessageReceivedIds(messageReceived);
      setBridgeReceivedMessage(true);
      // Add activity notification
      const managerNames = managers
        .filter(m => messageReceived.has(m.id))
        .map(m => m.name)
        .join(', ');
      addActivityEvent('message_received', `Message received: ${managerNames}`, '#00cc88');
      setTimeout(() => {
        setMessageReceivedIds(new Set());
        setBridgeReceivedMessage(false);
      }, 1200);
    }

    if (queueChanged.size > 0) {
      setQueueChangedIds(queueChanged);
      setTimeout(() => setQueueChangedIds(new Set()), 600);
    }

    // Detect orchestrator spawns
    if (orchestrator && !isFirstRender) {
      if (orchestrator.workerRunning && !prevOrchestrator?.workerRunning) {
        setWorkerJustSpawned(true);
        addActivityEvent('orchestrator_spawned', 'Orchestrator Worker spawned!', '#66aa88');
        setTimeout(() => setWorkerJustSpawned(false), 1500);
      }
      if (orchestrator.managerRunning && !prevOrchestrator?.managerRunning) {
        setManagerJustSpawned(true);
        addActivityEvent('orchestrator_spawned', 'Orchestrator Manager spawned!', '#aa8866');
        setTimeout(() => setManagerJustSpawned(false), 1500);
      }
    }

    // Update refs for next comparison
    prevManagersRef.current = managers;
    prevOrchestratorRef.current = orchestrator;
    prevBridgeRef.current = bridge;
  }, [managers, orchestrator, bridge, addActivityEvent]);

  const activeManagers = managers.filter(m => m.status === 'processing' || m.status === 'active' || m.messageQueue.length > 0);
  const idleManagers = managers.filter(m => m.status !== 'processing' && m.status !== 'active' && m.messageQueue.length === 0);

  // Show active managers first, then some idle ones
  const displayManagers = [...activeManagers, ...idleManagers.slice(0, Math.max(0, 10 - activeManagers.length))];

  return (
    <div className={`w-full h-full flex ${compactMode ? 'flex-col' : 'flex-row gap-4'} p-4 overflow-hidden relative`}>
      {/* Screen flash overlay */}
      <ScreenFlash active={showScreenFlash} />

      {/* Activity notifications - top right corner */}
      <div className="absolute top-4 right-4 z-40 flex flex-col gap-2">
        <AnimatePresence>
          {activityEvents.map(event => (
            <ActivityNotification
              key={event.id}
              event={event}
              onComplete={() => removeActivityEvent(event.id)}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Import Project Modal */}
      <AnimatePresence>
        {showImportModal && (
          <ImportProjectModal
            onClose={() => setShowImportModal(false)}
            onImport={() => {
              // Refresh will happen automatically via polling
              setShowImportModal(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* Left Column: Bridge + Responder */}
      <div className={`flex flex-col gap-3 ${compactMode ? 'w-full' : 'w-48'} flex-shrink-0`}>
        {/* Bridge */}
        <Tooltip
          content={
            <TooltipContent
              title="Telegram Bridge"
              description="Connects to Telegram API using long polling. Receives messages and routes them to the Responder for classification."
            />
          }
          position="right"
        >
          <div
            className={`bg-[var(--card)] border rounded-lg p-3 relative overflow-hidden transition-all duration-300 ${
              bridgeReceivedMessage
                ? 'message-ripple border-[var(--neon-green)] glow-pulse'
                : bridge.running && bridge.healthy
                  ? 'border-[var(--neon-green)]'
                  : bridge.running
                    ? 'border-yellow-800'
                    : 'border-[var(--card-border)]'
            }`}
            style={bridgeReceivedMessage ? { boxShadow: '0 0 30px rgba(0, 204, 136, 0.4)' } : {}}
          >
            {/* Activity indicator when message received */}
            <ActivityIndicator active={bridgeReceivedMessage} />

            {/* Shimmer effect when active */}
            {bridgeReceivedMessage && (
              <div className="absolute inset-0 shimmer pointer-events-none" />
            )}

            <div className="flex items-center gap-2 mb-2">
              <div className={`relative ${bridgeReceivedMessage ? 'robot-excited' : ''}`}>
                <Robot state={bridge.running ? 'running' : 'sleeping'} size={36} color="#6688cc" />
                {bridgeReceivedMessage && (
                  <motion.div
                    className="absolute -top-1 -right-1"
                    initial={{ scale: 0 }}
                    animate={{ scale: [0, 1.5, 1] }}
                    transition={{ duration: 0.3 }}
                  >
                    <span className="text-lg">📨</span>
                  </motion.div>
                )}
              </div>
              <div>
                <h3 className="font-medium text-white text-sm">Telegram Bridge</h3>
                <div className="flex items-center gap-1">
                  <span className={`text-[10px] ${
                    bridge.running && bridge.healthy
                      ? 'text-green-500'
                      : bridge.running
                        ? 'text-yellow-500'
                        : 'text-gray-500'
                  }`}>
                    {bridge.running && bridge.healthy
                      ? '● Healthy'
                      : bridge.running
                        ? '● Running'
                        : '○ Stopped'}
                  </span>
                  {bridgeReceivedMessage && (
                    <motion.span
                      className="text-[10px] text-[var(--neon-green)] ml-1 font-bold"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                    >
                      INCOMING!
                    </motion.span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-[10px] text-gray-500 space-y-0.5">
              {bridge.botUsername && (
                <Tooltip content="The Telegram bot username this bridge is connected to" position="right">
                  <div className="flex justify-between cursor-help">
                    <span>Bot</span>
                    <span className="text-blue-400">@{bridge.botUsername}</span>
                  </div>
                </Tooltip>
              )}
              <Tooltip content="Process ID - unique identifier for the running bridge process" position="right">
                <div className="flex justify-between cursor-help">
                  <span>PID</span>
                  <span className="text-gray-400">{bridge.pid ?? '—'}</span>
                </div>
              </Tooltip>
              <Tooltip content="How long the bridge has been running since last restart" position="right">
                <div className="flex justify-between cursor-help">
                  <span>Uptime</span>
                  <span className="text-gray-400">{bridge.uptime}</span>
                </div>
              </Tooltip>
              {bridge.lastPollTime && (
                <Tooltip content="When the bridge last checked Telegram for new messages" position="right">
                  <div className="flex justify-between cursor-help">
                    <span>Last Poll</span>
                    <span className="text-gray-400">
                      {new Date(bridge.lastPollTime).toLocaleTimeString()}
                    </span>
                  </div>
                </Tooltip>
              )}
            </div>
            {bridge.errorMessage && (
              <div className="mt-2 p-1.5 bg-red-900/30 rounded border border-red-900/50">
                <p className="text-[9px] text-red-400 truncate" title={bridge.errorMessage}>
                  ⚠ {bridge.errorMessage}
                </p>
              </div>
            )}
          </div>
        </Tooltip>

        {/* Connector */}
        <div className="flex justify-center">
          <div className="w-px h-4 bg-gray-700" />
        </div>

        {/* Responder */}
        <Tooltip
          content={
            <TooltipContent
              title={`Responder (${models.responder.charAt(0).toUpperCase() + models.responder.slice(1)})`}
              description="Fast classifier that decides how to handle each incoming message: CREATE new manager, QUEUE to existing, or INTERRUPT active work."
            />
          }
          position="right"
        >
          <div
            className={`bg-[var(--card)] border rounded-lg p-3 relative overflow-hidden transition-all duration-300 ${
              bridgeReceivedMessage
                ? 'processing-pulse border-orange-500'
                : responderActive
                  ? 'border-orange-800'
                  : 'border-[var(--card-border)]'
            }`}
            style={bridgeReceivedMessage ? { boxShadow: '0 0 20px rgba(204, 136, 68, 0.4)' } : {}}
          >
            {/* Shimmer effect when processing */}
            {bridgeReceivedMessage && (
              <div className="absolute inset-0 shimmer pointer-events-none" />
            )}

            <div className="flex items-center gap-2">
              <div className={`relative ${bridgeReceivedMessage ? 'robot-excited' : ''}`}>
                <Robot state={responderActive || bridgeReceivedMessage ? 'running' : 'idle'} size={32} color="#cc8844" />
                {bridgeReceivedMessage && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
                    <TypingIndicator />
                  </div>
                )}
              </div>
              <div>
                <h3 className="font-medium text-white text-sm">Responder</h3>
                <Tooltip content={`Uses ${models.responder.charAt(0).toUpperCase() + models.responder.slice(1)} model for message classification`} position="right">
                  <span className="text-[10px] text-gray-500 cursor-help">{models.responder.charAt(0).toUpperCase() + models.responder.slice(1)}</span>
                </Tooltip>
              </div>
            </div>
            <p className="text-[10px] text-gray-600 mt-2">
              {bridgeReceivedMessage ? (
                <motion.span
                  className="text-orange-400 font-medium"
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                >
                  🔄 Routing message...
                </motion.span>
              ) : (
                'Routes messages'
              )}
            </p>
          </div>
        </Tooltip>

        {/* Connector */}
        <div className="flex justify-center">
          <div className="w-px h-4 bg-gray-700" />
        </div>

        {/* Orchestrator */}
        <Tooltip
          content={
            <TooltipContent
              title="Orchestrator System"
              description="Autonomous task execution system. Worker implements tasks, Manager reviews and approves. Works through tasks.json file."
            />
          }
          position="right"
        >
          <motion.div
            className={`bg-[var(--card)] border rounded-lg p-3 relative overflow-hidden ${
              workerJustSpawned || managerJustSpawned
                ? 'border-green-500'
                : orchestrator?.workerRunning || orchestrator?.managerRunning
                  ? 'border-green-900'
                  : 'border-[var(--card-border)]'
            }`}
            animate={workerJustSpawned || managerJustSpawned ? {
              boxShadow: ['0 0 0px rgba(0, 255, 136, 0)', '0 0 30px rgba(0, 255, 136, 0.5)', '0 0 0px rgba(0, 255, 136, 0)'],
            } : {}}
            transition={{ duration: 1 }}
          >
            {/* Shimmer effect on spawn */}
            {(workerJustSpawned || managerJustSpawned) && (
              <div className="absolute inset-0 shimmer pointer-events-none" />
            )}

            <h3 className="font-medium text-white text-sm mb-2 flex items-center gap-2">
              Orchestrator
              {(orchestrator?.workerRunning || orchestrator?.managerRunning) && (
                <span className="w-2 h-2 bg-green-500 rounded-full heartbeat" style={{ boxShadow: '0 0 6px #22c55e' }} />
              )}
            </h3>
            <OrchestratorTeam
              orchestrator={orchestrator}
              workerJustSpawned={workerJustSpawned}
              managerJustSpawned={managerJustSpawned}
            />
            <div className="text-[10px] text-gray-600 mt-2 space-y-0.5">
              <Tooltip content="Worker process that implements tasks - writes code, runs tests" position="right">
                <div className="flex justify-between cursor-help">
                  <span>Worker</span>
                  <motion.span
                    className={orchestrator?.workerRunning ? 'text-green-500' : 'text-gray-500'}
                    animate={workerJustSpawned ? { scale: [1, 1.2, 1] } : {}}
                  >
                    {orchestrator?.workerRunning ? `PID ${orchestrator.workerPid}` : 'Stopped'}
                  </motion.span>
                </div>
              </Tooltip>
              <Tooltip content="Manager process that reviews work and approves/rejects changes" position="right">
                <div className="flex justify-between cursor-help">
                  <span>Manager</span>
                  <motion.span
                    className={orchestrator?.managerRunning ? 'text-green-500' : 'text-gray-500'}
                    animate={managerJustSpawned ? { scale: [1, 1.2, 1] } : {}}
                  >
                    {orchestrator?.managerRunning ? `PID ${orchestrator.managerPid}` : 'Stopped'}
                  </motion.span>
                </div>
              </Tooltip>
            </div>
          </motion.div>
        </Tooltip>
      </div>

      {/* Managers List - shown below in compact mode, or to the right otherwise */}
      {!compactMode && (
        <>
          {/* Animated connector arrow when messages flow */}
          <div className="flex items-start pt-16 relative">
            {/* Connection line with energy beam */}
            <div className="flex items-center gap-1">
              <div className={`relative h-0.5 w-8 rounded-full overflow-hidden ${
                bridgeReceivedMessage ? 'bg-[var(--neon-green)]' : 'bg-gray-700'
              }`}>
                {bridgeReceivedMessage && (
                  <motion.div
                    className="absolute h-full w-4 rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, transparent, #fff, transparent)',
                      boxShadow: '0 0 10px var(--neon-green)',
                    }}
                    initial={{ x: '-100%' }}
                    animate={{ x: '200%' }}
                    transition={{ duration: 0.5, ease: 'easeOut', repeat: 2 }}
                  />
                )}
              </div>
              <motion.span
                className={`text-lg font-bold ${
                  bridgeReceivedMessage ? 'text-[var(--neon-green)]' : 'text-gray-600'
                }`}
                animate={bridgeReceivedMessage ? {
                  scale: [1, 1.3, 1],
                  x: [0, 3, 0],
                } : {}}
                transition={{ duration: 0.3, repeat: bridgeReceivedMessage ? 3 : 0 }}
              >
                →
              </motion.span>
            </div>
            {/* Flying arrow animation */}
            <AnimatePresence>
              {bridgeReceivedMessage && (
                <motion.div
                  className="absolute left-0 top-[50%] -translate-y-1/2 text-[var(--neon-green)]"
                  initial={{ x: -20, opacity: 0, scale: 0.5 }}
                  animate={{ x: 60, opacity: [0, 1, 1, 0], scale: [0.5, 1.2, 1, 0.8] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                >
                  ➤
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Managers List */}
      <div className={`flex flex-col ${compactMode ? 'flex-1 mt-3' : 'flex-shrink-0'}`}>
        <div className="flex items-center gap-2 mb-2">
          <Tooltip
            content={
              <TooltipContent
                title="Manager Agents"
                description="Long-running Opus agents that handle specific topics."
              />
            }
            position="bottom"
          >
            <h3 className="font-medium text-sm text-white">
              Managers
            </h3>
          </Tooltip>
          <span className="text-[9px] text-gray-500 bg-[var(--card)] px-1.5 py-0.5 rounded">
            {managers.length}
          </span>
          {activeManagers.length > 0 && (
            <span className="text-[9px] text-green-600 bg-green-900/30 px-1.5 py-0.5 rounded">
              {activeManagers.length} active
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-1.5">
          <AnimatePresence>
            {displayManagers.map((manager, i) => (
              <ManagerRow
                key={manager.id}
                manager={manager}
                color={MANAGER_COLORS[i % MANAGER_COLORS.length]}
                index={i}
                isNew={newManagerIds.has(manager.id)}
                hasNewMessage={messageReceivedIds.has(manager.id)}
                queueChanged={queueChangedIds.has(manager.id)}
              />
            ))}
          </AnimatePresence>

          {idleManagers.length > 10 - activeManagers.length && (
            <div className="text-[9px] text-gray-600 py-1.5 text-center">
              +{idleManagers.length - (10 - activeManagers.length)} more idle
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
