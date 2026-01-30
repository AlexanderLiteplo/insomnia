#!/bin/bash

#######################################################################
#                          INSOMNIA SETUP                              #
#                    Spawns Claude for guided setup                    #
#######################################################################

set -e

# Colors
GREEN='\033[0;32m'
NC='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="$SCRIPT_DIR/templates"
SETUP_PROMPT_FILE="$TEMPLATE_DIR/setup-prompt.md"

# Check if Claude Code is installed
check_claude_code() {
    if ! command -v claude &> /dev/null; then
        echo
        echo -e "${GREEN}Error: Claude Code CLI is not installed.${NC}"
        echo
        echo "Please install it first:"
        echo "  npm install -g @anthropic-ai/claude-code"
        echo
        echo "Then run this setup again."
        exit 1
    fi
}

# Read and prepare the setup prompt
prepare_setup_prompt() {
    if [[ -f "$SETUP_PROMPT_FILE" ]]; then
        sed "s|{{INSTALL_DIR}}|$SCRIPT_DIR|g" "$SETUP_PROMPT_FILE"
    else
        cat << 'EOF'
You are setting up Insomnia, a Claude automation system.
Guide the user through setup interactively.
EOF
    fi
}

# Launch Claude Code with setup context
launch_claude_setup() {
    echo
    echo -e "${GREEN}────────────────────────────────────────────────────────────────────────────${NC}"
    echo
    echo -e "  ${BOLD}Insomnia Setup${NC}"
    echo -e "  ${DIM}Claude will guide you through the configuration process.${NC}"
    echo
    echo -e "${GREEN}────────────────────────────────────────────────────────────────────────────${NC}"
    echo

    local setup_prompt
    setup_prompt=$(prepare_setup_prompt)

    # Launch Claude Code interactively with setup instructions as the first message
    # (positional argument = interactive mode, -p flag = non-interactive print mode)
    cd "$SCRIPT_DIR"
    claude --dangerously-skip-permissions "$setup_prompt"
}

# Main
main() {
    check_claude_code
    launch_claude_setup
}

main "$@"
