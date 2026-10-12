#!/usr/bin/env bash
# BBQ macOS Release Packaging Script
# Standardizes release artifacts to:
#   - BBQ-mac-arm64.app.zip
#   - BBQ-mac-arm64.dmg
# Enforces Hardened Runtime, Apple Developer ID signing, Notarization, and Stapling.
# Computes SHA256 checksums from final published bytes and verifies ARM64 architecture.

set -euo pipefail

TARGET_DIR="${1:-target/release}"
OUTPUT_DIR="${2:-target/release/release-artifacts}"
IS_RELEASE_BUILD="${BBQ_RELEASE_BUILD:-false}"
ALLOW_UNSIGNED="${BBQ_ALLOW_UNSIGNED_MACOS:-false}"

# If running in GitHub Actions with a release tag or release input, treat as release build
if [ "${GITHUB_REF_TYPE:-}" = "tag" ] || [ -n "${RELEASE_TAG:-}" ]; then
  IS_RELEASE_BUILD="true"
fi

echo "=== Packaging macOS ARM64 Release Artifacts (Release Mode: $IS_RELEASE_BUILD, Allow Unsigned: $ALLOW_UNSIGNED) ==="

if [ ! -d "$TARGET_DIR" ]; then
  echo "Target directory '$TARGET_DIR' does not exist. Run build first."
  exit 1
fi

# Cleanup handler for temporary signing keychain and staging assets
TEMP_KEYCHAIN=""
cleanup_temp_assets() {
  if [ -n "$TEMP_KEYCHAIN" ] && [ -f "$TEMP_KEYCHAIN" ]; then
    echo "Securely cleaning up temporary signing keychain..."
    security delete-keychain "$TEMP_KEYCHAIN" 2>/dev/null || true
  fi
}
trap cleanup_temp_assets EXIT INT TERM

