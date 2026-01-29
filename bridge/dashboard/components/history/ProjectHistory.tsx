'use client';

import { motion } from 'framer-motion';
import type { Project } from '../../lib/types';

interface ProjectHistoryProps {
  projects: Project[];
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.4,
      ease: [0, 0, 0.2, 1] as const,
    },
  },
};

export function ProjectHistory({ projects }: ProjectHistoryProps) {
  const completedProjects = projects.filter(p => p.status === 'complete');

  if (completedProjects.length === 0) {
    return (
      <div className="text-gray-500 text-sm text-center py-8">
        No completed projects yet
      </div>
    );
  }

  return (
    <motion.div
      className="relative"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Glowing vertical timeline line */}
      <div
        className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-neon-green shadow-glow-green-sm"
        style={{
          boxShadow: '0 0 8px #00ffaa, 0 0 16px #00ffaa',
        }}
      />

      <div className="space-y-4">
        {completedProjects.map((project, index) => (
          <motion.div
            key={`${project.name}-${index}`}
            className="relative pl-8"
            variants={itemVariants}
          >
            {/* Timeline node with checkmark */}
            <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-neon-green/20 border-2 border-neon-green flex items-center justify-center shadow-glow-green-sm">
              <svg
                className="w-3 h-3 text-neon-green"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            {/* Project content */}
            <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-3 hover:border-neon-green/30 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-white font-medium text-sm truncate">
                  {project.name}
                </h4>
                <span className="text-xs text-neon-green">
                  {project.completed}/{project.total} tasks
                </span>
              </div>

              {project.lastCompletedTask && (
                <p className="text-xs text-gray-400 truncate">
                  Last: {project.lastCompletedTask}
                </p>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
