#!/usr/bin/env bash

# Assert that the macOS private-build exception is present on the main app only.
check_macos_adhoc_signing() {
  local bundle="$1"
  local main_executable="$bundle/Contents/MacOS/portfolio-studio"
  local framework_executable="$bundle/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework"
  local executable details

  for executable in "$main_executable" "$framework_executable"; do
    if [[ ! -f "$executable" ]]; then
      echo "Missing signed executable: $executable" >&2
      return 1
    fi
    if ! details="$(codesign --display --verbose=4 "$executable" 2>&1)"; then
      echo "Cannot inspect executable signature: $executable" >&2
      return 1
    fi
    if ! grep -Fqx 'Signature=adhoc' <<<"$details" ||
       ! grep -Fqx 'TeamIdentifier=not set' <<<"$details" ||
       ! grep -Eq 'CodeDirectory .*flags=[^[:space:]]*runtime' <<<"$details"; then
      echo "Expected ad-hoc signature with Hardened Runtime and no Team ID: $executable" >&2
      return 1
    fi
    echo "Ad-hoc hardened signature verified: $executable"
  done

  local entitlement_file key actual
  entitlement_file="$(mktemp "${TMPDIR:-/tmp}/portfolio-studio-entitlements.XXXXXX")" || return 1
  if ! codesign --display --entitlements :- "$bundle" >"$entitlement_file" 2>/dev/null ||
     ! plutil -lint "$entitlement_file" >/dev/null; then
    echo "Cannot inspect main app entitlements: $bundle" >&2
    rm -f "$entitlement_file"
    return 1
  fi
  for key in com.apple.security.cs.allow-jit com.apple.security.cs.disable-library-validation; do
    actual="$(/usr/libexec/PlistBuddy -c "Print :$key" "$entitlement_file" 2>/dev/null)" || actual=""
    if [[ "$actual" != "true" ]]; then
      echo "Required main-app entitlement missing or false: $key" >&2
      rm -f "$entitlement_file"
      return 1
    fi
  done

  # Electron Framework itself must not acquire the main-process exception.
  if codesign --display --entitlements :- "$framework_executable" >"$entitlement_file" 2>/dev/null; then
    if [[ -s "$entitlement_file" ]] && ! plutil -lint "$entitlement_file" >/dev/null; then
      echo "Electron Framework entitlements are invalid" >&2
      rm -f "$entitlement_file"
      return 1
    fi
    actual="$(/usr/libexec/PlistBuddy -c "Print :com.apple.security.cs.disable-library-validation" "$entitlement_file" 2>/dev/null)" || actual=""
    if [[ "$actual" == "true" ]]; then
      echo "Electron Framework unexpectedly has the main-process library-validation exception" >&2
      rm -f "$entitlement_file"
      return 1
    fi
  fi
  rm -f "$entitlement_file"
  echo "Main-app signing exception verified; framework exception absent: $bundle"
}
