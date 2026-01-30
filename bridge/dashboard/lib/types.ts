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

// Task interface for project tasks
export interface ProjectTask {
  id: string;
  name: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'worker_done' | 'completed';
  requirements?: string[];
  testCommand?: string;
  testsPassing?: boolean;
  workerNotes?: string;
  managerReview?: string;
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
  tasks?: ProjectTask[];
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

// Claude process interface
export interface ClaudeProcess {
  pid: number;
  cpu: number;
  memory: number;
  runtime: string;
  command: string;
  status: 'running' | 'paused';
  workingDir?: string;
  prompt?: string;
}

// Model configuration interface
export interface ModelConfig {
  responder: 'sonnet' | 'haiku' | 'opus';
  defaultManager: 'sonnet' | 'haiku' | 'opus';
  orchestratorWorker: 'sonnet' | 'haiku' | 'opus';
  orchestratorManager: 'sonnet' | 'haiku' | 'opus';
}

// System status interface
export interface SystemStatus {
  bridge: BridgeStatus;
  managers: Manager[];
  projects: Project[];
  orchestrator?: OrchestratorStatus;
  claudeProcesses: number;
  claudeProcessDetails: ClaudeProcess[];
  models: ModelConfig;
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

// Event types for animations
export type SystemEventType =
  | 'message_received'
  | 'manager_created'
  | 'manager_processing'
  | 'orchestrator_spawned'
  | 'task_completed'
  | 'queue_updated';

export interface SystemEvent {
  id: string;
  type: SystemEventType;
  targetId?: string;  // Manager ID, project name, etc.
  timestamp: number;
  data?: Record<string, unknown>;
}

// Nightly Builds Configuration
export interface NightlyBuildConfig {
  enabled: boolean;
  buildTime: string;      // 24h format "HH:MM" e.g. "03:00"
  wakeUpTime: string;     // 24h format "HH:MM" e.g. "08:00"
  model: 'sonnet' | 'haiku' | 'opus';
  customPrompt: string;
  lastRun?: string;       // ISO timestamp
  nextRun?: string;       // ISO timestamp

  // Earnings extraction feature
  earningsExtraction: {
    enabled: boolean;
    sources: string[];      // e.g. ["stripe", "gumroad", "custom"]
    customSourcePath?: string;  // Path to custom earnings data
  };

  // Priority tasks feature
  priorityTasks: {
    enabled: boolean;
    maxTasks: number;       // How many top tasks to fetch (default: 4)
    sources: ('orchestrator' | 'human-tasks' | 'github-issues')[];
  };

  // Manager distribution feature
  managerDistribution: {
    enabled: boolean;
    maxManagersToSpawn: number;  // Max parallel managers (default: 4)
    taskAssignmentStrategy: 'round-robin' | 'priority-based' | 'skill-match';
  };
}

// Nightly Build Briefing
export interface NightlyBriefing {
  id: string;
  createdAt: string;
  buildStartedAt: string;
  buildCompletedAt: string;
  model: string;
  tldr: string;
  summary: string;
  changes: NightlyBuildChange[];
  status: 'success' | 'partial' | 'failed';
  error?: string;
}

export interface NightlyBuildChange {
  type: 'improvement' | 'fix' | 'optimization' | 'cleanup' | 'scrape' | 'new_tool' | 'earnings' | 'task_distribution';
  title: string;
  description: string;
  filesChanged?: string[];
  project?: string;
}

// Earnings data for briefings
export interface EarningsData {
  date: string;
  total: number;
  currency: string;
  breakdown: {
    source: string;
    amount: number;
    transactions: number;
  }[];
}

// Priority task from various sources
export interface PriorityTask {
  id: string;
  title: string;
  description?: string;
  source: 'orchestrator' | 'human-tasks' | 'github-issues';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  project?: string;
  assignedManager?: string;
}

// Extended briefing with earnings and task data
export interface NightlyBriefingExtended extends NightlyBriefing {
  earnings?: EarningsData;
  priorityTasks?: PriorityTask[];
  managersSpawned?: {
    managerId: string;
    managerName: string;
    assignedTask: string;
  }[];
}
