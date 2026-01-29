#!/bin/bash
#
# Project Registry Management
# Tracks multiple claude-manager-worker projects
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REGISTRY="$PROJECT_ROOT/projects.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Ensure registry exists
if [[ ! -f "$REGISTRY" ]]; then
    echo '{"projects": []}' > "$REGISTRY"
fi

usage() {
    echo "Usage: $0 [command] [args]"
    echo ""
    echo "Commands:"
    echo "  list                    List all registered projects"
    echo "  status                  Show status of all projects (for iMessage bridge)"
    echo "  status-json             Show status as JSON (machine readable)"
    echo "  add <name> <tasks_file> Register a new project"
    echo "  remove <name>           Remove a project from registry"
    echo "  start <name>            Start a specific project"
    echo "  stop <name>             Stop a specific project"
    echo ""
}

# Add a project to registry
add_project() {
    local name="$1"
    local tasks_file="$2"

    if [[ -z "$name" || -z "$tasks_file" ]]; then
        echo "Usage: $0 add <name> <tasks_file>"
        exit 1
    fi

    # Expand ~ in path
    tasks_file="${tasks_file/#\~/$HOME}"

    if [[ ! -f "$tasks_file" ]]; then
        echo -e "${RED}Error: Tasks file not found: $tasks_file${NC}"
        exit 1
    fi

    # Check if already exists
    local exists=$(jq -r ".projects[] | select(.name == \"$name\") | .name" "$REGISTRY")
    if [[ -n "$exists" ]]; then
        echo -e "${YELLOW}Project '$name' already registered, updating...${NC}"
        local tmp=$(mktemp)
        jq "(.projects[] | select(.name == \"$name\")) |= {name: \"$name\", tasksFile: \"$tasks_file\", addedAt: \"$(date -Iseconds)\"}" "$REGISTRY" > "$tmp"
        mv "$tmp" "$REGISTRY"
    else
        local tmp=$(mktemp)
        jq ".projects += [{name: \"$name\", tasksFile: \"$tasks_file\", addedAt: \"$(date -Iseconds)\"}]" "$REGISTRY" > "$tmp"
        mv "$tmp" "$REGISTRY"
        echo -e "${GREEN}Added project: $name${NC}"
    fi
}

# Remove a project from registry
remove_project() {
    local name="$1"

    if [[ -z "$name" ]]; then
        echo "Usage: $0 remove <name>"
        exit 1
    fi

    local tmp=$(mktemp)
    jq ".projects |= map(select(.name != \"$name\"))" "$REGISTRY" > "$tmp"
    mv "$tmp" "$REGISTRY"
    echo -e "${GREEN}Removed project: $name${NC}"
}

# List all projects
list_projects() {
    echo -e "${CYAN}=== Registered Projects ===${NC}"
    local count=$(jq '.projects | length' "$REGISTRY")

    if [[ $count -eq 0 ]]; then
        echo "No projects registered"
        return
    fi

    jq -r '.projects[] | "- \(.name): \(.tasksFile)"' "$REGISTRY"
}

# Get status of a single project
get_project_status() {
    local tasks_file="$1"
    tasks_file="${tasks_file/#\~/$HOME}"

    if [[ ! -f "$tasks_file" ]]; then
        echo "not_found"
        return
    fi

    local total=$(jq '.tasks | length' "$tasks_file")
    local pending=$(jq '[.tasks[] | select(.status == "pending")] | length' "$tasks_file")
    local in_progress=$(jq '[.tasks[] | select(.status == "in_progress" or .status == "worker_done")] | length' "$tasks_file")
    local completed=$(jq '[.tasks[] | select(.status == "completed")] | length' "$tasks_file")

    echo "$completed/$total"
}

