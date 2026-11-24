#!/bin/sh
set -e
cd "$(dirname "$0")"
[ -d node_modules ] || npm ci
# Newer npm skips Electron's install script, which downloads the app binary.
[ -f node_modules/electron/path.txt ] || node node_modules/electron/install.js
npm start
