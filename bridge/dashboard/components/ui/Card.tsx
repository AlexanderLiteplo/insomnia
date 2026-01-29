import { StatusDot, StatusDotStatus } from './StatusDot';

interface CardProps {
  title: string;
  children: React.ReactNode;
  status?: StatusDotStatus;
  count?: number;
  badge?: string;
  badgeColor?: string;
}

export function Card({ title, children, status, count, badge, badgeColor }: CardProps) {
  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        {status && <StatusDot status={status} />}
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {count !== undefined && (
          <span className="text-xs bg-[var(--card-border)] px-2 py-0.5 rounded-full text-gray-400">
            {count}
          </span>
        )}
        {badge && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${badgeColor || 'bg-yellow-500/20 text-yellow-400'}`}>
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
