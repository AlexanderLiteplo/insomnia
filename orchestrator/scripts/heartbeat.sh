#!/bin/bash
#
# Heartbeat - Status updates every 30 minutes
# Part of the Claude Manager-Worker System
#
# Sends iMessage updates with:
# - Status of all managed projects (with tasks.json)
# - Recent activity on external projects
# - A random helpful insight from Claude
#

set -e

# === PATHS (Updated for official locations) ===
MANAGER_ROOT="$HOME/Documents/claude-manager"
IMESSAGE_BRIDGE="$HOME/claude-sms-bridge"
PROJECTS_DIR="$MANAGER_ROOT/projects"
EXTERNAL_PROJECTS_FILE="$MANAGER_ROOT/external-projects.json"
HEARTBEAT_LOG="$MANAGER_ROOT/logs/heartbeat.log"

# Ensure log directory exists
mkdir -p "$(dirname "$HEARTBEAT_LOG")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$HEARTBEAT_LOG"
}

# Get human-readable time ago
time_ago() {
    local seconds=$1
    if [[ $seconds -lt 60 ]]; then
        echo "${seconds}s ago"
    elif [[ $seconds -lt 3600 ]]; then
        echo "$((seconds / 60))m ago"
    elif [[ $seconds -lt 86400 ]]; then
        echo "$((seconds / 3600))h ago"
    else
        echo "$((seconds / 86400))d ago"
    fi
}

