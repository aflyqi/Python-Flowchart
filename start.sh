#!/usr/bin/env bash
# Start the Python Flowchart tool
# Usage: bash start.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Python Flowchart Tool ==="
echo ""

# Check if frontend is built
if [ ! -d "$SCRIPT_DIR/frontend/dist" ]; then
    echo "[!] Frontend not built. Building..."
    cd "$SCRIPT_DIR/frontend"
    NODE_ENV=development npm install
    NODE_ENV=development npm run build
    cd "$SCRIPT_DIR"
fi

echo "[✓] Starting server at http://localhost:8765"
echo ""
python "$SCRIPT_DIR/server.py"
