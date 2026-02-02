#!/bin/bash
#
# Isolated Worker Claude - For parallel orchestration
# Runs with project-specific state and tasks file
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Get project-specific config from args
PROJECT_NAME="$1"
TASKS_FILE="$2"
TASKS_FILE="${TASKS_FILE/#\~/$HOME}"

# Configuration
MAX_ITERATIONS="${MAX_ITERATIONS:-1000}"
WORKER_MODEL="${WORKER_MODEL:-opus}"
ITERATION_DELAY="${ITERATION_DELAY:-5}"

# Project-specific state
STATE_DIR="$PROJECT_ROOT/.state/$PROJECT_NAME"
ITERATION_FILE="$STATE_DIR/worker_iteration"
STATUS_FILE="$STATE_DIR/worker_status"
CURRENT_TASK_FILE="$STATE_DIR/current_task"
LOG_FILE="$PROJECT_ROOT/logs/$PROJECT_NAME/worker_$(date +%Y%m%d_%H%M%S).log"

mkdir -p "$STATE_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$PROJECT_NAME] [$level] $message" | tee -a "$LOG_FILE"
}

log_info() { log "INFO" "$*"; }
log_warn() { log "WARN" "$*"; }
log_error() { log "ERROR" "$*"; }
log_success() { log "SUCCESS" "$*"; }

init_state() {
    if [[ ! -f "$ITERATION_FILE" ]]; then
        echo "0" > "$ITERATION_FILE"
    fi
    echo "running" > "$STATUS_FILE"
}

get_iteration() {
    cat "$ITERATION_FILE" 2>/dev/null || echo "0"
}

increment_iteration() {
    local current=$(get_iteration)
    echo $((current + 1)) > "$ITERATION_FILE"
}

get_next_task() {
    if [[ ! -f "$TASKS_FILE" ]]; then
        log_error "No tasks.json found at $TASKS_FILE"
        return 1
    fi
    local task_id=$(jq -r '.tasks[] | select(.status == "pending" or .status == "in_progress") | .id' "$TASKS_FILE" | head -1)
    if [[ -z "$task_id" || "$task_id" == "null" ]]; then
        return 1
    fi
    echo "$task_id"
}

get_task() {
    local task_id="$1"
    jq -r ".tasks[] | select(.id == \"$task_id\")" "$TASKS_FILE"
}

update_task_status() {
    local task_id="$1"
    local status="$2"
    local tests_passing="$3"
    local worker_notes="$4"

    local tmp_file=$(mktemp)
    jq "(.tasks[] | select(.id == \"$task_id\")) |= . + {status: \"$status\", testsPassing: $tests_passing, workerNotes: \"$worker_notes\"}" "$TASKS_FILE" > "$tmp_file"
    mv "$tmp_file" "$TASKS_FILE"
}

get_project_info() {
    local field="$1"
    jq -r ".project.$field // empty" "$TASKS_FILE"
}

