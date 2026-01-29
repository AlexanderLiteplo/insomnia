'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Robot } from '../robots/Robot';
import { StatusDot, StatusDotStatus } from '../ui/StatusDot';

interface DiagramNodeProps {
  title: string;
  status: StatusDotStatus;
  robotState: 'idle' | 'running' | 'sleeping';
  children?: React.ReactNode;
  onClick?: () => void;
  itemCount?: number;
  robotColor?: string;
  defaultExpanded?: boolean;
}

export function DiagramNode({
  title,
  status,
  robotState,
  children,
  onClick,
  itemCount,
  robotColor = '#00ffaa',
  defaultExpanded = true,
}: DiagramNodeProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const handleClick = () => {
    if (children) {
      setIsExpanded(!isExpanded);
    }
    onClick?.();
  };

  const isProcessing = status === 'processing';

  return (
    <motion.div
      className={`
        bg-[var(--card)] border rounded-xl p-4 cursor-pointer h-full flex flex-col
        transition-colors duration-200
        ${isProcessing ? 'border-glow-green border-[var(--neon-green)]' : 'border-[var(--card-border)]'}
        ${children ? 'hover:border-[var(--neon-green)]/50' : ''}
      `}
      onClick={handleClick}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      layout
    >
      {/* Header row with robot, title, status, and count */}
      <div className="flex items-center gap-2">
        <Robot state={robotState} size={40} color={robotColor} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusDot status={status} />
            <h3 className={`font-semibold text-white text-sm ${isProcessing ? 'text-glow-green' : ''}`}>
              {title}
            </h3>
            {itemCount !== undefined && (
              <span className="text-xs bg-[var(--card-border)] px-2 py-0.5 rounded-full text-gray-400">
                {itemCount}
              </span>
            )}
          </div>
        </div>

        {/* Expand indicator if there are children */}
        {children && (
          <motion.svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0"
          >
            <path
              d="M4 6L8 10L12 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-gray-400"
            />
          </motion.svg>
        )}
      </div>

      {/* Expandable content */}
      <AnimatePresence initial={false}>
        {isExpanded && children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden flex-1 min-h-0"
          >
            <div className="pt-3 mt-3 border-t border-[var(--card-border)] h-full overflow-y-auto max-h-[50vh]">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
