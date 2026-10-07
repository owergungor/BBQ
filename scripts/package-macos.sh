#!/usr/bin/env bash
# BBQ macOS Release Packaging Script
# Standardizes release artifacts to:
#   - mac-arm64.app.zip
#   - mac-arm64.dmg
# Computes SHA256 checksums after renaming and verifies ARM64 architecture.

set -euo pipefail

TARGET_DIR="${1:-target/release}"
OUTPUT_DIR="${2:-target/release/release-artifacts}"

echo "=== Packaging macOS ARM64 Release Artifacts ==="

if [ ! -d "$TARGET_DIR" ]; then
  echo "Target directory '$TARGET_DIR' does not exist. Run build first."
  exit 1
fi

# 1. Locate .app bundle
APP=$(ls -d "$TARGET_DIR"/bundle/macos/*.app 2>/dev/null | head -n 1 || true)
if [ -z "$APP" ] || [ ! -d "$APP" ]; then
  echo "Expected macOS .app bundle was not found in '$TARGET_DIR/bundle/macos/'!"
  exit 1
fi
echo "Found source .app bundle: $APP"

# Check forbidden debug/log artifacts in bundle
if find "$APP" -name "*.pdb" -o -name "*.log" | grep .; then
  echo "Forbidden debug/log artifacts found in macOS bundle!"
  exit 1
fi

# 2. Verify Architecture: ARM64 (aarch64)
MAIN_BIN="$APP/Contents/MacOS/bbq-desktop"
if [ ! -f "$MAIN_BIN" ]; then
  echo "Main binary '$MAIN_BIN' not found inside bundle!"
  exit 1
fi

ARCHS=$(lipo -archs "$MAIN_BIN")
echo "Binary architectures in $MAIN_BIN: $ARCHS"
if ! echo "$ARCHS" | grep -q "arm64"; then
  echo "Architecture verification failed: expected arm64, got '$ARCHS'!"
  exit 1
fi
file "$MAIN_BIN"
echo "Architecture verified: macOS ARM64"

# 3. Locate .dmg disk image
DMG=$(ls "$TARGET_DIR"/bundle/dmg/*.dmg 2>/dev/null | head -n 1 || true)
if [ -z "$DMG" ] || [ ! -f "$DMG" ]; then
  echo "Expected macOS .dmg image was not found in '$TARGET_DIR/bundle/dmg/'!"
  exit 1
fi
echo "Found source DMG image: $DMG"

# 4. Prepare output directory
mkdir -p "$OUTPUT_DIR"
ABS_OUTPUT_DIR=$(cd "$OUTPUT_DIR" && pwd)

APP_ZIP_DST="$ABS_OUTPUT_DIR/mac-arm64.app.zip"
DMG_DST="$ABS_OUTPUT_DIR/mac-arm64.dmg"

# Standardize .app -> mac-arm64.app.zip
echo "Creating zip archive -> mac-arm64.app.zip"
rm -f "$APP_ZIP_DST"
APP_NAME=$(basename "$APP")
APP_DIR=$(dirname "$APP")
(cd "$APP_DIR" && ditto -c -k --keepParent "$APP_NAME" "$APP_ZIP_DST") || (cd "$APP_DIR" && zip -r -y "$APP_ZIP_DST" "$APP_NAME")

# Standardize .dmg -> mac-arm64.dmg
echo "Standardizing DMG -> mac-arm64.dmg"
cp "$DMG" "$DMG_DST"

# 5. Verify outputs
for f in "$APP_ZIP_DST" "$DMG_DST"; do
  if [ ! -s "$f" ]; then
    echo "Generated artifact '$f' is empty or missing!"
    exit 1
  fi
  ls -lh "$f"
done

# 6. Calculate SHA256 hashes AFTER rename
echo ""
echo "=== SHA256 Checksums (macOS ARM64) ==="
CHECKSUMS_FILE="$ABS_OUTPUT_DIR/checksums.txt"
(cd "$ABS_OUTPUT_DIR" && shasum -a 256 mac-arm64.app.zip mac-arm64.dmg | tee -a "$CHECKSUMS_FILE")
echo "Wrote checksums to $CHECKSUMS_FILE"
