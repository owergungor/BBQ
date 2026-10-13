#!/usr/bin/env node
/**
 * BBQ Release Metadata Validator
 * Validates Tauri 2 updater metadata schema, platform identifiers, matching signatures, and CI requirements.
 */

import fs from "node:fs";
import path from "node:path";

const VALID_PLATFORMS = new Set([
  "windows-x86_64",
  "windows-i686",
  "windows-aarch64",
  "darwin-x86_64",
  "darwin-aarch64",
  "linux-x86_64",
  "linux-i686",
  "linux-aarch64",
  "linux-armv7",
]);

export function validateReleaseMetadata(metadataPath, options = {}) {
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(metadataPath)) {
    return {
      valid: false,
      errors: [`Metadata file not found at ${metadataPath}`],
      warnings,
    };
  }

  let metadata;
  try {
    const raw = fs.readFileSync(metadataPath, "utf-8");
    metadata = JSON.parse(raw);
  } catch (err) {
    return {
      valid: false,
      errors: [`Metadata file is not valid JSON: ${err.message}`],
      warnings,
    };
  }

  // 1. Version validation
  if (!metadata.version || typeof metadata.version !== "string") {
    errors.push("Missing or invalid 'version' field in metadata (must be non-empty string)");
  } else {
    // Validate SemVer pattern (x.y.z)
    const cleanVer = metadata.version.startsWith("v") ? metadata.version.slice(1) : metadata.version;
    const semverRegex = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
    if (!semverRegex.test(cleanVer)) {
      errors.push(`Invalid SemVer format for 'version': "${metadata.version}"`);
    }
  }

  // 2. Pub date validation
  if (!metadata.pub_date || typeof metadata.pub_date !== "string") {
    errors.push("Missing or invalid 'pub_date' field in metadata (must be ISO-8601 string)");
  } else if (Number.isNaN(Date.parse(metadata.pub_date))) {
    errors.push(`Invalid date format for 'pub_date': "${metadata.pub_date}"`);
  }

  // 3. Platforms validation
  if (!metadata.platforms || typeof metadata.platforms !== "object") {
    errors.push("Missing or invalid 'platforms' map in metadata");
  } else {
    const platformKeys = Object.keys(metadata.platforms);
    if (platformKeys.length === 0) {
      if (options.strictSigning) {
        errors.push("No platforms declared in 'platforms' map (strict signing mode enabled)");
      } else {
        warnings.push("No platforms currently configured in 'platforms' map");
      }
    }

    for (const [platformKey, platformData] of Object.entries(metadata.platforms)) {
      if (!VALID_PLATFORMS.has(platformKey)) {
        errors.push(`Unrecognized Tauri platform identifier: "${platformKey}"`);
      }

      if (!platformData || typeof platformData !== "object") {
        errors.push(`Invalid platform entry for "${platformKey}": must be an object`);
        continue;
      }

      // Validate signature
      if (!platformData.signature || typeof platformData.signature !== "string" || platformData.signature.trim().length === 0) {
        errors.push(`Platform "${platformKey}" has missing or empty 'signature'`);
      }

      // Validate URL
      if (!platformData.url || typeof platformData.url !== "string") {
        errors.push(`Platform "${platformKey}" has missing or invalid 'url'`);
      } else {
        try {
          const parsed = new URL(platformData.url);
          if (parsed.protocol !== "https:") {
            errors.push(`Platform "${platformKey}" URL must use HTTPS: ${platformData.url}`);
          }
        } catch {
          errors.push(`Platform "${platformKey}" has malformed URL: ${platformData.url}`);
        }
      }
    }
  }

  // 4. Staged artifact cross-verification (if artifactsDir provided)
  if (options.artifactsDir && fs.existsSync(options.artifactsDir) && metadata.platforms) {
    const dirFiles = new Set(fs.readdirSync(options.artifactsDir));
    for (const [platformKey, platformData] of Object.entries(metadata.platforms)) {
      if (platformData.url) {
        let assetName = "";
        try {
          assetName = path.basename(new URL(platformData.url).pathname);
        } catch {
          // Handled by URL check above
        }

        if (assetName) {
          if (!dirFiles.has(assetName)) {
            if (options.strictSigning) {
              errors.push(`Strict validation failed: platform "${platformKey}" references asset "${assetName}" which does not exist in "${options.artifactsDir}"`);
            } else {
              warnings.push(`Platform "${platformKey}" asset "${assetName}" not found in local artifacts dir`);
            }
          }

          // In strict mode, also ensure matching .sig file exists locally
          const expectedSigFile = `${assetName}.sig`;
          const altSigFile = dirFiles.has(expectedSigFile) ? expectedSigFile : Array.from(dirFiles).find((f) => f.endsWith(".sig") && f.includes(platformKey.includes("win") ? "win" : "mac"));
          if (!altSigFile && options.strictSigning) {
            errors.push(`Strict validation failed: matching signature file not found for "${assetName}" in "${options.artifactsDir}"`);
          }
        }
      }
    }
  }

  // 5. Credential check in strict mode
  if (options.requireSigningKey && !process.env.TAURI_SIGNING_PRIVATE_KEY) {
    errors.push("Missing required TAURI_SIGNING_PRIVATE_KEY environment secret for signed release build");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// CLI entry point
if (process.argv[1] && process.argv[1].endsWith("validate-release-metadata.mjs")) {
  const args = process.argv.slice(2);
  const metadataPath = args[0] || "release-assets/latest.json";
  const strict = args.includes("--strict");
  const requireSigningKey = args.includes("--require-signing-key");
  const artifactsDirIndex = args.indexOf("--artifacts-dir");
  const artifactsDir = artifactsDirIndex !== -1 && args[artifactsDirIndex + 1] ? args[artifactsDirIndex + 1] : undefined;

  const result = validateReleaseMetadata(metadataPath, {
    strictSigning: strict,
    requireSigningKey,
    artifactsDir,
  });

  if (result.warnings.length > 0) {
    for (const warn of result.warnings) {
      console.warn(`[WARN] ${warn}`);
    }
  }

  if (!result.valid) {
    console.error("Release metadata validation FAILED:");
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(`Release metadata validated successfully: ${metadataPath}`);
}
