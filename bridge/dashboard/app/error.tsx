'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console for debugging
    console.error('Dashboard Error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] p-4">
      <div className="max-w-md w-full bg-[#1a1a1a] border border-red-900/50 rounded-lg p-6 text-center">
        <div className="text-4xl mb-4">💥</div>
        <h2 className="text-xl font-semibold text-red-400 mb-2">Dashboard Crashed</h2>
        <p className="text-gray-400 text-sm mb-4">
          Something went wrong. The error has been logged.
        </p>

        <div className="bg-[#0a0a0a] border border-[#333] rounded p-3 mb-4 text-left">
          <p className="text-[10px] text-gray-500 uppercase mb-1">Error Message</p>
          <p className="text-xs text-red-300 font-mono break-all">
            {error.message || 'Unknown error'}
          </p>
          {error.digest && (
            <>
              <p className="text-[10px] text-gray-500 uppercase mt-2 mb-1">Digest</p>
              <p className="text-xs text-gray-400 font-mono">{error.digest}</p>
            </>
          )}
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-green-900/50 hover:bg-green-900/70 text-green-400 border border-green-800 rounded text-sm transition-colors"
          >
            Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm transition-colors"
          >
            Reload Page
          </button>
        </div>

        <p className="text-[10px] text-gray-600 mt-4">
          If the problem persists, check the browser console or server logs.
        </p>
      </div>
    </div>
  );
}
