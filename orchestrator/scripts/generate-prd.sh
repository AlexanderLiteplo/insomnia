#!/bin/bash
# generate-prd.sh - Translates a scoping document into tasks.json (PRD)
# Usage: ./generate-prd.sh <scope-file.md> [output-dir]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORCHESTRATOR_DIR="$(dirname "$SCRIPT_DIR")"
MANAGER_MODEL="${MANAGER_MODEL:-opus}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${BLUE}[PRD]${NC} $1"; }
success() { echo -e "${GREEN}[PRD]${NC} $1"; }
warn() { echo -e "${YELLOW}[PRD]${NC} $1"; }
error() { echo -e "${RED}[PRD]${NC} $1"; }

# Check for scope file
if [ -z "$1" ]; then
    error "Usage: ./generate-prd.sh <scope-file.md> [output-dir]"
    error "Example: ./generate-prd.sh ./scoping/my-project_scope.md ~/Documents/my-project"
    exit 1
fi

SCOPE_FILE="$1"
OUTPUT_DIR="${2:-}"

if [ ! -f "$SCOPE_FILE" ]; then
    error "Scope file not found: $SCOPE_FILE"
    exit 1
fi

log "Reading scoping document: $SCOPE_FILE"
log "Using model: $MANAGER_MODEL"

SCOPE_CONTENT=$(cat "$SCOPE_FILE")
PROMPT_FILE="$ORCHESTRATOR_DIR/scoping/.current_prd_prompt.md"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Build the PRD generation prompt
cat > "$PROMPT_FILE" << 'PROMPT_END'
You are a technical project manager converting a scoping document into an actionable task list.

## Scoping Document
SCOPE_CONTENT_PLACEHOLDER

## Your Task
Generate a tasks.json file that can be used by an autonomous Worker/Manager system to build this project.

### Task JSON Format
```json
{
  "project": {
    "name": "project-name-slug",
    "description": "One-line description",
    "outputDir": "OUTPUT_DIR_PLACEHOLDER"
  },
  "tasks": [
    {
      "id": "task-001",
      "name": "Short task name",
      "description": "Detailed description of what to implement",
      "requirements": [
        "Specific requirement 1",
        "Specific requirement 2",
        "Specific requirement 3"
      ],
      "testCommand": "npm test OR specific test command",
      "status": "pending",
      "testsPassing": false,
      "workerNotes": "",
      "managerReview": ""
    }
  ]
}
```

### Guidelines for Creating Tasks
1. **Order matters**: Tasks should be in implementation order (setup first, features next, polish last)
2. **Atomic tasks**: Each task should be completable in one session (1-3 hours of work)
3. **Clear requirements**: 3-5 specific, testable requirements per task
4. **Test commands**: Every task needs a way to verify completion
5. **First task**: Always start with project setup (init, dependencies, basic structure)
6. **Last task**: End with integration/polish task

### Common Task Patterns
- task-001: Project setup (create project, install deps, basic config)
- task-002: Core data models/types
- task-003-N: Feature implementations (one per core feature)
- task-N-1: Integration and error handling
- task-N: Final polish and documentation

### Test Command Examples
- `npm test` - for projects with test suites
- `npm run build && npm run lint` - for build verification
- `npm run dev & sleep 5 && curl localhost:3000 && kill $!` - for server verification
- `[ -f ./output/file.txt ]` - for file existence checks
- `node -e "require('./index.js')"` - for module loading checks

OUTPUT ONLY THE JSON. No explanation, no markdown code blocks, just the raw JSON.
PROMPT_END

# Replace placeholders
ESCAPED_SCOPE=$(echo "$SCOPE_CONTENT" | sed 's/[&/\]/\\&/g')

# Use a temp file approach for large content
TEMP_PROMPT=$(mktemp)
cat "$PROMPT_FILE" > "$TEMP_PROMPT"

# Replace scope content placeholder
python3 -c "
import sys
content = open('$TEMP_PROMPT').read()
scope = open('$SCOPE_FILE').read()
content = content.replace('SCOPE_CONTENT_PLACEHOLDER', scope)
print(content)
" > "${TEMP_PROMPT}.2"
mv "${TEMP_PROMPT}.2" "$TEMP_PROMPT"

# If output dir provided, use it; otherwise use a default
if [ -n "$OUTPUT_DIR" ]; then
    # Expand ~ if present
    OUTPUT_DIR="${OUTPUT_DIR/#\~/$HOME}"
    sed -i '' "s|OUTPUT_DIR_PLACEHOLDER|$OUTPUT_DIR|g" "$TEMP_PROMPT"
else
    # Extract project name from scope and create default output dir
    sed -i '' "s|OUTPUT_DIR_PLACEHOLDER|~/Documents/PROJECT_NAME|g" "$TEMP_PROMPT"
fi

log "Invoking Claude to generate tasks.json..."

# Run Claude to generate the PRD
PRD_OUTPUT=$(claude --model "$MANAGER_MODEL" --print "$(cat "$TEMP_PROMPT")" 2>&1)

# Clean up temp file
rm -f "$TEMP_PROMPT"

# Try to extract JSON from the output (in case there's extra text)
PRD_JSON=$(echo "$PRD_OUTPUT" | grep -A 10000 '{' | head -n -0)

# Validate JSON
if echo "$PRD_JSON" | jq . > /dev/null 2>&1; then
    # Extract project name for file naming
    PROJECT_NAME=$(echo "$PRD_JSON" | jq -r '.project.name')

    # Save to prds directory
    PRD_FILE="$ORCHESTRATOR_DIR/prds/${PROJECT_NAME}_tasks.json"
    echo "$PRD_JSON" | jq . > "$PRD_FILE"

    success "PRD generated successfully!"
    echo ""
    log "Project: $PROJECT_NAME"
    log "Tasks: $(echo "$PRD_JSON" | jq '.tasks | length')"
    log "Saved to: $PRD_FILE"
    echo ""

    # Show task summary
    log "Task Summary:"
    echo "$PRD_JSON" | jq -r '.tasks[] | "  - \(.id): \(.name)"'
    echo ""

    # Ask if user wants to start the orchestrator
    success "To start building this project, run:"
    echo "  cp \"$PRD_FILE\" \"$ORCHESTRATOR_DIR/prds/tasks.json\""
    echo "  cd \"$ORCHESTRATOR_DIR\" && ./scripts/orchestrator.sh start"

    # Also register the project
    log "Registering project..."
    if [ -f "$ORCHESTRATOR_DIR/scripts/projects.sh" ]; then
        "$ORCHESTRATOR_DIR/scripts/projects.sh" add "$PROJECT_NAME" "$PRD_FILE" 2>/dev/null || true
    fi
else
    error "Failed to generate valid JSON"
    error "Raw output:"
    echo "$PRD_OUTPUT"
    exit 1
fi
