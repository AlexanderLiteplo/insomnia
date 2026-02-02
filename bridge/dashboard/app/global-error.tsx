'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ backgroundColor: '#0a0a0a', color: 'white', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}>
          <div style={{
            maxWidth: '28rem',
            width: '100%',
            backgroundColor: '#1a1a1a',
            border: '1px solid #7f1d1d',
            borderRadius: '0.5rem',
            padding: '1.5rem',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>💥</div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f87171', marginBottom: '0.5rem' }}>
              Critical Dashboard Error
            </h2>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1rem' }}>
              The dashboard encountered an unrecoverable error.
            </p>

            <div style={{
              backgroundColor: '#0a0a0a',
              border: '1px solid #333',
              borderRadius: '0.375rem',
              padding: '0.75rem',
              marginBottom: '1rem',
              textAlign: 'left',
            }}>
              <p style={{ fontSize: '0.625rem', color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                Error Message
              </p>
              <p style={{ fontSize: '0.75rem', color: '#fca5a5', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {error.message || 'Unknown error'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={reset}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: 'rgba(20, 83, 45, 0.5)',
                  color: '#4ade80',
                  border: '1px solid #166534',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#374151',
                  color: '#d1d5db',
                  border: 'none',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
