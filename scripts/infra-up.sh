#!/bin/bash
set -euo pipefail

env_file="${ENV_FILE:-.env}"
export ENV_FILE="$env_file"

compose_file_list="${COMPOSE_FILE:-docker-compose.yml}"
compose_cmd=(docker compose)
for f in $(printf "%s" "$compose_file_list" | tr ":" " "); do
  compose_cmd+=(-f "$f")
done

"${compose_cmd[@]}" up -d
