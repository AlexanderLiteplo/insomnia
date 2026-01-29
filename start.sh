#!/bin/bash

#######################################################################
#                          INSOMNIA START                              #
#              Claude Automation System - Quick Launcher               #
#######################################################################

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
DASHBOARD_DIR="$BRIDGE_DIR/dashboard"
CONFIG_FILE="$BRIDGE_DIR/config.json"

# Animation control
ANIMATION_PID=""

# Cleanup
cleanup() {
    printf "\033[?25h"  # Show cursor
    [[ -n "$ANIMATION_PID" ]] && kill "$ANIMATION_PID" 2>/dev/null
    stty echo 2>/dev/null
}

trap cleanup EXIT INT TERM

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

# The famous spinning donut animation
# Based on donut.c by Andy Sloane
run_donut() {
    local duration=$1
    local start_time=$(date +%s)

    hide_cursor
    clear_screen

    local A=0 B=0

    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))

        if [[ $elapsed -ge $duration ]]; then
            break
        fi

        # Calculate remaining time
        local remaining=$((duration - elapsed))

        # Build the frame
        local output=""
        local z=()
        local b=()

        # Initialize buffers
        for ((k=0; k<1760; k++)); do
            b[$k]=" "
            z[$k]=0
        done

        local j=0
        while (( $(echo "$j < 6.28" | bc -l) )); do
            local i=0
            while (( $(echo "$i < 6.28" | bc -l) )); do
                local c=$(echo "s($i)" | bc -l)
                local d=$(echo "c($j)" | bc -l)
                local e=$(echo "s($A)" | bc -l)
                local f=$(echo "s($j)" | bc -l)
                local g=$(echo "c($A)" | bc -l)
                local h=$(echo "$d + 2" | bc -l)
                local D=$(echo "1 / ($c * $h * $e + $f * $g + 5)" | bc -l)
                local l=$(echo "c($i)" | bc -l)
                local m=$(echo "c($B)" | bc -l)
                local n=$(echo "s($B)" | bc -l)
                local t=$(echo "$c * $h * $g - $f * $e" | bc -l)

                local x=$(printf "%.0f" $(echo "40 + 30 * $D * ($l * $h * $m - $t * $n)" | bc -l) 2>/dev/null)
                local y=$(printf "%.0f" $(echo "12 + 15 * $D * ($l * $h * $n + $t * $m)" | bc -l) 2>/dev/null)
                local o=$((x + 80 * y))
                local N=$(printf "%.0f" $(echo "8 * (($f * $e - $c * $d * $g) * $m - $c * $d * $e - $f * $g - $l * $d * $n)" | bc -l) 2>/dev/null)

                if [[ $y -gt 0 && $y -lt 22 && $x -gt 0 && $x -lt 80 ]]; then
                    local curr_z=${z[$o]:-0}
                    if (( $(echo "$D > $curr_z" | bc -l) )); then
                        z[$o]=$D
                        local chars=".,-~:;=!*#\$@"
                        if [[ $N -gt 0 && $N -lt 12 ]]; then
                            b[$o]="${chars:$N:1}"
                        else
                            b[$o]="."
                        fi
                    fi
                fi

                i=$(echo "$i + 0.07" | bc -l)
            done
            j=$(echo "$j + 0.02" | bc -l)
        done

        # Print frame with colors
        printf "\033[H"

        # Print INSOMNIA above the donut
        echo
        printf "                 ${NEON_GREEN}██╗${NEON_PINK}███╗   ██╗${NEON_GREEN}███████╗${NEON_PINK} ██████╗ ${NEON_GREEN}███╗   ███╗${NEON_PINK}███╗   ██╗${NEON_GREEN}██╗${NEON_PINK} █████╗ ${NC}\n"
        printf "                 ${NEON_PINK}██║${NEON_GREEN}████╗  ██║${NEON_PINK}██╔════╝${NEON_GREEN}██╔═══██╗${NEON_PINK}████╗ ████║${NEON_GREEN}████╗  ██║${NEON_PINK}██║${NEON_GREEN}██╔══██╗${NC}\n"
        printf "                 ${NEON_GREEN}██║${NEON_PINK}██╔██╗ ██║${NEON_GREEN}███████╗${NEON_PINK}██║   ██║${NEON_GREEN}██╔████╔██║${NEON_PINK}██╔██╗ ██║${NEON_GREEN}██║${NEON_PINK}███████║${NC}\n"
        printf "                 ${NEON_PINK}██║${NEON_GREEN}██║╚██╗██║${NEON_PINK}╚════██║${NEON_GREEN}██║   ██║${NEON_PINK}██║╚██╔╝██║${NEON_GREEN}██║╚██╗██║${NEON_PINK}██║${NEON_GREEN}██╔══██║${NC}\n"
        printf "                 ${NEON_GREEN}██║${NEON_PINK}██║ ╚████║${NEON_GREEN}███████║${NEON_PINK}╚██████╔╝${NEON_GREEN}██║ ╚═╝ ██║${NEON_PINK}██║ ╚████║${NEON_GREEN}██║${NEON_PINK}██║  ██║${NC}\n"
        printf "                 ${NEON_PINK}╚═╝${NEON_GREEN}╚═╝  ╚═══╝${NEON_PINK}╚══════╝${NEON_GREEN} ╚═════╝ ${NEON_PINK}╚═╝     ╚═╝${NEON_GREEN}╚═╝  ╚═══╝${NEON_PINK}╚═╝${NEON_GREEN}╚═╝  ╚═╝${NC}\n"
        echo
        printf "                          ${NEON_GREEN}⚡${NC} Claude Automation System ${NEON_PINK}⚡${NC}\n"
        echo

        # Print donut
        for ((k=0; k<1760; k++)); do
            if (( k % 80 == 0 )); then
                echo
            else
                local char="${b[$k]}"
                if [[ "$char" != " " ]]; then
                    if (( RANDOM % 2 == 0 )); then
                        printf "${NEON_GREEN}%s${NC}" "$char"
                    else
                        printf "${NEON_PINK}%s${NC}" "$char"
                    fi
                else
                    printf " "
                fi
            fi
        done

        echo
        printf "\n                    ${DIM}Starting services... (${remaining}s)${NC}\n"

        A=$(echo "$A + 0.07" | bc -l)
        B=$(echo "$B + 0.03" | bc -l)

        sleep 0.05
    done
}

