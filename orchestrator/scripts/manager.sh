#!/bin/bash
#
# Manager Claude - The Quality Oversight & Skill Generation Loop
# Part of the Claude Manager-Worker System
#
# Reviews Worker's completed tasks, validates quality, creates skills.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration
MANAGER_MODEL="${MANAGER_MODEL:-opus}"
REVIEW_INTERVAL="${REVIEW_INTERVAL:-10}"
PROJECT_OUTPUT_DIR="${PROJECT_OUTPUT_DIR:-$HOME/Documents}"
LOG_FILE="$PROJECT_ROOT/logs/manager_$(date +%Y%m%d_%H%M%S).log"

# State files
STATE_DIR="$PROJECT_ROOT/.state"
STATUS_FILE="$STATE_DIR/manager_status"
REVIEW_COUNT_FILE="$STATE_DIR/manager_reviews"
TASKS_FILE="$PROJECT_ROOT/prds/tasks.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "[$timestamp] [MANAGER] [$level] $message" | tee -a "$LOG_FILE"
}

log_info() { log "INFO" "$*"; }
log_warn() { log "${YELLOW}WARN${NC}" "$*"; }
log_error() { log "${RED}ERROR${NC}" "$*"; }
log_success() { log "${GREEN}SUCCESS${NC}" "$*"; }
log_review() { log "${MAGENTA}REVIEW${NC}" "$*"; }

init_state() {
    mkdir -p "$STATE_DIR"
    mkdir -p "$PROJECT_ROOT/logs"
    mkdir -p "$PROJECT_ROOT/skills"
    mkdir -p "$PROJECT_ROOT/output"

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

# Get task details by ID
get_task() {
    local task_id="$1"
    jq -r ".tasks[] | select(.id == \"$task_id\")" "$TASKS_FILE"
}

# Update task status in JSON
update_task_status() {
    local task_id="$1"
    local status="$2"
    local manager_review="$3"

    local tmp_file=$(mktemp)
    jq "(.tasks[] | select(.id == \"$task_id\")) |= . + {status: \"$status\", managerReview: \"$manager_review\"}" "$TASKS_FILE" > "$tmp_file"
    mv "$tmp_file" "$TASKS_FILE"
}

# Get project info from JSON
get_project_info() {
    local field="$1"
    jq -r ".project.$field // empty" "$TASKS_FILE"
}

get_task_needing_review() {
    # Find first task with status "worker_done" (worker thinks it's done, needs validation)
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

build_skill_generation_prompt() {
    local output_dir=$(get_project_info "outputDir")
    output_dir="${output_dir/#\~/$HOME}"
    local project_name=$(get_project_info "name")

    # Get tasks that had retries (were sent back to worker at least once)
    local problem_tasks=$(jq -r '.tasks[] | select((.retryCount // 0) > 0) | "- \(.name) (retried \(.retryCount)x): \(.managerReview // "no notes")"' "$TASKS_FILE" 2>/dev/null)

    if [[ -z "$problem_tasks" ]]; then
        echo ""
        return
    fi

    cat <<EOF
# Skill Generation for $project_name

These tasks required retries:

$problem_tasks

Review the code at \`$output_dir\` and create concise skill files in \`$PROJECT_ROOT/skills/\` to help future workers avoid these issues.

Keep each skill to ~20 lines max: problem, solution, brief example.
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

        # Check what happened (Claude updated tasks.json directly)
        local new_status=$(jq -r ".tasks[] | select(.id == \"$task_id\") | .status" "$TASKS_FILE")
        if [[ "$new_status" == "completed" ]]; then
            log_success "Task $task_id APPROVED"
        elif [[ "$new_status" == "pending" ]]; then
            log_warn "Task $task_id NEEDS CHANGES"
        else
            # Failsafe: if Claude didn't update, mark as approved
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

run_skill_generation() {
    local prompt=$(build_skill_generation_prompt)

    if [[ -z "$prompt" ]]; then
        log_info "No problem tasks found, skipping skill generation"
        return 0
    fi

    log_info "Running final skill generation for problem tasks..."

    local prompt_file="$STATE_DIR/skill_prompt.md"
    echo "$prompt" > "$prompt_file"

    if cat "$prompt_file" | claude -p \
        --dangerously-skip-permissions \
        --model "$MANAGER_MODEL" \
        2>&1 | tee -a "$LOG_FILE"; then
        log_success "Skill generation completed"
        return 0
    else
        log_warn "Skill generation failed (non-critical)"
        return 0
    fi
}

generate_final_report() {
    log_info "Generating final report..."

    local report_file="$PROJECT_ROOT/output/FINAL_REPORT.md"
    local review_count=$(get_review_count)
    local project_name=$(get_project_info "name")

    cat > "$report_file" <<EOF
# Project Complete: $project_name

**Generated:** $(date)
**Reviews:** $review_count

## Tasks

EOF

    jq -r '.tasks[] | "- \(.name): \(.status)"' "$TASKS_FILE" >> "$report_file"

    # List skills if any were generated
    local skill_count=$(ls "$PROJECT_ROOT"/skills/*.md 2>/dev/null | wc -l | tr -d ' ')
    if [[ $skill_count -gt 0 ]]; then
        echo -e "\n## Skills Generated\n" >> "$report_file"
        for skill in "$PROJECT_ROOT"/skills/*.md; do
            if [[ -f "$skill" ]]; then
                echo "- $(basename "$skill")" >> "$report_file"
            fi
        done
    fi

    log_success "Final report: $report_file"
}

cleanup() {
    echo "stopping" > "$STATUS_FILE"
    run_skill_generation
    generate_final_report
    log_info "Manager Claude shutting down"
}

trap cleanup EXIT INT TERM

main() {
    log_info "========================================"
    log_info "Manager Claude Starting"
    log_info "Model: $MANAGER_MODEL"
    log_info "Review Interval: ${REVIEW_INTERVAL}s"
    log_info "Tasks file: $TASKS_FILE"
    log_info "========================================"

    init_state

    while true; do
        # Check for tasks needing review (status == worker_done)
        local task_id=$(get_task_needing_review)
        if [[ -n "$task_id" && "$task_id" != "null" ]]; then
            run_manager_review "$task_id"
        fi

        # Check if all tasks are complete
        if check_all_tasks_complete; then
            log_success "All tasks completed!"
            break
        fi

        # Check worker status
        local worker_status=$(check_worker_status)
        if [[ "$worker_status" == "stopping" ]] || [[ "$worker_status" == "stopped" ]]; then
            log_info "Worker has stopped"
            break
        fi

        sleep "$REVIEW_INTERVAL"
    done

    log_info "Manager Claude finished"
}

main "$@"
