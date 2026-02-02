#!/bin/bash
# Nightly Build Scheduler Control Script

PLIST_PATH="$HOME/Library/LaunchAgents/com.insomnia.nightly-builds.plist"
SCHEDULER_SCRIPT="$HOME/Documents/insomnia/bridge/dashboard/nightly-scheduler.js"
LOG_PATH="$HOME/Documents/insomnia/bridge/nightly-scheduler.log"

case "$1" in
  start)
    echo "Loading nightly builds scheduler..."
    launchctl load "$PLIST_PATH" 2>/dev/null
    if [ $? -eq 0 ]; then
      echo "✓ Scheduler started"
      echo "  Checking every 15 minutes for scheduled builds"
    else
      echo "✗ Failed to start scheduler (may already be running)"
    fi
    ;;

  stop)
    echo "Stopping nightly builds scheduler..."
    launchctl unload "$PLIST_PATH" 2>/dev/null
    if [ $? -eq 0 ]; then
      echo "✓ Scheduler stopped"
    else
      echo "✗ Failed to stop scheduler"
    fi
    ;;

  restart)
    echo "Restarting nightly builds scheduler..."
    launchctl unload "$PLIST_PATH" 2>/dev/null
    sleep 1
    launchctl load "$PLIST_PATH"
    echo "✓ Scheduler restarted"
    ;;

  status)
    if launchctl list | grep -q "com.insomnia.nightly-builds"; then
      echo "✓ Scheduler is running"
      launchctl list | grep com.insomnia.nightly-builds
      echo ""
      echo "Recent activity:"
      tail -10 "$LOG_PATH" 2>/dev/null || echo "  No logs yet"
    else
      echo "✗ Scheduler is not running"
    fi
    ;;

  logs)
    if [ -f "$LOG_PATH" ]; then
      tail -f "$LOG_PATH"
    else
      echo "No logs yet"
    fi
    ;;

  test)
    echo "Running scheduler check manually..."
    node "$SCHEDULER_SCRIPT"
    ;;

  *)
    echo "Nightly Build Scheduler Control"
    echo ""
    echo "Usage: $0 {start|stop|restart|status|logs|test}"
    echo ""
    echo "Commands:"
    echo "  start    - Start the scheduler (runs every 15 min)"
    echo "  stop     - Stop the scheduler"
    echo "  restart  - Restart the scheduler"
    echo "  status   - Check if scheduler is running"
    echo "  logs     - Tail the scheduler logs"
    echo "  test     - Run a manual scheduler check"
    exit 1
    ;;
esac
