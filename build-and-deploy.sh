#!/bin/bash
# Bash script to build and deploy to Firebase with environment variables
# Usage: ./build-and-deploy.sh

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
echo "Building project..."
npm run build

if [ $? -eq 0 ]; then
    echo ""
    echo "Build successful! Deploying to Firebase..."
    firebase deploy --only hosting
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "Deployment complete! 🎉"
    else
        echo ""
        echo "Deployment failed!"
        exit 1
    fi
else
    echo ""
    echo "Build failed!"
    exit 1
fi
