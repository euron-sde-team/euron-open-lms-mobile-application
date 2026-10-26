#!/usr/bin/env bash
# Forwards the local euron-open-lms stack's ports into a connected Android emulator or
# USB device, so the app's localhost URLs (API, website, S3 emulator, stubs) work there
# exactly as on the iOS simulator. Run it again after an emulator restarts.
#
#   pnpm android:reverse            (every connected device)
set -euo pipefail
PORTS=(5026 3530 4597 5119 8046 8081)
devices="$(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')"
if [[ -z "$devices" ]]; then
  echo "No Android device or emulator connected (adb devices)." >&2
  exit 1
fi
for d in $devices; do
  for p in "${PORTS[@]}"; do adb -s "$d" reverse "tcp:$p" "tcp:$p" >/dev/null; done
  echo "$d: forwarded ${PORTS[*]}"
done
