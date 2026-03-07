#!/bin/bash
set -euo pipefail

env_file="${ENV_FILE:-.env}"
export ENV_FILE="$env_file"
is_ci="${CI:-}"

compose_file_list="${COMPOSE_FILE:-docker-compose.yml}"
compose_cmd=(docker compose)
for f in $(printf "%s" "$compose_file_list" | tr ":" " "); do
  compose_cmd+=(-f "$f")
done

scale_args=""
has_celery_service=$("${compose_cmd[@]}" config --services 2>/dev/null | grep -q "celery-worker" && echo "true" || echo "false")
if [ "$is_ci" != "true" ] && [ "$has_celery_service" = "true" ]; then
  scale_args="--scale celery-worker=3"
fi

"${compose_cmd[@]}" up -d $scale_args
