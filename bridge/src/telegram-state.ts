/**
 * Telegram state persistence
 */

import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from './config';
import { TelegramState } from './types';

const STATE_FILE = path.join(DATA_DIR, '.telegram-state.json');

const defaultState: TelegramState = {
  lastUpdateId: 0,
  botUsername: undefined,
};

let state: TelegramState = { ...defaultState };

export function loadTelegramState(): TelegramState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      state = { ...defaultState, ...data };
    }
  } catch {
    state = { ...defaultState };
  }
  return state;
}

export function saveTelegramState(updates: Partial<TelegramState>): void {
  state = { ...state, ...updates };
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    // Ignore write errors
  }
}

export function getTelegramState(): TelegramState {
  return state;
}
