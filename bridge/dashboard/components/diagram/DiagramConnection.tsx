interface DiagramConnectionProps {
  active: boolean;
  direction: 'horizontal' | 'vertical';
}

export function DiagramConnection({ active, direction }: DiagramConnectionProps) {
  const isHorizontal = direction === 'horizontal';
  const width = isHorizontal ? 60 : 4;
  const height = isHorizontal ? 4 : 60;

  const pathD = isHorizontal ? 'M 0 2 L 60 2' : 'M 2 0 L 2 60';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="flex-shrink-0"
    >
      <path
        d={pathD}
        fill="none"
        stroke={active ? 'var(--neon-green)' : '#4a4a4a'}
        strokeWidth={2}
        strokeDasharray="8 4"
        className={active ? 'flow-pulse' : ''}
        style={
          active
            ? { filter: 'drop-shadow(0 0 4px rgba(0, 255, 170, 0.8))' }
            : undefined
        }
      />
    </svg>
  );
}
