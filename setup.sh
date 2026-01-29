#!/bin/bash

#######################################################################
#                          INSOMNIA SETUP                              #
#            Shows cool animation then spawns Claude for setup         #
#######################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NEON_GREEN='\033[38;5;46m'
NEON_PINK='\033[38;5;198m'
NC='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE_DIR="$SCRIPT_DIR/bridge"
TEMPLATE_DIR="$SCRIPT_DIR/templates"
SETUP_PROMPT_FILE="$TEMPLATE_DIR/setup-prompt.md"

# Cleanup
cleanup() {
    printf "\033[?25h"  # Show cursor
    stty echo 2>/dev/null
    stty sane 2>/dev/null
}

trap cleanup EXIT INT TERM

# Flush stdin to clear any buffered input
flush_stdin() {
    # Read and discard any pending input (works on macOS and Linux)
    while read -t 0.01 -n 1 2>/dev/null; do :; done
    # Second pass with longer timeout
    read -t 0.1 -n 10000 discard 2>/dev/null || true
}

# Reset terminal to clean state
reset_terminal() {
    show_cursor
    stty sane 2>/dev/null || true
    stty echo 2>/dev/null || true
    printf "\033[0m"  # Reset all attributes
    flush_stdin
    sleep 0.1  # Brief delay to let terminal stabilize
}

# Hide cursor
hide_cursor() {
    printf "\033[?25l"
}

# Show cursor
show_cursor() {
    printf "\033[?25h"
}

# Clear screen
clear_screen() {
    printf "\033[2J\033[H"
}

