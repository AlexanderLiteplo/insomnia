import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Config } from './types';

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

export function loadConfig(): Config {
  const defaults: Config = {
    yourPhoneNumber: process.env.YOUR_PHONE_NUMBER || '',
    yourEmail: process.env.YOUR_EMAIL || '',
    claudeWorkDir: process.env.HOME || os.homedir(),
    pollInterval: 5000,
  };

  if (fs.existsSync(CONFIG_PATH)) {
    const fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return { ...defaults, ...fileConfig };
  }

  return defaults;
}

export const IMESSAGE_DB = path.join(os.homedir(), 'Library/Messages/chat.db');
export const DATA_DIR = path.join(__dirname, '..');
