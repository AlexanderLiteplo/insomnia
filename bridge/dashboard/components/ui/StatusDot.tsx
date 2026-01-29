export type StatusDotStatus = 'online' | 'offline' | 'processing';

interface StatusDotProps {
  status: StatusDotStatus;
}

export function StatusDot({ status }: StatusDotProps) {
  const colors = {
    online: 'bg-green-600',
    offline: 'bg-gray-600',
    processing: 'bg-blue-500',
  };
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${colors[status]} ${status === 'processing' ? 'pulse-simple' : ''}`} />
  );
}