# Simpler matrix-style animation as fallback
run_matrix_welcome() {
    local duration=$1
    local start_time=$(date +%s)

    hide_cursor
    clear_screen

    local cols=$(tput cols)
    local rows=$(tput lines)
    local chars="アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789@#$%&*"

    declare -a drops
    for ((i=0; i<cols; i++)); do
        drops[$i]=$((RANDOM % rows))
    done

    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))

        if [[ $elapsed -ge $duration ]]; then
            break
        fi

        printf "\033[H"

        # Print banner in the middle
        local banner_row=$((rows / 2 - 5))

        for ((row=0; row<rows; row++)); do
            for ((col=0; col<cols; col++)); do
                if [[ $row -eq ${drops[$col]} ]]; then
                    local char_idx=$((RANDOM % ${#chars}))
                    printf "${NEON_GREEN}%s${NC}" "${chars:$char_idx:1}"
                    drops[$col]=$(( (drops[$col] + 1) % rows ))
                else
                    printf " "
                fi
            done
            echo
        done

        sleep 0.1
    done
}

# ASCII art banner animation
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
    local tagline="⚡ Claude Automation System ⚡"
    local tag_padding=$(( (width - ${#tagline}) / 2 ))
    printf "%*s${BOLD}%s${NC}\n" $tag_padding "" "$tagline"
    echo
    sleep 0.5
}

# Simple spinning donut using shell (optimized version)
run_simple_donut() {
    local duration=$1

    hide_cursor

    # Pre-compute lookup tables for better performance
    local -a sin_table cos_table
    for i in $(seq 0 628); do
        local angle=$(echo "scale=4; $i / 100" | bc -l)
        sin_table[$i]=$(echo "scale=4; s($angle)" | bc -l 2>/dev/null || echo "0")
        cos_table[$i]=$(echo "scale=4; c($angle)" | bc -l 2>/dev/null || echo "1")
    done

    local A=0 B=0
    local start_time=$(date +%s)
    local chars=".,-~:;=!*#\$@"

    while true; do
        local current_time=$(date +%s)
        [[ $((current_time - start_time)) -ge $duration ]] && break

        # Initialize frame buffer
        local -a buffer zbuffer
        for ((k=0; k<1760; k++)); do
            buffer[$k]=" "
            zbuffer[$k]=0
        done

        # Calculate frame
        local j=0
        while [[ $j -lt 628 ]]; do
            local i=0
            local sj=${sin_table[$j]:-0}
            local cj=${cos_table[$j]:-1}

            while [[ $i -lt 628 ]]; do
                local si=${sin_table[$i]:-0}
                local ci=${cos_table[$i]:-1}

                local h=$(echo "scale=4; $cj + 2" | bc -l)
                local D=$(echo "scale=4; 1 / ($si * $h * ${sin_table[$((A % 629))]:-0} + $sj * ${cos_table[$((A % 629))]:-1} + 5)" | bc -l)
                local t=$(echo "scale=4; $si * $h * ${cos_table[$((A % 629))]:-1} - $sj * ${sin_table[$((A % 629))]:-0}" | bc -l)

                local x=$(printf "%.0f" $(echo "scale=2; 40 + 30 * $D * ($ci * $h * ${cos_table[$((B % 629))]:-1} - $t * ${sin_table[$((B % 629))]:-0})" | bc -l) 2>/dev/null || echo "40")
                local y=$(printf "%.0f" $(echo "scale=2; 12 + 15 * $D * ($ci * $h * ${sin_table[$((B % 629))]:-0} + $t * ${cos_table[$((B % 629))]:-1})" | bc -l) 2>/dev/null || echo "12")

                local o=$((x + 80 * y))
                local N=$(printf "%.0f" $(echo "scale=2; 8 * (($sj * ${sin_table[$((A % 629))]:-0} - $si * $cj * ${cos_table[$((A % 629))]:-1}) * ${cos_table[$((B % 629))]:-1} - $si * $cj * ${sin_table[$((A % 629))]:-0} - $sj * ${cos_table[$((A % 629))]:-1} - $ci * $cj * ${sin_table[$((B % 629))]:-0})" | bc -l) 2>/dev/null || echo "0")

                if [[ $y -gt 0 && $y -lt 22 && $x -gt 0 && $x -lt 80 && $o -gt 0 && $o -lt 1760 ]]; then
                    local curr_z=${zbuffer[$o]:-0}
                    local cmp=$(echo "$D > $curr_z" | bc -l 2>/dev/null || echo "0")
                    if [[ "$cmp" == "1" ]]; then
                        zbuffer[$o]=$D
                        [[ $N -gt 0 && $N -lt 12 ]] && buffer[$o]="${chars:$N:1}" || buffer[$o]="."
                    fi
                fi

                ((i += 7))
            done
            ((j += 2))
        done

        # Render frame
        printf "\033[H"
        echo
        printf "                     ${NEON_GREEN}██╗${NEON_PINK}███╗   ██╗${NEON_GREEN}███████╗${NEON_PINK} ██████╗ ${NEON_GREEN}███╗   ███╗${NEON_PINK}███╗   ██╗${NEON_GREEN}██╗${NEON_PINK} █████╗ ${NC}\n"
        printf "                     ${NEON_PINK}██║${NEON_GREEN}████╗  ██║${NEON_PINK}██╔════╝${NEON_GREEN}██╔═══██╗${NEON_PINK}████╗ ████║${NEON_GREEN}████╗  ██║${NEON_PINK}██║${NEON_GREEN}██╔══██╗${NC}\n"
        printf "                     ${NEON_GREEN}██║${NEON_PINK}██╔██╗ ██║${NEON_GREEN}███████╗${NEON_PINK}██║   ██║${NEON_GREEN}██╔████╔██║${NEON_PINK}██╔██╗ ██║${NEON_GREEN}██║${NEON_PINK}███████║${NC}\n"
        printf "                     ${NEON_PINK}██║${NEON_GREEN}██║╚██╗██║${NEON_PINK}╚════██║${NEON_GREEN}██║   ██║${NEON_PINK}██║╚██╔╝██║${NEON_GREEN}██║╚██╗██║${NEON_PINK}██║${NEON_GREEN}██╔══██║${NC}\n"
        printf "                     ${NEON_GREEN}██║${NEON_PINK}██║ ╚████║${NEON_GREEN}███████║${NEON_PINK}╚██████╔╝${NEON_GREEN}██║ ╚═╝ ██║${NEON_PINK}██║ ╚████║${NEON_GREEN}██║${NEON_PINK}██║  ██║${NC}\n"
        printf "                     ${NEON_PINK}╚═╝${NEON_GREEN}╚═╝  ╚═══╝${NEON_PINK}╚══════╝${NEON_GREEN} ╚═════╝ ${NEON_PINK}╚═╝     ╚═╝${NEON_GREEN}╚═╝  ╚═══╝${NEON_PINK}╚═╝${NEON_GREEN}╚═╝  ╚═╝${NC}\n"
        echo
        printf "                              ${BOLD}⚡ Claude Automation System ⚡${NC}\n"
        echo

        for ((k=0; k<1760; k++)); do
            if (( k % 80 == 0 )); then
                echo
            else
                local char="${buffer[$k]}"
                if [[ "$char" != " " ]]; then
                    printf "${NEON_GREEN}%s${NC}" "$char"
                else
                    printf " "
                fi
            fi
        done

        local remaining=$((duration - (current_time - start_time)))
        printf "\n\n                         ${DIM}Starting services... (${remaining}s remaining)${NC}\n"

        ((A += 4))
        ((B += 2))
        sleep 0.1
    done

    show_cursor
}

# Fast spinning animation (no bc dependency)
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

    local donut_frames=(
'        **********
      **          **
    **              **
   *                  *
  *                    *
 *                      *
 *                      *
 *                      *
  *                    *
   *                  *
    **              **
      **          **
        **********        '

'        oooooooooo
      oo          oo
    oo              oo
   o                  o
  o                    o
 o                      o
 o                      o
 o                      o
  o                    o
   o                  o
    oo              oo
      oo          oo
        oooooooooo        '

'        @@@@@@@@@@
      @@          @@
    @@              @@
   @                  @
  @                    @
 @                      @
 @                      @
 @                      @
  @                    @
   @                  @
    @@              @@
      @@          @@
        @@@@@@@@@@        '
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

        # Print a large spinning character
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
        printf "                         ${DIM}Starting services... (${remaining}s remaining)${NC}\n"
        printf "                              ${NEON_GREEN}${frames[$i]}${NC}\n"

        i=$(( (i + 1) % ${#frames[@]} ))
        d=$(( (d + 1) % ${#big_frames[@]} ))
        sleep 0.15
    done

    show_cursor
}

# Print status message
print_success() {
    echo "${GREEN}✓${NC} $1"
}

print_error() {
    echo "${RED}✗${NC} $1"
}

print_info() {
    echo "${CYAN}ℹ${NC} $1"
}

print_warning() {
    echo "${YELLOW}⚠${NC} $1"
}

# Check if configured
check_config() {
    if [[ ! -f "$CONFIG_FILE" ]]; then
        return 1
    fi

    local phone=$(grep -o '"yourPhoneNumber"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" | cut -d'"' -f4)

    if [[ -z "$phone" ]]; then
        return 1
    fi

    return 0
}

# Start bridge
start_bridge() {
    if pgrep -f "node.*dist/server.js" >/dev/null; then
        print_warning "Bridge is already running"
        return 0
    fi

    # Remove stale lock
    rm -f "$BRIDGE_DIR/.bridge.lock"

    # Start bridge
    (cd "$BRIDGE_DIR" && npm start > /dev/null 2>&1 &)
    sleep 2

    if pgrep -f "node.*dist/server.js" >/dev/null; then
        print_success "Bridge started"
        return 0
    else
        print_error "Failed to start bridge"
        return 1
    fi
}

# Start dashboard
start_dashboard() {
    if lsof -Pi :3333 -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_warning "Dashboard already running on port 3333"
        return 0
    fi

    (cd "$DASHBOARD_DIR" && npm run dev > /dev/null 2>&1 &)
    sleep 3

    if lsof -Pi :3333 -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_success "Dashboard started at http://localhost:3333"
        return 0
    else
        print_warning "Dashboard may still be starting..."
        return 0
    fi
}

# Main start function
main() {
    # Check if setup has been done
    if ! check_config; then
        echo "${RED}Insomnia has not been configured yet.${NC}"
        echo
        echo "Please run the setup script first:"
        echo "  ${CYAN}./setup.sh${NC}"
        echo
        exit 1
    fi

    # Run the cool animation welcome (5 seconds)
    run_fast_spinner 5

    clear_screen
    show_cursor

    echo
    show_animated_banner
    echo

    # Start services
    echo "${BOLD}Starting Insomnia services...${NC}"
    echo

    start_bridge
    start_dashboard

    echo
    echo "${NEON_GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo
    echo "${BOLD}${NEON_GREEN}Insomnia is running! ⚡${NC}"
    echo
    echo "  ${CYAN}Dashboard:${NC} http://localhost:3333"
    echo "  ${CYAN}Bridge logs:${NC} tail -f $BRIDGE_DIR/imessage-server.log"
    echo
    echo "${DIM}Send an iMessage to yourself to test the system.${NC}"
    echo "${NEON_GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo

    # Open dashboard
    if command -v open >/dev/null 2>&1; then
        sleep 1
        open "http://localhost:3333"
    fi
}

# Run
main "$@"
