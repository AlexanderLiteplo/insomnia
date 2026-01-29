interface ProgressBarProps {
  value: number;
  max: number;
  color?: string;
}

export function ProgressBar({ value, max, color }: ProgressBarProps) {
  const percent = max > 0 ? (value / max) * 100 : 0;
  const bgColor = color || (percent === 100 ? 'bg-green-500' : 'bg-[var(--accent)]');
  return (
    <div className="w-full bg-[var(--card-border)] rounded-full h-2">
      <div
        className={`${bgColor} h-2 rounded-full transition-all duration-500`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
