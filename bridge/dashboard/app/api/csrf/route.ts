import { NextResponse } from 'next/server';
import { generateCsrfToken, authenticateReadRequest } from '../../lib/auth';

/**
 * GET /api/csrf - Generate a new CSRF token
 *
 * This endpoint provides CSRF tokens for browser-initiated requests.
 * The token should be included in the x-csrf-token header for all
 * state-changing operations (POST, PATCH, DELETE, PUT).
 *
 * Security: Only allows localhost requests to get tokens.
 */
export async function GET(request: Request) {
  // Only localhost can request CSRF tokens
  const auth = authenticateReadRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  const token = generateCsrfToken();

  return NextResponse.json(
    { token },
    {
      headers: {
        // Prevent caching of CSRF tokens
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    }
  );
}
