'use client';

import { useState, useRef, useEffect, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  maxWidth?: number;
}

export function Tooltip({
  content,
  children,
  position = 'top',
  delay = 300,
  maxWidth = 250
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const showTooltip = () => {
    timeoutRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const padding = 8;

        let x = 0, y = 0;
        switch (position) {
          case 'top':
            x = rect.left + rect.width / 2;
            y = rect.top - padding;
            break;
          case 'bottom':
            x = rect.left + rect.width / 2;
            y = rect.bottom + padding;
            break;
          case 'left':
            x = rect.left - padding;
            y = rect.top + rect.height / 2;
            break;
          case 'right':
            x = rect.right + padding;
            y = rect.top + rect.height / 2;
            break;
        }
        setCoords({ x, y });
      }
      setIsVisible(true);
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const getPositionStyles = () => {
    switch (position) {
      case 'top':
        return {
          left: coords.x,
          top: coords.y,
          transform: 'translate(-50%, -100%)'
        };
      case 'bottom':
        return {
          left: coords.x,
          top: coords.y,
          transform: 'translate(-50%, 0)'
        };
      case 'left':
        return {
          left: coords.x,
          top: coords.y,
          transform: 'translate(-100%, -50%)'
        };
      case 'right':
        return {
          left: coords.x,
          top: coords.y,
          transform: 'translate(0, -50%)'
        };
    }
  };

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        className="inline-block"
      >
        {children}
      </div>
      <AnimatePresence>
        {isVisible && (
          <motion.div
            className="fixed z-[100] pointer-events-none"
            style={getPositionStyles()}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
          >
            <div
              className="bg-gray-900 border border-gray-700 text-gray-200 text-[11px] px-2.5 py-1.5 rounded shadow-lg"
              style={{ maxWidth }}
            >
              {content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// Helper component for consistent tooltip content formatting
export function TooltipContent({ title, description }: { title?: string; description: string }) {
  return (
    <div>
      {title && <div className="font-medium text-white mb-0.5">{title}</div>}
      <div className="text-gray-400 leading-relaxed">{description}</div>
    </div>
  );
}
