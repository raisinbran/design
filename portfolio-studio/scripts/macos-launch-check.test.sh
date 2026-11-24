#!/usr/bin/env bash
set -euo pipefail

studio_root="$(cd "$(dirname "$0")/.." && pwd)"
source "$studio_root/scripts/macos-launch-check.sh"
forge_app="$(find "$studio_root/out" -maxdepth 2 -type d -name '*.app' -print -quit)"
if [[ -z "$forge_app" ]]; then
  echo "Cannot run negative control: Forge app is missing" >&2
  exit 1
fi

executable="$forge_app/Contents/MacOS/portfolio-studio"
if [[ ! -x "$executable" ]]; then
  echo "Cannot run negative control: packaged executable is missing" >&2
  exit 1
fi

test_profile="$(mktemp -d)"
trap 'rm -rf "$test_profile"' EXIT

# Simulate a launch command returning success without creating any application process.
successful_open_without_app() { return 0; }
if found_pid="$(start_and_confirm_launch "$executable" "$test_profile/user-data" 1 successful_open_without_app)"; then
  echo "FAIL: a successful open command with no application process matched PID $found_pid" >&2
  exit 1
fi
echo "PASS: successful open without an application process is rejected"
