#!/bin/sh
set -e
cd "$(dirname "$0")"
[ -d node_modules ] || npm ci
npm start