# Animated banner with alternating colors
show_animated_banner() {
    clear_screen
    hide_cursor

    local banner=(
" ██╗███╗   ██╗███████╗ ██████╗ ███╗   ███╗███╗   ██╗██╗ █████╗ "
" ██║████╗  ██║██╔════╝██╔═══██╗████╗ ████║████╗  ██║██║██╔══██╗"
" ██║██╔██╗ ██║███████╗██║   ██║██╔████╔██║██╔██╗ ██║██║███████║"
" ██║██║╚██╗██║╚════██║██║   ██║██║╚██╔╝██║██║╚██╗██║██║██╔══██║"
" ██║██║ ╚████║███████║╚██████╔╝██║ ╚═╝ ██║██║ ╚████║██║██║  ██║"
" ╚═╝╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝"
    )

    local width=$(tput cols)

    echo
    echo

    # Animate each line appearing with color wave
    for line in "${banner[@]}"; do
        local padding=$(( (width - 65) / 2 ))
        [[ $padding -lt 0 ]] && padding=0
        printf "%*s" $padding ""

        # Print each character with alternating colors
        for (( i=0; i<${#line}; i++ )); do
            local char="${line:$i:1}"
            if [[ "$char" != " " ]]; then
                if (( (i / 3) % 2 == 0 )); then
                    printf "${NEON_GREEN}%s${NC}" "$char"
                else
                    printf "${NEON_PINK}%s${NC}" "$char"
                fi
            else
                printf " "
            fi
        done
        echo
        sleep 0.08
    done

    echo
    local tagline="⚡ Setup Wizard ⚡"
    local tag_padding=$(( (width - ${#tagline}) / 2 ))
    printf "%*s${BOLD}%s${NC}\n" $tag_padding "" "$tagline"
    echo
    sleep 0.5
}

# Fast spinning animation with donut ring
run_fast_spinner() {
    local duration=$1
    local start_time=$(date +%s)

    hide_cursor
    clear_screen

    local frames=(
        "    ⠋    "
        "    ⠙    "
        "    ⠹    "
        "    ⠸    "
        "    ⠼    "
        "    ⠴    "
        "    ⠦    "
        "    ⠧    "
        "    ⠇    "
        "    ⠏    "
    )

    local i=0
    local d=0

    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))

        [[ $elapsed -ge $duration ]] && break

        printf "\033[H"
        echo
        printf "                   ${NEON_GREEN}██╗${NEON_PINK}███╗   ██╗${NEON_GREEN}███████╗${NEON_PINK} ██████╗ ${NEON_GREEN}███╗   ███╗${NEON_PINK}███╗   ██╗${NEON_GREEN}██╗${NEON_PINK} █████╗ ${NC}\n"
        printf "                   ${NEON_PINK}██║${NEON_GREEN}████╗  ██║${NEON_PINK}██╔════╝${NEON_GREEN}██╔═══██╗${NEON_PINK}████╗ ████║${NEON_GREEN}████╗  ██║${NEON_PINK}██║${NEON_GREEN}██╔══██╗${NC}\n"
        printf "                   ${NEON_GREEN}██║${NEON_PINK}██╔██╗ ██║${NEON_GREEN}███████╗${NEON_PINK}██║   ██║${NEON_GREEN}██╔████╔██║${NEON_PINK}██╔██╗ ██║${NEON_GREEN}██║${NEON_PINK}███████║${NC}\n"
        printf "                   ${NEON_PINK}██║${NEON_GREEN}██║╚██╗██║${NEON_PINK}╚════██║${NEON_GREEN}██║   ██║${NEON_PINK}██║╚██╔╝██║${NEON_GREEN}██║╚██╗██║${NEON_PINK}██║${NEON_GREEN}██╔══██║${NC}\n"
        printf "                   ${NEON_GREEN}██║${NEON_PINK}██║ ╚████║${NEON_GREEN}███████║${NEON_PINK}╚██████╔╝${NEON_GREEN}██║ ╚═╝ ██║${NEON_PINK}██║ ╚████║${NEON_GREEN}██║${NEON_PINK}██║  ██║${NC}\n"
        printf "                   ${NEON_PINK}╚═╝${NEON_GREEN}╚═╝  ╚═══╝${NEON_PINK}╚══════╝${NEON_GREEN} ╚═════╝ ${NEON_PINK}╚═╝     ╚═╝${NEON_GREEN}╚═╝  ╚═══╝${NEON_PINK}╚═╝${NEON_GREEN}╚═╝  ╚═╝${NC}\n"
        echo
        printf "                                    ${BOLD}⚡ Insomnia ⚡${NC}\n"
        echo
        echo
        echo

        # Print animated donut ring
        local big_frames=(
"                              ${NEON_GREEN}   ▄▄▄▄▄▄▄▄▄▄▄   ${NC}
                              ${NEON_GREEN} ▄█           █▄ ${NC}
                              ${NEON_GREEN}██             ██${NC}
                              ${NEON_PINK}██             ██${NC}
                              ${NEON_PINK}██             ██${NC}
                              ${NEON_GREEN}██             ██${NC}
                              ${NEON_GREEN} ▀█           █▀ ${NC}
                              ${NEON_GREEN}   ▀▀▀▀▀▀▀▀▀▀▀   ${NC}"

"                              ${NEON_PINK}   ▄▄▄▄▄▄▄▄▄▄▄   ${NC}
                              ${NEON_PINK} ▄█░░░░░░░░░░░█▄ ${NC}
                              ${NEON_PINK}██░░░░░░░░░░░░░██${NC}
                              ${NEON_GREEN}██░░░░░░░░░░░░░██${NC}
                              ${NEON_GREEN}██░░░░░░░░░░░░░██${NC}
                              ${NEON_PINK}██░░░░░░░░░░░░░██${NC}
                              ${NEON_PINK} ▀█░░░░░░░░░░░█▀ ${NC}
                              ${NEON_PINK}   ▀▀▀▀▀▀▀▀▀▀▀   ${NC}"

"                              ${NEON_GREEN}   ▄▄▄▄▄▄▄▄▄▄▄   ${NC}
                              ${NEON_GREEN} ▄█▒▒▒▒▒▒▒▒▒▒▒█▄ ${NC}
                              ${NEON_GREEN}██▒▒▒▒▒▒▒▒▒▒▒▒▒██${NC}
                              ${NEON_PINK}██▒▒▒▒▒▒▒▒▒▒▒▒▒██${NC}
                              ${NEON_PINK}██▒▒▒▒▒▒▒▒▒▒▒▒▒██${NC}
                              ${NEON_GREEN}██▒▒▒▒▒▒▒▒▒▒▒▒▒██${NC}
                              ${NEON_GREEN} ▀█▒▒▒▒▒▒▒▒▒▒▒█▀ ${NC}
                              ${NEON_GREEN}   ▀▀▀▀▀▀▀▀▀▀▀   ${NC}"

"                              ${NEON_PINK}   ▄▄▄▄▄▄▄▄▄▄▄   ${NC}
                              ${NEON_PINK} ▄█▓▓▓▓▓▓▓▓▓▓▓█▄ ${NC}
                              ${NEON_PINK}██▓▓▓▓▓▓▓▓▓▓▓▓▓██${NC}
                              ${NEON_GREEN}██▓▓▓▓▓▓▓▓▓▓▓▓▓██${NC}
                              ${NEON_GREEN}██▓▓▓▓▓▓▓▓▓▓▓▓▓██${NC}
                              ${NEON_PINK}██▓▓▓▓▓▓▓▓▓▓▓▓▓██${NC}
                              ${NEON_PINK} ▀█▓▓▓▓▓▓▓▓▓▓▓█▀ ${NC}
                              ${NEON_PINK}   ▀▀▀▀▀▀▀▀▀▀▀   ${NC}"
        )

        echo -e "${big_frames[$d]}"

        local remaining=$((duration - elapsed))
        echo
        echo
        printf "                       ${DIM}Initializing setup wizard... (${remaining}s)${NC}\n"
        printf "                              ${NEON_GREEN}${frames[$i]}${NC}\n"

        i=$(( (i + 1) % ${#frames[@]} ))
        d=$(( (d + 1) % ${#big_frames[@]} ))
        sleep 0.15
    done

    # Clean up animation state before returning
    show_cursor
    printf "\033[0m"  # Reset all text attributes
}

# Check if Claude Code is installed
check_claude_code() {
    if ! command -v claude &> /dev/null; then
        show_cursor
        echo
        echo -e "${RED}Error: Claude Code CLI is not installed.${NC}"
        echo
        echo "Please install it first:"
        echo -e "  ${CYAN}npm install -g @anthropic-ai/claude-code${NC}"
        echo
        echo "Then run this setup again."
        exit 1
    fi
}

# Read and prepare the setup prompt
prepare_setup_prompt() {
    if [[ -f "$SETUP_PROMPT_FILE" ]]; then
        # Read template and replace placeholders
        sed "s|{{INSTALL_DIR}}|$SCRIPT_DIR|g" "$SETUP_PROMPT_FILE"
    else
        # Fallback inline prompt if template doesn't exist
        cat << EOF
You are setting up Insomnia, a Claude automation system.

## Your Task
Guide the user through setting up Insomnia. Be friendly and conversational. Ask questions one at a time.

## Installation Directory
The system is installed at: $SCRIPT_DIR

## What Needs to Be Configured

### 1. Prerequisites Check
First, verify these are installed/accessible:
- Node.js 18+ (run: node --version)
- npm (run: npm --version)
- Check if iMessage database is accessible: test -r ~/Library/Messages/chat.db

### 2. Get User Info
Ask for:
- Name (for personalization)
- Telegram bot token (guide them through @BotFather)
- Telegram user ID (optional, for access restriction)

### 3. Install Dependencies
Run: cd $BRIDGE_DIR && npm install && npm run build
Run: cd $BRIDGE_DIR/dashboard && npm install

### 4. Create Config
Create $BRIDGE_DIR/config.json with their Telegram bot token and settings.

### 5. Generate CLAUDE.md
Generate ~/.claude/CLAUDE.md from $TEMPLATE_DIR/CLAUDE.md.template
Replace {{USER_NAME}} and {{INSTALL_DIR}} placeholders.

### 6. Start Services
Offer to start the bridge and dashboard, then open the browser.

## Start
Greet the user, check prerequisites, then gather their information step by step.
EOF
    fi
}

# Launch Claude Code with setup context
launch_claude_setup() {
    # CRITICAL: Reset terminal state completely before Claude Code starts
    # This prevents the "Clos code CLI found at" hang/garble bug
    reset_terminal
    clear_screen

    echo
    echo -e "${NEON_GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo
    echo -e "  ${BOLD}Launching Claude Code for setup...${NC}"
    echo -e "  ${DIM}Claude will guide you through the configuration process.${NC}"
    echo
    echo -e "${NEON_GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo
    sleep 0.5

    # Flush stdin one more time right before launching Claude
    flush_stdin

    # Get the setup prompt
    local setup_prompt
    setup_prompt=$(prepare_setup_prompt)

    # Launch Claude Code with the setup instructions
    # Using --dangerously-skip-permissions since setup needs to run various commands
    cd "$SCRIPT_DIR"
    claude --dangerously-skip-permissions -p "$setup_prompt"
}

# Main
main() {
    # Make sure Claude Code is available
    check_claude_code

    # Run the cool animation (3 seconds)
    run_fast_spinner 3

    # Launch Claude to handle the rest
    launch_claude_setup
}

# Run main
main "$@"
