'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Robot } from '../robots/Robot';
import { StatusDot } from '../ui/StatusDot';
import { Tooltip, TooltipContent } from '../ui/Tooltip';
import type { BridgeStatus, Manager, Project, SystemEvent, ModelConfig } from '../../lib/types';

interface OrchestratorStatus {
  workerRunning: boolean;
  workerPid?: number | null;
  managerRunning: boolean;
  managerPid?: number | null;
}

interface ArchitectureTreeProps {
  bridge: BridgeStatus;
  managers: Manager[];
  projects: Project[];
  orchestrator?: OrchestratorStatus;
  responderActive?: boolean;
  models: ModelConfig;
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
      className={`flex items-center gap-3 py-2 border-b border-[var(--card-border)] last:border-0 relative ${animationClass}`}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      layout
      style={isNew || hasNewMessage ? { boxShadow: `0 0 15px ${color}40` } : {}}
    >
      {/* Expanding rings for new managers */}
      <ExpandingRings active={isNew} color={color} />
      {/* Particle effect for new managers */}
      <EventParticles active={isNew} color={color} />
      {/* Electric sparks for new managers */}
      <ElectricSparks active={isNew} color={color} />

      {/* Robot for this manager */}
      <Tooltip
        content={
          <TooltipContent
            title={manager.name}
            description={`Handles topics: ${manager.topics?.join(', ') || 'general'}`}
          />
        }
        position="right"
      >
        <div className={`relative ${hasNewMessage ? 'robot-excited' : ''}`}>
          <Robot state={robotState} size={32} color={color} />
          {isProcessing && (
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
              <div className="w-2 h-2 bg-blue-500 rounded-full heartbeat" style={{ boxShadow: '0 0 6px #3b82f6' }} />
            </div>
          )}
        </div>
      </Tooltip>

      {/* Manager info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white text-xs truncate">{manager.name}</span>
          {hasQueue && (
            <Tooltip
              content={`${manager.messageQueue.length} message${manager.messageQueue.length > 1 ? 's' : ''} queued - waiting to be processed`}
              position="top"
            >
              <motion.span
                className={`text-[10px] bg-yellow-900/50 text-yellow-500 px-1.5 py-0.5 rounded cursor-help ${queueChanged ? 'badge-pop' : ''}`}
                animate={queueChanged ? { scale: [1, 1.3, 1] } : {}}
                transition={{ duration: 0.3 }}
              >
                {manager.messageQueue.length}
              </motion.span>
            </Tooltip>
          )}
          {isNew && (
            <motion.span
              className="text-[9px] bg-green-900/50 text-green-400 px-1 py-0.5 rounded"
              initial={{ scale: 0, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 15 }}
              style={{ boxShadow: '0 0 8px #22c55e' }}
            >
              NEW
            </motion.span>
          )}
          {isProcessing && (
            <TypingIndicator />
          )}
        </div>
        {manager.currentTask && (
          <p className={`text-[10px] truncate ${isProcessing ? 'text-blue-400' : 'text-gray-500'}`}>
            {isProcessing ? '⚡ ' : ''}{manager.currentTask}
          </p>
        )}
      </div>

      {/* Status indicator */}
      <Tooltip content={STATUS_TOOLTIPS[statusType]} position="left">
        <div className={isProcessing ? 'heartbeat' : ''}>
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

export function ArchitectureTree({
  bridge,
  managers,
  projects,
  orchestrator,
  responderActive = false,
  models,
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
    <div className="w-full h-full flex gap-4 p-4 overflow-hidden relative">
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

      {/* Left Column: Bridge + Responder */}
      <div className="flex flex-col gap-4 w-48 flex-shrink-0">
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

      {/* Managers List */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <Tooltip
            content={
              <TooltipContent
                title="Manager Agents"
                description="Long-running Opus agents that handle specific topics. Each manager can spawn workers and orchestrators for complex tasks."
              />
            }
            position="bottom"
          >
            <h3 className="font-medium text-white cursor-help">Managers</h3>
          </Tooltip>
          <Tooltip content="Total number of manager agents registered in the system" position="bottom">
            <span className="text-[10px] text-gray-500 bg-[var(--card)] px-2 py-0.5 rounded cursor-help">
              {managers.length} total
            </span>
          </Tooltip>
          {activeManagers.length > 0 && (
            <Tooltip content="Managers currently processing tasks or with queued messages" position="bottom">
              <span className="text-[10px] text-green-600 bg-green-900/30 px-2 py-0.5 rounded cursor-help">
                {activeManagers.length} active
              </span>
            </Tooltip>
          )}
        </div>

        <div className="flex-1 overflow-y-auto bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-2">
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
            <div className="text-[10px] text-gray-600 py-2 text-center">
              +{idleManagers.length - (10 - activeManagers.length)} more idle
            </div>
          )}
        </div>
      </div>

      {/* Arrow */}
      <div className="flex items-start pt-16 text-gray-600">
        <span className="text-lg">→</span>
      </div>

      {/* Projects */}
      <div className="w-48 flex-shrink-0 flex flex-col">
        <Tooltip
          content={
            <TooltipContent
              title="Active Projects"
              description="Projects being built by the orchestrator system. Progress shows completed tasks out of total tasks."
            />
          }
          position="bottom"
        >
          <h3 className="font-medium text-white mb-3 cursor-help">Projects</h3>
        </Tooltip>
        <div className="flex-1 overflow-y-auto bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-2">
          {projects.length === 0 ? (
            <div className="text-center py-4">
              <div className="text-2xl mb-1">📁</div>
              <p className="text-[10px] text-gray-600">No projects</p>
            </div>
          ) : (
            projects.map((project, i) => {
              const percent = project.total > 0 ? Math.round((project.completed / project.total) * 100) : 0;
              return (
                <Tooltip
                  key={i}
                  content={`${project.completed} of ${project.total} tasks completed`}
                  position="left"
                >
                  <div className="py-2 border-b border-[var(--card-border)] last:border-0 cursor-help">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-white truncate">{project.name}</span>
                      <span className="text-[10px] text-gray-500">{percent}%</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded h-1">
                      <div
                        className="bg-green-600 h-1 rounded"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                </Tooltip>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
