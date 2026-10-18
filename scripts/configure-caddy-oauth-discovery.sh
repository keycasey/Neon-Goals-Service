#!/usr/bin/env bash
set -euo pipefail

admin_url=http://127.0.0.1:2019
servers_file=$(mktemp)
trap 'rm -f "$servers_file"' EXIT

for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if curl -fsS "$admin_url/config/apps/http/servers" >"$servers_file"; then
    break
  fi
  sleep 5
done

server_name=$(bun -e '
  const servers = JSON.parse(await Bun.file(process.argv[1]).text());
  const entries = Object.entries(servers);
  const selected = entries.find(([, server]) => JSON.stringify(server).includes("goals.keycasey.com")) ?? entries[0];
  if (!selected) process.exit(1);
  console.log(selected[0]);
' "$servers_file")

for route_id in neon-goals-oidc-alias neon-goals-as-alias neon-goals-prm-alias; do
  curl -fsS -X DELETE "$admin_url/id/$route_id" >/dev/null 2>&1 || true
done

add_alias() {
  local route_id=$1
  local public_path=$2
  local backend_path=$3
  curl -fsS -X POST \
    -H 'Content-Type: application/json' \
    --data-binary "{\"@id\":\"${route_id}\",\"match\":[{\"host\":[\"goals.keycasey.com\"],\"path\":[\"${public_path}\"]}],\"handle\":[{\"handler\":\"rewrite\",\"uri\":\"${backend_path}\"},{\"handler\":\"reverse_proxy\",\"upstreams\":[{\"dial\":\"127.0.0.1:3001\"}]}],\"terminal\":true}" \
    "$admin_url/config/apps/http/servers/${server_name}/routes/0" >/dev/null
}

add_alias neon-goals-oidc-alias '/.well-known/openid-configuration*' '/api/.well-known/openid-configuration'
add_alias neon-goals-as-alias '/.well-known/oauth-authorization-server*' '/api/.well-known/oauth-authorization-server'
add_alias neon-goals-prm-alias '/.well-known/oauth-protected-resource*' '/api/.well-known/oauth-protected-resource/mcp'
