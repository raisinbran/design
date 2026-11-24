#!/usr/bin/env bash

# Read the OS-reported executable name, never the command arguments; argv may contain
# the expected image path in an awk or shell helper without running that image.
application_process_ids() {
  local executable="$1"
  local pid process_executable
  while read -r pid process_executable; do
    if [[ "$pid" =~ ^[0-9]+$ && "$process_executable" == "$executable" ]]; then
      printf '%s\n' "$pid"
    fi
  done < <(ps -axww -o pid=,comm=)
}

find_application_process() {
  local executable="$1"
  local profile="$2"
  local earlier_pids="$3"
  local pid process_executable current_executable arguments

  while read -r pid process_executable; do
    [[ "$pid" =~ ^[0-9]+$ && "$process_executable" == "$executable" ]] || continue
    [[ "$earlier_pids" != *" $pid "* ]] || continue
    kill -0 "$pid" 2>/dev/null || continue

    # Recheck the exact PID and verify the disposable user-data argument.
    current_executable="$(ps -p "$pid" -ww -o comm= 2>/dev/null)" || continue
    [[ "$current_executable" == "$executable" ]] || continue
    arguments="$(ps -p "$pid" -ww -o args= 2>/dev/null)" || continue
    [[ " $arguments " == *" --user-data-dir=$profile "* ]] || continue
    printf '%s\n' "$pid"
    return 0
  done < <(ps -axww -o pid=,comm=)
  return 1
}

# The launch command succeeding is not sufficient: require a NEW process with the
# mounted app's exact executable and intended profile, alive after a second check.
start_and_confirm_launch() {
  local executable="$1"
  local profile="$2"
  local checks="$3"
  shift 3
  local earlier_pids attempt candidate confirmed
  earlier_pids=" $(application_process_ids "$executable" | tr '\n' ' ') "
  "$@" || return 1

  for ((attempt = 1; attempt <= checks; attempt++)); do
    if candidate="$(find_application_process "$executable" "$profile" "$earlier_pids")"; then
      sleep 1
      if confirmed="$(find_application_process "$executable" "$profile" "$earlier_pids")" &&
        [[ "$candidate" == "$confirmed" ]]; then
        printf '%s\n' "$candidate"
        return 0
      fi
    fi
    if ((attempt < checks)); then sleep 1; fi
  done
  return 1
}
