import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from './config';

const LOG_FILE = path.join(DATA_DIR, 'imessage-server.log');

export function log(message: string): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  console.log(line.trim());
  fs.appendFileSync(LOG_FILE, line);
}
