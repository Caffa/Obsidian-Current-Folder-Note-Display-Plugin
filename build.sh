#!/bin/bash
# Build script for Current Folder Notes plugin

echo "Building Current Folder Notes plugin..."

# Run TypeScript compiler
npx tsc -noEmit false

# Use esbuild to bundle the project
node esbuild.config.mjs

echo "Build completed successfully!"

