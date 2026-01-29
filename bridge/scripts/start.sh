#!/bin/bash
# Start script for Claude Automation Bridge (Telegram)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRIDGE_DIR="$(dirname "$SCRIPT_DIR")"

cd "$BRIDGE_DIR"

# Kill any existing caffeinate from previous bridge runs
pkill -f "caffeinate.*bridge" 2>/dev/null

# Start caffeinate to prevent sleep (-d: display, -i: idle, -s: system)
caffeinate -d -i -s -w $$ &
CAFFEINATE_PID=$!

echo "☕ Caffeinate started (PID: $CAFFEINATE_PID)"
echo "🤖 Starting Telegram Bridge..."
exec node dist/telegram-server.js
