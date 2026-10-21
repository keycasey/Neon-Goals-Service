#!/usr/bin/env bash
set -uo pipefail

service_root=/var/www/Neon-Goals-Service
state_dir=/home/ec2-user/.neon-goals
mkdir -p "$state_dir"

exec 9>"$state_dir/service.lock"
flock -n 9 || exit 0

echo $$ >"$state_dir/service.pid"
cd "$service_root"

child_pid=
stop_requested=false

handle_stop() {
  stop_requested=true
  if [ -n "$child_pid" ] && kill -0 "$child_pid" 2>/dev/null; then
    kill "$child_pid" 2>/dev/null || true
  fi
}

cleanup() {
  handle_stop
  unlink "$state_dir/service.pid" 2>/dev/null || true
}

trap handle_stop TERM INT
trap cleanup EXIT

while true; do
  env NODE_ENV=production \
    MCP_ENABLED=true \
    MCP_OAUTH_ENABLED=true \
    MCP_PUBLIC_BASE_URL=https://goals.keycasey.com/api \
    MCP_PERSONAL_GRANTS_ENABLED=false \
    node dist/src/main.js >>"$state_dir/service.log" 2>&1 9>&- &
  child_pid=$!
  wait "$child_pid"
  service_exit=$?
  child_pid=
  if [ "$stop_requested" = "true" ]; then
    exit 0
  fi
  printf '%s service exited with code %s; restarting in 2s\n' "$(date -u +%FT%TZ)" "$service_exit" >>"$state_dir/service.log"
  sleep 2
done
