#!/bin/bash
# new-project.sh - Complete flow from project idea to ready-to-build PRD
# Usage: ./new-project.sh "project idea" [output-dir]
#
# This script:
# 1. Creates a scoping document from your idea (Manager)
# 2. Generates tasks.json from the scoping doc (Manager)
# 3. Optionally starts the orchestrator to build it

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORCHESTRATOR_DIR="$(dirname "$SCRIPT_DIR")"
MANAGER_MODEL="${MANAGER_MODEL:-opus}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${BLUE}[NEW]${NC} $1"; }
success() { echo -e "${GREEN}[NEW]${NC} $1"; }
warn() { echo -e "${YELLOW}[NEW]${NC} $1"; }
error() { echo -e "${RED}[NEW]${NC} $1"; }
header() { echo -e "\n${CYAN}═══════════════════════════════════════════════════════════${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}\n"; }

# Check for project idea
if [ -z "$1" ]; then
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║          🚀 Insomnia Project Generator 🚀                 ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Usage: ./new-project.sh \"project idea\" [output-dir]"
    echo ""
    echo "Examples:"
    echo "  ./new-project.sh \"Build a CLI that converts markdown to PDF\""
    echo "  ./new-project.sh \"Create a Next.js dashboard for tracking habits\" ~/Documents/habit-tracker"
    echo "  ./new-project.sh \"iOS app for taking passport photos with proper dimensions\""
    echo ""
    echo "This will:"
    echo "  1. 📋 Create a detailed scoping document"
    echo "  2. 📝 Generate tasks.json with actionable tasks"
    echo "  3. 🔧 Register the project for the orchestrator"
    echo ""
    exit 1
fi

PROJECT_IDEA="$1"
OUTPUT_DIR="${2:-}"

header "Step 1: Creating Scoping Document"
log "Project Idea: $PROJECT_IDEA"

# Run the scoping script and capture the scope file path
SCOPE_OUTPUT=$("$SCRIPT_DIR/scope.sh" "$PROJECT_IDEA" 2>&1)
echo "$SCOPE_OUTPUT"

# Extract the scope file path from output
SCOPE_FILE=$(echo "$SCOPE_OUTPUT" | grep "Full document saved to:" | sed 's/.*saved to: //')

if [ -z "$SCOPE_FILE" ] || [ ! -f "$SCOPE_FILE" ]; then
    error "Failed to create scoping document"
    exit 1
fi

success "Scoping document ready!"

header "Step 2: Generating Tasks (PRD)"

# Run the PRD generation script
if [ -n "$OUTPUT_DIR" ]; then
    "$SCRIPT_DIR/generate-prd.sh" "$SCOPE_FILE" "$OUTPUT_DIR"
else
    "$SCRIPT_DIR/generate-prd.sh" "$SCOPE_FILE"
fi

header "🎉 Project Ready!"

echo ""
log "Your project has been scoped and tasks have been generated."
log "The Worker/Manager system can now build it autonomously."
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "  1. Review the generated tasks.json"
echo "  2. Copy to active: cp prds/<project>_tasks.json prds/tasks.json"
echo "  3. Start building: ./scripts/orchestrator.sh start"
echo ""
echo -e "${YELLOW}Or run in parallel with other projects:${NC}"
echo "  ./scripts/projects.sh start <project-name>"
echo ""
