export interface Config {
  yourPhoneNumber: string;
  yourEmail: string;
  claudeWorkDir: string;
  pollInterval: number;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ConversationHistory {
  messages: Message[];
}

export interface State {
  lastMessageRowId: number;
}

export interface DatabaseRow {
  ROWID: number;
  text: string | null;
  attributedBody: Buffer | null;
  date: number;
  sender: string;
}
