#!/bin/bash
# Start script for iMessage Bridge with caffeinate to prevent sleep

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRIDGE_DIR="$(dirname "$SCRIPT_DIR")"

cd "$BRIDGE_DIR"

# Kill any existing caffeinate from previous bridge runs (tagged with comment)
pkill -f "caffeinate.*imessage-bridge" 2>/dev/null

# Start caffeinate to prevent sleep (-d: display, -i: idle, -s: system)
# The comment helps identify this specific caffeinate instance
caffeinate -d -i -s -w $$ &
CAFFEINATE_PID=$!

echo "☕ Caffeinate started (PID: $CAFFEINATE_PID)"
echo "🚀 Starting iMessage Bridge..."

# Run the server (caffeinate will stop when this script exits)
exec node dist/server.js
