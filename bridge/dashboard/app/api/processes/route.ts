import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { authenticateRequest } from '../../lib/auth';

// POST /api/processes - Kill or pause/resume a Claude process
export async function POST(request: Request) {
  // Authenticate the request (mutating operation, requires CSRF or API key)
  const auth = authenticateRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  try {
    const body = await request.json();
    const { pid, action } = body;

    if (!pid || typeof pid !== 'number') {
      return NextResponse.json(
        { error: 'Invalid PID', message: 'PID must be a number' },
        { status: 400 }
      );
    }

    if (!action || !['kill', 'pause', 'resume'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action', message: 'Action must be kill, pause, or resume' },
        { status: 400 }
      );
    }

    // Verify the process is actually a Claude process before acting on it
    try {
      const verifyResult = execSync(
        `ps -p ${pid} -o args= 2>/dev/null`,
        { encoding: 'utf8', timeout: 5000 }
      );

      if (!verifyResult.includes('claude')) {
        return NextResponse.json(
          { error: 'Not a Claude process', message: 'The specified PID is not a Claude process' },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Process not found', message: 'The specified PID does not exist' },
        { status: 404 }
      );
    }

    // Perform the action
    try {
      switch (action) {
        case 'kill':
          // Send SIGTERM for graceful shutdown
          execSync(`kill -TERM ${pid}`, { encoding: 'utf8', timeout: 5000 });
          break;
        case 'pause':
          // Send SIGSTOP to pause the process
          execSync(`kill -STOP ${pid}`, { encoding: 'utf8', timeout: 5000 });
          break;
        case 'resume':
          // Send SIGCONT to resume the process
          execSync(`kill -CONT ${pid}`, { encoding: 'utf8', timeout: 5000 });
          break;
      }

      return NextResponse.json({
        success: true,
        message: `Process ${pid} ${action === 'kill' ? 'terminated' : action === 'pause' ? 'paused' : 'resumed'} successfully`,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return NextResponse.json(
        { error: 'Failed to execute action', message: errorMessage },
        { status: 500 }
      );
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Invalid request', message: errorMessage },
      { status: 400 }
    );
  }
}
