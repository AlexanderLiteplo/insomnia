'use client';

import { DiagramNode } from '../DiagramNode';
import type { BridgeStatus } from '../../../lib/types';

interface BridgeNodeProps {
  bridge: BridgeStatus;
  onClick?: () => void;
}

export function BridgeNode({ bridge, onClick }: BridgeNodeProps) {
  const status = bridge.running ? 'processing' : 'offline';
  const robotState = bridge.running ? 'running' : 'sleeping';

  return (
    <DiagramNode
      title="iMessage Bridge"
      status={status}
      robotState={robotState}
      robotColor="#00aaff"
      onClick={onClick}
    >
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Status</span>
          <span className={bridge.running ? 'text-green-400' : 'text-red-400'}>
            {bridge.running ? 'Running' : 'Stopped'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">PID</span>
          <span className="text-white font-mono">{bridge.pid || '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Uptime</span>
          <span className="text-white">{bridge.uptime || '—'}</span>
        </div>
      </div>
    </DiagramNode>
  );
}
