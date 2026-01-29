export type ClaudeModel = 'sonnet' | 'haiku' | 'opus';

export interface ModelConfig {
  responder: ClaudeModel;        // Model for the message classifier/router (default: haiku)
  defaultManager: ClaudeModel;   // Default model for new managers (default: opus)
  orchestratorWorker: ClaudeModel;  // Model for orchestrator workers (default: opus)
  orchestratorManager: ClaudeModel; // Model for orchestrator managers (default: opus)
}

export interface Config {
  // Telegram configuration
  telegramBotToken?: string;
  telegramAllowedUserIds?: number[];  // Optional: restrict to specific user IDs

  // Transport type (telegram is the only supported option now)
  transport?: 'telegram';

  // Common settings
  claudeWorkDir: string;
  pollInterval: number;

  // Model configuration
  models?: ModelConfig;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ConversationHistory {
  messages: Message[];
}

// Telegram-specific types
export interface TelegramState {
  lastUpdateId: number;
  botUsername?: string;
}
