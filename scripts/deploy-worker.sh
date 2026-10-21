#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "$script_dir/.." && pwd)
cd "$repo_root"

worker_api_key=${WORKER_API_KEY:-}
if [ -z "$worker_api_key" ] && [ -f .env ]; then
  worker_api_key=$(
    awk -F= '$1 == "WORKER_API_KEY" {
      sub(/^[^=]*=/, "");
      sub(/\r$/, "");
      print;
      exit;
    }' .env
  )
fi
if [ "${#worker_api_key}" -lt 24 ]; then
  echo "::error title=Worker deploy blocked::WORKER_API_KEY is missing or too short"
  exit 1
fi

release_sha=$(git rev-parse --verify HEAD)
if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "::error title=Worker deploy blocked::Unable to resolve a release commit"
  exit 1
fi

archive_path=$(mktemp /tmp/neon-goals-worker.XXXXXX.tar)
trap 'test ! -e "$archive_path" || unlink "$archive_path"' EXIT
git archive --format=tar --output="$archive_path" "$release_sha"
remote_archive="/tmp/neon-goals-worker-$release_sha.tar"

echo "Uploading immutable worker release $release_sha to gilbert..."
scp "$archive_path" "gilbert:$remote_archive"

printf '%s\n' "$worker_api_key" | ssh gilbert 'set -euo pipefail
IFS= read -r worker_api_key
if [ "${#worker_api_key}" -lt 24 ]; then
  echo "Worker key transfer failed" >&2
  exit 1
fi
env_dir=/home/alpha/.config/neon-goals
env_file="$env_dir/worker.env"
mkdir -p "$env_dir"
env_tmp=$(mktemp "$env_dir/.worker.env.XXXXXX")
if [ -f "$env_file" ]; then
  grep -v "^WORKER_API_KEY=" "$env_file" > "$env_tmp" || true
fi
printf "WORKER_API_KEY=%s\n" "$worker_api_key" >> "$env_tmp"
chmod 600 "$env_tmp"
mv "$env_tmp" "$env_file"'

ssh gilbert bash -s -- "$release_sha" "$remote_archive" <<'ENDSSH'
set -euo pipefail

release_sha=$1
remote_archive=$2
release_root=/home/alpha/.local/share/neon-goals/releases
release_dir="$release_root/$release_sha"
current_link=/home/alpha/.local/share/neon-goals/current
uv_bin=/home/linuxbrew/.linuxbrew/bin/uv
python_bin=/home/alpha/.pyenv/versions/3.12.0/bin/python

mkdir -p "$release_root"
if [ ! -d "$release_dir" ]; then
  staging_dir=$(mktemp -d "$release_root/.staging-$release_sha.XXXXXX")
  tar -xf "$remote_archive" -C "$staging_dir"
  (
    cd "$staging_dir/worker"
    "$uv_bin" sync --frozen --group dev --python "$python_bin"
    "$uv_bin" run --frozen --group dev pytest -q
  )
  mv "$staging_dir" "$release_dir"
fi
unlink "$remote_archive"

previous_target=$(readlink -f "$current_link" 2>/dev/null || true)
ln -sfn "$release_dir" "$current_link"
sudo install -m 0644 "$release_dir/deploy/scraper-worker.service" /etc/systemd/system/scraper-worker.service
sudo systemctl daemon-reload
sudo systemctl restart scraper-worker.service

if ! curl --fail --silent --show-error --retry 10 --retry-all-errors --retry-delay 2 \
  http://100.91.29.119:5000/health >/dev/null; then
  echo "Worker release failed its health check" >&2
  if [ -n "$previous_target" ] && [ -d "$previous_target" ]; then
    ln -sfn "$previous_target" "$current_link"
    sudo systemctl restart scraper-worker.service
  fi
  sudo systemctl status scraper-worker.service --no-pager --lines=20 || true
  exit 1
fi

sudo systemctl is-active --quiet scraper-worker.service
echo "Worker release $release_sha is healthy"
ENDSSH

echo "Worker deployed successfully"