# 1. Locate .app bundle
APP=$(ls -d "$TARGET_DIR"/bundle/macos/*.app 2>/dev/null | head -n 1 || true)
if [ -z "$APP" ] || [ ! -d "$APP" ]; then
  echo "Expected macOS .app bundle was not found in '$TARGET_DIR/bundle/macos/'!"
  exit 1
fi
echo "Found source .app bundle: $APP"

# Check forbidden debug/log artifacts in bundle
if find "$APP" -name "*.pdb" -o -name "*.log" 2>/dev/null | grep .; then
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

# 3. Import Certificate into Temporary Keychain (if supplied via CI secrets)
APPLE_CERTIFICATE="${APPLE_CERTIFICATE:-}"
APPLE_CERTIFICATE_PASSWORD="${APPLE_CERTIFICATE_PASSWORD:-}"

if [ -n "$APPLE_CERTIFICATE" ] && [ -n "$APPLE_CERTIFICATE_PASSWORD" ]; then
  echo "Importing Apple Developer Certificate into temporary keychain..."
  TEMP_KEYCHAIN=$(mktemp "${TMPDIR:-/tmp}/bbq-sign-XXXXXX.keychain")
  KEYCHAIN_PASS=$(uuidgen 2>/dev/null || date +%s%N)

  security create-keychain -p "$KEYCHAIN_PASS" "$TEMP_KEYCHAIN"
  security set-keychain-settings -lut 21600 "$TEMP_KEYCHAIN"
  security unlock-keychain -p "$KEYCHAIN_PASS" "$TEMP_KEYCHAIN"

  P12_TEMP=$(mktemp "${TMPDIR:-/tmp}/cert-XXXXXX.p12")
  echo "$APPLE_CERTIFICATE" | base64 --decode > "$P12_TEMP"
  security import "$P12_TEMP" -k "$TEMP_KEYCHAIN" -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
  rm -f "$P12_TEMP"

  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASS" "$TEMP_KEYCHAIN"
  security list-keychains -d user -s "$TEMP_KEYCHAIN" $(security list-keychains -d user 2>/dev/null | tr -d '"')
  echo "Certificate imported successfully."
fi

# 4. Resolve and Validate Signing Identity
APPLE_SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:-}"

if [ "$IS_RELEASE_BUILD" = "true" ] && [ -z "$APPLE_SIGNING_IDENTITY" ]; then
  if [ "$ALLOW_UNSIGNED" = "true" ]; then
    echo "=== [NOTICE] Free Distribution Mode (Unsigned macOS build) ==="
    echo "APPLE_SIGNING_IDENTITY not configured. BBQ_ALLOW_UNSIGNED_MACOS=true is enabled."
    echo "Applying ad-hoc code signature with hardened runtime for ARM64..."
    codesign --force --options runtime --deep -s - "$APP"
    codesign --verify --deep --strict --verbose=2 "$APP" 2>/dev/null || true
    echo "Ad-hoc code signature applied."
  else
    echo "ERROR: Release build requires APPLE_SIGNING_IDENTITY. Distributing an unsigned/ad-hoc build causes Gatekeeper rejection." >&2
    echo "To explicitly allow unsigned packaging for free distribution, set BBQ_ALLOW_UNSIGNED_MACOS=true." >&2
    exit 1
  fi
elif [ -n "$APPLE_SIGNING_IDENTITY" ]; then
  echo "Verifying presence of signing identity: $APPLE_SIGNING_IDENTITY"
  if ! security find-identity -v -p codesigning 2>/dev/null | grep -Fq "$APPLE_SIGNING_IDENTITY"; then
    echo "ERROR: Configured signing identity '$APPLE_SIGNING_IDENTITY' not found in available keychains!" >&2
    exit 1
  fi

  echo "Applying Apple Developer ID Code Signature with Hardened Runtime to $APP..."
  codesign --force --options runtime --deep --sign "$APPLE_SIGNING_IDENTITY" "$APP"
  codesign --verify --deep --strict --verbose=2 "$APP"
  echo "Application code signature verified successfully."
else
  echo "[Notice] APPLE_SIGNING_IDENTITY not configured in environment."
  echo "Applying local ad-hoc signature with hardened runtime for non-release validation..."
  codesign --force --options runtime --deep -s - "$APP" 2>/dev/null || true
fi

# 5. Prepare output directory
mkdir -p "$OUTPUT_DIR"
ABS_OUTPUT_DIR=$(cd "$OUTPUT_DIR" && pwd)

APP_ZIP_DST="$ABS_OUTPUT_DIR/BBQ-mac-arm64.app.zip"
DMG_DST="$ABS_OUTPUT_DIR/BBQ-mac-arm64.dmg"

# 6. Create DMG directly from the SIGNED application bundle
echo "Packaging DMG containing the signed application bundle..."
DMG_STAGING_DIR=$(mktemp -d "${TMPDIR:-/tmp}/dmg-staging-XXXXXX")
cp -R "$APP" "$DMG_STAGING_DIR/"
ln -s /Applications "$DMG_STAGING_DIR/Applications"

rm -f "$DMG_DST"
hdiutil create -volname "BBQ" -srcfolder "$DMG_STAGING_DIR" -ov -format UDZO "$DMG_DST"
rm -rf "$DMG_STAGING_DIR"
echo "Generated signed application DMG -> $DMG_DST"

# 7. Sign DMG disk image
if [ -n "$APPLE_SIGNING_IDENTITY" ]; then
  echo "Signing DMG -> $DMG_DST"
  codesign --force --sign "$APPLE_SIGNING_IDENTITY" "$DMG_DST"
  codesign --verify --verbose=2 "$DMG_DST"
elif [ "$ALLOW_UNSIGNED" = "true" ]; then
  echo "Ad-hoc signing DMG -> $DMG_DST"
  codesign --force -s - "$DMG_DST" 2>/dev/null || true
fi

# 8. Apple Notarization & Stapling Sequence
APPLE_ID="${APPLE_ID:-}"
APPLE_PASSWORD="${APPLE_PASSWORD:-}"
APPLE_TEAM_ID="${APPLE_TEAM_ID:-}"

if [ "$IS_RELEASE_BUILD" = "true" ] && ([ -z "$APPLE_ID" ] || [ -z "$APPLE_PASSWORD" ] || [ -z "$APPLE_TEAM_ID" ]); then
  if [ "$ALLOW_UNSIGNED" = "true" ]; then
    echo "=== [NOTICE] Skipping Apple Notarization (Unsigned free distribution mode) ==="
    echo "WARNING: macOS DMG and app bundle are unnotarized. macOS Gatekeeper will require user override."
  else
    echo "ERROR: Release build requires Apple notarization credentials (APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID). Unnotarized DMGs are rejected by Gatekeeper." >&2
    echo "To explicitly allow unsigned packaging for free distribution, set BBQ_ALLOW_UNSIGNED_MACOS=true." >&2
    exit 1
  fi
elif [ -n "$APPLE_ID" ] && [ -n "$APPLE_PASSWORD" ] && [ -n "$APPLE_TEAM_ID" ]; then
  echo "Submitting DMG to Apple Notary Service..."
  xcrun notarytool submit "$DMG_DST" --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait
  echo "Stapling notarization ticket to DMG..."
  xcrun stapler staple "$DMG_DST"
  xcrun stapler staple "$APP" 2>/dev/null || true
  xcrun stapler validate "$DMG_DST"
  echo "Notarization and stapling completed."
  spctl --assess --type execute --verbose "$APP" 2>/dev/null || true
else
  echo "[Notice] Apple notarization credentials not configured."
  echo "Skipping Apple notary submission (non-release build mode)."
fi

# 9. Standardize .app -> BBQ-mac-arm64.app.zip
echo "Creating zip archive -> BBQ-mac-arm64.app.zip"
rm -f "$APP_ZIP_DST"
APP_NAME=$(basename "$APP")
APP_DIR=$(dirname "$APP")
(cd "$APP_DIR" && ditto -c -k --keepParent "$APP_NAME" "$APP_ZIP_DST") || (cd "$APP_DIR" && zip -r -y "$APP_ZIP_DST" "$APP_NAME")

# 10. Verify final published outputs
for f in "$APP_ZIP_DST" "$DMG_DST"; do
  if [ ! -s "$f" ]; then
    echo "Generated artifact '$f' is empty or missing!"
    exit 1
  fi
  ls -lh "$f"
done

# 11. Calculate SHA256 hashes from final published bytes
echo ""
echo "=== SHA256 Checksums (macOS ARM64) ==="
CHECKSUMS_FILE="$ABS_OUTPUT_DIR/checksums.txt"
rm -f "$CHECKSUMS_FILE"
(cd "$ABS_OUTPUT_DIR" && shasum -a 256 BBQ-mac-arm64.app.zip BBQ-mac-arm64.dmg | tee "$CHECKSUMS_FILE")
echo "Wrote checksums to $CHECKSUMS_FILE"

if [ "$ALLOW_UNSIGNED" = "true" ] && [ -z "$APPLE_SIGNING_IDENTITY" ]; then
  echo ""
  echo "=== [NOTICE] Unsigned macOS Distribution Artifacts Ready ==="
  echo "Artifacts: BBQ-mac-arm64.app.zip and BBQ-mac-arm64.dmg generated in unsigned mode."
  echo "Gatekeeper will display an untrusted developer warning to end users."
  echo "End users can launch via Right-Click > Open or running: xattr -d com.apple.quarantine /Applications/BBQ.app"
fi
