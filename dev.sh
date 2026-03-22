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

# Wait for API readiness to avoid worker boot race
API_URL="${NEON_GOALS_API_URL:-http://localhost:3001}"
READY_CHECK_URL="${API_URL}/api/auth/me"
MAX_WAIT_SECONDS="${NEON_API_WAIT_TIMEOUT:-60}"
elapsed=0

echo "Waiting for API readiness at ${READY_CHECK_URL} (timeout: ${MAX_WAIT_SECONDS}s)..."
until curl -sS --max-time 2 -o /dev/null "${READY_CHECK_URL}"; do
    elapsed=$((elapsed + 1))
    if [ "$elapsed" -ge "$MAX_WAIT_SECONDS" ]; then
        echo "API did not become ready within ${MAX_WAIT_SECONDS}s; stopping."
        cleanup
    fi
    sleep 1
done

echo "API is ready."

# Start worker in background
echo "Starting Python worker..."
cd worker && NEON_GOALS_API_URL="${API_URL}" .venv/bin/python -m uvicorn main:app --port 5001 --reload &
WORKER_PID=$!

# Wait for all background jobs
wait
