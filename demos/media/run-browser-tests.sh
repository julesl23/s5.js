#!/bin/bash

# Browser Test Runner for S5.js Media Processing
# This script starts a local HTTP server and opens the browser tests

# Check if port 8080 is available by trying to connect
if nc -z localhost 8080 2>/dev/null; then
    # Port 8080 is in use, use 8081
    PORT=8081
    echo "ℹ️  Port 8080 is in use, using port 8081 instead"
else
    # Port 8080 is available
    PORT=8080
fi

HOST="localhost"

echo "🧪 S5.js Media Processing - Browser Test Runner"
echo "=============================================="
echo ""

# Check if Python is available
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ Error: Python is required to run the HTTP server"
    echo "Please install Python 3 or use an alternative HTTP server"
    exit 1
fi

# Navigate to project root
cd "$(dirname "$0")/../.." || exit 1

echo "📁 Working directory: $(pwd)"
echo ""

# Build the project first
echo "🔨 Building S5.js..."
if npm run build; then
    echo "✅ Build successful"
else
    echo "❌ Build failed. Please fix build errors and try again."
    exit 1
fi

echo ""
echo "🌐 Starting HTTP server on http://${HOST}:${PORT}"
echo ""

# Function to open browser
open_browser() {
    URL="http://${HOST}:${PORT}/demos/media/browser-tests.html"

    echo "📊 Opening browser tests at: $URL"
    echo ""

    # Detect OS and open browser
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command -v xdg-open &> /dev/null; then
            xdg-open "$URL" 2>/dev/null &
        elif command -v gnome-open &> /dev/null; then
            gnome-open "$URL" 2>/dev/null &
        else
            echo "Please open your browser and navigate to: $URL"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        open "$URL" 2>/dev/null &
    elif [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
        # Windows
        start "$URL" 2>/dev/null &
    else
        echo "Please open your browser and navigate to: $URL"
    fi
}

# Start the server and open browser after a short delay
(sleep 2 && open_browser) &

echo "🚀 Server starting..."
echo "   Press Ctrl+C to stop the server"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start the HTTP server
$PYTHON_CMD -m http.server $PORT --bind $HOST 2>/dev/null || {
    echo ""
    echo "❌ Failed to start server on port $PORT"
    echo "   The port might be in use. Try a different port:"
    echo "   $PYTHON_CMD -m http.server 8081"
    exit 1
}