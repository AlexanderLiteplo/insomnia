'use client';

import { DiagramNode } from '../DiagramNode';
import { StatusDot } from '../../ui/StatusDot';
import type { Manager } from '../../../lib/types';

interface ManagersNodeProps {
  managers: Manager[];
  onClick?: () => void;
}

export function ManagersNode({ managers, onClick }: ManagersNodeProps) {
  const hasProcessing = managers.some(m => m.status === 'processing');
  const status = hasProcessing ? 'processing' : managers.length > 0 ? 'online' : 'offline';
  const robotState = hasProcessing ? 'running' : managers.length > 0 ? 'idle' : 'sleeping';

  return (
    <DiagramNode
      title="Managers"
      status={status}
      robotState={robotState}
      robotColor="#aa00ff"
      itemCount={managers.length}
      onClick={onClick}
    >
      {managers.length === 0 ? (
        <p className="text-gray-500 text-sm">No managers active</p>
      ) : (
        <div className="space-y-2 overflow-y-auto">
          {managers.map((manager) => (
            <div
              key={manager.id}
              className="border-b border-[var(--card-border)] pb-2 last:border-0 last:pb-0"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <StatusDot
                    status={
                      manager.status === 'processing'
                        ? 'processing'
                        : manager.status === 'active'
                        ? 'online'
                        : 'offline'
                    }
                  />
                  <span className="font-medium text-white text-sm">{manager.name}</span>
                </div>
                {manager.messageQueue.length > 0 && (
                  <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
                    {manager.messageQueue.length} queued
                  </span>
                )}
              </div>
              {manager.currentTask && (
                <p className="text-xs text-blue-400 truncate mb-1">
                  {manager.currentTask}
                </p>
              )}
              <div className="flex flex-wrap gap-1">
                {manager.topics.map((topic, i) => (
                  <span
                    key={i}
                    className="text-xs bg-[var(--card-border)] px-1.5 py-0.5 rounded text-gray-400"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </DiagramNode>
  );
}
