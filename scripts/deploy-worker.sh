#!/bin/bash
set -e

echo "🚀 Deploying scraper worker to Gilbert..."

# 1. Update the code on the remote machine
echo "📥 Pulling latest code..."
ssh gilbert "cd ~/Development/neon-goals-service && git pull"

# 2. Restart the worker service to apply changes
echo "🔄 Restarting scraper-worker service..."
ssh gilbert "sudo systemctl restart scraper-worker"

# 3. Check service status
echo "✅ Checking service status..."
ssh gilbert "sudo systemctl status scraper-worker --no-pager | head -n 10"

echo "✅ Repo updated and Scraper Worker restarted on Gilbert."
