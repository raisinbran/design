#!/usr/bin/env bash
set -euo pipefail

studio_root="$(cd "$(dirname "$0")/.." && pwd)"
source "$studio_root/scripts/macos-signing-policy.sh"
temporary="$(mktemp -d "${RUNNER_TEMP:-/tmp}/portfolio-studio-signing-test.XXXXXX")"
trap 'rm -rf "$temporary"' EXIT

app="$temporary/Portfolio Studio.app"
main_executable="$app/Contents/MacOS/portfolio-studio"
framework_executable="$app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework"
mkdir -p "$(dirname "$main_executable")" "$(dirname "$framework_executable")"
touch "$main_executable" "$framework_executable"
new_entitlements="$studio_root/scripts/macos-adhoc-main-entitlements.plist"
legacy_entitlements="$temporary/legacy.plist"
cp "$new_entitlements" "$legacy_entitlements"
extra_entitlements="$temporary/extra.plist"
cp "$new_entitlements" "$extra_entitlements"
/usr/libexec/PlistBuddy -c 'Add :com.apple.security.device.camera bool true' "$extra_entitlements"
/usr/libexec/PlistBuddy -c 'Delete :com.apple.security.cs.disable-library-validation' "$legacy_entitlements"

# Stub codesign outputs, keeping the system plist parser real.
signing_scenario="legacy-main"
codesign() {
  if [[ "$1" == "--display" && "$2" == "--verbose=4" ]]; then
    if [[ "$signing_scenario" == "missing-runtime" && "$3" == "$main_executable" ]]; then
      printf '%s\n' 'CodeDirectory v=20500 flags=0x2(adhoc)' >&2
    else
      printf '%s\n' 'CodeDirectory v=20500 flags=0x10002(adhoc,runtime)' >&2
    fi
    printf '%s\n' 'Signature=adhoc' 'TeamIdentifier=not set' >&2
    return 0
  fi
  if [[ "$1" == "--display" && "$2" == "--entitlements" && "$3" == ":-" ]]; then
    case "$4" in
      "$app")
        if [[ "$signing_scenario" == "legacy-main" ]]; then
          cat "$legacy_entitlements"
        elif [[ "$signing_scenario" == "extra-entitlement" ]]; then
          cat "$extra_entitlements"
        else
          cat "$new_entitlements"
        fi
        return 0
        ;;
      "$framework_executable")
        if [[ "$signing_scenario" == "framework-inspect-fails" ]]; then
          return 1
        fi
        if [[ "$signing_scenario" == "framework-leak" ]]; then
          cat "$new_entitlements"
        else
          cat "$legacy_entitlements"
        fi
        return 0
        ;;
    esac
  fi
  return 1
}

expect_rejected() {
  local scenario="$1"
  signing_scenario="$scenario"
  if check_macos_adhoc_signing "$app" >"$temporary/check.log" 2>&1; then
    echo "FAIL: signing scenario $scenario was incorrectly accepted" >&2
    return 1
  fi
  echo "PASS: rejected signing scenario $scenario"
}

# The current pre-fix signing policy must fail even if codesign verifies successfully.
expect_rejected "legacy-main"
expect_rejected "missing-runtime"
expect_rejected "framework-leak"
expect_rejected "extra-entitlement"
expect_rejected "framework-inspect-fails"
signing_scenario="corrected"
check_macos_adhoc_signing "$app"
echo "PASS: corrected, narrowly scoped main-app exception accepted"
