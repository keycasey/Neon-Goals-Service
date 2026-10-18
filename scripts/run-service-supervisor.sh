#!/usr/bin/env bash
set -u

service_root=/var/www/Neon-Goals-Service
state_dir=/home/ec2-user/.neon-goals
mkdir -p "$state_dir"

exec 9>"$state_dir/service.lock"
flock -n 9 || exit 0

echo $$ >"$state_dir/service.pid"
trap 'rm -f /home/ec2-user/.neon-goals/service.pid' EXIT
cd "$service_root"

while true; do
  env NODE_ENV=production \
    MCP_ENABLED=true \
    MCP_OAUTH_ENABLED=true \
    MCP_PUBLIC_BASE_URL=https://goals.keycasey.com/api \
    MCP_PERSONAL_GRANTS_ENABLED=false \
    node dist/src/main.js >>"$state_dir/service.log" 2>&1
  service_exit=$?
  printf '%s service exited with code %s; restarting in 2s\n' "$(date -u +%FT%TZ)" "$service_exit" >>"$state_dir/service.log"
  sleep 2
done
