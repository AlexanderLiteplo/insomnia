'use client';

import { DiagramNode } from '../DiagramNode';

interface ResponderNodeProps {
  isActive: boolean;
  lastAction?: string;
  onClick?: () => void;
}

export function ResponderNode({ isActive, lastAction, onClick }: ResponderNodeProps) {
  const status = isActive ? 'processing' : 'online';
  const robotState = isActive ? 'running' : 'idle';

  return (
    <DiagramNode
      title="Responder (Haiku)"
      status={status}
      robotState={robotState}
      robotColor="#ffaa00"
      onClick={onClick}
    >
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Model</span>
          <span className="text-white">Claude Haiku</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Role</span>
          <span className="text-gray-300">Message Router</span>
        </div>
        {lastAction && (
          <div className="pt-2 border-t border-[var(--card-border)]">
            <span className="text-gray-400 text-xs">Last action:</span>
            <p className="text-blue-400 text-xs mt-1 truncate">{lastAction}</p>
          </div>
        )}
        <div className="text-xs text-gray-500 pt-2">
          Routes incoming messages to managers via CREATE, QUEUE, or INTERRUPT actions
        </div>
      </div>
    </DiagramNode>
  );
}
