'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ManagerSpawnerProps {
  isOpen: boolean;
  onClose: () => void;
  getCsrfToken: () => Promise<string>;
  onSpawn?: () => void;
}

export function ManagerSpawner({ isOpen, onClose, getCsrfToken, onSpawn }: ManagerSpawnerProps) {
  const [prompt, setPrompt] = useState('');
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
      }, 200);
    }
  }, [isOpen]);

  const handleSpawn = async () => {
    if (!prompt.trim()) {
      setError('Please enter a task for the manager');
      return;
    }

    setSpawning(true);
    setError(null);
    setSuccess(null);

    try {
      const token = await getCsrfToken();

      // Use the new auto-generate endpoint that determines name/description/topics from the prompt
      const res = await fetch('/api/managers/spawn-auto', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': token,
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to spawn manager');
      }

      setSuccess(`Manager "${data.manager.name}" created`);
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
        className="absolute top-14 right-3 bg-[var(--card)] border border-purple-500/30 rounded-lg z-50 w-80 shadow-xl"
        initial={{ opacity: 0, y: -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={{ duration: 0.15 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-[var(--card-border)] bg-purple-900/10">
          <div className="flex items-center gap-2">
            <span className="text-lg text-purple-400">+</span>
            <h3 className="font-medium text-white text-sm">New Manager</h3>
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
          {/* Info */}
          <div className="mb-3 text-[10px] text-gray-500 bg-purple-900/10 p-2 rounded border border-purple-900/30">
            Managers are long-running Opus agents that handle specific topics and can spawn orchestrators.
          </div>

          {/* Prompt textarea */}
          <div className="mb-3">
            <label className="text-xs font-medium text-gray-300 mb-1 block">
              What should this manager handle?
            </label>
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Build a new authentication system for the app..."
              className="w-full h-24 px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-purple-500/50 transition-colors"
            />
            <p className="text-[10px] text-gray-600 mt-1">
              The system will auto-generate the manager name, description, and topics
            </p>
          </div>

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
                  : 'bg-purple-900/30 text-purple-400 border border-purple-800 hover:bg-purple-900/50'
            }`}
          >
            {spawning ? (
              <>
                <span className="w-3 h-3 border border-purple-400 border-t-transparent rounded-full animate-spin" />
                Creating Manager...
              </>
            ) : (
              <>
                <span>+</span>
                Create Manager
              </>
            )}
          </button>

          {/* Tip */}
          <p className="text-[9px] text-gray-600 text-center mt-2">
            Press Cmd+Enter to create
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
