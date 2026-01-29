#!/bin/bash

#######################################################################
#                          INSOMNIA SETUP                              #
#                    Insomnia - Interactive Setup                     #
#######################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NEON_GREEN='\033[38;5;46m'
NEON_PINK='\033[38;5;198m'
NC='\033[0m' # No Color
BOLD='\033[1m'
DIM='\033[2m'

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE_DIR="$SCRIPT_DIR/bridge"
DASHBOARD_DIR="$BRIDGE_DIR/dashboard"
ORCHESTRATOR_DIR="$SCRIPT_DIR/orchestrator"
CONFIG_FILE="$BRIDGE_DIR/config.json"
TEMPLATE_DIR="$SCRIPT_DIR/templates"
CLAUDE_MD_TEMPLATE="$TEMPLATE_DIR/CLAUDE.md.template"

# User configuration (populated during setup)
USER_NAME=""
INSTALL_DIR=""

# Animation frames for the donut
DONUT_RUNNING=false

# Clear screen and hide cursor
clear_screen() {
    printf "\033[2J\033[H"
}

hide_cursor() {
    printf "\033[?25l"
}

show_cursor() {
    printf "\033[?25h"
}

# Cleanup on exit
cleanup() {
    show_cursor
    DONUT_RUNNING=false
    # Kill any background processes
    jobs -p | xargs -r kill 2>/dev/null || true
}

trap cleanup EXIT INT TERM

