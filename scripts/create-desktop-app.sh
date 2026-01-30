#!/bin/bash

#######################################################################
#                    CREATE DESKTOP APP                                #
#                Creates macOS .app bundle for Insomnia                #
#######################################################################

set -e

# Colors
GREEN='\033[0;32m'
NC='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSOMNIA_DIR="$(dirname "$SCRIPT_DIR")"
APP_NAME="Insomnia"
APP_DIR="/Applications/${APP_NAME}.app"

echo
echo -e "${GREEN}────────────────────────────────────────────────────────────────────────────${NC}"
echo -e "${BOLD}  Creating ${APP_NAME} Desktop Application${NC}"
echo -e "${GREEN}────────────────────────────────────────────────────────────────────────────${NC}"
echo

# Check if app already exists
if [[ -d "$APP_DIR" ]]; then
    echo -e "${DIM}Warning: ${APP_DIR} already exists.${NC}"
    read -p "Do you want to replace it? (y/n): " replace
    if [[ "$replace" != "y" && "$replace" != "Y" ]]; then
        echo "Aborted."
        exit 1
    fi
    rm -rf "$APP_DIR"
fi

# Create app bundle structure
echo -e "${DIM}Creating app bundle structure...${NC}"
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

# Create Info.plist
echo -e "${DIM}Creating Info.plist...${NC}"
cat > "$APP_DIR/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>Insomnia</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundleIdentifier</key>
    <string>com.insomnia.claude-automation</string>
    <key>CFBundleName</key>
    <string>Insomnia</string>
    <key>CFBundleDisplayName</key>
    <string>Insomnia</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSUIElement</key>
    <false/>
</dict>
</plist>
PLIST

# Create the launcher script
echo -e "${DIM}Creating launcher script...${NC}"
cat > "$APP_DIR/Contents/MacOS/Insomnia" << LAUNCHER
#!/bin/bash

# Insomnia Desktop App Launcher
# This script launches Insomnia and opens the dashboard

INSOMNIA_DIR="$INSOMNIA_DIR"
LOG_FILE="\$INSOMNIA_DIR/bridge/app-launcher.log"

# Log function
log() {
    echo "\$(date '+%Y-%m-%d %H:%M:%S') - \$1" >> "\$LOG_FILE"
}

log "Insomnia app launched"

# Check if Terminal is available and launch start.sh
if [[ -x "\$INSOMNIA_DIR/start.sh" ]]; then
    log "Starting Insomnia via start.sh"

    # Open Terminal with the start script
    osascript << APPLESCRIPT
        tell application "Terminal"
            activate
            do script "cd '\$INSOMNIA_DIR' && ./start.sh"
        end tell
APPLESCRIPT

    log "Terminal launched with start.sh"

    # Wait for services to start, then open dashboard
    (sleep 5 && open "http://localhost:3333") &
    log "Dashboard will open in browser"
else
    log "ERROR: start.sh not found at \$INSOMNIA_DIR/start.sh"
    osascript -e 'display alert "Insomnia Error" message "Could not find start.sh. Please ensure Insomnia is properly installed."'
fi
LAUNCHER

chmod +x "$APP_DIR/Contents/MacOS/Insomnia"

# Create the app icon (a simple placeholder - user can replace with custom icon)
echo -e "${DIM}Creating app icon...${NC}"

# Create iconset directory
ICONSET_DIR="$INSOMNIA_DIR/scripts/AppIcon.iconset"
mkdir -p "$ICONSET_DIR"

# Generate a simple icon using Python (available on macOS)
python3 << 'PYTHON_SCRIPT'
import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    # If PIL not available, skip icon creation
    sys.exit(0)

def create_icon(size, filename):
    # Create image with gradient background
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Create circular gradient (neon green to pink)
    center = size // 2
    for r in range(center, 0, -1):
        # Gradient from pink (#c6408e) to green (#2ee89e)
        ratio = r / center
        red = int(198 * ratio + 46 * (1 - ratio))
        green = int(64 * ratio + 232 * (1 - ratio))
        blue = int(142 * ratio + 158 * (1 - ratio))
        draw.ellipse(
            [center - r, center - r, center + r, center + r],
            fill=(red, green, blue, 255)
        )

    # Draw a donut hole in the center
    hole_radius = size // 4
    draw.ellipse(
        [center - hole_radius, center - hole_radius,
         center + hole_radius, center + hole_radius],
        fill=(30, 30, 30, 255)
    )

    # Draw "I" in the center
    try:
        font_size = size // 3
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
    except:
        font = ImageFont.load_default()

    text = "I"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    text_x = (size - text_width) // 2
    text_y = (size - text_height) // 2 - bbox[1]
    draw.text((text_x, text_y), text, fill=(46, 232, 158, 255), font=font)

    img.save(filename, 'PNG')

iconset_dir = os.environ.get('ICONSET_DIR', '/tmp/AppIcon.iconset')
os.makedirs(iconset_dir, exist_ok=True)

sizes = [16, 32, 64, 128, 256, 512, 1024]
for size in sizes:
    create_icon(size, f"{iconset_dir}/icon_{size}x{size}.png")
    if size <= 512:
        create_icon(size * 2, f"{iconset_dir}/icon_{size}x{size}@2x.png")

print("Icons created successfully")
PYTHON_SCRIPT

# Check if iconset was created and convert to icns
if [[ -d "$ICONSET_DIR" ]] && [[ -n "$(ls -A "$ICONSET_DIR" 2>/dev/null)" ]]; then
    echo -e "${DIM}Converting to .icns format...${NC}"
    iconutil -c icns "$ICONSET_DIR" -o "$APP_DIR/Contents/Resources/AppIcon.icns" 2>/dev/null || true
    rm -rf "$ICONSET_DIR"
else
    echo -e "${DIM}Note: Could not create custom icon (PIL not installed). Using system default.${NC}"
fi

# Register the app with Launch Services
echo -e "${DIM}Registering app with macOS...${NC}"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP_DIR" 2>/dev/null || true

# Touch the app to update Finder
touch "$APP_DIR"

echo
echo -e "${GREEN}Success! ${APP_NAME}.app has been created.${NC}"
echo
echo -e "${BOLD}Location:${NC} ${APP_DIR}"
echo
echo -e "${DIM}You can now:${NC}"
echo -e "  1. Find it in Finder under Applications"
echo -e "  2. Drag it to your Dock to pin it"
echo -e "  3. Use Spotlight (Cmd+Space) and type '${APP_NAME}' to launch"
echo
echo -e "${GREEN}────────────────────────────────────────────────────────────────────────────${NC}"

# Offer to open Applications folder
read -p "Would you like to open the Applications folder now? (y/n): " open_apps
if [[ "$open_apps" == "y" || "$open_apps" == "Y" ]]; then
    open /Applications
fi
