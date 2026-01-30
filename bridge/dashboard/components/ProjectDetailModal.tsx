'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StatusDot } from './ui/StatusDot';
import { ProgressBar } from './ui/ProgressBar';

interface Task {
  id: string;
  name: string;
  description: string;
  requirements: string[];
  testCommand?: string;
  status: string;
  testsPassing: boolean;
  workerNotes?: string;
  managerReview?: string;
}

interface ProjectDetails {
  name: string;
  description: string;
  outputDir: string | null;
  tasks: Task[];
}

interface ProjectDetailModalProps {
  projectName: string;
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_COLORS = {
  completed: { bg: 'bg-green-900/30', text: 'text-green-400', border: 'border-green-900' },
  worker_done: { bg: 'bg-blue-900/30', text: 'text-blue-400', border: 'border-blue-900' },
  in_progress: { bg: 'bg-yellow-900/30', text: 'text-yellow-400', border: 'border-yellow-900' },
  pending: { bg: 'bg-gray-800', text: 'text-gray-500', border: 'border-gray-700' },
};

function getStatusColor(status: string) {
  return STATUS_COLORS[status as keyof typeof STATUS_COLORS] || STATUS_COLORS.pending;
}

function getStatusDotStatus(status: string): 'online' | 'processing' | 'offline' {
  if (status === 'completed') return 'online';
  if (status === 'in_progress' || status === 'worker_done') return 'processing';
  return 'offline';
}

export function ProjectDetailModal({ projectName, isOpen, onClose }: ProjectDetailModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);

    fetch(`/api/projects/${encodeURIComponent(projectName)}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch project details');
        return res.json();
      })
      .then(data => {
        setProject(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [projectName, isOpen]);

  if (!isOpen) return null;

  const completedCount = project?.tasks.filter(t => t.status === 'completed').length || 0;
  const totalCount = project?.tasks.length || 0;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="fixed inset-4 md:inset-10 lg:inset-20 bg-[var(--card)] border border-[var(--card-border)] rounded-lg z-50 flex flex-col overflow-hidden"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            {/* Header */}
            <div className="flex-shrink-0 p-4 border-b border-[var(--card-border)] flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-medium text-white mb-1">{project?.name || projectName}</h2>
                {project?.description && (
                  <p className="text-sm text-gray-400 mb-2">{project.description}</p>
                )}
                {project?.outputDir && (
                  <p className="text-xs text-gray-600 font-mono">{project.outputDir}</p>
                )}
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex-1">
                    <ProgressBar value={completedCount} max={totalCount} />
                  </div>
                  <span className="text-sm text-gray-400">{percent}%</span>
                  <span className="text-sm text-gray-400">{completedCount}/{totalCount}</span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex-shrink-0 ml-4 text-gray-500 hover:text-gray-300 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="text-center py-12">
                  <div className="w-8 h-8 border-2 border-gray-600 border-t-gray-400 rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-gray-500 text-sm">Loading tasks...</p>
                </div>
              ) : error ? (
                <div className="text-center py-12">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              ) : project ? (
                <div className="space-y-2">
                  {project.tasks.map((task, idx) => {
                    const colors = getStatusColor(task.status);
                    const isExpanded = expandedTask === task.id;

                    return (
                      <div
                        key={task.id}
                        className={`border rounded-lg ${colors.border} bg-[var(--background)] overflow-hidden`}
                      >
                        {/* Task Header - Clickable */}
                        <button
                          onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                          className="w-full p-3 text-left hover:bg-[var(--card)]/30 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2 flex-1 min-w-0">
                              <StatusDot status={getStatusDotStatus(task.status)} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs text-gray-600">#{idx + 1}</span>
                                  <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-medium ${colors.bg} ${colors.text} ${colors.border} border`}>
                                    {task.status.replace('_', ' ')}
                                  </span>
                                  {task.testsPassing && (
                                    <span className="text-[10px] px-2 py-0.5 rounded bg-green-900/30 text-green-400 border border-green-900">
                                      Tests ✓
                                    </span>
                                  )}
                                </div>
                                <h3 className="font-medium text-white text-sm mb-1">{task.name}</h3>
                                <p className="text-xs text-gray-400 line-clamp-2">{task.description}</p>
                              </div>
                            </div>
                            <span className="text-gray-600 flex-shrink-0 text-lg">
                              {isExpanded ? '−' : '+'}
                            </span>
                          </div>
                        </button>

                        {/* Expanded Details */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="px-3 pb-3 pt-0 border-t border-[var(--card-border)]">
                                {/* Requirements */}
                                {task.requirements && task.requirements.length > 0 && (
                                  <div className="mt-3">
                                    <h4 className="text-xs font-medium text-gray-400 mb-2">Requirements:</h4>
                                    <ul className="space-y-1">
                                      {task.requirements.map((req, i) => (
                                        <li key={i} className="text-xs text-gray-500 flex gap-2">
                                          <span className="text-gray-600">•</span>
                                          <span className="flex-1">{req}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {/* Test Command */}
                                {task.testCommand && (
                                  <div className="mt-3">
                                    <h4 className="text-xs font-medium text-gray-400 mb-1">Test Command:</h4>
                                    <code className="text-xs text-gray-500 bg-[var(--card)] px-2 py-1 rounded block font-mono">
                                      {task.testCommand}
                                    </code>
                                  </div>
                                )}

                                {/* Worker Notes */}
                                {task.workerNotes && (
                                  <div className="mt-3">
                                    <h4 className="text-xs font-medium text-gray-400 mb-1">Worker Notes:</h4>
                                    <p className="text-xs text-gray-500 bg-[var(--card)] px-2 py-1 rounded">
                                      {task.workerNotes}
                                    </p>
                                  </div>
                                )}

                                {/* Manager Review */}
                                {task.managerReview && (
                                  <div className="mt-3">
                                    <h4 className="text-xs font-medium text-gray-400 mb-1">Manager Review:</h4>
                                    <p className="text-xs text-gray-500 bg-[var(--card)] px-2 py-1 rounded">
                                      {task.managerReview}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
