import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import * as path from 'path';
import { authenticateRequest, checkRateLimit, getRateLimitIdentifier } from '../../../lib/auth';

const BRIDGE_DIR = path.join(process.env.HOME || '', 'Documents', 'insomnia', 'bridge');

export async function POST(request: Request) {
  // Rate limiting check first
  const rateLimitId = getRateLimitIdentifier(request);
  if (!checkRateLimit(rateLimitId)) {
    return NextResponse.json(
      { success: false, message: 'Rate limit exceeded. Try again later.' },
      { status: 429 }
    );
  }

  // Authenticate the request
  const auth = authenticateRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  try {
    // Kill existing process
    try {
      execSync('pkill -f "node dist/server.js"', { timeout: 5000 });
    } catch {
      // Process may not be running, ignore
    }

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