# Print centered text
print_centered() {
    local text="$1"
    local width=$(tput cols)
    local padding=$(( (width - ${#text}) / 2 ))
    printf "%*s%s\n" $padding "" "$text"
}

# Animated typing effect
type_text() {
    local text="$1"
    local delay="${2:-0.03}"
    for (( i=0; i<${#text}; i++ )); do
        printf "%s" "${text:$i:1}"
        sleep "$delay"
    done
}

# Print with neon glow effect (alternating colors)
print_neon() {
    local text="$1"
    for (( i=0; i<${#text}; i++ )); do
        if (( i % 2 == 0 )); then
            printf "${NEON_GREEN}%s${NC}" "${text:$i:1}"
        else
            printf "${NEON_PINK}%s${NC}" "${text:$i:1}"
        fi
    done
    echo
}

# ASCII Art Banner - INSOMNIA
print_insomnia_banner() {
    local banner=(
" ██╗███╗   ██╗███████╗ ██████╗ ███╗   ███╗███╗   ██╗██╗ █████╗ "
" ██║████╗  ██║██╔════╝██╔═══██╗████╗ ████║████╗  ██║██║██╔══██╗"
" ██║██╔██╗ ██║███████╗██║   ██║██╔████╔██║██╔██╗ ██║██║███████║"
" ██║██║╚██╗██║╚════██║██║   ██║██║╚██╔╝██║██║╚██╗██║██║██╔══██║"
" ██║██║ ╚████║███████║╚██████╔╝██║ ╚═╝ ██║██║ ╚████║██║██║  ██║"
" ╚═╝╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝"
    )

    clear_screen
    hide_cursor

    # Animate banner appearing line by line
    local total_lines=${#banner[@]}
    local width=$(tput cols)

    echo
    echo

    for line in "${banner[@]}"; do
        local padding=$(( (width - ${#line}) / 2 ))
        printf "%*s" $padding ""

        # Color each character with alternating neon colors
        for (( i=0; i<${#line}; i++ )); do
            local char="${line:$i:1}"
            if [[ "$char" != " " ]]; then
                if (( (i + RANDOM % 3) % 2 == 0 )); then
                    printf "${NEON_GREEN}%s${NC}" "$char"
                else
                    printf "${NEON_PINK}%s${NC}" "$char"
                fi
            else
                printf " "
            fi
        done
        echo
        sleep 0.1
    done

    echo

    # Animated tagline
    local tagline="⚡ Insomnia ⚡"
    local padding=$(( (width - ${#tagline}) / 2 ))
    printf "%*s" $padding ""
    type_text "$tagline" 0.02
    echo
    echo

    sleep 0.5
}

# Animated donut (runs in background)
# Based on the classic donut.c algorithm
start_donut_animation() {
    DONUT_RUNNING=true
    (
        A=0
        B=0

        while $DONUT_RUNNING; do
            # Pre-compute sines and cosines
            sinA=$(echo "s($A)" | bc -l)
            cosA=$(echo "c($A)" | bc -l)
            sinB=$(echo "s($B)" | bc -l)
            cosB=$(echo "c($B)" | bc -l)

            # Initialize buffers
            declare -a b
            declare -a z
            for ((k=0; k<1760; k++)); do
                b[$k]=" "
                z[$k]=0
            done

            # Compute the donut
            j=0
            while (( $(echo "$j < 6.28" | bc -l) )); do
                sinj=$(echo "s($j)" | bc -l)
                cosj=$(echo "c($j)" | bc -l)

                i=0
                while (( $(echo "$i < 6.28" | bc -l) )); do
                    sini=$(echo "s($i)" | bc -l)
                    cosi=$(echo "c($i)" | bc -l)

                    h=$(echo "$cosj + 2" | bc -l)
                    D=$(echo "1 / ($sini * $h * $sinA + $sinj * $cosA + 5)" | bc -l)
                    t=$(echo "$sini * $h * $cosA - $sinj * $sinA" | bc -l)

                    x=$(printf "%.0f" $(echo "40 + 30 * $D * ($cosi * $h * $cosB - $t * $sinB)" | bc -l))
                    y=$(printf "%.0f" $(echo "12 + 15 * $D * ($cosi * $h * $sinB + $t * $cosB)" | bc -l))

                    o=$((x + 80 * y))
                    N=$(printf "%.0f" $(echo "8 * (($sinj * $sinA - $sini * $cosj * $cosA) * $cosB - $sini * $cosj * $sinA - $sinj * $cosA - $cosi * $cosj * $sinB)" | bc -l))

                    if (( y > 0 && y < 22 && x > 0 && x < 80 )); then
                        if (( $(echo "$D > ${z[$o]:-0}" | bc -l) )); then
                            z[$o]=$D
                            if (( N > 0 )); then
                                b[$o]="${NEON_GREEN}.,-~:;=!*#$@${NC:$N:1}"
                            else
                                b[$o]="."
                            fi
                        fi
                    fi

                    i=$(echo "$i + 0.07" | bc -l)
                done
                j=$(echo "$j + 0.02" | bc -l)
            done

            # Print the frame
            printf "\033[H"
            for ((k=0; k<1760; k++)); do
                if (( k % 80 == 0 )); then
                    echo
                else
                    printf "%s" "${b[$k]}"
                fi
            done

            A=$(echo "$A + 0.04" | bc -l)
            B=$(echo "$B + 0.02" | bc -l)

            sleep 0.03
        done
    ) &
}

# Simpler spinning animation for loading
show_spinner() {
    local pid=$1
    local message="$2"
    local frames=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
    local i=0

    hide_cursor
    while kill -0 "$pid" 2>/dev/null; do
        printf "\r${NEON_GREEN}${frames[$i]}${NC} ${message}"
        i=$(( (i + 1) % ${#frames[@]} ))
        sleep 0.1
    done
    printf "\r${GREEN}✓${NC} ${message}\n"
    show_cursor
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Section header
print_section() {
    local title="$1"
    echo
    echo "${NEON_PINK}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo "${BOLD}${NEON_GREEN}  $title${NC}"
    echo "${NEON_PINK}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo
}

# Success message
print_success() {
    echo "${GREEN}✓${NC} $1"
}

# Error message
print_error() {
    echo "${RED}✗${NC} $1"
}

# Warning message
print_warning() {
    echo "${YELLOW}⚠${NC} $1"
}

# Info message
print_info() {
    echo "${CYAN}ℹ${NC} $1"
}

# Prompt for input
prompt_input() {
    local prompt="$1"
    local variable="$2"
    local default="$3"

    if [[ -n "$default" ]]; then
        printf "${NEON_GREEN}▸${NC} ${prompt} ${DIM}(default: $default)${NC}: "
    else
        printf "${NEON_GREEN}▸${NC} ${prompt}: "
    fi

    read -r input

    if [[ -z "$input" && -n "$default" ]]; then
        eval "$variable='$default'"
    else
        eval "$variable='$input'"
    fi
}

# Prompt for yes/no
prompt_yn() {
    local prompt="$1"
    local default="${2:-y}"

    if [[ "$default" == "y" ]]; then
        printf "${NEON_GREEN}▸${NC} ${prompt} ${DIM}[Y/n]${NC}: "
    else
        printf "${NEON_GREEN}▸${NC} ${prompt} ${DIM}[y/N]${NC}: "
    fi

    read -r response
    response=${response:-$default}

    [[ "$response" =~ ^[Yy] ]]
}

# Check prerequisites
check_prerequisites() {
    print_section "Checking Prerequisites"

    local all_ok=true

    # Check macOS
    if [[ "$(uname)" == "Darwin" ]]; then
        print_success "Running on macOS"
    else
        print_error "This script requires macOS (for iMessage integration)"
        exit 1
    fi

    # Check Node.js
    if command_exists node; then
        local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if (( node_version >= 18 )); then
            print_success "Node.js $(node --version) installed"
        else
            print_error "Node.js 18+ required (found $(node --version))"
            all_ok=false
        fi
    else
        print_error "Node.js not installed"
        print_info "Install with: brew install node"
        all_ok=false
    fi

    # Check npm
    if command_exists npm; then
        print_success "npm $(npm --version) installed"
    else
        print_error "npm not installed"
        all_ok=false
    fi

    # Check bc (for donut animation)
    if command_exists bc; then
        print_success "bc calculator installed"
    else
        print_warning "bc not installed (needed for donut animation)"
        print_info "Install with: brew install bc"
    fi

    $all_ok
}

# Check and install Claude Code
check_claude_code() {
    print_section "Claude Code Setup"

    if command_exists claude; then
        print_success "Claude Code CLI found at $(which claude)"

        # Check if authenticated
        if claude auth status 2>/dev/null | grep -q "authenticated"; then
            print_success "Claude Code is authenticated"
        else
            print_warning "Claude Code may not be authenticated"
            echo
            print_info "Running authentication..."
            echo "${DIM}Please complete the authentication in your browser${NC}"
            echo

            if prompt_yn "Would you like to authenticate Claude Code now?"; then
                claude login
                if claude auth status 2>/dev/null | grep -q "authenticated"; then
                    print_success "Successfully authenticated!"
                else
                    print_warning "Authentication may have failed. You can run 'claude login' manually later."
                fi
            fi
        fi
    else
        print_error "Claude Code CLI not found"
        echo
        echo "${BOLD}Claude Code is required to run Insomnia.${NC}"
        echo
        echo "Installation options:"
        echo
        echo "  ${CYAN}Option 1: npm (recommended)${NC}"
        echo "    npm install -g @anthropic-ai/claude-code"
        echo
        echo "  ${CYAN}Option 2: Homebrew${NC}"
        echo "    brew install claude"
        echo

        if prompt_yn "Would you like to install Claude Code via npm now?"; then
            echo
            print_info "Installing Claude Code..."
            npm install -g @anthropic-ai/claude-code

            if command_exists claude; then
                print_success "Claude Code installed successfully!"
                echo
                print_info "Now let's authenticate..."
                claude login
            else
                print_error "Installation may have failed. Please install manually and run setup again."
                exit 1
            fi
        else
            print_error "Claude Code is required. Please install it and run setup again."
            exit 1
        fi
    fi
}

# Setup iMessage permissions
setup_imessage_permissions() {
    print_section "iMessage Permissions Setup"

    echo "Insomnia needs access to your iMessage database to receive messages."
    echo "This requires ${BOLD}Full Disk Access${NC} for Terminal (or your terminal app)."
    echo

    echo "${CYAN}Step-by-step instructions:${NC}"
    echo
    echo "  1. Open ${BOLD}System Settings${NC} (or System Preferences on older macOS)"
    echo
    echo "  2. Go to ${BOLD}Privacy & Security${NC} → ${BOLD}Full Disk Access${NC}"
    echo
    echo "  3. Click the ${BOLD}+${NC} button to add an application"
    echo
    echo "  4. Navigate to and add your terminal application:"
    echo "     • Terminal.app: /Applications/Utilities/Terminal.app"
    echo "     • iTerm2: /Applications/iTerm.app"
    echo "     • VS Code Terminal: /Applications/Visual Studio Code.app"
    echo "     • Warp: /Applications/Warp.app"
    echo
    echo "  5. ${BOLD}Toggle ON${NC} the switch next to the added application"
    echo
    echo "  6. ${BOLD}Restart your terminal${NC} for changes to take effect"
    echo

    # Check if we can read the iMessage database
    local imessage_db="$HOME/Library/Messages/chat.db"

    if [[ -r "$imessage_db" ]]; then
        print_success "iMessage database is accessible"
    else
        print_warning "Cannot access iMessage database yet"
        echo
        echo "${YELLOW}After granting Full Disk Access and restarting your terminal,${NC}"
        echo "${YELLOW}run this setup again to verify access.${NC}"
    fi

    echo
    if prompt_yn "Would you like to open System Settings now?"; then
        open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
        echo
        print_info "System Settings opened. Please add your terminal app to Full Disk Access."
        echo
        read -p "Press Enter after you've granted access and restarted your terminal..."

        # Check again
        if [[ -r "$imessage_db" ]]; then
            print_success "iMessage database is now accessible!"
        else
            print_warning "Still cannot access iMessage database."
            print_info "Make sure to restart your terminal after granting access."
        fi
    fi

    echo
    echo "${CYAN}Additionally, ensure:${NC}"
    echo "  • iMessage is signed in on this Mac"
    echo "  • Messages app has run at least once"
    echo "  • You have messages in the Messages app"
    echo
}

# Configure the bridge
configure_bridge() {
    print_section "Bridge Configuration"

    echo "Now let's configure your Insomnia bridge settings."
    echo

    # Get phone number
    local current_phone=""
    if [[ -f "$CONFIG_FILE" ]]; then
        current_phone=$(grep -o '"yourPhoneNumber"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" | cut -d'"' -f4)
    fi

    echo "${BOLD}Phone Number${NC}"
    echo "Enter the phone number that will send you messages."
    echo "This should be YOUR phone number (the one you'll message from)."
    echo "Format: +1234567890 (with country code)"
    echo

    prompt_input "Your phone number" phone_number "$current_phone"

    # Validate phone number format
    while [[ ! "$phone_number" =~ ^\+[0-9]{10,15}$ ]]; do
        print_warning "Phone number should start with + followed by 10-15 digits"
        prompt_input "Your phone number" phone_number "$current_phone"
    done

    echo

    # Get email (optional)
    local current_email=""
    if [[ -f "$CONFIG_FILE" ]]; then
        current_email=$(grep -o '"yourEmail"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" | cut -d'"' -f4)
    fi

    echo "${BOLD}iCloud Email (optional)${NC}"
    echo "If you also use iMessage with an email, enter it here."
    echo "Leave blank if you only use your phone number."
    echo

    prompt_input "Your iCloud email" email "$current_email"

    echo

    # Get work directory
    local current_workdir=""
    if [[ -f "$CONFIG_FILE" ]]; then
        current_workdir=$(grep -o '"claudeWorkDir"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" | cut -d'"' -f4)
    fi

    echo "${BOLD}Claude Work Directory${NC}"
    echo "The directory where Claude will have access to work."
    echo "Default is your home directory."
    echo

    prompt_input "Work directory" work_dir "${current_workdir:-$HOME}"

    echo

    # Poll interval
    local current_poll=""
    if [[ -f "$CONFIG_FILE" ]]; then
        current_poll=$(grep -o '"pollInterval"[[:space:]]*:[[:space:]]*[0-9]*' "$CONFIG_FILE" | grep -o '[0-9]*$')
    fi

    echo "${BOLD}Poll Interval${NC}"
    echo "How often to check for new messages (in milliseconds)."
    echo "Lower = faster response, Higher = less CPU usage."
    echo

    prompt_input "Poll interval (ms)" poll_interval "${current_poll:-5000}"

    # Write config file
    echo
    print_info "Writing configuration..."

    cat > "$CONFIG_FILE" << EOF
{
  "yourPhoneNumber": "$phone_number",
  "yourEmail": "$email",
  "claudeWorkDir": "$work_dir",
  "pollInterval": $poll_interval
}
EOF

    print_success "Configuration saved to $CONFIG_FILE"
}

# Install CLI tools (Vercel, Supabase, gcloud)
install_cli_tools() {
    print_section "Installing CLI Tools"

    echo "Insomnia works best with these CLIs installed and authenticated."
    echo

    # Check for Homebrew first (needed for gcloud)
    if ! command_exists brew; then
        print_warning "Homebrew is not installed"
        if prompt_yn "Would you like to install Homebrew? (required for gcloud CLI)"; then
            print_info "Installing Homebrew..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

            # Add Homebrew to PATH for this session
            if [[ -f "/opt/homebrew/bin/brew" ]]; then
                eval "$(/opt/homebrew/bin/brew shellenv)"
            elif [[ -f "/usr/local/bin/brew" ]]; then
                eval "$(/usr/local/bin/brew shellenv)"
            fi

            if command_exists brew; then
                print_success "Homebrew installed successfully"
            else
                print_error "Homebrew installation may have failed"
            fi
        fi
    else
        print_success "Homebrew is installed"
    fi

    echo

    # Vercel CLI
    echo "${BOLD}Vercel CLI${NC}"
    if command_exists vercel; then
        print_success "Vercel CLI is already installed ($(vercel --version 2>/dev/null | head -1))"
    else
        if prompt_yn "Install Vercel CLI?"; then
            print_info "Installing Vercel CLI..."
            (npm install -g vercel) &
            show_spinner $! "Installing Vercel CLI"

            if command_exists vercel; then
                print_success "Vercel CLI installed successfully"
                echo
                if prompt_yn "Would you like to authenticate Vercel now?"; then
                    vercel login
                fi
            else
                print_error "Vercel CLI installation may have failed"
            fi
        else
            print_info "Skipping Vercel CLI installation"
        fi
    fi

    echo

    # Supabase CLI
    echo "${BOLD}Supabase CLI${NC}"
    if command_exists supabase; then
        print_success "Supabase CLI is already installed ($(supabase --version 2>/dev/null))"
    else
        if prompt_yn "Install Supabase CLI?"; then
            print_info "Installing Supabase CLI..."
            if command_exists brew; then
                (brew install supabase/tap/supabase) &
                show_spinner $! "Installing Supabase CLI via Homebrew"
            else
                (npm install -g supabase) &
                show_spinner $! "Installing Supabase CLI via npm"
            fi

            if command_exists supabase; then
                print_success "Supabase CLI installed successfully"
                echo
                if prompt_yn "Would you like to authenticate Supabase now?"; then
                    supabase login
                fi
            else
                print_error "Supabase CLI installation may have failed"
            fi
        else
            print_info "Skipping Supabase CLI installation"
        fi
    fi

    echo

    # Google Cloud CLI (gcloud)
    echo "${BOLD}Google Cloud CLI (gcloud)${NC}"
    if command_exists gcloud; then
        print_success "gcloud CLI is already installed ($(gcloud --version 2>/dev/null | head -1))"
    else
        if prompt_yn "Install Google Cloud CLI?"; then
            if command_exists brew; then
                print_info "Installing Google Cloud CLI via Homebrew..."
                (brew install --cask google-cloud-sdk) &
                show_spinner $! "Installing Google Cloud CLI"

                # Source gcloud completion and path
                if [[ -f "$(brew --prefix)/share/google-cloud-sdk/path.bash.inc" ]]; then
                    source "$(brew --prefix)/share/google-cloud-sdk/path.bash.inc"
                fi

                if command_exists gcloud; then
                    print_success "Google Cloud CLI installed successfully"
                    echo
                    if prompt_yn "Would you like to authenticate gcloud now?"; then
                        gcloud auth login
                        echo
                        if prompt_yn "Would you like to set up application default credentials?"; then
                            gcloud auth application-default login
                        fi
                    fi
                else
                    print_warning "gcloud may require a terminal restart to be available"
                    print_info "After restarting, run: gcloud auth login"
                fi
            else
                print_error "Homebrew is required to install gcloud CLI"
                print_info "Install Homebrew first, then run setup again"
            fi
        else
            print_info "Skipping Google Cloud CLI installation"
        fi
    fi

    echo
    print_success "CLI tools setup complete!"
}

# Install dependencies
install_dependencies() {
    print_section "Installing Dependencies"

    # Bridge dependencies
    print_info "Installing bridge dependencies..."
    (cd "$BRIDGE_DIR" && npm install) &
    show_spinner $! "Installing bridge dependencies"

    # Build bridge
    print_info "Building bridge..."
    (cd "$BRIDGE_DIR" && npm run build) &
    show_spinner $! "Compiling TypeScript"

    # Dashboard dependencies
    print_info "Installing dashboard dependencies..."
    (cd "$DASHBOARD_DIR" && npm install) &
    show_spinner $! "Installing dashboard dependencies"

    print_success "All dependencies installed!"
}

# Generate CLAUDE.md for the user
generate_claude_md() {
    print_section "Generating CLAUDE.md"

    echo "Insomnia uses a CLAUDE.md file to give Claude context about your system."
    echo "This file will be installed to ~/.claude/CLAUDE.md"
    echo
    echo "${BOLD}This will help Claude:${NC}"
    echo "  • Know where your Insomnia installation is located"
    echo "  • Understand how to manage the bridge, orchestrator, and tasks"
    echo "  • Use the correct commands for your specific setup"
    echo

    # Get user's name
    echo "${BOLD}Your Name${NC}"
    echo "This is used in the CLAUDE.md so Claude knows who to refer to."
    echo

    prompt_input "Your name" USER_NAME "${USER_NAME:-$(whoami)}"

    echo

    # Confirm installation directory
    echo "${BOLD}Installation Directory${NC}"
    echo "The directory where Insomnia is installed."
    echo

    prompt_input "Installation directory" INSTALL_DIR "${INSTALL_DIR:-$SCRIPT_DIR}"

    echo

    # Check if CLAUDE.md already exists
    local claude_dir="$HOME/.claude"
    local claude_md_path="$claude_dir/CLAUDE.md"
    local backup_path=""

    if [[ -f "$claude_md_path" ]]; then
        print_warning "Existing CLAUDE.md found at $claude_md_path"
        echo
        echo "Options:"
        echo "  1. Append Insomnia section to existing file"
        echo "  2. Replace with new Insomnia CLAUDE.md (backup existing)"
        echo "  3. Skip CLAUDE.md generation"
        echo

        printf "${NEON_GREEN}▸${NC} Choose an option ${DIM}[1/2/3]${NC}: "
        read -r option

        case "$option" in
            1)
                # Append mode
                print_info "Appending Insomnia section to existing CLAUDE.md..."

                # Generate the content
                local content=$(cat "$CLAUDE_MD_TEMPLATE" | \
                    sed "s|{{USER_NAME}}|$USER_NAME|g" | \
                    sed "s|{{INSTALL_DIR}}|$INSTALL_DIR|g")

                # Append with separator
                echo "" >> "$claude_md_path"
                echo "---" >> "$claude_md_path"
                echo "" >> "$claude_md_path"
                echo "$content" >> "$claude_md_path"

                print_success "Appended Insomnia section to $claude_md_path"
                ;;
            2)
                # Replace mode with backup
                backup_path="$claude_md_path.backup.$(date +%Y%m%d_%H%M%S)"
                cp "$claude_md_path" "$backup_path"
                print_info "Backed up existing file to $backup_path"

                # Generate new file
                mkdir -p "$claude_dir"
                cat "$CLAUDE_MD_TEMPLATE" | \
                    sed "s|{{USER_NAME}}|$USER_NAME|g" | \
                    sed "s|{{INSTALL_DIR}}|$INSTALL_DIR|g" > "$claude_md_path"

                print_success "Generated new CLAUDE.md at $claude_md_path"
                ;;
            3)
                print_info "Skipping CLAUDE.md generation"
                return 0
                ;;
            *)
                print_info "Invalid option, skipping CLAUDE.md generation"
                return 0
                ;;
        esac
    else
        # No existing file, create new
        mkdir -p "$claude_dir"

        print_info "Generating CLAUDE.md..."

        cat "$CLAUDE_MD_TEMPLATE" | \
            sed "s|{{USER_NAME}}|$USER_NAME|g" | \
            sed "s|{{INSTALL_DIR}}|$INSTALL_DIR|g" > "$claude_md_path"

        print_success "Generated CLAUDE.md at $claude_md_path"
    fi

    echo
    echo "${CYAN}The CLAUDE.md file tells Claude:${NC}"
    echo "  • Your installation directory: $INSTALL_DIR"
    echo "  • How to use the bridge, dashboard, and orchestrator"
    echo "  • Human task system commands"
    echo "  • Debugging best practices"
    echo
}

# Start services
start_services() {
    print_section "Starting Services"

    # Check if bridge is already running
    if pgrep -f "node.*dist/server.js" >/dev/null; then
        print_warning "Bridge is already running"
        if prompt_yn "Would you like to restart it?"; then
            pkill -f "node.*dist/server.js" 2>/dev/null || true
            rm -f "$BRIDGE_DIR/.bridge.lock"
            sleep 1
        else
            print_info "Keeping existing bridge running"
        fi
    fi

    # Start bridge
    print_info "Starting bridge..."
    (cd "$BRIDGE_DIR" && npm start > /dev/null 2>&1 &)
    sleep 2

    if pgrep -f "node.*dist/server.js" >/dev/null; then
        print_success "Bridge started successfully"
    else
        print_error "Failed to start bridge. Check logs at $BRIDGE_DIR/imessage-server.log"
    fi

    # Start dashboard
    print_info "Starting dashboard..."

    # Check if dashboard port is in use
    if lsof -Pi :3333 -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_warning "Port 3333 is already in use"
        if prompt_yn "Would you like to kill the existing process and restart?"; then
            lsof -Pi :3333 -sTCP:LISTEN -t | xargs kill 2>/dev/null || true
            sleep 1
        else
            print_info "Dashboard may already be running"
        fi
    fi

    (cd "$DASHBOARD_DIR" && npm run dev > /dev/null 2>&1 &)
    sleep 3

    if lsof -Pi :3333 -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_success "Dashboard started at http://localhost:3333"
    else
        print_warning "Dashboard may still be starting up..."
    fi
}

# Final summary
print_summary() {
    print_section "Setup Complete!"

    echo "${NEON_GREEN}Insomnia is now running!${NC}"
    echo
    echo "Services:"
    echo "  ${GREEN}●${NC} Bridge: Running (monitoring iMessages)"
    echo "  ${GREEN}●${NC} Dashboard: http://localhost:3333"
    echo
    echo "Quick commands:"
    echo "  ${CYAN}View bridge logs:${NC}"
    echo "    tail -f $BRIDGE_DIR/imessage-server.log"
    echo
    echo "  ${CYAN}Check manager status:${NC}"
    echo "    cd $BRIDGE_DIR && npm run status"
    echo
    echo "  ${CYAN}Restart bridge:${NC}"
    echo "    cd $BRIDGE_DIR && pkill -f 'node dist/server.js' && npm start"
    echo
    echo "  ${CYAN}Start orchestrator:${NC}"
    echo "    cd $ORCHESTRATOR_DIR && ./scripts/orchestrator.sh start"
    echo
    echo "${BOLD}To use Insomnia:${NC}"
    echo "  1. Open Messages on your Mac"
    echo "  2. Send a message to yourself from your phone"
    echo "  3. Watch the magic happen! ✨"
    echo
    echo "${DIM}Dashboard: http://localhost:3333${NC}"
    echo

    # Show CLAUDE.md info if it was generated
    local claude_md_path="$HOME/.claude/CLAUDE.md"
    if [[ -f "$claude_md_path" ]]; then
        echo "${CYAN}CLAUDE.md:${NC}"
        echo "  Your Claude instructions are at: $claude_md_path"
        echo "  Claude will automatically use these for context about your Insomnia setup."
        echo
    fi
}

# Main setup function
main() {
    # Show animated banner
    print_insomnia_banner

    show_cursor

    echo "${BOLD}Welcome to the Insomnia setup wizard!${NC}"
    echo "This will guide you through configuring your Insomnia system."
    echo

    if ! prompt_yn "Ready to begin setup?"; then
        echo "Setup cancelled."
        exit 0
    fi

    # Run setup steps
    check_prerequisites || exit 1
    check_claude_code

    # Install CLI tools
    if prompt_yn "Would you like to install/update CLI tools (Vercel, Supabase, gcloud)?" "y"; then
        install_cli_tools
    fi

    setup_imessage_permissions
    configure_bridge
    install_dependencies

    # Generate CLAUDE.md for the user
    if prompt_yn "Would you like to generate a CLAUDE.md file for your system?" "y"; then
        generate_claude_md
    fi

    if prompt_yn "Would you like to start the services now?"; then
        start_services
    fi

    print_summary

    # Open dashboard in browser
    if prompt_yn "Would you like to open the dashboard in your browser?"; then
        open "http://localhost:3333"
    fi

    echo
    echo "${NEON_GREEN}${BOLD}Enjoy Insomnia! ⚡${NC}"
    echo
}

# Run main
main "$@"
