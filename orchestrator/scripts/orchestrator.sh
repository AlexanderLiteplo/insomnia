#!/bin/bash
#
# Orchestrator - Runs Worker and Manager Claude Together
# Part of the Claude Manager-Worker System
#
# This script launches both the Worker and Manager in parallel,
# coordinating the PRD implementation loop.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BRIDGE_CONFIG="$HOME/claude-automation-system/bridge/config.json"

# Read model from bridge config if available
get_model_from_config() {
    local key="$1"
    local default="$2"
    if [ -f "$BRIDGE_CONFIG" ] && command -v jq &> /dev/null; then
        local value=$(jq -r ".models.$key // empty" "$BRIDGE_CONFIG" 2>/dev/null)
        if [ -n "$value" ] && [ "$value" != "null" ]; then
            echo "$value"
            return
        fi
    fi
    echo "$default"
}

# Configuration - read from bridge config first, then env, then defaults
export MAX_ITERATIONS="${MAX_ITERATIONS:-1000}"
export WORKER_MODEL="${WORKER_MODEL:-$(get_model_from_config orchestratorWorker opus)}"
export MANAGER_MODEL="${MANAGER_MODEL:-$(get_model_from_config orchestratorManager opus)}"
export ITERATION_DELAY="${ITERATION_DELAY:-5}"
export REVIEW_INTERVAL="${REVIEW_INTERVAL:-60}"
export PROJECT_OUTPUT_DIR="${PROJECT_OUTPUT_DIR:-$HOME/Documents}"

# State
STATE_DIR="$PROJECT_ROOT/.state"
WORKER_PID_FILE="$STATE_DIR/worker.pid"
MANAGER_PID_FILE="$STATE_DIR/manager.pid"

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
   _____ _                 _        __  __
  / ____| |               | |      |  \/  |
 | |    | | __ _ _   _  __| | ___  | \  / | __ _ _ __   __ _  __ _  ___ _ __
 | |    | |/ _` | | | |/ _` |/ _ \ | |\/| |/ _` | '_ \ / _` |/ _` |/ _ \ '__|
 | |____| | (_| | |_| | (_| |  __/ | |  | | (_| | | | | (_| | (_| |  __/ |
  \_____|_|\__,_|\__,_|\__,_|\___| |_|  |_|\__,_|_| |_|\__,_|\__, |\___|_|
                                                              __/ |
 __          __        _              _____           _      |___/
 \ \        / /       | |            / ____|         | |
  \ \  /\  / /__  _ __| | _____ _ __| (___  _   _ ___| |_ ___ _ __ ___
   \ \/  \/ / _ \| '__| |/ / _ \ '__|\___ \| | | / __| __/ _ \ '_ ` _ \
    \  /\  / (_) | |  |   <  __/ |   ____) | |_| \__ \ ||  __/ | | | | |
     \/  \/ \___/|_|  |_|\_\___|_|  |_____/ \__, |___/\__\___|_| |_| |_|
                                             __/ |
                                            |___/
EOF
    echo -e "${NC}"
    echo -e "${GREEN}Autonomous PRD Implementation with Quality Oversight${NC}"
    echo ""
}

usage() {
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  start       Start both Worker and Manager Claude"
    echo "  stop        Stop both Worker and Manager Claude"
    echo "  status      Show status of Worker and Manager"
    echo "  worker      Start only Worker Claude"
    echo "  manager     Start only Manager Claude"
    echo "  logs        Tail the logs"
    echo "  clean       Clean all state and output files"
    echo ""
    echo "Options:"
    echo "  --max-iterations N      Maximum worker iterations (default: 1000)"
    echo "  --worker-model MODEL    Model for Worker Claude (default: opus)"
    echo "  --manager-model MODEL   Model for Manager Claude (default: opus)"
    echo "  --review-interval N     Seconds between manager reviews (default: 60)"
    echo "  --project-output-dir D  Directory where projects are created (default: ~/Documents)"
    echo ""
    echo "Examples:"
    echo "  $0 start                         # Start with defaults"
    echo "  $0 start --max-iterations 100    # Run up to 100 iterations"
    echo "  $0 status                        # Check what's running"
    echo "  $0 logs                          # Watch the logs"
    echo ""
}

