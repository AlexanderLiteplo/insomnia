'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ClaudeProcess } from '../lib/types';
import { Tooltip, TooltipContent } from './ui/Tooltip';

interface ClaudesPanelProps {
  processes: ClaudeProcess[];
  onRefresh: () => void;
  getCsrfToken: () => Promise<string>;
}

function formatRuntime(runtime: string): string {
  // Runtime from ps is in format HH:MM:SS or D-HH:MM:SS for longer durations
  if (runtime.includes('-')) {
    const [days, time] = runtime.split('-');
    return `${days}d ${time.split(':')[0]}h`;
  }
  const parts = runtime.split(':');
  if (parts.length === 3) {
    const hours = parseInt(parts[0]);
    const mins = parseInt(parts[1]);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }
  return runtime;
}

function getProcessLabel(process: ClaudeProcess): string {
  // Try to determine what this process is doing based on command/workingDir
  const cmd = process.command.toLowerCase();

  if (cmd.includes('telegram-manager')) return 'Manager';
  if (cmd.includes('worker') || cmd.includes('orchestrator')) return 'Worker';
  if (cmd.includes('responder')) return 'Responder';
  if (process.prompt) {
    // Truncate and show first few words of prompt
    const words = process.prompt.split(' ').slice(0, 4).join(' ');
    return words.length < process.prompt.length ? words + '...' : process.prompt;
  }
  if (process.workingDir) {
    // Show last folder name
    const parts = process.workingDir.split('/');
    return parts[parts.length - 1] || 'Claude';
  }
  return 'Claude Agent';
}

