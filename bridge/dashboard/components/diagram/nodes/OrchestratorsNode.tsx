'use client';

import { DiagramNode } from '../DiagramNode';
import { StatusDot } from '../../ui/StatusDot';

interface OrchestratorStatus {
  workerRunning: boolean;
  workerPid?: number | null;
  managerRunning: boolean;
  managerPid?: number | null;
}

interface OrchestratorsNodeProps {
  orchestrator?: OrchestratorStatus;
  onClick?: () => void;
}

export function OrchestratorsNode({ orchestrator, onClick }: OrchestratorsNodeProps) {
  const isActive = orchestrator?.workerRunning || orchestrator?.managerRunning;
  const status = isActive ? 'processing' : 'offline';
  const robotState = isActive ? 'running' : 'sleeping';

  return (
    <DiagramNode
      title="Orchestrator"
      status={status}
      robotState={robotState}
      robotColor="#00ffaa"
      onClick={onClick}
    >
      <div className="space-y-3 text-sm">
        {/* Worker Status */}
        <div className="border-b border-[var(--card-border)] pb-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <StatusDot status={orchestrator?.workerRunning ? 'processing' : 'offline'} />
              <span className="text-white font-medium">Worker</span>
            </div>
            <span className="text-xs text-gray-500">Opus</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Status</span>
            <span className={orchestrator?.workerRunning ? 'text-green-400' : 'text-red-400'}>
              {orchestrator?.workerRunning ? 'Running' : 'Stopped'}
            </span>
          </div>
          {orchestrator?.workerPid && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">PID</span>
              <span className="text-white font-mono">{orchestrator.workerPid}</span>
            </div>
          )}
        </div>

        {/* Manager Status */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <StatusDot status={orchestrator?.managerRunning ? 'processing' : 'offline'} />
              <span className="text-white font-medium">Manager</span>
            </div>
            <span className="text-xs text-gray-500">Opus</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Status</span>
            <span className={orchestrator?.managerRunning ? 'text-green-400' : 'text-red-400'}>
              {orchestrator?.managerRunning ? 'Running' : 'Stopped'}
            </span>
          </div>
          {orchestrator?.managerPid && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">PID</span>
              <span className="text-white font-mono">{orchestrator.managerPid}</span>
            </div>
          )}
        </div>

        <div className="text-xs text-gray-500 pt-1 border-t border-[var(--card-border)]">
          Worker implements tasks, Manager reviews and approves
        </div>
      </div>
    </DiagramNode>
  );
}