# Show status of all projects (human readable for iMessage)
show_status() {
    local count=$(jq '.projects | length' "$REGISTRY")

    if [[ $count -eq 0 ]]; then
        echo "No active projects."
        return
    fi

    echo "Project Status:"
    echo ""

    while IFS= read -r project; do
        local name=$(echo "$project" | jq -r '.name')
        local tasks_file=$(echo "$project" | jq -r '.tasksFile')
        tasks_file="${tasks_file/#\~/$HOME}"

        if [[ ! -f "$tasks_file" ]]; then
            echo "- $name: [tasks file missing]"
            continue
        fi

        local total=$(jq '.tasks | length' "$tasks_file")
        local pending=$(jq '[.tasks[] | select(.status == "pending")] | length' "$tasks_file")
        local in_progress=$(jq '[.tasks[] | select(.status == "in_progress" or .status == "worker_done")] | length' "$tasks_file")
        local completed=$(jq '[.tasks[] | select(.status == "completed")] | length' "$tasks_file")
        local project_desc=$(jq -r '.project.description // "No description"' "$tasks_file")

        local status_icon="🔄"
        if [[ $completed -eq $total ]]; then
            status_icon="✅"
        elif [[ $in_progress -gt 0 ]]; then
            status_icon="🔨"
        fi

        echo "$status_icon $name: $completed/$total tasks done"

        # Show current task if in progress
        if [[ $in_progress -gt 0 ]]; then
            local current_task=$(jq -r '.tasks[] | select(.status == "in_progress" or .status == "worker_done") | .name' "$tasks_file" | head -1)
            echo "   └─ Working on: $current_task"
        fi
    done < <(jq -c '.projects[]' "$REGISTRY")
}

# Show status as JSON (for programmatic use)
show_status_json() {
    local output='{"projects":['
    local first=true

    while IFS= read -r project; do
        local name=$(echo "$project" | jq -r '.name')
        local tasks_file=$(echo "$project" | jq -r '.tasksFile')
        tasks_file="${tasks_file/#\~/$HOME}"

        if [[ "$first" == "true" ]]; then
            first=false
        else
            output+=","
        fi

        if [[ ! -f "$tasks_file" ]]; then
            output+="{\"name\":\"$name\",\"status\":\"missing\"}"
            continue
        fi

        local total=$(jq '.tasks | length' "$tasks_file")
        local completed=$(jq '[.tasks[] | select(.status == "completed")] | length' "$tasks_file")
        local in_progress=$(jq '[.tasks[] | select(.status == "in_progress" or .status == "worker_done")] | length' "$tasks_file")
        local current_task=$(jq -r '.tasks[] | select(.status == "in_progress" or .status == "worker_done") | .name' "$tasks_file" 2>/dev/null | head -1)

        output+="{\"name\":\"$name\",\"total\":$total,\"completed\":$completed,\"inProgress\":$in_progress,\"currentTask\":\"$current_task\"}"
    done < <(jq -c '.projects[]' "$REGISTRY")

    output+=']}'
    echo "$output" | jq .
}

# Start a specific project
start_project() {
    local name="$1"

    if [[ -z "$name" ]]; then
        echo "Usage: $0 start <name>"
        exit 1
    fi

    local tasks_file=$(jq -r ".projects[] | select(.name == \"$name\") | .tasksFile" "$REGISTRY")

    if [[ -z "$tasks_file" || "$tasks_file" == "null" ]]; then
        echo -e "${RED}Project not found: $name${NC}"
        exit 1
    fi

    tasks_file="${tasks_file/#\~/$HOME}"

    # Copy tasks file to prds/tasks.json and start
    cp "$tasks_file" "$PROJECT_ROOT/prds/tasks.json"
    "$SCRIPT_DIR/orchestrator.sh" start
}

# Stop current project
stop_project() {
    "$SCRIPT_DIR/orchestrator.sh" stop
}

# Main
case "${1:-}" in
    add)
        add_project "$2" "$3"
        ;;
    remove)
        remove_project "$2"
        ;;
    list)
        list_projects
        ;;
    status)
        show_status
        ;;
    status-json)
        show_status_json
        ;;
    start)
        start_project "$2"
        ;;
    stop)
        stop_project "$2"
        ;;
    help|--help|-h)
        usage
        ;;
    *)
        usage
        exit 1
        ;;
esac
