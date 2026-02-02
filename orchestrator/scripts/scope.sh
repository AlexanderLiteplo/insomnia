#!/bin/bash
# scope.sh - Manager creates a scoping document from a project idea
# Usage: ./scope.sh "project idea or description"

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORCHESTRATOR_DIR="$(dirname "$SCRIPT_DIR")"
SCOPING_DIR="$ORCHESTRATOR_DIR/scoping"
MANAGER_MODEL="${MANAGER_MODEL:-opus}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${BLUE}[SCOPE]${NC} $1"; }
success() { echo -e "${GREEN}[SCOPE]${NC} $1"; }
warn() { echo -e "${YELLOW}[SCOPE]${NC} $1"; }
error() { echo -e "${RED}[SCOPE]${NC} $1"; }

# Check for project idea
if [ -z "$1" ]; then
    error "Usage: ./scope.sh \"project idea or description\""
    error "Example: ./scope.sh \"Build a CLI tool that converts markdown to PDF\""
    exit 1
fi

PROJECT_IDEA="$1"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create scoping directory if it doesn't exist
mkdir -p "$SCOPING_DIR"

# Generate a slug from the project idea (first 3 words, lowercase, hyphens)
PROJECT_SLUG=$(echo "$PROJECT_IDEA" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | cut -c1-50 | sed 's/-$//')

SCOPE_FILE="$SCOPING_DIR/${PROJECT_SLUG}_scope_${TIMESTAMP}.md"
PROMPT_FILE="$SCOPING_DIR/.current_scope_prompt.md"

log "Creating scoping document for: $PROJECT_IDEA"
log "Using model: $MANAGER_MODEL"

# Build the scoping prompt
cat > "$PROMPT_FILE" << 'PROMPT_END'
You are a technical product manager creating a scoping document for a new project.

## Project Idea
PROJECT_IDEA_PLACEHOLDER

## Your Task
Create a comprehensive scoping document that includes:

### 1. Project Overview
- Clear project name (short, memorable)
- One-paragraph description of what it does
- Target users/audience
- Core value proposition

### 2. Problem Statement
- What problem does this solve?
- Why is this problem worth solving?
- What's the current alternative (if any)?

### 3. Core Features (MVP)
List 3-7 essential features for a minimum viable product:
- Feature name: Brief description
- Priority: Must-have / Should-have / Nice-to-have

### 4. Technical Approach
- Recommended tech stack (be specific)
- Architecture overview (keep it simple)
- Key technical decisions and why
- External dependencies or APIs needed

### 5. Success Criteria
- How do we know when this is "done"?
- What metrics matter?
- Definition of MVP complete

### 6. Out of Scope (for MVP)
- What are we explicitly NOT building in v1?
- Future considerations

### 7. Risks & Unknowns
- Technical risks
- Dependencies on external services
- Open questions that need answers

### 8. Estimated Complexity
Rate overall complexity: Simple / Medium / Complex
- Estimated number of tasks: X-Y tasks
- Key implementation challenges

Write the scoping document now. Be specific and actionable. This document will be used to generate the task list for implementation.
PROMPT_END

# Replace placeholder with actual project idea
sed -i '' "s|PROJECT_IDEA_PLACEHOLDER|$PROJECT_IDEA|g" "$PROMPT_FILE"

log "Invoking Claude to create scoping document..."

# Run Claude to generate the scoping document
claude --model "$MANAGER_MODEL" --print "$(cat "$PROMPT_FILE")" > "$SCOPE_FILE" 2>&1

if [ $? -eq 0 ]; then
    success "Scoping document created: $SCOPE_FILE"
    echo ""
    log "Preview (first 50 lines):"
    echo "---"
    head -50 "$SCOPE_FILE"
    echo "---"
    echo ""
    success "Full document saved to: $SCOPE_FILE"
    log "Next step: Run ./scripts/generate-prd.sh \"$SCOPE_FILE\" to create tasks.json"
else
    error "Failed to generate scoping document"
    exit 1
fi