function CpuIndicator({ cpu }: { cpu: number }) {
  const getColor = () => {
    if (cpu > 80) return 'text-red-500 bg-red-900/30';
    if (cpu > 50) return 'text-yellow-500 bg-yellow-900/30';
    if (cpu > 10) return 'text-blue-500 bg-blue-900/30';
    return 'text-gray-500 bg-gray-900/30';
  };

  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${getColor()}`}>
      {cpu.toFixed(0)}%
    </span>
  );
}

export function ClaudesPanel({ processes, onRefresh, getCsrfToken }: ClaudesPanelProps) {
  const [expandedPid, setExpandedPid] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<{ pid: number; action: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async (pid: number, action: 'kill' | 'pause' | 'resume') => {
    setActionLoading({ pid, action });
    setError(null);

    try {
      const token = await getCsrfToken();
      const res = await fetch('/api/processes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': token,
        },
        body: JSON.stringify({ pid, action }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'Failed to execute action');
        setTimeout(() => setError(null), 3000);
      } else {
        // Refresh the process list after action
        setTimeout(() => {
          onRefresh();
        }, 500);
      }
    } catch (err) {
      setError('Network error');
      setTimeout(() => setError(null), 3000);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="w-80 flex-shrink-0 border-l border-[var(--card-border)] bg-[var(--card)]/30 flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-[var(--card-border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tooltip
            content={
              <TooltipContent
                title="Claude Processes"
                description="All running Claude Code processes on this machine. View their status, resource usage, and control them."
              />
            }
            position="left"
          >
            <h2 className="font-medium text-white text-sm cursor-help">Claudes</h2>
          </Tooltip>
          {processes.length > 0 && (
            <Tooltip
              content={`${processes.length} Claude process${processes.length > 1 ? 'es' : ''} running`}
              position="bottom"
            >
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--neon-green)]/20 text-[var(--neon-green)] cursor-help">
                {processes.length}
              </span>
            </Tooltip>
          )}
        </div>
        <Tooltip content="Refresh process list" position="left">
          <button
            onClick={onRefresh}
            className="text-gray-500 hover:text-gray-300 transition-colors text-xs"
          >
            ↻
          </button>
        </Tooltip>
      </div>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-3 py-2 bg-red-900/30 border-b border-red-900 text-red-400 text-xs"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Process List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {processes.length === 0 ? (
          <div className="text-center py-6">
            <div className="text-2xl mb-1 opacity-50">💤</div>
            <p className="text-gray-600 text-xs">No Claude processes running</p>
          </div>
        ) : (
          processes.map((process) => (
            <motion.div
              key={process.pid}
              className={`border rounded bg-[var(--background)] ${
                process.status === 'paused'
                  ? 'border-yellow-900/50'
                  : 'border-[var(--card-border)]'
              }`}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              layout
            >
              {/* Collapsed view */}
              <div
                className="p-2 cursor-pointer hover:bg-[var(--card-border)]/20 transition-colors"
                onClick={() => setExpandedPid(expandedPid === process.pid ? null : process.pid)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Status indicator */}
                    <div
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        process.status === 'paused'
                          ? 'bg-yellow-500'
                          : process.cpu > 50
                            ? 'bg-green-500 animate-pulse'
                            : 'bg-green-500'
                      }`}
                    />
                    <span className="text-xs text-white truncate">
                      {getProcessLabel(process)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <CpuIndicator cpu={process.cpu} />
                    <span className="text-[9px] text-gray-600">
                      {formatRuntime(process.runtime)}
                    </span>
                    <span className="text-[10px] text-gray-600">
                      {expandedPid === process.pid ? '▲' : '▼'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Expanded view */}
              <AnimatePresence>
                {expandedPid === process.pid && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="border-t border-[var(--card-border)]"
                  >
                    <div className="p-2 space-y-2">
                      {/* Details */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-gray-500">PID</span>
                          <span className="text-gray-300 font-mono">{process.pid}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-gray-500">CPU</span>
                          <span className="text-gray-300">{process.cpu.toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-gray-500">Memory</span>
                          <span className="text-gray-300">{process.memory.toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-gray-500">Runtime</span>
                          <span className="text-gray-300">{process.runtime}</span>
                        </div>
                        {process.workingDir && (
                          <div className="text-[10px]">
                            <span className="text-gray-500">Directory</span>
                            <div className="text-gray-300 truncate font-mono text-[9px] mt-0.5">
                              {process.workingDir}
                            </div>
                          </div>
                        )}
                        {process.prompt && (
                          <div className="text-[10px]">
                            <span className="text-gray-500">Prompt</span>
                            <div className="text-gray-300 text-[9px] mt-0.5 line-clamp-3">
                              {process.prompt}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Command (collapsed by default) */}
                      <details className="text-[10px]">
                        <summary className="text-gray-500 cursor-pointer hover:text-gray-400">
                          Command
                        </summary>
                        <div className="text-gray-400 font-mono text-[8px] mt-1 p-1.5 bg-black/30 rounded overflow-x-auto">
                          {process.command}
                        </div>
                      </details>

                      {/* Actions */}
                      <div className="flex gap-1.5 pt-1">
                        {process.status === 'paused' ? (
                          <Tooltip content="Resume this Claude process" position="top">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAction(process.pid, 'resume');
                              }}
                              disabled={actionLoading?.pid === process.pid}
                              className={`flex-1 px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${
                                actionLoading?.pid === process.pid
                                  ? 'bg-gray-800 text-gray-500 cursor-wait'
                                  : 'bg-green-900/30 hover:bg-green-900/50 text-green-500 border border-green-900'
                              }`}
                            >
                              {actionLoading?.pid === process.pid && actionLoading.action === 'resume'
                                ? '...'
                                : '▶ Resume'}
                            </button>
                          </Tooltip>
                        ) : (
                          <Tooltip content="Pause this Claude process (can be resumed)" position="top">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAction(process.pid, 'pause');
                              }}
                              disabled={actionLoading?.pid === process.pid}
                              className={`flex-1 px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${
                                actionLoading?.pid === process.pid
                                  ? 'bg-gray-800 text-gray-500 cursor-wait'
                                  : 'bg-yellow-900/30 hover:bg-yellow-900/50 text-yellow-500 border border-yellow-900'
                              }`}
                            >
                              {actionLoading?.pid === process.pid && actionLoading.action === 'pause'
                                ? '...'
                                : '⏸ Pause'}
                            </button>
                          </Tooltip>
                        )}
                        <Tooltip content="Terminate this Claude process (cannot be undone)" position="top">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Kill Claude process ${process.pid}?`)) {
                                handleAction(process.pid, 'kill');
                              }
                            }}
                            disabled={actionLoading?.pid === process.pid}
                            className={`px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${
                              actionLoading?.pid === process.pid
                                ? 'bg-gray-800 text-gray-500 cursor-wait'
                                : 'bg-red-900/30 hover:bg-red-900/50 text-red-500 border border-red-900'
                            }`}
                          >
                            {actionLoading?.pid === process.pid && actionLoading.action === 'kill'
                              ? '...'
                              : '✕ Kill'}
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