load_skills() {
    local skills_dir="$PROJECT_ROOT/skills"
    local skills_content=""
    if [[ -d "$skills_dir" ]] && ls "$skills_dir"/*.md 1> /dev/null 2>&1; then
        for skill in "$skills_dir"/*.md; do
            skills_content+="$(cat "$skill")"$'\n\n'
        done
    fi
    echo "$skills_content"
}

build_worker_prompt() {
    local task_id="$1"
    local iteration=$(get_iteration)
    local skills=$(load_skills)

    local task=$(get_task "$task_id")
    local task_name=$(echo "$task" | jq -r '.name')
    local task_desc=$(echo "$task" | jq -r '.description')
    local task_reqs=$(echo "$task" | jq -r '.requirements | join("\n- ")')
    local test_cmd=$(echo "$task" | jq -r '.testCommand // "echo No test command"')
    local manager_review=$(echo "$task" | jq -r '.managerReview // empty')
    local retry_count=$(echo "$task" | jq -r '.retryCount // 0')

    local project_name=$(get_project_info "name")
    local project_desc=$(get_project_info "description")
    local output_dir=$(get_project_info "outputDir")
    output_dir="${output_dir/#\~/$HOME}"

    local feedback_section=""
    if [[ -n "$manager_review" && "$retry_count" -gt 0 ]]; then
        feedback_section="## Manager Feedback (Fix This)
$manager_review

"
    fi

    cat <<EOF
# Worker Claude - Task Implementation

## Task ID: $task_id
## Iteration: $iteration

${feedback_section}## Project: $project_name
**Directory:** $output_dir

## Task: $task_name

$task_desc

### Requirements
- $task_reqs

### Test Command
\`$test_cmd\`

## Instructions

1. Navigate to: \`$output_dir\`
2. Implement the requirements
3. Run: \`$test_cmd\`
4. If tests pass, mark complete with structured notes:
   \`\`\`bash
   jq '(.tasks[] | select(.id == "$task_id")) |= . + {status: "worker_done", testsPassing: true, workerNotes: "STATUS: DONE | IMPLEMENTED: <files changed> | TESTS: <test results> | DECISIONS: <choices made>"}' $TASKS_FILE > /tmp/tasks_tmp.json && mv /tmp/tasks_tmp.json $TASKS_FILE
   \`\`\`

## Worker Notes Format (REQUIRED)
When updating workerNotes, use this structure:
- STATUS: DONE | PARTIAL | BLOCKED
- IMPLEMENTED: List files created/modified
- TESTS: Test results with exit codes
- DECISIONS: Technical choices and why
- ISSUES: Problems encountered (if any)

$skills
EOF
}

run_worker_iteration() {
    local task_id="$1"
    local iteration=$(get_iteration)

    log_info "Starting iteration $iteration for task: $task_id"
    echo "$task_id" > "$CURRENT_TASK_FILE"

    update_task_status "$task_id" "in_progress" "false" ""

    local prompt=$(build_worker_prompt "$task_id")
    local prompt_file="$STATE_DIR/current_prompt.md"
    echo "$prompt" > "$prompt_file"

    log_info "Invoking Claude ($WORKER_MODEL)..."

    if cat "$prompt_file" | claude -p \
        --dangerously-skip-permissions \
        --model "$WORKER_MODEL" \
        2>&1 | tee -a "$LOG_FILE"; then
        log_success "Iteration $iteration completed"
        increment_iteration
        return 0
    else
        log_error "Iteration $iteration failed"
        return 1
    fi
}

check_task_complete() {
    local task_id="$1"
    local status=$(jq -r ".tasks[] | select(.id == \"$task_id\") | .status" "$TASKS_FILE")
    [[ "$status" == "worker_done" || "$status" == "completed" ]]
}

cleanup() {
    echo "stopping" > "$STATUS_FILE"
    log_info "Worker Claude for $PROJECT_NAME shutting down"
}

trap cleanup EXIT INT TERM

main() {
    log_info "========================================"
    log_info "Isolated Worker for: $PROJECT_NAME"
    log_info "Tasks file: $TASKS_FILE"
    log_info "Model: $WORKER_MODEL"
    log_info "========================================"

    init_state

    local consecutive_failures=0
    local max_failures=3

    while true; do
        local iteration=$(get_iteration)

        if [[ $iteration -ge $MAX_ITERATIONS ]]; then
            log_warn "Reached max iterations ($MAX_ITERATIONS)"
            break
        fi

        local task_id
        if ! task_id=$(get_next_task); then
            log_info "No more pending tasks for $PROJECT_NAME"
            break
        fi

        if check_task_complete "$task_id"; then
            log_success "Task $task_id marked done, manager will validate"
            consecutive_failures=0
            continue
        fi

        if run_worker_iteration "$task_id"; then
            consecutive_failures=0
        else
            ((consecutive_failures++))
            log_warn "Consecutive failures: $consecutive_failures"

            if [[ $consecutive_failures -ge $max_failures ]]; then
                log_error "Too many consecutive failures, stopping"
                break
            fi
        fi

        sleep "$ITERATION_DELAY"
    done

    log_info "Worker Claude for $PROJECT_NAME finished"
}

main "$@"
