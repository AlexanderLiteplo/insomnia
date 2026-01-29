'use client';

import { useEffect, useRef, useState } from 'react';

interface DonutAnimationProps {
  width?: number;
  height?: number;
  className?: string;
}

export function DonutAnimation({ width = 40, height = 22, className = '' }: DonutAnimationProps) {
  const [frame, setFrame] = useState('');
  const aRef = useRef(0);
  const bRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const A = aRef.current;
      const B = bRef.current;

      const chars = '.,-~:;=!*#$@'.split('');
      const output: string[] = [];
      const zbuffer: number[] = [];

      // Initialize buffers
      for (let i = 0; i < width * height; i++) {
        output[i] = ' ';
        zbuffer[i] = 0;
      }

      // Calculate donut
      for (let j = 0; j < 6.28; j += 0.07) {
        for (let i = 0; i < 6.28; i += 0.02) {
          const sinA = Math.sin(A);
          const cosA = Math.cos(A);
          const sinB = Math.sin(B);
          const cosB = Math.cos(B);
          const sinj = Math.sin(j);
          const cosj = Math.cos(j);
          const sini = Math.sin(i);
          const cosi = Math.cos(i);

          const h = cosj + 2;
          const D = 1 / (sini * h * sinA + sinj * cosA + 5);
          const t = sini * h * cosA - sinj * sinA;

          const x = Math.floor(width / 2 + (width / 2) * 0.7 * D * (cosi * h * cosB - t * sinB));
          const y = Math.floor(height / 2 + (height / 2) * 0.7 * D * (cosi * h * sinB + t * cosB));
          const o = x + width * y;
          const N = Math.floor(8 * ((sinj * sinA - sini * cosj * cosA) * cosB - sini * cosj * sinA - sinj * cosA - cosi * cosj * sinB));

          if (y >= 0 && y < height && x >= 0 && x < width && D > zbuffer[o]) {
            zbuffer[o] = D;
            output[o] = chars[Math.max(0, N)] || '.';
          }
        }
      }

      // Build frame string
      let frameStr = '';
      for (let k = 0; k < height; k++) {
        for (let l = 0; l < width; l++) {
          frameStr += output[k * width + l];
        }
        frameStr += '\n';
      }

      setFrame(frameStr);

      // Rotate
      aRef.current += 0.04;
      bRef.current += 0.02;
    }, 50);

    return () => clearInterval(interval);
  }, [width, height]);

  return (
    <pre
      className={`font-mono text-[var(--neon-green)] leading-none text-[10px] select-none ${className}`}
      style={{
        letterSpacing: '2px',
      }}
    >
      {frame}
    </pre>
  );
}
