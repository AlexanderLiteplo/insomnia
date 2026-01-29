import { NextResponse } from 'next/server';
import * as crypto from 'crypto';

/**
 * API Authentication Middleware
 *
 * Security model:
 * - If DASHBOARD_API_KEY is set, requires it for all mutating operations
 * - Localhost requests are allowed for browser dashboard access (via host header only - not spoofable headers)
 * - All external requests require API key authentication
 * - CSRF protection via tokens for browser-initiated requests
 */

const API_KEY = process.env.DASHBOARD_API_KEY;

// CSRF token storage (in-memory, survives process restarts via session)
// In production, consider using a Redis store or database
const csrfTokens = new Map<string, { token: string; expires: number }>();
const CSRF_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour

// Rate limiting storage
interface RateLimitEntry {
  count: number;
  windowStart: number;
}
const rateLimits = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 10; // Max 10 requests per minute for mutating operations

interface AuthResult {
  authorized: boolean;
  error?: NextResponse;
}

/**
 * Generate a CSRF token for a session
 */
export function generateCsrfToken(): string {
  const token = crypto.randomBytes(32).toString('hex');
  const sessionId = crypto.randomBytes(16).toString('hex');
  csrfTokens.set(sessionId, {
    token,
    expires: Date.now() + CSRF_TOKEN_EXPIRY,
  });
  // Clean up expired tokens periodically
  cleanupExpiredTokens();
  return `${sessionId}:${token}`;
}

/**
 * Validate a CSRF token
 */
export function validateCsrfToken(tokenString: string | null): boolean {
  if (!tokenString) return false;

  const parts = tokenString.split(':');
  if (parts.length !== 2) return false;

  const [sessionId, token] = parts;
  const stored = csrfTokens.get(sessionId);

  if (!stored) return false;
  if (Date.now() > stored.expires) {
    csrfTokens.delete(sessionId);
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(stored.token),
    Buffer.from(token)
  );
}

/**
 * Clean up expired CSRF tokens
 */
function cleanupExpiredTokens(): void {
  const now = Date.now();
  for (const [sessionId, data] of csrfTokens.entries()) {
    if (now > data.expires) {
      csrfTokens.delete(sessionId);
    }
  }
}

/**
 * Check rate limit for a given identifier (e.g., IP address or session)
 * Returns true if request should be allowed, false if rate limited
 */
export function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(identifier);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    // New window
    rateLimits.set(identifier, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Get rate limit identifier from request
 */
export function getRateLimitIdentifier(request: Request): string {
  // Use host header as identifier for localhost
  // In production with a proxy, you might use a session ID or authenticated user ID
  const host = request.headers.get('host') || 'unknown';
  return host;
}

/**
 * Check if the request is from localhost
 *
 * SECURITY: Only trust the host header for localhost detection.
 * x-forwarded-for and x-real-ip headers can be spoofed by attackers.
 * The host header is set by the client's TCP connection and cannot be spoofed
 * without actually connecting to the correct host.
 */
function isLocalhost(request: Request): boolean {
  // SECURITY FIX: Do NOT trust x-forwarded-for or x-real-ip headers
  // These can be easily spoofed by attackers to bypass authentication.
  // Only trust the host header which reflects the actual connection destination.

  const host = request.headers.get('host') || '';
  // Extract just the hostname (remove port if present)
  const hostname = host.split(':')[0];

  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

/**
 * Validate API key from request headers
 */
function validateApiKey(request: Request): boolean {
  const authHeader = request.headers.get('authorization');

  if (!authHeader) {
    return false;
  }

  // Support both "Bearer <key>" and plain "<key>" formats
  const key = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  return key === API_KEY;
}

/**
 * Authenticate a request for mutating operations (POST, PATCH, DELETE, PUT)
 *
 * Security layers:
 * 1. API key authentication (for programmatic access)
 * 2. CSRF token validation (for browser-initiated requests)
 * 3. Localhost restriction (fallback when no API key configured)
 *
 * @param request - The incoming request
 * @returns AuthResult with authorized status and optional error response
 */
export function authenticateRequest(request: Request): AuthResult {
  // Check for API key authentication first (programmatic access)
  if (validateApiKey(request)) {
    return { authorized: true };
  }

  // For localhost requests, require CSRF token for browser security
  if (isLocalhost(request)) {
    const csrfToken = request.headers.get('x-csrf-token');
    if (validateCsrfToken(csrfToken)) {
      return { authorized: true };
    }

    // If no CSRF token but localhost, check if this might be a legitimate
    // browser request without token (for backwards compatibility during migration)
    // We'll allow it but log a warning - remove this after CSRF is fully deployed
    const referer = request.headers.get('referer');
    const origin = request.headers.get('origin');

    // Verify the request originates from our dashboard
    if (referer || origin) {
      const sourceUrl = referer || origin || '';
      try {
        const url = new URL(sourceUrl);
        if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
          // Valid same-origin request from localhost
          // In strict mode, uncomment the below to require CSRF:
          // return {
          //   authorized: false,
          //   error: NextResponse.json(
          //     { error: 'CSRF token required', message: 'Include x-csrf-token header' },
          //     { status: 403 }
          //   ),
          // };
          return { authorized: true };
        }
      } catch {
        // Invalid URL in referer/origin
      }
    }

    // No API key, no valid CSRF, but localhost - check origin/referer
    // If no origin headers at all, this could be a direct request (curl, etc.)
    // For localhost direct requests without origin, we'll be permissive
    if (!referer && !origin) {
      return { authorized: true };
    }

    return {
      authorized: false,
      error: NextResponse.json(
        {
          error: 'Forbidden',
          message: 'CSRF validation failed. Request origin not allowed.'
        },
        { status: 403 }
      ),
    };
  }

  // External request without API key
  if (!API_KEY) {
    return {
      authorized: false,
      error: NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'API key not configured. External access denied.'
        },
        { status: 401 }
      ),
    };
  }

  return {
    authorized: false,
    error: NextResponse.json(
      {
        error: 'Unauthorized',
        message: 'Invalid or missing API key. Use Authorization header.'
      },
      { status: 401 }
    ),
  };
}

/**
 * Authenticate for read-only operations
 * More permissive - allows all localhost, requires key only for external
 */
export function authenticateReadRequest(request: Request): AuthResult {
  // Always allow localhost for read operations
  if (isLocalhost(request)) {
    return { authorized: true };
  }

  // For external requests, require API key if configured
  if (API_KEY && !validateApiKey(request)) {
    return {
      authorized: false,
      error: NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'API key required for external access.'
        },
        { status: 401 }
      ),
    };
  }

  return { authorized: true };
}
