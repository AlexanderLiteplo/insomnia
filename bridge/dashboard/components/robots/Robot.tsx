'use client';

interface RobotProps {
  state: 'idle' | 'running' | 'sleeping';
  size?: number;
  color?: string;
}

// Tamagotchi-style pixel robot
export function Robot({ state, size = 80, color = '#00ffaa' }: RobotProps) {
  // Muted colors - no bright glows
  const mainColor = state === 'sleeping' ? '#555' : color;
  const bgColor = state === 'sleeping' ? '#222' : '#1a1a1a';

  // Gentle animation class
  const animClass =
    state === 'running' ? 'tamagotchi-active' :
    state === 'idle' ? 'tamagotchi-idle' : '';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={animClass}
      style={{ imageRendering: 'pixelated' }}
    >
      {/* Background egg shape (like Tamagotchi screen) */}
      <rect x="2" y="1" width="12" height="14" rx="3" fill={bgColor} stroke={mainColor} strokeWidth="0.5" />

      {/* Pixel character */}
      {state === 'sleeping' ? (
        // Sleeping - curled up, Z's
        <>
          {/* Body blob */}
          <rect x="5" y="8" width="6" height="4" fill={mainColor} />
          <rect x="6" y="7" width="4" height="1" fill={mainColor} />
          {/* Closed eyes */}
          <rect x="6" y="9" width="2" height="1" fill={bgColor} />
          <rect x="9" y="9" width="1" height="1" fill={bgColor} />
          {/* Z's */}
          <text x="10" y="6" fontSize="3" fill={mainColor} opacity="0.6">z</text>
          <text x="11" y="4" fontSize="2" fill={mainColor} opacity="0.4">z</text>
        </>
      ) : (
        // Active states
        <>
          {/* Head */}
          <rect x="5" y="3" width="6" height="5" fill={mainColor} />
          <rect x="6" y="2" width="4" height="1" fill={mainColor} />

          {/* Eyes */}
          <rect x="6" y="4" width="1" height="2" fill={bgColor} />
          <rect x="9" y="4" width="1" height="2" fill={bgColor} />

          {/* Mouth - happy when running */}
          {state === 'running' ? (
            <>
              <rect x="7" y="6" width="2" height="1" fill={bgColor} />
            </>
          ) : (
            <rect x="7" y="6" width="2" height="1" fill={bgColor} opacity="0.5" />
          )}

          {/* Body */}
          <rect x="6" y="8" width="4" height="3" fill={mainColor} />

          {/* Feet */}
          <rect x="5" y="11" width="2" height="2" fill={mainColor} />
          <rect x="9" y="11" width="2" height="2" fill={mainColor} />

          {/* Arms */}
          <rect x="4" y="8" width="1" height="2" fill={mainColor} />
          <rect x="11" y="8" width="1" height="2" fill={mainColor} />

          {/* Antenna */}
          <rect x="7" y="1" width="2" height="1" fill={mainColor} />
          <rect x="8" y="0" width="1" height="1" fill={state === 'running' ? color : mainColor} />
        </>
      )}
    </svg>
  );
}
