#!/usr/bin/env bash
set -euo pipefail

env_file=${1:-.env}

if [ ! -f "$env_file" ]; then
  echo "::error title=Missing production environment::$env_file does not exist"
  exit 1
fi

chmod 600 "$env_file"

ensure_secret() {
  local key=$1
  local value
  value=$(awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$env_file")

  if [ -n "$value" ]; then
    if [ "${#value}" -lt 24 ]; then
      echo "::error title=Weak production secret::$key must contain at least 24 characters"
      exit 1
    fi
    return
  fi

  value=$(openssl rand -hex 32)
  env_tmp=$(mktemp "$(dirname "$env_file")/.env.XXXXXX")
  awk -F= -v key="$key" '$1 != key' "$env_file" > "$env_tmp"
  printf '\n%s=%s\n' "$key" "$value" >> "$env_tmp"
  chmod 600 "$env_tmp"
  mv "$env_tmp" "$env_file"
  echo "::notice title=Production secret provisioned::$key was generated and stored with mode 0600"
}

ensure_secret WORKER_API_KEY
ensure_secret PLAID_TOKEN_ENCRYPTION_KEY
