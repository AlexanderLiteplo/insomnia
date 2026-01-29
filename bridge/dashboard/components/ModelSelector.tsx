'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type ClaudeModel = 'sonnet' | 'haiku' | 'opus';

interface ModelConfig {
  responder: ClaudeModel;
  defaultManager: ClaudeModel;
  orchestratorWorker: ClaudeModel;
  orchestratorManager: ClaudeModel;
}

interface ModelSelectorProps {
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

const FIELD_LABELS: Record<keyof ModelConfig, { label: string; description: string }> = {
  responder: {
    label: 'Responder',
    description: 'Routes incoming messages to managers',
  },
  defaultManager: {
    label: 'Default Manager',
    description: 'Model for new manager agents',
  },
  orchestratorWorker: {
    label: 'Orchestrator Worker',
    description: 'Implements project tasks',
  },
  orchestratorManager: {
    label: 'Orchestrator Manager',
    description: 'Reviews and approves work',
  },
};

export function ModelSelector({ isOpen, onClose, getCsrfToken }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchModels();
    }
  }, [isOpen]);

  const fetchModels = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error('Failed to load config');
      const data = await res.json();
      setModels(data.models);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config');
    } finally {
      setLoading(false);
    }
  };

  const handleModelChange = (field: keyof ModelConfig, value: ClaudeModel) => {
    if (models) {
      setModels({ ...models, [field]: value });
      setSuccess(false);
    }
  };

  const handleSave = async () => {
    if (!models) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const token = await getCsrfToken();
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': token,
        },
        body: JSON.stringify({ models }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to save');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="absolute top-14 right-3 bg-[var(--card)] border border-[var(--card-border)] rounded-lg z-50 w-80 shadow-xl"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-[var(--card-border)]">
          <div className="flex items-center gap-2">
            <span className="text-lg">🤖</span>
            <h3 className="font-medium text-white text-sm">Model Configuration</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-3">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-5 h-5 border-2 border-gray-600 border-t-gray-400 rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="text-red-400 text-xs p-2 bg-red-900/20 rounded mb-3">
              {error}
            </div>
          ) : models ? (
            <div className="space-y-3">
              {(Object.keys(FIELD_LABELS) as Array<keyof ModelConfig>).map((field) => (
                <div key={field} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-medium text-gray-300">
                        {FIELD_LABELS[field].label}
                      </label>
                      <p className="text-[10px] text-gray-600">
                        {FIELD_LABELS[field].description}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {(['haiku', 'sonnet', 'opus'] as ClaudeModel[]).map((model) => (
                      <button
                        key={model}
                        onClick={() => handleModelChange(field, model)}
                        className={`flex-1 px-2 py-1.5 rounded text-[11px] font-medium transition-all ${
                          models[field] === model
                            ? `bg-gray-700 ${MODEL_INFO[model].color} border border-gray-600`
                            : 'bg-gray-800/50 text-gray-500 hover:bg-gray-800 hover:text-gray-400 border border-transparent'
                        }`}
                      >
                        {MODEL_INFO[model].name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Legend */}
              <div className="pt-2 border-t border-[var(--card-border)] mt-3">
                <p className="text-[10px] text-gray-600 mb-2">Model Capabilities:</p>
                <div className="flex flex-wrap gap-2">
                  {(['haiku', 'sonnet', 'opus'] as ClaudeModel[]).map((model) => (
                    <div key={model} className="flex items-center gap-1">
                      <span className={`text-[10px] ${MODEL_INFO[model].color}`}>●</span>
                      <span className="text-[10px] text-gray-500">
                        {MODEL_INFO[model].name}: {MODEL_INFO[model].description}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Save Button */}
              <div className="pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className={`w-full py-2 rounded text-xs font-medium transition-all ${
                    success
                      ? 'bg-green-900/50 text-green-400 border border-green-800'
                      : saving
                        ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                        : 'bg-[var(--neon-green)]/20 text-[var(--neon-green)] border border-[var(--neon-green)]/30 hover:bg-[var(--neon-green)]/30'
                  }`}
                >
                  {saving ? 'Saving...' : success ? 'Saved!' : 'Save Configuration'}
                </button>
              </div>

              {/* Note */}
              <p className="text-[9px] text-gray-600 text-center">
                Changes apply to new agents only. Running agents keep their model.
              </p>
            </div>
          ) : null}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Small badge showing the current model for an item
 */
export function ModelBadge({ model }: { model: ClaudeModel }) {
  const info = MODEL_INFO[model];
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded bg-gray-800/50 ${info.color}`}>
      {info.name}
    </span>
  );
}
