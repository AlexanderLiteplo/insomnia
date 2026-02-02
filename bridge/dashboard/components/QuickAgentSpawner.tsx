'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type ClaudeModel = 'sonnet' | 'haiku' | 'opus';

interface QuickAgentSpawnerProps {
  isOpen: boolean;
  onClose: () => void;
  getCsrfToken: () => Promise<string>;
  onSpawn?: () => void;
}

const MODEL_INFO: Record<ClaudeModel, { name: string; description: string; color: string }> = {
  haiku: {
    name: 'Haiku',
    description: 'Fast & light',
    color: 'text-blue-400',
  },
  sonnet: {
    name: 'Sonnet',
    description: 'Balanced',
    color: 'text-purple-400',
  },
  opus: {
    name: 'Opus',
    description: 'Most capable',
    color: 'text-amber-400',
  },
};

export function QuickAgentSpawner({ isOpen, onClose, getCsrfToken, onSpawn }: QuickAgentSpawnerProps) {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<ClaudeModel>('sonnet');
  const [directory, setDirectory] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [spawning, setSpawning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea when dialog opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Clear state when closing
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setPrompt('');
        setError(null);
        setSuccess(null);
        setShowAdvanced(false);
      }, 200);
    }
  }, [isOpen]);

  const handleSpawn = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setSpawning(true);
    setError(null);
    setSuccess(null);

    try {
      const token = await getCsrfToken();

      const res = await fetch('/api/agents/spawn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': token,
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model,
          directory: directory.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to spawn agent');
      }

      setSuccess(`Agent spawned (PID: ${data.pid})`);
      onSpawn?.();

      // Close after success
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to spawn');
    } finally {
      setSpawning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl + Enter to spawn
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSpawn();
    }
    // Escape to close
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="absolute top-14 right-3 bg-[var(--card)] border border-[var(--card-border)] rounded-lg z-50 w-80 shadow-xl"
        initial={{ opacity: 0, y: -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={{ duration: 0.15 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-[var(--card-border)]">
          <div className="flex items-center gap-2">
            <span className="text-lg text-[var(--neon-green)]">+</span>
            <h3 className="font-medium text-white text-sm">Quick Agent</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none"
          >
            x
          </button>
        </div>

        {/* Content */}
        <div className="p-3" onKeyDown={handleKeyDown}>
          {/* Prompt textarea */}
          <div className="mb-3">
            <label className="text-xs font-medium text-gray-300 mb-1 block">
              What should the agent do?
            </label>
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Help me debug the login flow in my React app..."
              className="w-full h-20 px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-gray-500 transition-colors"
            />
            <p className="text-[10px] text-gray-600 mt-1">
              Press Cmd+Enter to spawn
            </p>
          </div>

          {/* Model selector */}
          <div className="mb-3">
            <label className="text-xs font-medium text-gray-300 mb-1 block">
              Model
            </label>
            <div className="flex gap-1">
              {(['haiku', 'sonnet', 'opus'] as ClaudeModel[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setModel(m)}
                  className={`flex-1 px-2 py-1.5 rounded text-[11px] font-medium transition-all ${
                    model === m
                      ? `bg-gray-700 ${MODEL_INFO[m].color} border border-gray-600`
                      : 'bg-gray-800/50 text-gray-500 hover:bg-gray-800 hover:text-gray-400 border border-transparent'
                  }`}
                >
                  <div>{MODEL_INFO[m].name}</div>
                  <div className="text-[9px] opacity-70">{MODEL_INFO[m].description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Advanced options toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-[10px] text-gray-500 hover:text-gray-400 mb-3 flex items-center gap-1"
          >
            <span className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>
              &gt;
            </span>
            Advanced options
          </button>

          {/* Advanced options */}
          <AnimatePresence>
            {showAdvanced && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden mb-3"
              >
                <label className="text-xs font-medium text-gray-300 mb-1 block">
                  Working Directory (optional)
                </label>
                <input
                  type="text"
                  value={directory}
                  onChange={(e) => setDirectory(e.target.value)}
                  placeholder="e.g., ~/Projects/my-app"
                  className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 transition-colors"
                />
                <p className="text-[10px] text-gray-600 mt-1">
                  Directory to add context from (--add-dir)
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error message */}
          {error && (
            <div className="text-red-400 text-xs p-2 bg-red-900/20 rounded mb-3">
              {error}
            </div>
          )}

          {/* Success message */}
          {success && (
            <div className="text-green-400 text-xs p-2 bg-green-900/20 rounded mb-3">
              {success}
            </div>
          )}

          {/* Spawn button */}
          <button
            onClick={handleSpawn}
            disabled={spawning || !prompt.trim()}
            className={`w-full py-2.5 rounded text-xs font-medium transition-all flex items-center justify-center gap-2 ${
              spawning
                ? 'bg-gray-800 text-gray-500 cursor-wait'
                : !prompt.trim()
                  ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  : 'bg-[var(--neon-green)]/20 text-[var(--neon-green)] border border-[var(--neon-green)]/30 hover:bg-[var(--neon-green)]/30'
            }`}
          >
            {spawning ? (
              <>
                <span className="w-3 h-3 border border-gray-500 border-t-transparent rounded-full animate-spin" />
                Spawning...
              </>
            ) : (
              <>
                <span>+</span>
                Spawn Agent
              </>
            )}
          </button>

          {/* Tip */}
          <p className="text-[9px] text-gray-600 text-center mt-2">
            Agent runs in background with --dangerously-skip-permissions
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
