#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

kill_process_tree() {
  local pid="$1"
  # Kill the process group rooted at the backgrounded PID
  local pgid
  pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ') || true
  if [ -n "$pgid" ]; then
    kill -TERM -- -"$pgid" 2>/dev/null || true
    sleep 0.5
    kill -KILL -- -"$pgid" 2>/dev/null || true
  fi
}


cleanup_dev_servers() {
  echo ""
  echo "Shutting down dev servers..."
  trap '' SIGINT SIGTERM EXIT

  sleep 0.5

  if [ -n "${NX_PID:-}" ]; then
    kill_process_tree "$NX_PID"
  fi

  exit 0
}
