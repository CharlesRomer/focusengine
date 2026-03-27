#!/usr/bin/env bash
set -e

COMPASS_DIR="$HOME/.compass"
TRACKER_URL="https://focusengine-one.vercel.app/tracker.py"
PLIST_LABEL="com.compass.tracker"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Compass macOS Agent Installer"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check Python 3.9+
PYTHON=$(which python3 || true)
if [ -z "$PYTHON" ]; then
  echo "Error: Python 3 not found. Install from python.org and try again."
  exit 1
fi

PY_VERSION=$($PYTHON -c "import sys; print(sys.version_info >= (3,9))")
if [ "$PY_VERSION" != "True" ]; then
  echo "Error: Python 3.9+ required."
  exit 1
fi

echo "✓ Python 3 found: $PYTHON"

# Install dependencies
echo "Installing dependencies..."
$PYTHON -m pip install --quiet pyobjc-framework-Cocoa schedule requests

# Create config dir
mkdir -p "$COMPASS_DIR"

# Download tracker
echo "Downloading tracker..."
curl -sSL "$TRACKER_URL" -o "$COMPASS_DIR/tracker.py"
chmod +x "$COMPASS_DIR/tracker.py"

# Write LaunchAgent plist
cat > "$PLIST_PATH" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${PYTHON}</string>
        <string>${COMPASS_DIR}/tracker.py</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${COMPASS_DIR}/tracker.log</string>
    <key>StandardErrorPath</key>
    <string>${COMPASS_DIR}/tracker.error.log</string>
</dict>
</plist>
PLIST

# Load it
launchctl load "$PLIST_PATH" 2>/dev/null || true

echo ""
echo "✓ Agent installed and started"
echo ""
echo "Next step: Open Compass > Settings > Agent to copy your session token."
echo "Opening Compass now..."
open "https://focusengine-one.vercel.app/settings"
