#!/bin/bash
# Simple script to serve the website locally

echo "Starting local server..."
echo "Open http://localhost:8000 in your browser"
echo "Press Ctrl+C to stop"

cd public
python3 -m http.server 8000
