#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "$SCRIPT_DIR/cleanup-dev.sh"

trap cleanup_dev_servers SIGINT SIGTERM EXIT

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

npx nx run-many -t dev &
NX_PID=$!
wait $NX_PID
