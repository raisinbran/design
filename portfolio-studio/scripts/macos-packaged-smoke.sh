#!/usr/bin/env bash
set -euo pipefail

studio_root="$(cd "$(dirname "$0")/.." && pwd)"
dmg="$(find "$studio_root/out/make" -type f -name '*.dmg' -print -quit)"
if [[ -z "$dmg" ]]; then
  echo "No Forge DMG found" >&2
  exit 1
fi

temporary="$(mktemp -d "${RUNNER_TEMP:-/tmp}/portfolio-studio-mac.XXXXXX")"
mount="$temporary/mounted"
mkdir -p "$mount"
mounted=0
launched_pid=""
cleanup() {
  if [[ -n "$launched_pid" ]]; then kill -TERM "$launched_pid" 2>/dev/null || true; fi
  if [[ "$mounted" == 1 ]]; then hdiutil detach "$mount" -quiet || true; fi
  rm -rf "$temporary"
}
trap cleanup EXIT

echo "macOS: $(sw_vers -productVersion), architecture: $(uname -m)"
echo "DMG SHA256: $(shasum -a 256 "$dmg")"
forge_app="$(find "$studio_root/out" -maxdepth 2 -type d -name '*.app' -print -quit)"
if [[ -z "$forge_app" ]]; then echo "Forge packaged app is missing" >&2; exit 1; fi
echo "Forge packaged bundle signature before DMG creation: $forge_app"
codesign --display --verbose=2 "$forge_app" 2>&1 || true
if ! codesign --verify --deep --strict --verbose=2 "$forge_app"; then
  echo "Forge packaged app has an invalid signature before the DMG maker" >&2
fi
hdiutil attach -readonly -nobrowse -mountpoint "$mount" "$dmg"
mounted=1
app="$(find "$mount" -maxdepth 1 -type d -name '*.app' -print -quit)"
if [[ -z "$app" ]]; then echo "DMG contains no app bundle" >&2; exit 1; fi
exe="$app/Contents/MacOS/portfolio-studio"
plist="$app/Contents/Info.plist"
if [[ ! -x "$exe" ]]; then echo "Missing or non-executable Mach-O: $exe" >&2; exit 1; fi

echo "App bundle: $app"
file "$exe"
stat -f 'Executable mode: %Sp' "$exe"
plutil -p "$plist" | grep -E 'CFBundleExecutable|CFBundlePackageType|CFBundleIdentifier' || true
codesign --display --verbose=4 "$app" 2>&1 || true
signature_ok=0
if codesign --verify --deep --strict --verbose=2 "$app"; then
  signature_ok=1
else
  echo "Strict signature verification FAILED" >&2
fi

# LaunchServices exercises a different entry path than launching the Mach-O directly.
mkdir -p "$temporary/launch-profile"
launch_ok=0
if open -n -a "$app" --args "--user-data-dir=$temporary/launch-profile"; then
  for _ in {1..12}; do
    launched_pid="$(ps -axo pid=,command= | awk -v executable="$exe" 'index($0, executable) { print $1; exit }')"
    if [[ -n "$launched_pid" ]]; then
      launch_ok=1
      break
    fi
    sleep 1
  done
else
  echo "LaunchServices open returned a failure" >&2
fi
echo "LaunchServices started process: $launch_ok; PID: ${launched_pid:-none}"
if [[ "$launch_ok" == 0 ]]; then
  log show --last 2m --style compact --predicate 'process == "lsd"' 2>/dev/null | tail -n 30 || true
else
  kill -TERM "$launched_pid" || true
  launched_pid=""
  sleep 2
fi

export PACKAGED_APP_EXE="$exe"
export PACKAGED_APP_VARIANT="macOS DMG executable"
direct_ok=0
if node "$studio_root/scripts/packaged-smoke.mjs"; then direct_ok=1; fi

if [[ "$signature_ok" == 0 || "$launch_ok" == 0 || "$direct_ok" == 0 ]]; then
  echo "Mac package diagnostics failed: signature=$signature_ok LaunchServices=$launch_ok direct=$direct_ok" >&2
  exit 1
fi
