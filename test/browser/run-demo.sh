#!/bin/bash

# Progressive Rendering Demo Runner for Enhanced S5.js
# This script starts a local HTTP server and opens the progressive rendering demo

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

echo "🎨 Enhanced S5.js - Progressive Rendering Demo"
echo "=============================================="
echo ""
echo "📍 Milestone 5 Grant Deliverable"
echo "   Progressive Rendering Strategies:"
echo "   • Blur (gradual sharpening)"
echo "   • Scan Lines (top-to-bottom reveal)"
echo "   • Interlaced (alternating lines)"
echo ""

# Check if Python is available
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ Error: Python is required to run the HTTP server"
    echo "Please install Python 3 or use an alternative HTTP server:"
    echo "  npm install -g http-server"
    echo "  npx http-server test/browser -p 8080"
    exit 1
fi

# Navigate to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../.." || exit 1

echo "📁 Working directory: $(pwd)"
echo ""

# No build step needed - the demo is standalone HTML
echo "✅ Demo is ready (standalone HTML)"
echo ""

echo "🌐 Starting HTTP server on http://${HOST}:${PORT}"
echo ""

# Function to open browser
open_browser() {
    URL="http://${HOST}:${PORT}/test/browser/progressive-rendering-demo.html"

    echo "🚀 Opening demo at: $URL"
    echo ""
    echo "📝 Instructions:"
    echo "   1. Select an image file (JPEG/PNG/WebP)"
    echo "   2. Set number of progressive scans (1-10)"
    echo "   3. Click 'Load Image with Progressive Rendering'"
    echo "   4. Watch all three strategies render side-by-side"
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

    echo "💡 Tip: Test in multiple browsers (Chrome, Firefox, Safari, Edge)"
    echo "     for complete browser compatibility validation"
    echo ""
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
