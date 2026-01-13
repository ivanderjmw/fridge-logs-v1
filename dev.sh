#!/bin/bash
# Bash script to run dev server with environment variables
# Usage: ./dev.sh

echo "Loading environment variables from .env.local..."

# Read .env.local file and export environment variables
if [ -f ".env.local" ]; then
    export $(grep -v '^#' .env.local | xargs)
    echo "✓ Environment variables loaded"
else
    echo "ERROR: .env.local file not found!"
    echo "Please copy .env.example to .env.local and fill in your Firebase credentials."
    exit 1
fi

echo ""
echo "Starting development server..."
npm run dev
