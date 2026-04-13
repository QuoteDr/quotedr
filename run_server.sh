#!/bin/bash
# ALD Direct Inc. - Invoicing System Startup Script
# Owner: Adam

echo "=========================================="
echo "ALD Direct Inc. - Invoicing System"
echo "=========================================="
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: Python 3 is not installed or not in PATH"
    exit 1
fi

# Run the application directly (Flask already installed)
echo ""
echo "🚀 Starting web server..."
echo "   Access at: http://localhost:5000"
echo "   Press Ctrl+C to stop"
echo ""

cd /home/node/.openclaw/workspace/projects/ALD-Invoicing-WebApp
python3 app.py
