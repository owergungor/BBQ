#!/usr/bin/env node
/**
 * BBQ Release Metadata Generator
 * Generates Tauri 2 compliant `latest.json` updater metadata from staged release artifacts and signatures.
 */

import fs from "node:fs";
import path from "node:path";

function parseArgs(args) {
  const options = {
    artifactsDir: "release-assets",
    output: "release-assets/latest.json",
    version: "",
    tag: "",
    repo: "owergungor/BBQ",
    notes: "BBQ Desktop Update",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--artifacts-dir" && args[i + 1]) {
      options.artifactsDir = args[++i];
    } else if (arg === "--output" && args[i + 1]) {
      options.output = args[++i];
    } else if (arg === "--version" && args[i + 1]) {
      options.version = args[++i];
    } else if (arg === "--tag" && args[i + 1]) {
      options.tag = args[++i];
    } else if (arg === "--repo" && args[i + 1]) {
      options.repo = args[++i];
    } else if (arg === "--notes" && args[i + 1]) {
      options.notes = args[++i];
    } else if (arg === "--notes-file" && args[i + 1]) {
      const notesPath = args[++i];
      if (fs.existsSync(notesPath)) {
        options.notes = fs.readFileSync(notesPath, "utf-8").trim();
      }
    } else if (arg === "--include-linux") {
      options.includeLinux = true;
    }
  }

  return options;
}

export function generateUpdateMetadata(options) {
  const { artifactsDir, output, version, tag, repo, notes, includeLinux } = options;

  if (!version) {
    throw new Error("Missing required --version parameter");
  }

  const effectiveTag = tag || (version.startsWith("v") ? version : `v${version}`);
  const semverVersion = version.startsWith("v") ? version.slice(1) : version;

  const platforms = {};

  if (fs.existsSync(artifactsDir)) {
    const files = fs.readdirSync(artifactsDir);
    const sigFiles = files.filter((f) => f.endsWith(".sig"));

    for (const sigFile of sigFiles) {
      const targetAsset = sigFile.replace(/\.sig$/, "");
      if (!files.includes(targetAsset)) {
        // Strict integrity: never advertise an asset if the payload file does not exist locally
        continue;
      }

      const sigPath = path.join(artifactsDir, sigFile);
      const sigContent = fs.readFileSync(sigPath, "utf-8").trim();
      if (!sigContent) {
        // Skip empty signature files
        continue;
      }

      const lower = targetAsset.toLowerCase();

      // Platform mapping for Windows x64 (NSIS updater installer / bundle)
      if ((lower.includes("win") || lower.includes("x64") || lower.includes("nsis")) && !platforms["windows-x86_64"]) {
        platforms["windows-x86_64"] = {
          signature: sigContent,
          url: `https://github.com/${repo}/releases/download/${effectiveTag}/${targetAsset}`,
        };
      }
      // Platform mapping for macOS ARM64 (Tauri application archive)
      else if ((lower.includes("mac") || lower.includes("darwin") || lower.includes("arm64") || lower.includes("aarch64")) && !platforms["darwin-aarch64"]) {
        platforms["darwin-aarch64"] = {
          signature: sigContent,
          url: `https://github.com/${repo}/releases/download/${effectiveTag}/${targetAsset}`,
        };
      }
      // Platform mapping for Linux x86_64 (Only advertised when built and explicitly enabled)
      else if (includeLinux && (lower.includes("linux") || lower.includes("appimage")) && !platforms["linux-x86_64"]) {
        platforms["linux-x86_64"] = {
          signature: sigContent,
          url: `https://github.com/${repo}/releases/download/${effectiveTag}/${targetAsset}`,
        };
      }
    }
  }

  const metadata = {
    version: semverVersion,
    notes: (notes || `BBQ Desktop v${semverVersion}`).trim(),
    pub_date: new Date().toISOString(),
    platforms,
  };

  if (output) {
    const outDir = path.dirname(output);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(output, JSON.stringify(metadata, null, 2) + "\n", "utf-8");
  }

  return metadata;
}

// CLI entry point
if (process.argv[1] && process.argv[1].endsWith("generate-update-metadata.mjs")) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const result = generateUpdateMetadata(opts);
    console.log(`Generated updater metadata with ${Object.keys(result.platforms).length} platform(s) -> ${opts.output}`);
  } catch (err) {
    console.error("Error generating update metadata:", err.message);
    process.exit(1);
  }
}
