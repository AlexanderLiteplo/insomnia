'use client';

import { motion } from 'framer-motion';
import { Robot } from '../robots/Robot';
import { StatusDot } from '../ui/StatusDot';
import type { BridgeStatus, Manager, Project } from '../../lib/types';

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

function ManagerRow({
  manager,
  color,
  index
}: {
  manager: Manager;
  color: string;
  index: number;
}) {
  const isProcessing = manager.status === 'processing';
  const hasQueue = manager.messageQueue.length > 0;
  const robotState = isProcessing ? 'running' : manager.status === 'active' ? 'idle' : 'sleeping';

  return (
    <motion.div
      className="flex items-center gap-3 py-2 border-b border-[var(--card-border)] last:border-0"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
    >
      {/* Robot for this manager */}
      <Robot state={robotState} size={32} color={color} />

      {/* Manager info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white text-xs truncate">{manager.name}</span>
          {hasQueue && (
            <span className="text-[10px] bg-yellow-900/50 text-yellow-500 px-1.5 py-0.5 rounded">
              {manager.messageQueue.length}
            </span>
          )}
        </div>
        {manager.currentTask && (
          <p className="text-[10px] text-gray-500 truncate">{manager.currentTask}</p>
        )}
      </div>

      {/* Status indicator */}
      <StatusDot status={isProcessing ? 'processing' : manager.status === 'active' ? 'online' : 'offline'} />
    </motion.div>
  );
}

function OrchestratorTeam({ orchestrator }: { orchestrator?: OrchestratorStatus }) {
  const workerState = orchestrator?.workerRunning ? 'running' : 'sleeping';
  const managerState = orchestrator?.managerRunning ? 'running' : 'sleeping';

  return (
    <div className="flex items-center gap-2">
      {/* Worker robot */}
      <div className="text-center">
        <Robot state={workerState} size={28} color="#66aa88" />
        <div className="text-[9px] text-gray-500 mt-1">Worker</div>
      </div>

      {/* Manager robot */}
      <div className="text-center">
        <Robot state={managerState} size={28} color="#aa8866" />
        <div className="text-[9px] text-gray-500 mt-1">Manager</div>
      </div>
    </div>
  );
}

export function ArchitectureTree({
  bridge,
  managers,
  projects,
  orchestrator,
  responderActive = false,
}: ArchitectureTreeProps) {
  const activeManagers = managers.filter(m => m.status === 'processing' || m.status === 'active' || m.messageQueue.length > 0);
  const idleManagers = managers.filter(m => m.status !== 'processing' && m.status !== 'active' && m.messageQueue.length === 0);

  // Show active managers first, then some idle ones
  const displayManagers = [...activeManagers, ...idleManagers.slice(0, Math.max(0, 10 - activeManagers.length))];

  return (
    <div className="w-full h-full flex gap-4 p-4 overflow-hidden">
      {/* Left Column: Bridge + Responder */}
      <div className="flex flex-col gap-4 w-48 flex-shrink-0">
        {/* Bridge */}
        <div className={`bg-[var(--card)] border rounded-lg p-3 ${
          bridge.running && bridge.healthy
            ? 'border-[var(--neon-green)]'
            : bridge.running
              ? 'border-yellow-800'
              : 'border-[var(--card-border)]'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <Robot state={bridge.running ? 'running' : 'sleeping'} size={36} color="#6688cc" />
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
              </div>
            </div>
          </div>
          <div className="text-[10px] text-gray-500 space-y-0.5">
            {bridge.botUsername && (
              <div className="flex justify-between">
                <span>Bot</span>
                <span className="text-blue-400">@{bridge.botUsername}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>PID</span>
              <span className="text-gray-400">{bridge.pid ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>Uptime</span>
              <span className="text-gray-400">{bridge.uptime}</span>
            </div>
            {bridge.lastPollTime && (
              <div className="flex justify-between">
                <span>Last Poll</span>
                <span className="text-gray-400">
                  {new Date(bridge.lastPollTime).toLocaleTimeString()}
                </span>
              </div>
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

        {/* Connector */}
        <div className="flex justify-center">
          <div className="w-px h-4 bg-gray-700" />
        </div>

        {/* Responder */}
        <div className={`bg-[var(--card)] border rounded-lg p-3 ${responderActive ? 'border-orange-800' : 'border-[var(--card-border)]'}`}>
          <div className="flex items-center gap-2">
            <Robot state={responderActive ? 'running' : 'idle'} size={32} color="#cc8844" />
            <div>
              <h3 className="font-medium text-white text-sm">Responder</h3>
              <span className="text-[10px] text-gray-500">Haiku</span>
            </div>
          </div>
          <p className="text-[10px] text-gray-600 mt-2">Routes messages</p>
        </div>

        {/* Connector */}
        <div className="flex justify-center">
          <div className="w-px h-4 bg-gray-700" />
        </div>

        {/* Orchestrator */}
        <div className={`bg-[var(--card)] border rounded-lg p-3 ${
          orchestrator?.workerRunning || orchestrator?.managerRunning
            ? 'border-green-900'
            : 'border-[var(--card-border)]'
        }`}>
          <h3 className="font-medium text-white text-sm mb-2">Orchestrator</h3>
          <OrchestratorTeam orchestrator={orchestrator} />
          <div className="text-[10px] text-gray-600 mt-2 space-y-0.5">
            <div className="flex justify-between">
              <span>Worker</span>
              <span className={orchestrator?.workerRunning ? 'text-green-500' : 'text-gray-500'}>
                {orchestrator?.workerRunning ? `PID ${orchestrator.workerPid}` : 'Stopped'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Manager</span>
              <span className={orchestrator?.managerRunning ? 'text-green-500' : 'text-gray-500'}>
                {orchestrator?.managerRunning ? `PID ${orchestrator.managerPid}` : 'Stopped'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Arrow */}
      <div className="flex items-start pt-16 text-gray-600">
        <span className="text-lg">→</span>
      </div>

      {/* Managers List */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="font-medium text-white">Managers</h3>
          <span className="text-[10px] text-gray-500 bg-[var(--card)] px-2 py-0.5 rounded">
            {managers.length} total
          </span>
          {activeManagers.length > 0 && (
            <span className="text-[10px] text-green-600 bg-green-900/30 px-2 py-0.5 rounded">
              {activeManagers.length} active
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-2">
          {displayManagers.map((manager, i) => (
            <ManagerRow
              key={manager.id}
              manager={manager}
              color={MANAGER_COLORS[i % MANAGER_COLORS.length]}
              index={i}
            />
          ))}

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
        <h3 className="font-medium text-white mb-3">Projects</h3>
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
                <div key={i} className="py-2 border-b border-[var(--card-border)] last:border-0">
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
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
