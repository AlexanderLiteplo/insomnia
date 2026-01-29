'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { HumanTask } from '../lib/types';

interface UseTasksReturn {
  tasks: HumanTask[];
  pendingTasks: HumanTask[];
  completedTasks: HumanTask[];
  loading: boolean;
  error: Error | null;
  updateTask: (id: string, updates: Partial<HumanTask>) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useTasks(): UseTasksReturn {
  const [tasks, setTasks] = useState<HumanTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const response = await fetch('/api/tasks');
      if (!response.ok) {
        throw new Error(`Failed to fetch tasks: ${response.statusText}`);
      }
      const data = await response.json();
      setTasks(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchTasks();
  }, [fetchTasks]);

  const updateTask = useCallback(async (id: string, updates: Partial<HumanTask>) => {
    try {
      const response = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
      if (!response.ok) {
        throw new Error(`Failed to update task: ${response.statusText}`);
      }
      const updatedTask = await response.json();
      setTasks(prev => prev.map(t => t.id === id ? updatedTask : t));
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      throw err;
    }
  }, []);

  useEffect(() => {
    fetchTasks();

    const interval = setInterval(fetchTasks, 10000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  const pendingTasks = useMemo(
    () => tasks.filter(t => t.status === 'pending' || t.status === 'in_progress'),
    [tasks]
  );

  const completedTasks = useMemo(
    () => tasks.filter(t => t.status === 'completed' || t.status === 'dismissed'),
    [tasks]
  );

  return { tasks, pendingTasks, completedTasks, loading, error, updateTask, refresh };
}
