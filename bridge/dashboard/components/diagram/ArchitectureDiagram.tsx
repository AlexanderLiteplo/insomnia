'use client';

import { DiagramConnection } from './DiagramConnection';
import { BridgeNode } from './nodes/BridgeNode';
import { ResponderNode } from './nodes/ResponderNode';
import { ManagersNode } from './nodes/ManagersNode';
import { OrchestratorsNode } from './nodes/OrchestratorsNode';
import { ProjectsNode } from './nodes/ProjectsNode';
import type { BridgeStatus, Manager, Project } from '../../lib/types';

interface OrchestratorStatus {
  workerRunning: boolean;
  workerPid?: number | null;
  managerRunning: boolean;
  managerPid?: number | null;
}

interface ArchitectureDiagramProps {
  bridge: BridgeStatus;
  managers: Manager[];
  projects: Project[];
  orchestrator?: OrchestratorStatus;
  responderActive?: boolean;
  lastResponderAction?: string;
}

export function ArchitectureDiagram({
  bridge,
  managers,
  projects,
  orchestrator,
  responderActive = false,
  lastResponderAction,
}: ArchitectureDiagramProps) {
  // Determine active states for connections based on system status
  const bridgeToResponderActive = bridge.running;
  const responderToManagersActive = bridge.running && managers.length > 0;
  const managersToOrchestratorsActive = Boolean(
    managers.some((m) => m.status === 'processing') &&
      (orchestrator?.workerRunning || orchestrator?.managerRunning)
  );
  const orchestratorsToProjectsActive = Boolean(
    (orchestrator?.workerRunning || orchestrator?.managerRunning) &&
      projects.some((p) => p.status === 'active')
  );

  return (
    <div className="w-full h-full flex flex-col">
      {/* Desktop: Horizontal flow layout - Full height */}
      <div className="hidden md:flex items-stretch justify-between gap-4 flex-1 min-h-0">
        {/* iMessage Bridge Node */}
        <div className="flex-1 min-w-0 flex flex-col">
          <BridgeNode bridge={bridge} />
        </div>

        {/* Connection: Bridge -> Responder */}
        <div className="flex items-center">
          <DiagramConnection active={bridgeToResponderActive} direction="horizontal" />
        </div>

        {/* Responder Node */}
        <div className="flex-1 min-w-0 flex flex-col">
          <ResponderNode
            isActive={responderActive}
            lastAction={lastResponderAction}
          />
        </div>

        {/* Connection: Responder -> Managers */}
        <div className="flex items-center">
          <DiagramConnection active={responderToManagersActive} direction="horizontal" />
        </div>

        {/* Managers Node */}
        <div className="flex-[1.5] min-w-0 flex flex-col">
          <ManagersNode managers={managers} />
        </div>

        {/* Connection: Managers -> Orchestrators */}
        <div className="flex items-center">
          <DiagramConnection active={managersToOrchestratorsActive} direction="horizontal" />
        </div>

        {/* Orchestrators Node */}
        <div className="flex-1 min-w-0 flex flex-col">
          <OrchestratorsNode orchestrator={orchestrator} />
        </div>

        {/* Connection: Orchestrators -> Projects */}
        <div className="flex items-center">
          <DiagramConnection active={orchestratorsToProjectsActive} direction="horizontal" />
        </div>

        {/* Projects Node */}
        <div className="flex-[1.5] min-w-0 flex flex-col">
          <ProjectsNode projects={projects} />
        </div>
      </div>

      {/* Mobile: Vertical stacked layout */}
      <div className="flex md:hidden flex-col items-center gap-2">
        {/* iMessage Bridge Node */}
        <div className="w-full">
          <BridgeNode bridge={bridge} />
        </div>

        {/* Connection: Bridge -> Responder */}
        <DiagramConnection active={bridgeToResponderActive} direction="vertical" />

        {/* Responder Node */}
        <div className="w-full">
          <ResponderNode
            isActive={responderActive}
            lastAction={lastResponderAction}
          />
        </div>

        {/* Connection: Responder -> Managers */}
        <DiagramConnection active={responderToManagersActive} direction="vertical" />

        {/* Managers Node */}
        <div className="w-full">
          <ManagersNode managers={managers} />
        </div>

        {/* Connection: Managers -> Orchestrators */}
        <DiagramConnection active={managersToOrchestratorsActive} direction="vertical" />

        {/* Orchestrators Node */}
        <div className="w-full">
          <OrchestratorsNode orchestrator={orchestrator} />
        </div>

        {/* Connection: Orchestrators -> Projects */}
        <DiagramConnection active={orchestratorsToProjectsActive} direction="vertical" />

        {/* Projects Node */}
        <div className="w-full">
          <ProjectsNode projects={projects} />
        </div>
      </div>
    </div>
  );
}
