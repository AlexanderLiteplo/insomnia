#!/bin/bash
#
# Isolated Manager Claude - For parallel orchestration
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
MANAGER_MODEL="${MANAGER_MODEL:-opus}"
REVIEW_INTERVAL="${REVIEW_INTERVAL:-10}"

# Project-specific state
STATE_DIR="$PROJECT_ROOT/.state/$PROJECT_NAME"
STATUS_FILE="$STATE_DIR/manager_status"
REVIEW_COUNT_FILE="$STATE_DIR/manager_reviews"
LOG_FILE="$PROJECT_ROOT/logs/$PROJECT_NAME/manager_$(date +%Y%m%d_%H%M%S).log"

mkdir -p "$STATE_DIR"
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$PROJECT_ROOT/skills"

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$PROJECT_NAME] [MANAGER] [$level] $message" | tee -a "$LOG_FILE"
}

log_info() { log "INFO" "$*"; }
log_warn() { log "WARN" "$*"; }
log_error() { log "ERROR" "$*"; }
log_success() { log "SUCCESS" "$*"; }
log_review() { log "REVIEW" "$*"; }

init_state() {
    if [[ ! -f "$REVIEW_COUNT_FILE" ]]; then
        echo "0" > "$REVIEW_COUNT_FILE"
    fi
    echo "running" > "$STATUS_FILE"
}

get_review_count() {
    cat "$REVIEW_COUNT_FILE" 2>/dev/null || echo "0"
}

increment_review_count() {
    local current=$(get_review_count)
    echo $((current + 1)) > "$REVIEW_COUNT_FILE"
}

get_task() {
    local task_id="$1"
    jq -r ".tasks[] | select(.id == \"$task_id\")" "$TASKS_FILE"
}

update_task_status() {
    local task_id="$1"
    local status="$2"
    local manager_review="$3"

    local tmp_file=$(mktemp)
    jq "(.tasks[] | select(.id == \"$task_id\")) |= . + {status: \"$status\", managerReview: \"$manager_review\"}" "$TASKS_FILE" > "$tmp_file"
    mv "$tmp_file" "$TASKS_FILE"
}

get_project_info() {
    local field="$1"
    jq -r ".project.$field // empty" "$TASKS_FILE"
}

get_task_needing_review() {
    jq -r '.tasks[] | select(.status == "worker_done") | .id' "$TASKS_FILE" | head -1
}

build_manager_prompt() {
    local task_id="$1"
    local task=$(get_task "$task_id")
    local task_name=$(echo "$task" | jq -r '.name')
    local test_cmd=$(echo "$task" | jq -r '.testCommand // "echo No test"')
    local output_dir=$(get_project_info "outputDir")
    output_dir="${output_dir/#\~/$HOME}"

    cat <<EOF
# Validate: $task_name ($task_id)

Run: \`cd $output_dir && $test_cmd\`

If tests PASS:
\`\`\`bash
jq '(.tasks[] | select(.id == "$task_id")) |= . + {status: "completed", managerReview: "Tests pass"}' $TASKS_FILE > /tmp/tasks_tmp.json && mv /tmp/tasks_tmp.json $TASKS_FILE
\`\`\`

If tests FAIL (update managerReview with 1-2 sentence fix instruction):
\`\`\`bash
jq '(.tasks[] | select(.id == "$task_id")) |= . + {status: "pending", managerReview: "BRIEF_FIX_INSTRUCTION", retryCount: ((.retryCount // 0) + 1)}' $TASKS_FILE > /tmp/tasks_tmp.json && mv /tmp/tasks_tmp.json $TASKS_FILE
\`\`\`

Replace BRIEF_FIX_INSTRUCTION with a short plain-text description of what failed and how to fix. No code blocks, no markdown, under 50 words.
EOF
}

run_manager_review() {
    local task_id="$1"
    local review_count=$(get_review_count)

    log_review "Reviewing task: $task_id (#$review_count)"

    local prompt=$(build_manager_prompt "$task_id")
    local prompt_file="$STATE_DIR/manager_prompt.md"
    echo "$prompt" > "$prompt_file"

    if cat "$prompt_file" | claude -p \
        --dangerously-skip-permissions \
        --model "$MANAGER_MODEL" \
        2>&1 | tee -a "$LOG_FILE"; then
        increment_review_count

        local new_status=$(jq -r ".tasks[] | select(.id == \"$task_id\") | .status" "$TASKS_FILE")
        if [[ "$new_status" == "completed" ]]; then
            log_success "Task $task_id APPROVED"
        elif [[ "$new_status" == "pending" ]]; then
            log_warn "Task $task_id NEEDS CHANGES"
        else
            log_warn "Status unchanged, auto-approving"
            update_task_status "$task_id" "completed" "Auto-approved"
        fi
        return 0
    else
        log_error "Review failed, auto-approving task"
        update_task_status "$task_id" "completed" "Auto-approved (review failed)"
        return 0
    fi
}

check_worker_status() {
    local worker_status="$STATE_DIR/worker_status"
    if [[ -f "$worker_status" ]]; then
        cat "$worker_status"
    else
        echo "unknown"
    fi
}

check_all_tasks_complete() {
    local pending=$(jq -r '.tasks[] | select(.status != "completed") | .id' "$TASKS_FILE" | wc -l | tr -d ' ')
    [[ $pending -eq 0 ]]
}

cleanup() {
    echo "stopping" > "$STATUS_FILE"
    log_info "Manager Claude for $PROJECT_NAME shutting down"
}

trap cleanup EXIT INT TERM

main() {
    log_info "========================================"
    log_info "Isolated Manager for: $PROJECT_NAME"
    log_info "Tasks file: $TASKS_FILE"
    log_info "Model: $MANAGER_MODEL"
    log_info "========================================"

    init_state

    while true; do
        local task_id=$(get_task_needing_review)
        if [[ -n "$task_id" && "$task_id" != "null" ]]; then
            run_manager_review "$task_id"
        fi

        if check_all_tasks_complete; then
            log_success "All tasks completed for $PROJECT_NAME!"
            break
        fi

        local worker_status=$(check_worker_status)
        if [[ "$worker_status" == "stopping" ]] || [[ "$worker_status" == "stopped" ]]; then
            log_info "Worker for $PROJECT_NAME has stopped"
            break
        fi

        sleep "$REVIEW_INTERVAL"
    done

    log_info "Manager Claude for $PROJECT_NAME finished"
}

main "$@"
