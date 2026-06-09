#!/bin/bash

echo "========================================"
echo "  AvgExpert Gateway - Startup (Debian 12)"
echo "========================================"
echo ""

cd "$(dirname "$0")"

echo "[INFO] Starting API Gateway..."
echo ""
echo "========================================"
echo "  System is LIVE. Press Ctrl+C to stop."
echo "========================================"
echo ""

npm start
