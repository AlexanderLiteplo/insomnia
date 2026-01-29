'use client';

import { useEffect, useRef } from 'react';

export function WaveBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = {
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      };
    };

    window.addEventListener('mousemove', handleMouseMove);

    const gridSize = 10;
    const dotCount = gridSize * gridSize;
    const dots: { baseX: number; baseY: number }[] = [];

    // Initialize dot positions in a 10x10 grid
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        dots.push({
          baseX: (i + 0.5) / gridSize,
          baseY: (j + 0.5) / gridSize,
        });
      }
    }

    const animate = (time: number) => {
      const t = time * 0.001; // Convert to seconds

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Neon green color with 40% opacity
      ctx.fillStyle = 'rgba(0, 255, 170, 0.4)';

      dots.forEach((dot) => {
        // Calculate base screen position
        const baseScreenX = dot.baseX * canvas.width;
        const baseScreenY = dot.baseY * canvas.height;

        // Apply sine wave animation: y = baseY + sin(x * 0.1 + time * 2) * 30
        const waveOffset = Math.sin(dot.baseX * 10 * 0.1 + t * 2) * 30;

        // Apply mouse parallax effect (subtle shift based on mouse position)
        const parallaxStrength = 20;
        const parallaxX = mouseRef.current.x * parallaxStrength * dot.baseX;
        const parallaxY = mouseRef.current.y * parallaxStrength * dot.baseY;

        // Calculate final position
        const x = baseScreenX + parallaxX;
        const y = baseScreenY + waveOffset + parallaxY;

        // Draw dot with pseudo-3D effect (size varies with wave position)
        const size = 3 + Math.sin(dot.baseX * 10 * 0.1 + t * 2) * 1;

        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: -10 }}
    />
  );
}
