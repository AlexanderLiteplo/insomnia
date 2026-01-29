'use client';

import { DiagramNode } from '../DiagramNode';
import { StatusDot } from '../../ui/StatusDot';
import { ProgressBar } from '../../ui/ProgressBar';
import type { Project } from '../../../lib/types';

interface ProjectsNodeProps {
  projects: Project[];
  onClick?: () => void;
}

export function ProjectsNode({ projects, onClick }: ProjectsNodeProps) {
  const activeProjects = projects.filter(p => p.status === 'active');
  const hasActive = activeProjects.length > 0;
  const status = hasActive ? 'processing' : projects.length > 0 ? 'online' : 'offline';
  const robotState = hasActive ? 'running' : projects.length > 0 ? 'idle' : 'sleeping';

  return (
    <DiagramNode
      title="Projects"
      status={status}
      robotState={robotState}
      robotColor="#ff00aa"
      itemCount={projects.length}
      onClick={onClick}
    >
      {projects.length === 0 ? (
        <p className="text-gray-500 text-sm">No active projects</p>
      ) : (
        <div className="space-y-2 overflow-y-auto">
          {projects.map((project, i) => {
            const percent = project.total > 0 ? Math.round((project.completed / project.total) * 100) : 0;
            const isComplete = project.status === 'complete';

            return (
              <div
                key={i}
                className="border-b border-[var(--card-border)] pb-2 last:border-0 last:pb-0"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <StatusDot
                      status={
                        project.status === 'active'
                          ? 'processing'
                          : isComplete
                          ? 'online'
                          : 'offline'
                      }
                    />
                    <span className="font-medium text-white text-sm truncate">
                      {project.name}
                    </span>
                  </div>
                  <span className={`text-xs ${isComplete ? 'text-green-400' : 'text-gray-400'}`}>
                    {project.completed}/{project.total}
                  </span>
                </div>

                <div className="mb-2">
                  <ProgressBar
                    value={project.completed}
                    max={project.total}
                    color={isComplete ? 'bg-green-500' : undefined}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className={`text-xs ${isComplete ? 'text-green-400' : 'text-gray-400'}`}>
                    {percent}%
                  </span>
                  {project.status === 'paused' && (
                    <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded">
                      Paused
                    </span>
                  )}
                </div>

                {project.currentTask && !isComplete && (
                  <p className="text-xs text-blue-400 mt-1 truncate">
                    {project.currentTask}
                  </p>
                )}

                {project.lastCompletedTask && (
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    {project.lastCompletedTask}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </DiagramNode>
  );
}
