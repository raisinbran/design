#!/usr/bin/env bash

# Assert the macOS private-build signing policy: the main app and its helper apps, which load the
# ad-hoc-signed Electron Framework, carry exactly the two approved entitlements; Electron Framework
# itself carries no library-validation exception.
macos_signing_helper_names=("Portfolio Studio Helper" "Portfolio Studio Helper (GPU)" "Portfolio Studio Helper (Renderer)" "Portfolio Studio Helper (Plugin)")

# Ad-hoc signature, Hardened Runtime and no Team ID on one executable.
macos_check_adhoc_hardened() {
  local executable="$1" details
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
}

# The bundle holds allow-jit and disable-library-validation, both true, and no other entitlement
# (no camera, microphone, USB, location, get-task-allow, ...).
macos_check_exact_entitlements() {
  local bundle="$1" file key actual extra
  file="$(mktemp "${TMPDIR:-/tmp}/portfolio-studio-entitlements.XXXXXX")" || return 1
  if ! codesign --display --entitlements :- "$bundle" >"$file" 2>/dev/null || ! plutil -lint "$file" >/dev/null; then
    echo "Cannot inspect entitlements: $bundle" >&2
    rm -f "$file"
    return 1
  fi
  for key in com.apple.security.cs.allow-jit com.apple.security.cs.disable-library-validation; do
    actual="$(/usr/libexec/PlistBuddy -c "Print :$key" "$file" 2>/dev/null)" || actual=""
    if [[ "$actual" != "true" ]]; then
      echo "Required entitlement missing or false ($key): $bundle" >&2
      rm -f "$file"
      return 1
    fi
  done
  extra="$(/usr/libexec/PlistBuddy -c Print "$file" | sed -n 's/^    \([^ ]*\) = .*/\1/p' |
    grep -vxF -e com.apple.security.cs.allow-jit -e com.apple.security.cs.disable-library-validation || true)"
  rm -f "$file"
  if [[ -n "$extra" ]]; then
    echo "Unexpected entitlements in $bundle: $extra" >&2
    return 1
  fi
  echo "Exact entitlements verified: $bundle"
}

check_macos_adhoc_signing() {
  local bundle="$1"
  local framework_executable="$bundle/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework"
  local name helper file actual
  local executables=("$bundle/Contents/MacOS/portfolio-studio" "$framework_executable")
  local apps=("$bundle")

  # Every expected helper must be present; a missing one must not pass silently.
  for name in "${macos_signing_helper_names[@]}"; do
    helper="$bundle/Contents/Frameworks/$name.app"
    if [[ ! -d "$helper" ]]; then
      echo "Missing helper app: $helper" >&2
      return 1
    fi
    apps+=("$helper")
    executables+=("$helper/Contents/MacOS/$name")
  done

  local target
  for target in "${executables[@]}"; do macos_check_adhoc_hardened "$target" || return 1; done
  for target in "${apps[@]}"; do macos_check_exact_entitlements "$target" || return 1; done

  # Electron Framework itself must not acquire the library-validation exception.
  file="$(mktemp "${TMPDIR:-/tmp}/portfolio-studio-entitlements.XXXXXX")" || return 1
  if ! codesign --display --entitlements :- "$framework_executable" >"$file" 2>/dev/null; then
    echo "Cannot inspect Electron Framework entitlements: $framework_executable" >&2
    rm -f "$file"
    return 1
  fi
  if [[ -s "$file" ]]; then
    if ! plutil -lint "$file" >/dev/null; then
      echo "Electron Framework entitlements are invalid" >&2
      rm -f "$file"
      return 1
    fi
    actual="$(/usr/libexec/PlistBuddy -c "Print :com.apple.security.cs.disable-library-validation" "$file" 2>/dev/null)" || actual=""
    if [[ "$actual" == "true" ]]; then
      echo "Electron Framework unexpectedly has the library-validation exception" >&2
      rm -f "$file"
      return 1
    fi
  fi
  rm -f "$file"
  echo "Signing policy verified (main app and ${#macos_signing_helper_names[@]} helpers hold the exception; framework does not): $bundle"
}
