#!/bin/zsh
set -u

cd "$(dirname "$0")"

export PORT="${PORT:-5178}"
export NO_OPEN=1

BUNDLED_NODE="$PWD/runtime/node"
LOG_FILE="$PWD/local-helper.log"

echo "================================================"
echo "Music Link Filler - Local Helper"
echo "================================================"
echo
echo "Folder: $PWD"
echo "Log: $LOG_FILE"
echo

if [ ! -f "$PWD/server.js" ]; then
  echo "[ERROR] server.js was not found."
  echo
  echo "Do not run this file inside the ZIP preview."
  echo "Please unzip the whole package first, then run start-local-helper-macos.command."
  echo
  read "?Press Enter to close..."
  exit 1
fi

if [ ! -d "$PWD/public" ]; then
  echo "[ERROR] The public folder was not found."
  echo "Please download the helper again and unzip the whole package first."
  echo
  read "?Press Enter to close..."
  exit 1
fi

if [ -f "$BUNDLED_NODE" ]; then
  chmod +x "$BUNDLED_NODE" 2>/dev/null || true
  NODE_EXE="$BUNDLED_NODE"
else
  if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js was not found."
    echo "Please download the full macOS helper package, or install Node.js 22+."
    echo
    read "?Press Enter to close..."
    exit 1
  fi
  NODE_EXE="node"
fi

echo "Starting local helper..."
echo "Local helper address: http://127.0.0.1:$PORT"
echo "Keep this window open, then return to the online page and connect the local helper."
echo
echo "If startup fails, send local-helper.log to the tool maker."
echo

"$NODE_EXE" server.js > "$LOG_FILE" 2>&1
EXIT_CODE=$?

echo
echo "Local helper stopped. Exit code: $EXIT_CODE"
echo "Last log lines:"
echo "------------------------------------------------"
if [ -f "$LOG_FILE" ]; then
  tail -n 30 "$LOG_FILE"
fi
echo "------------------------------------------------"
read "?Press Enter to close..."
exit "$EXIT_CODE"
