#!/bin/bash
# Development script that runs both server and worker
# Properly kills both on Ctrl-C

set -e

# Cleanup function
cleanup() {
    echo "Stopping all processes..."
    kill $(jobs -p) 2>/dev/null
    exit 0
}

# Trap SIGINT (Ctrl-C) and SIGTERM
trap cleanup SIGINT SIGTERM

echo "Starting Neon Goals development environment..."
echo "Server: http://localhost:3001"
echo "Worker: http://localhost:5001"
echo ""

# Start server in background
echo "Starting NestJS server..."
bun run start:dev &
SERVER_PID=$!

# Wait a moment for server to start
sleep 2

# Start worker in background
echo "Starting Python worker..."
cd worker && NEON_GOALS_API_URL=http://localhost:3001 .venv/bin/python -m uvicorn main:app --port 5001 --reload &
WORKER_PID=$!

# Wait for all background jobs
wait
