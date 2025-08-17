#!/bin/bash
# S5 Real Server Startup Script

# Load seed phrase from file
if [ -f ~/.s5-seed ]; then
    export S5_SEED_PHRASE="$(cat ~/.s5-seed)"
    echo "✅ Using seed phrase from ~/.s5-seed"
else
    echo "❌ ERROR: No seed phrase file found at ~/.s5-seed"
    echo "Create one with: echo 'your twelve word seed phrase here' > ~/.s5-seed"
    exit 1
fi

# Start the server
echo "Starting S5 Real Server with persistent identity..."
node server-real-s5.js
