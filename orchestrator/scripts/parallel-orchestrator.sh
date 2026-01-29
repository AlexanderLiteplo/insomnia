#!/bin/bash
#
# Parallel Orchestrator - Runs multiple projects concurrently
# Each project gets its own isolated Worker and Manager Claude pair
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REGISTRY="$PROJECT_ROOT/projects.json"

# Configuration
export WORKER_MODEL="${WORKER_MODEL:-opus}"
export MANAGER_MODEL="${MANAGER_MODEL:-opus}"
export MAX_ITERATIONS="${MAX_ITERATIONS:-1000}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

show_banner() {
    echo -e "${CYAN}"
    cat << 'EOF'
  ____                 _ _      _    ___           _               _             _
 |  _ \ __ _ _ __ __ _| | | ___| |  / _ \ _ __ ___| |__   ___  ___| |_ _ __ __ _| |_ ___  _ __
 | |_) / _` | '__/ _` | | |/ _ \ | | | | | '__/ __| '_ \ / _ \/ __| __| '__/ _` | __/ _ \| '__|
 |  __/ (_| | | | (_| | | |  __/ | | |_| | | | (__| | | |  __/\__ \ |_| | | (_| | || (_) | |
 |_|   \__,_|_|  \__,_|_|_|\___|_|  \___/|_|  \___|_| |_|\___||___/\__|_|  \__,_|\__\___/|_|
EOF
    echo -e "${NC}"
    echo -e "${GREEN}Run multiple projects in parallel with isolated worker/manager pairs${NC}"
    echo ""
}

usage() {
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  start [project1 project2...]  Start projects in parallel (default: all incomplete)"
    echo "  stop                          Stop all running projects"
    echo "  status                        Show status of all projects"
    echo ""
    echo "Options:"
    echo "  --max-concurrent N    Maximum concurrent projects (default: unlimited)"
    echo ""
}

# Ensure project has isolated state directory
ensure_project_state() {
    local project_name="$1"
    local state_dir="$PROJECT_ROOT/.state/$project_name"
    mkdir -p "$state_dir"
    mkdir -p "$PROJECT_ROOT/logs/$project_name"
    echo "$state_dir"
}

# Start a single project with isolated environment
start_project() {
    local project_name="$1"
    local tasks_file="$2"
    tasks_file="${tasks_file/#\~/$HOME}"

    if [[ ! -f "$tasks_file" ]]; then
        echo -e "${RED}Tasks file not found for $project_name: $tasks_file${NC}"
        return 1
    fi

    # Check if project is already complete
    local completed=$(jq '[.tasks[] | select(.status == "completed")] | length' "$tasks_file")
    local total=$(jq '.tasks | length' "$tasks_file")

    if [[ $completed -eq $total ]]; then
        echo -e "${GREEN}✓ $project_name is already complete ($completed/$total)${NC}"
        return 0
    fi

    local state_dir=$(ensure_project_state "$project_name")
    local worker_pid_file="$state_dir/worker.pid"
    local manager_pid_file="$state_dir/manager.pid"

    # Check if already running
    if [[ -f "$worker_pid_file" ]]; then
        local pid=$(cat "$worker_pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${YELLOW}$project_name already running (Worker PID: $pid)${NC}"
            return 0
        fi
    fi

    echo -e "${BLUE}Starting $project_name...${NC}"

    # Start isolated worker for this project
    (
        export TASKS_FILE="$tasks_file"
        export STATE_DIR="$state_dir"
        export LOG_FILE="$PROJECT_ROOT/logs/$project_name/worker_$(date +%Y%m%d_%H%M%S).log"
        nohup "$SCRIPT_DIR/worker-isolated.sh" "$project_name" "$tasks_file" > "$PROJECT_ROOT/logs/$project_name/worker_stdout.log" 2>&1 &
        echo $! > "$worker_pid_file"
    )

    sleep 1

    # Start isolated manager for this project
    (
        export TASKS_FILE="$tasks_file"
        export STATE_DIR="$state_dir"
        export LOG_FILE="$PROJECT_ROOT/logs/$project_name/manager_$(date +%Y%m%d_%H%M%S).log"
        nohup "$SCRIPT_DIR/manager-isolated.sh" "$project_name" "$tasks_file" > "$PROJECT_ROOT/logs/$project_name/manager_stdout.log" 2>&1 &
        echo $! > "$manager_pid_file"
    )

    local worker_pid=$(cat "$worker_pid_file")
    local manager_pid=$(cat "$manager_pid_file")
    echo -e "${GREEN}✓ $project_name started (Worker: $worker_pid, Manager: $manager_pid)${NC}"
}

# Stop a single project
stop_project() {
    local project_name="$1"
    local state_dir="$PROJECT_ROOT/.state/$project_name"

    if [[ ! -d "$state_dir" ]]; then
        return 0
    fi

    for pid_file in "$state_dir"/*.pid; do
        if [[ -f "$pid_file" ]]; then
            local pid=$(cat "$pid_file")
            if kill -0 "$pid" 2>/dev/null; then
                kill "$pid" 2>/dev/null || true
                sleep 1
                kill -9 "$pid" 2>/dev/null || true
            fi
            rm -f "$pid_file"
        fi
    done
    echo -e "${GREEN}Stopped $project_name${NC}"
}

# Stop all projects
stop_all() {
    echo -e "${YELLOW}Stopping all projects...${NC}"

    if [[ -d "$PROJECT_ROOT/.state" ]]; then
        for project_dir in "$PROJECT_ROOT/.state"/*/; do
            if [[ -d "$project_dir" ]]; then
                local project_name=$(basename "$project_dir")
                stop_project "$project_name"
            fi
        done
    fi

    echo -e "${GREEN}All projects stopped${NC}"
}

# Start all incomplete projects
start_all() {
    show_banner

    local count=$(jq '.projects | length' "$REGISTRY")

    if [[ $count -eq 0 ]]; then
        echo -e "${YELLOW}No projects registered${NC}"
        return
    fi

    echo -e "${CYAN}Starting all incomplete projects in parallel...${NC}"
    echo ""

    while IFS= read -r project; do
        local name=$(echo "$project" | jq -r '.name')
        local tasks_file=$(echo "$project" | jq -r '.tasksFile')
        start_project "$name" "$tasks_file"
    done < <(jq -c '.projects[]' "$REGISTRY")

    echo ""
    echo -e "${GREEN}Parallel orchestration started!${NC}"
    echo -e "Use '$0 status' to check progress"
    echo -e "Use '$0 stop' to stop all projects"
}

# Start specific projects
start_specific() {
    show_banner

    for project_name in "$@"; do
        local tasks_file=$(jq -r ".projects[] | select(.name == \"$project_name\") | .tasksFile" "$REGISTRY")

        if [[ -z "$tasks_file" || "$tasks_file" == "null" ]]; then
            echo -e "${RED}Project not found: $project_name${NC}"
            continue
        fi

        start_project "$project_name" "$tasks_file"
    done
}

# Show status of all projects
show_status() {
    echo -e "${CYAN}=== Parallel Orchestrator Status ===${NC}"
    echo ""

    local count=$(jq '.projects | length' "$REGISTRY")

    if [[ $count -eq 0 ]]; then
        echo "No projects registered"
        return
    fi

    while IFS= read -r project; do
        local name=$(echo "$project" | jq -r '.name')
        local tasks_file=$(echo "$project" | jq -r '.tasksFile')
        tasks_file="${tasks_file/#\~/$HOME}"
        local state_dir="$PROJECT_ROOT/.state/$name"

        # Get task counts
        if [[ -f "$tasks_file" ]]; then
            local total=$(jq '.tasks | length' "$tasks_file")
            local completed=$(jq '[.tasks[] | select(.status == "completed")] | length' "$tasks_file")
            local in_progress=$(jq '[.tasks[] | select(.status == "in_progress" or .status == "worker_done")] | length' "$tasks_file")
            local percent=$((completed * 100 / total))
        else
            local total=0 completed=0 in_progress=0 percent=0
        fi

        # Check process status
        local worker_status="stopped"
        local manager_status="stopped"

        if [[ -f "$state_dir/worker.pid" ]]; then
            local pid=$(cat "$state_dir/worker.pid")
            if kill -0 "$pid" 2>/dev/null; then
                worker_status="running"
            fi
        fi

        if [[ -f "$state_dir/manager.pid" ]]; then
            local pid=$(cat "$state_dir/manager.pid")
            if kill -0 "$pid" 2>/dev/null; then
                manager_status="running"
            fi
        fi

        # Display status
        if [[ $completed -eq $total ]]; then
            echo -e "${GREEN}✓ $name: $completed/$total (100%)${NC}"
        elif [[ "$worker_status" == "running" ]]; then
            echo -e "${BLUE}🔄 $name: $completed/$total ($percent%) - Worker: $worker_status, Manager: $manager_status${NC}"
            if [[ $in_progress -gt 0 ]]; then
                local current_task=$(jq -r '.tasks[] | select(.status == "in_progress") | .name' "$tasks_file" | head -1)
                echo -e "   └─ Working on: $current_task"
            fi
        else
            echo -e "${YELLOW}⏸ $name: $completed/$total ($percent%) - Paused${NC}"
        fi

    done < <(jq -c '.projects[]' "$REGISTRY")
}

# Main
main() {
    local command="${1:-help}"
    shift || true

    case "$command" in
        start)
            if [[ $# -gt 0 ]]; then
                start_specific "$@"
            else
                start_all
            fi
            ;;
        stop)
            stop_all
            ;;
        status)
            show_status
            ;;
        help|--help|-h)
            show_banner
            usage
            ;;
        *)
            echo -e "${RED}Unknown command: $command${NC}"
            usage
            exit 1
            ;;
    esac
}

main "$@"
