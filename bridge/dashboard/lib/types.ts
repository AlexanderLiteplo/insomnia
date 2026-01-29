// Robot state for animated diagram
export type RobotState = 'idle' | 'running' | 'sleeping';

// Manager interface
export interface Manager {
  id: string;
  name: string;
  description: string;
  topics: string[];
  status: 'active' | 'idle' | 'processing';
  currentTask: string | null;
  messageQueue: { id: string; content: string }[];
  lastActiveAt: string;
}

// Project interface
export interface Project {
  name: string;
  description: string;
  completed: number;
  total: number;
  status: 'active' | 'paused' | 'complete';
  currentTask?: string | null;
  lastCompletedTask?: string | null;
  outputDir?: string | null;
}

// Bridge status interface
export interface BridgeStatus {
  running: boolean;
  pid: number | null;
  uptime: string;
  healthy?: boolean;
  lastPollTime?: string | null;
  botUsername?: string | null;
  errorMessage?: string | null;
}

// Human task interface
export interface HumanTask {
  id: string;
  title: string;
  description: string;
  instructions: string[];
  project?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'dismissed';
  createdAt: string;
  completedAt?: string;
  createdBy?: string;
  notified: boolean;
}

// Orchestrator status interface
export interface OrchestratorStatus {
  workerRunning: boolean;
  workerPid: number | null;
  managerRunning: boolean;
  managerPid: number | null;
}

// System status interface
export interface SystemStatus {
  bridge: BridgeStatus;
  managers: Manager[];
  projects: Project[];
  orchestrator?: OrchestratorStatus;
  claudeProcesses: number;
  lastUpdated: string;
}

// Diagram node props for visualization
export interface DiagramNodeProps {
  id: string;
  label: string;
  x: number;
  y: number;
  type: 'robot' | 'manager' | 'worker' | 'bridge' | 'project';
  state?: RobotState;
  status?: 'active' | 'idle' | 'processing' | 'offline';
  onClick?: () => void;
}

// Connection props for diagram lines/arrows
export interface ConnectionProps {
  from: string;
  to: string;
  animated?: boolean;
  color?: string;
  label?: string;
}
