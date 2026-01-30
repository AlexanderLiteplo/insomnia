'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { NightlyBuildConfig, NightlyBriefingExtended } from '../lib/types';
import { Tooltip, TooltipContent } from './ui/Tooltip';

type ClaudeModel = 'sonnet' | 'haiku' | 'opus';

interface NightlyBuildsProps {
  isOpen: boolean;
  onClose: () => void;
  getCsrfToken: () => Promise<string>;
}

const MODEL_INFO: Record<ClaudeModel, { name: string; description: string; color: string }> = {
  haiku: {
    name: 'Haiku',
    description: 'Fast, lightweight',
    color: 'text-blue-400',
  },
  sonnet: {
    name: 'Sonnet',
    description: 'Balanced performance',
    color: 'text-purple-400',
  },
  opus: {
    name: 'Opus',
    description: 'Most capable',
    color: 'text-amber-400',
  },
};

const CHANGE_TYPE_ICONS: Record<string, string> = {
  improvement: '✨',
  fix: '🔧',
  optimization: '⚡',
  cleanup: '🧹',
  scrape: '📊',
  new_tool: '🛠️',
  earnings: '💰',
  task_distribution: '📋',
};

const CHANGE_TYPE_COLORS: Record<string, string> = {
  improvement: 'text-green-400 bg-green-900/30 border-green-800',
  fix: 'text-blue-400 bg-blue-900/30 border-blue-800',
  optimization: 'text-yellow-400 bg-yellow-900/30 border-yellow-800',
  cleanup: 'text-gray-400 bg-gray-800/50 border-gray-700',
  scrape: 'text-purple-400 bg-purple-900/30 border-purple-800',
  new_tool: 'text-pink-400 bg-pink-900/30 border-pink-800',
  earnings: 'text-emerald-400 bg-emerald-900/30 border-emerald-800',
  task_distribution: 'text-cyan-400 bg-cyan-900/30 border-cyan-800',
};

const EARNINGS_SOURCES = ['stripe', 'gumroad', 'custom'] as const;
const TASK_SOURCES = ['orchestrator', 'human-tasks', 'github-issues'] as const;
const ASSIGNMENT_STRATEGIES = ['round-robin', 'priority-based', 'skill-match'] as const;

function TimeInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [hours, minutes] = value.split(':');

  const handleHoursChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(`${e.target.value}:${minutes}`);
  };

  const handleMinutesChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(`${hours}:${e.target.value}`);
  };

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-300">{label}</label>
      <div className="flex gap-1 items-center">
        <select
          value={hours}
          onChange={handleHoursChange}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"
        >
          {Array.from({ length: 24 }, (_, i) => (
            <option key={i} value={i.toString().padStart(2, '0')}>
              {i.toString().padStart(2, '0')}
            </option>
          ))}
        </select>
        <span className="text-gray-500">:</span>
        <select
          value={minutes}
          onChange={handleMinutesChange}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"
        >
          {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
            <option key={m} value={m.toString().padStart(2, '0')}>
              {m.toString().padStart(2, '0')}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function formatTimeAgo(isoString: string): string {
  const now = new Date();
  const date = new Date(isoString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function formatTime12h(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

export function NightlyBuilds({ isOpen, onClose, getCsrfToken }: NightlyBuildsProps) {
  const [config, setConfig] = useState<NightlyBuildConfig | null>(null);
  const [briefings, setBriefings] = useState<NightlyBriefingExtended[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'briefings'>('config');
  const [selectedBriefing, setSelectedBriefing] = useState<NightlyBriefingExtended | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/nightly-builds');
      if (!res.ok) throw new Error('Failed to load nightly builds config');
      const data = await res.json();
      setConfig(data.config);
      setBriefings(data.briefings || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config');
    } finally {
      setLoading(false);
    }
  };

  const handleConfigChange = <K extends keyof NightlyBuildConfig>(field: K, value: NightlyBuildConfig[K]) => {
    if (config) {
      setConfig({ ...config, [field]: value });
      setSuccess(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const token = await getCsrfToken();
      const res = await fetch('/api/nightly-builds', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': token,
        },
        body: JSON.stringify({
          enabled: config.enabled,
          buildTime: config.buildTime,
          wakeUpTime: config.wakeUpTime,
          model: config.model,
          customPrompt: config.customPrompt,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to save');
      }

      const data = await res.json();
      setConfig(data.config);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleRunNow = async () => {
    setRunning(true);
    setError(null);

    try {
      const token = await getCsrfToken();
      const res = await fetch('/api/nightly-builds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': token,
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to start build');
      }

      const data = await res.json();
      setConfig(data.config);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start build');
    } finally {
      setRunning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg w-[600px] max-h-[80vh] shadow-xl overflow-hidden"
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[var(--card-border)] bg-gradient-to-r from-purple-900/20 to-blue-900/20">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🌙</span>
              <div>
                <h3 className="font-medium text-white">Nightly Builds</h3>
                <p className="text-xs text-gray-500">Automated improvements while you sleep</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 transition-colors text-xl leading-none p-1"
            >
              ×
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[var(--card-border)]">
            <button
              onClick={() => setActiveTab('config')}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                activeTab === 'config'
                  ? 'text-[var(--neon-green)] border-b-2 border-[var(--neon-green)]'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Configuration
            </button>
            <button
              onClick={() => { setActiveTab('briefings'); setSelectedBriefing(null); }}
              className={`flex-1 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'briefings'
                  ? 'text-[var(--neon-green)] border-b-2 border-[var(--neon-green)]'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Briefings
              {briefings.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/50 text-purple-400">
                  {briefings.length}
                </span>
              )}
            </button>
          </div>

          {/* Content */}
          <div className="p-4 overflow-y-auto max-h-[calc(80vh-140px)]">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-gray-600 border-t-gray-400 rounded-full animate-spin" />
              </div>
            ) : error && !config ? (
              <div className="text-red-400 text-sm p-3 bg-red-900/20 rounded">
                {error}
              </div>
            ) : activeTab === 'config' && config ? (
              <div className="space-y-5">
                {/* Enable Toggle */}
                <div className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg border border-gray-700">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${config.enabled ? 'bg-green-500' : 'bg-gray-600'}`} />
                      <span className="text-sm font-medium text-white">
                        {config.enabled ? 'Nightly Builds Active' : 'Nightly Builds Disabled'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {config.enabled && config.nextRun
                        ? `Next build: ${new Date(config.nextRun).toLocaleString()}`
                        : 'Enable to schedule automatic nightly improvements'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleConfigChange('enabled', !config.enabled)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      config.enabled ? 'bg-[var(--neon-green)]' : 'bg-gray-700'
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        config.enabled ? 'left-7' : 'left-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Time Settings */}
                <div className="grid grid-cols-2 gap-4">
                  <TimeInput
                    value={config.buildTime}
                    onChange={(v) => handleConfigChange('buildTime', v)}
                    label="Build Time"
                  />
                  <TimeInput
                    value={config.wakeUpTime}
                    onChange={(v) => handleConfigChange('wakeUpTime', v)}
                    label="Wake-up Time (briefing ready)"
                  />
                </div>

                <p className="text-[10px] text-gray-600">
                  Build starts at {formatTime12h(config.buildTime)}, briefing ready by {formatTime12h(config.wakeUpTime)}
                </p>

                {/* Model Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-300">AI Model</label>
                  <div className="flex gap-2">
                    {(['haiku', 'sonnet', 'opus'] as ClaudeModel[]).map((model) => (
                      <button
                        key={model}
                        onClick={() => handleConfigChange('model', model)}
                        className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-all ${
                          config.model === model
                            ? `bg-gray-700 ${MODEL_INFO[model].color} border border-gray-600`
                            : 'bg-gray-800/50 text-gray-500 hover:bg-gray-800 hover:text-gray-400 border border-transparent'
                        }`}
                      >
                        <div>{MODEL_INFO[model].name}</div>
                        <div className="text-[9px] opacity-70">{MODEL_INFO[model].description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Prompt */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-300">Custom Instructions</label>
                  <textarea
                    value={config.customPrompt}
                    onChange={(e) => handleConfigChange('customPrompt', e.target.value)}
                    className="w-full h-28 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white resize-none focus:border-[var(--neon-green)] focus:outline-none"
                    placeholder="What should the nightly build focus on?"
                  />
                  <p className="text-[10px] text-gray-600">
                    Tell Claude what to improve, fix, scrape, or build during nightly runs
                  </p>
                </div>

                {/* Divider */}
                <div className="border-t border-gray-700 my-4" />
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Automation Features</h4>

                {/* Earnings Extraction */}
                <div className="p-3 bg-emerald-900/10 rounded-lg border border-emerald-900/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">💰</span>
                      <div>
                        <span className="text-sm font-medium text-white">Earnings Extraction</span>
                        <p className="text-[10px] text-gray-500">Extract daily earnings from payment sources</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleConfigChange('earningsExtraction', {
                        ...config.earningsExtraction,
                        enabled: !config.earningsExtraction.enabled
                      })}
                      className={`relative w-10 h-5 rounded-full transition-colors ${
                        config.earningsExtraction.enabled ? 'bg-emerald-600' : 'bg-gray-700'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          config.earningsExtraction.enabled ? 'left-5' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  {config.earningsExtraction.enabled && (
                    <div className="mt-3 space-y-2">
                      <label className="text-[10px] text-gray-400">Sources</label>
                      <div className="flex flex-wrap gap-1">
                        {EARNINGS_SOURCES.map((source) => (
                          <button
                            key={source}
                            onClick={() => {
                              const sources = config.earningsExtraction.sources.includes(source)
                                ? config.earningsExtraction.sources.filter(s => s !== source)
                                : [...config.earningsExtraction.sources, source];
                              handleConfigChange('earningsExtraction', {
                                ...config.earningsExtraction,
                                sources
                              });
                            }}
                            className={`px-2 py-1 text-[10px] rounded transition-all ${
                              config.earningsExtraction.sources.includes(source)
                                ? 'bg-emerald-800 text-emerald-200 border border-emerald-700'
                                : 'bg-gray-800 text-gray-500 hover:text-gray-400'
                            }`}
                          >
                            {source}
                          </button>
                        ))}
                      </div>
                      {config.earningsExtraction.sources.includes('custom') && (
                        <input
                          type="text"
                          value={config.earningsExtraction.customSourcePath || ''}
                          onChange={(e) => handleConfigChange('earningsExtraction', {
                            ...config.earningsExtraction,
                            customSourcePath: e.target.value
                          })}
                          placeholder="Path to custom earnings data..."
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[10px] text-white"
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* Priority Tasks */}
                <div className="p-3 bg-cyan-900/10 rounded-lg border border-cyan-900/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📋</span>
                      <div>
                        <span className="text-sm font-medium text-white">Priority Tasks</span>
                        <p className="text-[10px] text-gray-500">Fetch top priority tasks from various sources</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleConfigChange('priorityTasks', {
                        ...config.priorityTasks,
                        enabled: !config.priorityTasks.enabled
                      })}
                      className={`relative w-10 h-5 rounded-full transition-colors ${
                        config.priorityTasks.enabled ? 'bg-cyan-600' : 'bg-gray-700'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          config.priorityTasks.enabled ? 'left-5' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  {config.priorityTasks.enabled && (
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className="text-[10px] text-gray-400">Max Tasks to Fetch</label>
                        <div className="flex gap-1 mt-1">
                          {[2, 4, 6, 8].map((n) => (
                            <button
                              key={n}
                              onClick={() => handleConfigChange('priorityTasks', {
                                ...config.priorityTasks,
                                maxTasks: n
                              })}
                              className={`px-3 py-1 text-[10px] rounded transition-all ${
                                config.priorityTasks.maxTasks === n
                                  ? 'bg-cyan-800 text-cyan-200 border border-cyan-700'
                                  : 'bg-gray-800 text-gray-500 hover:text-gray-400'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400">Sources</label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {TASK_SOURCES.map((source) => (
                            <button
                              key={source}
                              onClick={() => {
                                const sources = config.priorityTasks.sources.includes(source)
                                  ? config.priorityTasks.sources.filter(s => s !== source)
                                  : [...config.priorityTasks.sources, source];
                                handleConfigChange('priorityTasks', {
                                  ...config.priorityTasks,
                                  sources: sources as ('orchestrator' | 'human-tasks' | 'github-issues')[]
                                });
                              }}
                              className={`px-2 py-1 text-[10px] rounded transition-all ${
                                config.priorityTasks.sources.includes(source)
                                  ? 'bg-cyan-800 text-cyan-200 border border-cyan-700'
                                  : 'bg-gray-800 text-gray-500 hover:text-gray-400'
                              }`}
                            >
                              {source}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Manager Distribution */}
                <div className="p-3 bg-purple-900/10 rounded-lg border border-purple-900/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🤖</span>
                      <div>
                        <span className="text-sm font-medium text-white">Manager Distribution</span>
                        <p className="text-[10px] text-gray-500">Auto-distribute tasks across AI managers</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleConfigChange('managerDistribution', {
                        ...config.managerDistribution,
                        enabled: !config.managerDistribution.enabled
                      })}
                      className={`relative w-10 h-5 rounded-full transition-colors ${
                        config.managerDistribution.enabled ? 'bg-purple-600' : 'bg-gray-700'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          config.managerDistribution.enabled ? 'left-5' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  {config.managerDistribution.enabled && (
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className="text-[10px] text-gray-400">Max Managers to Spawn</label>
                        <div className="flex gap-1 mt-1">
                          {[2, 4, 6, 8].map((n) => (
                            <button
                              key={n}
                              onClick={() => handleConfigChange('managerDistribution', {
                                ...config.managerDistribution,
                                maxManagersToSpawn: n
                              })}
                              className={`px-3 py-1 text-[10px] rounded transition-all ${
                                config.managerDistribution.maxManagersToSpawn === n
                                  ? 'bg-purple-800 text-purple-200 border border-purple-700'
                                  : 'bg-gray-800 text-gray-500 hover:text-gray-400'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400">Assignment Strategy</label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {ASSIGNMENT_STRATEGIES.map((strategy) => (
                            <button
                              key={strategy}
                              onClick={() => handleConfigChange('managerDistribution', {
                                ...config.managerDistribution,
                                taskAssignmentStrategy: strategy
                              })}
                              className={`px-2 py-1 text-[10px] rounded transition-all ${
                                config.managerDistribution.taskAssignmentStrategy === strategy
                                  ? 'bg-purple-800 text-purple-200 border border-purple-700'
                                  : 'bg-gray-800 text-gray-500 hover:text-gray-400'
                              }`}
                            >
                              {strategy}
                            </button>
                          ))}
                        </div>
                        <p className="text-[9px] text-gray-600 mt-1">
                          {config.managerDistribution.taskAssignmentStrategy === 'round-robin' && 'Distribute tasks evenly across managers'}
                          {config.managerDistribution.taskAssignmentStrategy === 'priority-based' && 'Assign highest priority tasks first'}
                          {config.managerDistribution.taskAssignmentStrategy === 'skill-match' && 'Match task topics to manager expertise'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Last Run Info */}
                {config.lastRun && (
                  <div className="text-xs text-gray-500 p-2 bg-gray-800/30 rounded">
                    Last run: {formatTimeAgo(config.lastRun)} ({new Date(config.lastRun).toLocaleString()})
                  </div>
                )}

                {/* Error Display */}
                {error && (
                  <div className="text-red-400 text-xs p-2 bg-red-900/20 rounded">
                    {error}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className={`flex-1 py-2.5 rounded text-sm font-medium transition-all ${
                      success
                        ? 'bg-green-900/50 text-green-400 border border-green-800'
                        : saving
                          ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                          : 'bg-[var(--neon-green)]/20 text-[var(--neon-green)] border border-[var(--neon-green)]/30 hover:bg-[var(--neon-green)]/30'
                    }`}
                  >
                    {saving ? 'Saving...' : success ? 'Saved!' : 'Save Configuration'}
                  </button>
                  <Tooltip
                    content="Start a nightly build immediately instead of waiting for scheduled time"
                    position="top"
                  >
                    <button
                      onClick={handleRunNow}
                      disabled={running}
                      className={`px-4 py-2.5 rounded text-sm font-medium transition-all ${
                        running
                          ? 'bg-purple-900/30 text-purple-400 cursor-wait'
                          : 'bg-purple-900/50 hover:bg-purple-900/70 text-purple-300 border border-purple-800'
                      }`}
                    >
                      {running ? 'Starting...' : 'Run Now'}
                    </button>
                  </Tooltip>
                </div>
              </div>
            ) : activeTab === 'briefings' ? (
              selectedBriefing ? (
                /* Briefing Detail View */
                <div className="space-y-4">
                  <button
                    onClick={() => setSelectedBriefing(null)}
                    className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
                  >
                    ← Back to list
                  </button>

                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      selectedBriefing.status === 'success'
                        ? 'bg-green-900/50 text-green-400'
                        : selectedBriefing.status === 'partial'
                          ? 'bg-yellow-900/50 text-yellow-500'
                          : 'bg-red-900/50 text-red-400'
                    }`}>
                      {selectedBriefing.status.toUpperCase()}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(selectedBriefing.createdAt).toLocaleString()}
                    </span>
                    <span className={`text-xs ${MODEL_INFO[selectedBriefing.model as ClaudeModel]?.color || 'text-gray-400'}`}>
                      {selectedBriefing.model}
                    </span>
                  </div>

                  {/* TLDR */}
                  <div className="p-3 bg-gradient-to-r from-[var(--neon-green)]/10 to-transparent rounded-lg border border-[var(--neon-green)]/30">
                    <h4 className="text-xs font-medium text-[var(--neon-green)] mb-1">TLDR</h4>
                    <p className="text-sm text-white">{selectedBriefing.tldr}</p>
                  </div>

                  {/* Summary */}
                  <div>
                    <h4 className="text-xs font-medium text-gray-400 mb-2">Summary</h4>
                    <p className="text-sm text-gray-300 whitespace-pre-wrap">{selectedBriefing.summary}</p>
                  </div>

                  {/* Earnings Data */}
                  {selectedBriefing.earnings && (
                    <div className="p-3 bg-emerald-900/10 rounded-lg border border-emerald-900/30">
                      <h4 className="text-xs font-medium text-emerald-400 mb-2 flex items-center gap-2">
                        <span>💰</span> Earnings
                      </h4>
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-2xl font-bold text-white">
                          {selectedBriefing.earnings.currency === 'USD' ? '$' : selectedBriefing.earnings.currency}
                          {selectedBriefing.earnings.total.toFixed(2)}
                        </span>
                        <span className="text-xs text-gray-500">
                          on {selectedBriefing.earnings.date}
                        </span>
                      </div>
                      {selectedBriefing.earnings.breakdown && selectedBriefing.earnings.breakdown.length > 0 && (
                        <div className="space-y-1">
                          {selectedBriefing.earnings.breakdown.map((item, i) => (
                            <div key={i} className="flex justify-between text-xs">
                              <span className="text-gray-400">{item.source}</span>
                              <span className="text-white">
                                ${item.amount.toFixed(2)} ({item.transactions} txn)
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Priority Tasks */}
                  {selectedBriefing.priorityTasks && selectedBriefing.priorityTasks.length > 0 && (
                    <div className="p-3 bg-cyan-900/10 rounded-lg border border-cyan-900/30">
                      <h4 className="text-xs font-medium text-cyan-400 mb-2 flex items-center gap-2">
                        <span>📋</span> Priority Tasks ({selectedBriefing.priorityTasks.length})
                      </h4>
                      <div className="space-y-2">
                        {selectedBriefing.priorityTasks.map((task, i) => (
                          <div key={i} className="p-2 bg-gray-800/50 rounded">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                task.priority === 'urgent' ? 'bg-red-900/50 text-red-400' :
                                task.priority === 'high' ? 'bg-orange-900/50 text-orange-400' :
                                task.priority === 'medium' ? 'bg-yellow-900/50 text-yellow-400' :
                                'bg-gray-700 text-gray-400'
                              }`}>
                                {task.priority}
                              </span>
                              <span className="text-[10px] text-gray-500">{task.source}</span>
                              {task.project && (
                                <span className="text-[10px] text-gray-600">{task.project}</span>
                              )}
                            </div>
                            <p className="text-sm text-white">{task.title}</p>
                            {task.description && (
                              <p className="text-[10px] text-gray-400 mt-1 line-clamp-2">{task.description}</p>
                            )}
                            {task.assignedManager && (
                              <p className="text-[10px] text-purple-400 mt-1">
                                Assigned to: {task.assignedManager}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Managers Spawned */}
                  {selectedBriefing.managersSpawned && selectedBriefing.managersSpawned.length > 0 && (
                    <div className="p-3 bg-purple-900/10 rounded-lg border border-purple-900/30">
                      <h4 className="text-xs font-medium text-purple-400 mb-2 flex items-center gap-2">
                        <span>🤖</span> Managers Spawned ({selectedBriefing.managersSpawned.length})
                      </h4>
                      <div className="space-y-1">
                        {selectedBriefing.managersSpawned.map((mgr, i) => (
                          <div key={i} className="flex items-center justify-between text-xs p-2 bg-gray-800/50 rounded">
                            <span className="text-white font-medium">{mgr.managerName}</span>
                            <span className="text-gray-400 text-[10px] truncate max-w-[60%]">{mgr.assignedTask}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Changes */}
                  {selectedBriefing.changes && selectedBriefing.changes.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-400 mb-2">Changes ({selectedBriefing.changes.length})</h4>
                      <div className="space-y-2">
                        {selectedBriefing.changes.map((change, i) => (
                          <div
                            key={i}
                            className={`p-3 rounded border ${CHANGE_TYPE_COLORS[change.type] || 'bg-gray-800/50 border-gray-700 text-gray-400'}`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span>{CHANGE_TYPE_ICONS[change.type] || '📝'}</span>
                              <span className="text-sm font-medium">{change.title}</span>
                              {change.project && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                                  {change.project}
                                </span>
                              )}
                            </div>
                            <p className="text-xs opacity-80">{change.description}</p>
                            {change.filesChanged && change.filesChanged.length > 0 && (
                              <div className="mt-2 text-[10px] text-gray-500">
                                Files: {change.filesChanged.join(', ')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Timing */}
                  <div className="text-[10px] text-gray-600 pt-2 border-t border-gray-800">
                    Started: {new Date(selectedBriefing.buildStartedAt).toLocaleString()} |
                    Completed: {new Date(selectedBriefing.buildCompletedAt).toLocaleString()}
                  </div>
                </div>
              ) : (
                /* Briefings List */
                <div className="space-y-2">
                  {briefings.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="text-3xl mb-2 opacity-50">📋</div>
                      <p className="text-gray-500 text-sm">No briefings yet</p>
                      <p className="text-gray-600 text-xs mt-1">
                        Enable nightly builds to start receiving morning briefings
                      </p>
                    </div>
                  ) : (
                    briefings.map((briefing) => (
                      <motion.div
                        key={briefing.id}
                        className="p-3 bg-gray-800/30 rounded-lg border border-gray-700 cursor-pointer hover:border-[var(--neon-green)]/50 transition-colors"
                        whileHover={{ scale: 1.01 }}
                        onClick={() => setSelectedBriefing(briefing)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              briefing.status === 'success'
                                ? 'bg-green-900/50 text-green-400'
                                : briefing.status === 'partial'
                                  ? 'bg-yellow-900/50 text-yellow-500'
                                  : 'bg-red-900/50 text-red-400'
                            }`}>
                              {briefing.status}
                            </span>
                            <span className={`text-[10px] ${MODEL_INFO[briefing.model as ClaudeModel]?.color || 'text-gray-400'}`}>
                              {briefing.model}
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-500">
                            {formatTimeAgo(briefing.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-white line-clamp-2">{briefing.tldr}</p>
                        {/* Quick stats row */}
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {briefing.earnings && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/30 text-emerald-400">
                              💰 ${briefing.earnings.total.toFixed(2)}
                            </span>
                          )}
                          {briefing.priorityTasks && briefing.priorityTasks.length > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-900/30 text-cyan-400">
                              📋 {briefing.priorityTasks.length} tasks
                            </span>
                          )}
                          {briefing.managersSpawned && briefing.managersSpawned.length > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400">
                              🤖 {briefing.managersSpawned.length} managers
                            </span>
                          )}
                        </div>
                        {briefing.changes && briefing.changes.length > 0 && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {briefing.changes.slice(0, 4).map((change, i) => (
                              <span
                                key={i}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400"
                              >
                                {CHANGE_TYPE_ICONS[change.type]} {change.type}
                              </span>
                            ))}
                            {briefing.changes.length > 4 && (
                              <span className="text-[10px] text-gray-500">
                                +{briefing.changes.length - 4} more
                              </span>
                            )}
                          </div>
                        )}
                      </motion.div>
                    ))
                  )}
                </div>
              )
            ) : null}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Compact button for the top bar
 */
export function NightlyBuildsButton({
  onClick,
  enabled,
  nextRun,
}: {
  onClick: () => void;
  enabled?: boolean;
  nextRun?: string | null;
}) {
  return (
    <Tooltip
      content={
        <TooltipContent
          title="Nightly Builds"
          description={
            enabled
              ? `Automated improvements scheduled. ${nextRun ? `Next: ${new Date(nextRun).toLocaleString()}` : ''}`
              : 'Configure automatic nightly improvements'
          }
        />
      }
      position="bottom"
    >
      <button
        onClick={onClick}
        className={`bg-[var(--card)] border rounded px-3 py-1.5 text-center cursor-pointer hover:border-gray-600 transition-colors ${
          enabled ? 'border-purple-800' : 'border-[var(--card-border)]'
        }`}
      >
        <div className="text-lg">🌙</div>
        <div className={`text-[9px] ${enabled ? 'text-purple-400' : 'text-gray-500'}`}>
          {enabled ? 'Active' : 'Nightly'}
        </div>
      </button>
    </Tooltip>
  );
}
