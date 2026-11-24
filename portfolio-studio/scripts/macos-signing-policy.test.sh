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
for name in "${macos_signing_helper_names[@]}"; do
  mkdir -p "$app/Contents/Frameworks/$name.app/Contents/MacOS"
  touch "$app/Contents/Frameworks/$name.app/Contents/MacOS/$name"
done
bad_helper="$app/Contents/Frameworks/Portfolio Studio Helper (GPU).app"
bad_helper_executable="$bad_helper/Contents/MacOS/Portfolio Studio Helper (GPU)"

new_entitlements="$studio_root/scripts/macos-adhoc-main-entitlements.plist"
legacy_entitlements="$temporary/legacy.plist"
extra_entitlements="$temporary/extra.plist"
cp "$new_entitlements" "$legacy_entitlements"
cp "$new_entitlements" "$extra_entitlements"
/usr/libexec/PlistBuddy -c 'Delete :com.apple.security.cs.disable-library-validation' "$legacy_entitlements"
/usr/libexec/PlistBuddy -c 'Add :com.apple.security.get-task-allow bool true' "$extra_entitlements"

# Stub codesign outputs, keeping the system plist parser real.
signing_scenario="legacy-main"
codesign() {
  if [[ "$1" == "--display" && "$2" == "--verbose=4" ]]; then
    local flags='0x10002(adhoc,runtime)' signature='Signature=adhoc' team='TeamIdentifier=not set'
    if [[ "$signing_scenario" == "missing-runtime" && "$3" == "$main_executable" ]] ||
       [[ "$signing_scenario" == "helper-missing-runtime" && "$3" == "$bad_helper_executable" ]]; then
      flags='0x2(adhoc)'
    fi
    if [[ "$signing_scenario" == "helper-team-id" && "$3" == "$bad_helper_executable" ]]; then
      team='TeamIdentifier=ABCDE12345'
    fi
    printf '%s\n' "CodeDirectory v=20500 flags=$flags" "$signature" "$team" >&2
    return 0
  fi
  if [[ "$1" == "--display" && "$2" == "--entitlements" && "$3" == ":-" ]]; then
    case "$4" in
      "$app")
        case "$signing_scenario" in
          legacy-main) cat "$legacy_entitlements" ;;
          extra-entitlement) cat "$extra_entitlements" ;;
          *) cat "$new_entitlements" ;;
        esac
        return 0
        ;;
      "$bad_helper")
        case "$signing_scenario" in
          helper-missing-exception) cat "$legacy_entitlements" ;;
          helper-extra-entitlement) cat "$extra_entitlements" ;;
          *) cat "$new_entitlements" ;;
        esac
        return 0
        ;;
      "$app/Contents/Frameworks/"*Helper*.app)
        cat "$new_entitlements"
        return 0
        ;;
      "$framework_executable")
        [[ "$signing_scenario" == "framework-inspect-fails" ]] && return 1
        if [[ "$signing_scenario" == "framework-leak" ]]; then cat "$new_entitlements"; else cat "$legacy_entitlements"; fi
        return 0
        ;;
    esac
  fi
  return 1
}

# Each bad configuration must be rejected, and for the intended reason.
expect_rejected() {
  local scenario="$1" reason="$2"
  signing_scenario="$scenario"
  if check_macos_adhoc_signing "$app" >"$temporary/check.log" 2>&1; then
    echo "FAIL: signing scenario $scenario was incorrectly accepted" >&2
    return 1
  fi
  if ! grep -Fq "$reason" "$temporary/check.log"; then
    echo "FAIL: scenario $scenario was rejected for the wrong reason:" >&2
    cat "$temporary/check.log" >&2
    return 1
  fi
  echo "PASS: rejected signing scenario $scenario"
}

expect_rejected "legacy-main" "Required entitlement missing or false"
expect_rejected "missing-runtime" "Expected ad-hoc signature with Hardened Runtime"
expect_rejected "framework-leak" "Electron Framework unexpectedly has"
expect_rejected "framework-inspect-fails" "Cannot inspect Electron Framework entitlements"
expect_rejected "extra-entitlement" "Unexpected entitlements"
expect_rejected "helper-missing-exception" "Required entitlement missing or false"
expect_rejected "helper-extra-entitlement" "Unexpected entitlements in $bad_helper"
expect_rejected "helper-missing-runtime" "Expected ad-hoc signature with Hardened Runtime"
expect_rejected "helper-team-id" "Expected ad-hoc signature with Hardened Runtime"
rm -rf "$bad_helper"
expect_rejected "helper-absent" "Missing helper app"
mkdir -p "$bad_helper/Contents/MacOS"
touch "$bad_helper_executable"
signing_scenario="corrected"
check_macos_adhoc_signing "$app" >"$temporary/check.log"
grep -Fq "Exact entitlements verified: $bad_helper" "$temporary/check.log"
echo "PASS: corrected configuration accepted; every helper inspected"