init() {
    mkdir -p "$STATE_DIR"
    mkdir -p "$PROJECT_ROOT/logs"
    mkdir -p "$PROJECT_ROOT/prds"
    mkdir -p "$PROJECT_ROOT/skills"
    mkdir -p "$PROJECT_ROOT/output"
}

start_worker() {
    echo -e "${BLUE}Starting Worker Claude...${NC}"

    # Check if already running
    if [[ -f "$WORKER_PID_FILE" ]]; then
        local pid=$(cat "$WORKER_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${YELLOW}Worker already running (PID: $pid)${NC}"
            return 1
        fi
    fi

    # Start worker in background
    nohup "$SCRIPT_DIR/worker.sh" > "$PROJECT_ROOT/logs/worker_stdout.log" 2>&1 &
    local pid=$!
    echo "$pid" > "$WORKER_PID_FILE"

    echo -e "${GREEN}Worker started (PID: $pid)${NC}"
}

start_manager() {
    echo -e "${BLUE}Starting Manager Claude...${NC}"

    # Check if already running
    if [[ -f "$MANAGER_PID_FILE" ]]; then
        local pid=$(cat "$MANAGER_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${YELLOW}Manager already running (PID: $pid)${NC}"
            return 1
        fi
    fi

    # Start manager in background
    nohup "$SCRIPT_DIR/manager.sh" > "$PROJECT_ROOT/logs/manager_stdout.log" 2>&1 &
    local pid=$!
    echo "$pid" > "$MANAGER_PID_FILE"

    echo -e "${GREEN}Manager started (PID: $pid)${NC}"
}

stop_worker() {
    if [[ -f "$WORKER_PID_FILE" ]]; then
        local pid=$(cat "$WORKER_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${YELLOW}Stopping Worker (PID: $pid)...${NC}"
            kill "$pid" 2>/dev/null || true
            sleep 2
            kill -9 "$pid" 2>/dev/null || true
        fi
        rm -f "$WORKER_PID_FILE"
        echo -e "${GREEN}Worker stopped${NC}"
    else
        echo -e "${YELLOW}Worker not running${NC}"
    fi
}

stop_manager() {
    if [[ -f "$MANAGER_PID_FILE" ]]; then
        local pid=$(cat "$MANAGER_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${YELLOW}Stopping Manager (PID: $pid)...${NC}"
            kill "$pid" 2>/dev/null || true
            sleep 2
            kill -9 "$pid" 2>/dev/null || true
        fi
        rm -f "$MANAGER_PID_FILE"
        echo -e "${GREEN}Manager stopped${NC}"
    else
        echo -e "${YELLOW}Manager not running${NC}"
    fi
}

show_status() {
    echo -e "${CYAN}=== Claude Manager-Worker Status ===${NC}"
    echo ""

    # Worker status
    echo -e "${BLUE}Worker Claude:${NC}"
    if [[ -f "$WORKER_PID_FILE" ]]; then
        local pid=$(cat "$WORKER_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "  Status: ${GREEN}Running${NC} (PID: $pid)"
            if [[ -f "$STATE_DIR/worker_iteration" ]]; then
                echo -e "  Iteration: $(cat "$STATE_DIR/worker_iteration")"
            fi
            if [[ -f "$STATE_DIR/current_prd" ]]; then
                echo -e "  Current PRD: $(basename "$(cat "$STATE_DIR/current_prd")")"
            fi
        else
            echo -e "  Status: ${RED}Stopped${NC} (stale PID file)"
        fi
    else
        echo -e "  Status: ${YELLOW}Not running${NC}"
    fi

    echo ""

    # Manager status
    echo -e "${BLUE}Manager Claude:${NC}"
    if [[ -f "$MANAGER_PID_FILE" ]]; then
        local pid=$(cat "$MANAGER_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "  Status: ${GREEN}Running${NC} (PID: $pid)"
            if [[ -f "$STATE_DIR/manager_reviews" ]]; then
                echo -e "  Reviews: $(cat "$STATE_DIR/manager_reviews")"
            fi
        else
            echo -e "  Status: ${RED}Stopped${NC} (stale PID file)"
        fi
    else
        echo -e "  Status: ${YELLOW}Not running${NC}"
    fi

    echo ""

    # Task status from JSON
    echo -e "${BLUE}Tasks:${NC}"
    local tasks_file="$PROJECT_ROOT/prds/tasks.json"
    if [[ -f "$tasks_file" ]]; then
        local total_tasks=$(jq '.tasks | length' "$tasks_file")
        local pending=$(jq '[.tasks[] | select(.status == "pending")] | length' "$tasks_file")
        local in_progress=$(jq '[.tasks[] | select(.status == "in_progress" or .status == "worker_done")] | length' "$tasks_file")
        local completed=$(jq '[.tasks[] | select(.status == "completed")] | length' "$tasks_file")
        echo -e "  Total: $total_tasks"
        echo -e "  Pending: $pending"
        echo -e "  In Progress: $in_progress"
        echo -e "  Completed: $completed"
    else
        echo -e "  ${YELLOW}No tasks.json found${NC}"
    fi

    echo ""

    # Skills status
    echo -e "${BLUE}Skills Generated:${NC}"
    local skills_count=$(find "$PROJECT_ROOT/skills" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
    echo -e "  Count: $skills_count"
    if [[ $skills_count -gt 0 ]]; then
        for skill in "$PROJECT_ROOT"/skills/*.md; do
            if [[ -f "$skill" ]]; then
                echo -e "  - $(basename "$skill")"
            fi
        done
    fi
}

tail_logs() {
    echo -e "${CYAN}Tailing logs (Ctrl+C to stop)...${NC}"
    tail -f "$PROJECT_ROOT"/logs/*.log 2>/dev/null || echo "No logs found"
}

clean() {
    echo -e "${YELLOW}Cleaning state and output...${NC}"

    # Stop any running processes first
    stop_worker
    stop_manager

    # Clean directories
    rm -rf "$STATE_DIR"/*
    rm -rf "$PROJECT_ROOT/output"/*
    rm -rf "$PROJECT_ROOT/logs"/*

    # Recreate required directories
    mkdir -p "$STATE_DIR"
    mkdir -p "$PROJECT_ROOT/output"
    mkdir -p "$PROJECT_ROOT/logs"

    echo -e "${GREEN}Clean complete${NC}"
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --max-iterations)
                export MAX_ITERATIONS="$2"
                shift 2
                ;;
            --worker-model)
                export WORKER_MODEL="$2"
                shift 2
                ;;
            --manager-model)
                export MANAGER_MODEL="$2"
                shift 2
                ;;
            --review-interval)
                export REVIEW_INTERVAL="$2"
                shift 2
                ;;
            --project-output-dir)
                export PROJECT_OUTPUT_DIR="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done
}

main() {
    local command="${1:-help}"
    shift || true

    parse_args "$@"
    init

    case "$command" in
        start)
            show_banner
            echo -e "${CYAN}Configuration:${NC}"
            echo -e "  Max Iterations: $MAX_ITERATIONS"
            echo -e "  Worker Model: $WORKER_MODEL"
            echo -e "  Manager Model: $MANAGER_MODEL"
            echo -e "  Review Interval: ${REVIEW_INTERVAL}s"
            echo -e "  Project Output Dir: $PROJECT_OUTPUT_DIR"
            echo ""

            # Check for tasks.json
            local tasks_file="$PROJECT_ROOT/prds/tasks.json"
            if [[ ! -f "$tasks_file" ]]; then
                echo -e "${RED}Error: No tasks.json found at $tasks_file${NC}"
                echo -e "Please create prds/tasks.json with your tasks"
                exit 1
            fi

            local task_count=$(jq '.tasks | length' "$tasks_file")
            local pending_count=$(jq '[.tasks[] | select(.status == "pending")] | length' "$tasks_file")
            echo -e "${GREEN}Found $task_count tasks ($pending_count pending)${NC}"
            echo ""

            start_worker
            sleep 2
            start_manager

            echo ""
            echo -e "${GREEN}System started!${NC}"
            echo -e "Use '$0 status' to check progress"
            echo -e "Use '$0 logs' to watch the logs"
            echo -e "Use '$0 stop' to stop the system"
            ;;
        stop)
            stop_worker
            stop_manager
            ;;
        status)
            show_status
            ;;
        worker)
            start_worker
            ;;
        manager)
            start_manager
            ;;
        logs)
            tail_logs
            ;;
        clean)
            clean
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