# Gather status from managed projects (with tasks.json)
gather_managed_status() {
    local status_text=""
    local total_completed=0
    local total_in_progress=0
    local total_pending=0
    local active_instances=0

    if [[ -d "$PROJECTS_DIR" ]]; then
        for project_dir in "$PROJECTS_DIR"/*/; do
            if [[ -d "$project_dir" ]]; then
                local project_name=$(basename "$project_dir")
                local tasks_file="$project_dir/tasks.json"
                local worker_pid_file="$project_dir/.state/worker.pid"

                # Skip if no tasks file
                [[ ! -f "$tasks_file" ]] && continue

                # Get task counts
                local completed=$(jq '[.tasks[] | select(.status == "completed")] | length' "$tasks_file" 2>/dev/null || echo 0)
                local in_progress=$(jq '[.tasks[] | select(.status == "in_progress" or .status == "worker_done")] | length' "$tasks_file" 2>/dev/null || echo 0)
                local pending=$(jq '[.tasks[] | select(.status == "pending")] | length' "$tasks_file" 2>/dev/null || echo 0)
                local total=$((completed + in_progress + pending))

                # Check if worker is running
                local worker_running="stopped"
                if [[ -f "$worker_pid_file" ]]; then
                    local pid=$(cat "$worker_pid_file")
                    if ps -p "$pid" > /dev/null 2>&1; then
                        worker_running="running"
                        ((active_instances++))
                    fi
                fi

                # Get current task if in progress
                local current_task=""
                if [[ $in_progress -gt 0 ]]; then
                    current_task=$(jq -r '.tasks[] | select(.status == "in_progress") | "Task \(.id): \(.name)"' "$tasks_file" 2>/dev/null | head -1)
                fi

                # Calculate progress percentage
                local progress_pct=0
                if [[ $total -gt 0 ]]; then
                    progress_pct=$((completed * 100 / total))
                fi

                # Build status line
                status_text+="📦 $project_name: $completed/$total done ($progress_pct%)"
                if [[ "$worker_running" == "running" ]]; then
                    status_text+=" ✅"
                else
                    status_text+=" ⏸️"
                fi
                if [[ -n "$current_task" && "$worker_running" == "running" ]]; then
                    status_text+="\n   → $current_task"
                fi
                status_text+="\n"

                # Accumulate totals
                total_completed=$((total_completed + completed))
                total_in_progress=$((total_in_progress + in_progress))
                total_pending=$((total_pending + pending))
            fi
        done
    fi

    echo "$total_completed|$total_in_progress|$total_pending|$active_instances|$status_text"
}

# Gather status from external projects (recently modified)
gather_external_status() {
    local status_text=""
    local recent_count=0
    local now=$(date +%s)
    local day_seconds=86400

    if [[ -f "$EXTERNAL_PROJECTS_FILE" ]]; then
        # Get projects modified in last 24 hours
        while IFS= read -r project_json; do
            local name=$(echo "$project_json" | jq -r '.name')
            local path=$(echo "$project_json" | jq -r '.path')

            if [[ -d "$path" ]]; then
                # Quick check: use directory modification time or .git/index if exists
                local last_modified=""
                if [[ -f "$path/.git/index" ]]; then
                    last_modified=$(stat -f %m "$path/.git/index" 2>/dev/null)
                else
                    last_modified=$(stat -f %m "$path" 2>/dev/null)
                fi

                if [[ -n "$last_modified" ]]; then
                    local age=$((now - last_modified))

                    # Only show if modified in last 24 hours
                    if [[ $age -lt $day_seconds ]]; then
                        local time_str=$(time_ago $age)
                        status_text+="  • $name ($time_str)\n"
                        ((recent_count++))
                    fi
                fi
            fi
        done < <(jq -c '.projects[]' "$EXTERNAL_PROJECTS_FILE" 2>/dev/null)
    fi

    echo "$recent_count|$status_text"
}

# Gather full status
gather_status() {
    # Get managed project status
    local managed_result=$(gather_managed_status)
    local total_completed=$(echo "$managed_result" | cut -d'|' -f1)
    local total_in_progress=$(echo "$managed_result" | cut -d'|' -f2)
    local total_pending=$(echo "$managed_result" | cut -d'|' -f3)
    local active_instances=$(echo "$managed_result" | cut -d'|' -f4)
    local managed_status=$(echo "$managed_result" | cut -d'|' -f5-)

    # Get external project status
    local external_result=$(gather_external_status)
    local recent_external=$(echo "$external_result" | cut -d'|' -f1)
    local external_status=$(echo "$external_result" | cut -d'|' -f2-)

    # Build summary
    local total_tasks=$((total_completed + total_in_progress + total_pending))
    local summary="🤖 Claude Manager Heartbeat\n"
    summary+="━━━━━━━━━━━━━━━━━━━━━━\n"
    summary+="⏰ $(date '+%H:%M %b %d')\n"

    if [[ $total_tasks -gt 0 ]]; then
        summary+="📊 Managed: $total_completed/$total_tasks tasks ($active_instances active)\n"
    fi

    if [[ $recent_external -gt 0 ]]; then
        summary+="🔧 External: $recent_external projects active today\n"
    fi

    summary+="\n"

    # Add managed projects section
    if [[ -n "$managed_status" ]]; then
        summary+="$managed_status"
    fi

    # Add external projects section (only if there's recent activity)
    if [[ $recent_external -gt 0 && -n "$external_status" ]]; then
        summary+="\n📂 Recent Activity:\n"
        summary+="$external_status"
    fi

    if [[ -z "$managed_status" && $recent_external -eq 0 ]]; then
        summary+="No active projects.\n"
    fi

    echo -e "$summary"
}

# Generate random insight using Claude
generate_insight() {
    local status="$1"

    # Create a prompt for Claude to generate something helpful
    local prompt="You are a helpful AI assistant monitoring autonomous build systems. Based on the current status, generate ONE short, useful insight. Pick randomly from these categories:

1. Security tip relevant to the projects being built
2. Productivity suggestion for the build system
3. Fun fact about software engineering or AI
4. A micro-feature idea that could help audit/monitor the system
5. An encouraging message about progress

Current System Status:
$status

Respond with ONLY the insight (1-2 sentences max). Start with an appropriate emoji. Be concise - this goes in an iMessage."

    # Run Claude to generate insight (using haiku for speed/cost)
    local insight=$(echo "$prompt" | claude --model haiku --print 2>/dev/null | tail -5 | head -1)

    # Fallback if Claude fails
    if [[ -z "$insight" || "$insight" == *"error"* ]]; then
        local fallbacks=(
            "💡 Tip: Consider adding integration tests to catch regressions early."
            "🔒 Security: Remember to rotate API keys periodically."
            "🚀 Progress is progress, no matter how small!"
            "📝 Audit idea: Log all task transitions with timestamps."
            "🎯 Fun fact: The first computer bug was an actual bug (a moth) found in 1947."
        )
        insight="${fallbacks[$RANDOM % ${#fallbacks[@]}]}"
    fi

    echo "$insight"
}

# Send the heartbeat message
send_heartbeat() {
    log "Gathering status..."
    local status=$(gather_status)

    log "Generating insight..."
    local insight=$(generate_insight "$status")

    # Combine into final message
    local message="$status\n━━━━━━━━━━━━━━━━━━━━━━\n$insight"

    log "Sending heartbeat..."

    # Send via iMessage bridge
    if [[ -f "$IMESSAGE_BRIDGE/dist/send-cli.js" ]]; then
        cd "$IMESSAGE_BRIDGE"
        node dist/send-cli.js "$(echo -e "$message")"
        log "Heartbeat sent successfully"
    else
        log "ERROR: iMessage bridge not found at $IMESSAGE_BRIDGE/dist/send-cli.js"
        echo -e "$message"
    fi
}

# Daemon mode - run every 30 minutes
run_daemon() {
    local interval="${1:-1800}"  # Default 30 minutes (1800 seconds)

    log "Starting heartbeat daemon (interval: ${interval}s)"

    while true; do
        send_heartbeat
        log "Next heartbeat in ${interval}s"
        sleep "$interval"
    done
}

# Main
case "${1:-}" in
    daemon)
        run_daemon "${2:-1800}"
        ;;
    once|"")
        send_heartbeat
        ;;
    status)
        gather_status
        ;;
    *)
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  once      Send a single heartbeat (default)"
        echo "  daemon    Run continuously, sending every 30 minutes"
        echo "  status    Just print status without sending"
        echo ""
        echo "Examples:"
        echo "  $0                    # Send single heartbeat"
        echo "  $0 daemon             # Run daemon (30 min interval)"
        echo "  $0 daemon 900         # Run daemon (15 min interval)"
        ;;
esac
