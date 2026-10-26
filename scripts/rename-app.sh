#!/usr/bin/env bash
# Gives the app your academy's identity: the iOS bundle id, the Android application id
# and package, the name under the icon and the deep-link scheme. Run it once on a fresh
# clone, before your first store build (docs/guides/release.md).
#
#   scripts/rename-app.sh --id org.northwind.academy --name "Northwind Academy" --scheme northwind
#
# It edits files in place; review the diff before committing.
set -euo pipefail

ID="" NAME="" SCHEME=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --id) ID="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --scheme) SCHEME="$2"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
if [[ -z "$ID" || -z "$NAME" || -z "$SCHEME" ]]; then
  echo "usage: $0 --id <reverse.dns.id> --name <display name> --scheme <url scheme>" >&2
  exit 2
fi
[[ "$ID" =~ ^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$ ]] || { echo "--id must look like org.example.app (lowercase)" >&2; exit 2; }
[[ "$SCHEME" =~ ^[a-z][a-z0-9+.-]*$ ]] || { echo "--scheme must be lowercase letters, digits, +, . or -" >&2; exit 2; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
OLD_ID="com.example.openlms"
OLD_SCHEME="openlms"
OLD_PKG_DIR="android/app/src/main/java/com/example/openlms"
NEW_PKG_DIR="android/app/src/main/java/${ID//.//}"

# Portable in-place sed (BSD on macOS, GNU on Linux).
sedi() { if sed --version >/dev/null 2>&1; then sed -i "$@"; else sed -i '' "$@"; fi; }
xml_escape() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
# A value safe inside a sed replacement: & means "the match" there, | is our delimiter.
sed_safe() { printf '%s' "$1" | sed -e 's/[&|\\]/\\&/g'; }

# iOS: bundle id, display name, URL scheme.
sedi -E "s/PRODUCT_BUNDLE_IDENTIFIER = \"?${OLD_ID//./\\.}\"?;/PRODUCT_BUNDLE_IDENTIFIER = \"$ID\";/g" ios/OpenLms.xcodeproj/project.pbxproj
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName $NAME" ios/OpenLms/Info.plist 2>/dev/null ||
  sedi "/<key>CFBundleDisplayName<\/key>/{n;s|<string>.*</string>|<string>$(sed_safe "$(xml_escape "$NAME")")</string>|;}" ios/OpenLms/Info.plist
sedi "s|<string>$OLD_SCHEME</string>|<string>$SCHEME</string>|g" ios/OpenLms/Info.plist

# Android: application id, namespace, package directory and declarations, name, scheme.
sedi "s/\"$OLD_ID\"/\"$ID\"/g" android/app/build.gradle
if [[ -d "$OLD_PKG_DIR" && "$OLD_PKG_DIR" != "$NEW_PKG_DIR" ]]; then
  mkdir -p "$NEW_PKG_DIR"
  git mv -k "$OLD_PKG_DIR"/* "$NEW_PKG_DIR"/ 2>/dev/null || mv "$OLD_PKG_DIR"/* "$NEW_PKG_DIR"/
  find android/app/src/main/java -type d -empty -delete
fi
while IFS= read -r -d '' kt; do sedi "s/^package $OLD_ID\$/package $ID/" "$kt"; done < <(find android/app/src/main/java -name '*.kt' -print0)
sedi "s|<string name=\"app_name\">.*</string>|<string name=\"app_name\">$(sed_safe "$(xml_escape "$NAME")")</string>|" android/app/src/main/res/values/strings.xml
sedi "s|android:scheme=\"$OLD_SCHEME\"|android:scheme=\"$SCHEME\"|g" android/app/src/main/AndroidManifest.xml

# JavaScript side: the scheme the app builds links with.
for f in .env .env.example; do
  [[ -f "$f" ]] && sedi "s/^APP_SCHEME=.*/APP_SCHEME=$SCHEME/" "$f"
done

cat <<MSG
Renamed to "$NAME" ($ID), scheme $SCHEME://

Next:
  1. cd ios && bundle exec pod install
  2. Set your Apple team in Xcode (Signing & Capabilities) and your release keystore in
     android/keystore.properties.
  3. If you use push, register $ID in your Firebase project and add its config files.
  4. Rebuild: pnpm ios / pnpm android.
MSG
