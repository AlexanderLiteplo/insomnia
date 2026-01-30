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
        <div className="space-y-1.5 overflow-y-auto">
          {managers.map((manager) => (
            <div
              key={manager.id}
              className="border-b border-[var(--card-border)] pb-1.5 last:border-0 last:pb-0"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <StatusDot
                    status={
                      manager.status === 'processing'
                        ? 'processing'
                        : manager.status === 'active'
                        ? 'online'
                        : 'offline'
                    }
                  />
                  <span className="font-medium text-white text-xs truncate">{manager.name}</span>
                </div>
                {manager.messageQueue.length > 0 && (
                  <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full">
                    {manager.messageQueue.length}
                  </span>
                )}
              </div>
              {manager.currentTask && (
                <p className="text-[10px] text-blue-400 truncate ml-5">
                  {manager.currentTask}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </DiagramNode>
  );
}
