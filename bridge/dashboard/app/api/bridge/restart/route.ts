import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import * as path from 'path';

const BRIDGE_DIR = path.join(process.env.HOME || '', 'claude-sms-bridge');

export async function POST() {
  try {
    // Kill existing process
    try {
      execSync('pkill -f "node dist/server.js"', { timeout: 5000 });
    } catch {}

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Remove lock file and start
    execSync(`rm -f .bridge.lock && npm start &`, {
      cwd: BRIDGE_DIR,
      timeout: 10000,
      stdio: 'ignore',
    });

    return NextResponse.json({ success: true, message: 'Bridge restarted' });
  } catch (err) {
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
