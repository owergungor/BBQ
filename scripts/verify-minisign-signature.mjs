#!/usr/bin/env node
/**
 * BBQ Minisign Signature Verifier
 * Cryptographically verifies Tauri 2 Minisign signatures against the configured public key.
 * Uses Node.js native `crypto` (Ed25519 and Blake2b-512) with zero external dependencies.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/**
 * Extracts raw 32-byte Ed25519 public key and 8-byte key ID from a Minisign public key string.
 * Supports:
 * - Direct 42-byte base64 string (e.g. RWQ4GNYsfQ5VBkTxW5LHaNrD9d6PNG1JTlEhSscJvkWvBGfqtwJJGAw3)
 * - Two-line minisign.pub format (untrusted comment + base64)
 * - Base64-encoded minisign.pub format (as stored in tauri.conf.json)
 */
export function parseMinisignPublicKey(pubKeyInput) {
  let raw = pubKeyInput.trim();

  // If base64-encoded wrapper (e.g. in tauri.conf.json), decode first
  if (!raw.includes("untrusted comment") && raw.length > 60) {
    try {
      const decoded = Buffer.from(raw, "base64").toString("utf-8");
      if (decoded.includes("untrusted comment")) {
        raw = decoded.trim();
      }
    } catch {
      // Keep original if not a base64-encoded UTF-8 text block
    }
  }

  let base64Key = raw;
  if (raw.includes("\n")) {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const keyLine = lines.find((l) => !l.startsWith("untrusted comment"));
    if (!keyLine) {
      throw new Error("Invalid Minisign public key format: no key line found");
    }
    base64Key = keyLine;
  }

  const buf = Buffer.from(base64Key, "base64");
  if (buf.length !== 42) {
    throw new Error(`Invalid Minisign public key length: expected 42 bytes, got ${buf.length}`);
  }

  const header = buf.subarray(0, 2).toString("ascii");
  if (header !== "Ed" && header !== "ED") {
    throw new Error(`Unsupported Minisign public key algorithm header: ${header}`);
  }

  const keyId = buf.subarray(2, 10);
  const rawPublicKey = buf.subarray(10, 42);

  const spkiBuffer = Buffer.concat([SPKI_ED25519_PREFIX, rawPublicKey]);
  const keyObject = crypto.createPublicKey({
    key: spkiBuffer,
    format: "der",
    type: "spki",
  });

  return {
    keyIdHex: keyId.toString("hex"),
    keyId,
    rawPublicKey,
    keyObject,
  };
}

/**
 * Parses a Minisign signature string into its structural components.
 * Supports 4-line Minisign format or base64-wrapped 4-line format.
 */
export function parseMinisignSignature(sigInput) {
  let raw = sigInput.trim();

  // Check if entire signature is base64-encoded
  if (!raw.includes("untrusted comment")) {
    try {
      const decoded = Buffer.from(raw, "base64").toString("utf-8");
      if (decoded.includes("untrusted comment")) {
        raw = decoded.trim();
      }
    } catch {
      // Keep original
    }
  }

  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 4) {
    throw new Error(`Invalid Minisign signature: expected 4 lines, got ${lines.length}`);
  }

  const untrustedComment = lines[0];
  const bin1 = Buffer.from(lines[1], "base64");
  if (bin1.length !== 74) {
    throw new Error(`Invalid Minisign signature line 2: expected 74 bytes, got ${bin1.length}`);
  }

  const trustedCommentLine = lines[2];
  if (!trustedCommentLine.startsWith("trusted comment: ")) {
    throw new Error("Invalid Minisign signature line 3: missing 'trusted comment: ' prefix");
  }
  const trustedComment = trustedCommentLine.slice("trusted comment: ".length);

  const bin2 = Buffer.from(lines[3], "base64");
  if (bin2.length !== 64) {
    throw new Error(`Invalid Minisign signature line 4 (global sig): expected 64 bytes, got ${bin2.length}`);
  }

  const sigAlgorithm = bin1.subarray(0, 2);
  const keyId = bin1.subarray(2, 10);
  const signatureBytes = bin1.subarray(10, 74);
  const globalSignatureBytes = bin2;

  // Algorithm 0x45, 0x44 ('ED') or 0x52, 0x55 ('RU') is pre-hashed Blake2b-512
  // Algorithm 0x45, 0x64 ('Ed') is legacy direct Ed25519
  const isPrehashed = (sigAlgorithm[0] === 0x45 && sigAlgorithm[1] === 0x44) ||
                      (sigAlgorithm[0] === 0x52 && sigAlgorithm[1] === 0x55);

  return {
    untrustedComment,
    keyIdHex: keyId.toString("hex"),
    keyId,
    signatureBytes,
    trustedComment,
    globalSignatureBytes,
    isPrehashed,
  };
}

/**
 * Cryptographically verifies a file or buffer against a Minisign signature and public key.
 */
export function verifyMinisignSignature({ fileBuffer, sigContent, pubKey }) {
  const parsedKey = parseMinisignPublicKey(pubKey);
  const parsedSig = parseMinisignSignature(sigContent);

  // 1. Verify key ID match
  if (!parsedKey.keyId.equals(parsedSig.keyId)) {
    throw new Error(
      `Minisign Key ID mismatch: signature has ${parsedSig.keyIdHex}, public key expects ${parsedKey.keyIdHex}`
    );
  }

  // 2. Hash data if pre-hashed
  const messageToVerify = parsedSig.isPrehashed
    ? crypto.createHash("blake2b512").update(fileBuffer).digest()
    : fileBuffer;

  // 3. Verify primary payload signature
  const payloadValid = crypto.verify(
    null,
    messageToVerify,
    parsedKey.keyObject,
    parsedSig.signatureBytes
  );

  if (!payloadValid) {
    throw new Error("Minisign payload signature verification failed: invalid Ed25519 signature over file bytes");
  }

  // 4. Verify global signature over (signatureBytes + trustedComment)
  const globalMessage = Buffer.concat([
    parsedSig.signatureBytes,
    Buffer.from(parsedSig.trustedComment, "utf-8"),
  ]);

  const globalValid = crypto.verify(
    null,
    globalMessage,
    parsedKey.keyObject,
    parsedSig.globalSignatureBytes
  );

  if (!globalValid) {
    throw new Error("Minisign global signature verification failed: invalid signature over trusted comment");
  }

  return {
    valid: true,
    keyId: parsedKey.keyIdHex,
    isPrehashed: parsedSig.isPrehashed,
    trustedComment: parsedSig.trustedComment,
  };
}

// CLI entry point
if (process.argv[1] && process.argv[1].endsWith("verify-minisign-signature.mjs")) {
  const args = process.argv.slice(2);
  let filePath = "";
  let sigPath = "";
  let pubKey = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && args[i + 1]) {
      filePath = args[++i];
    } else if (args[i] === "--sig-file" && args[i + 1]) {
      sigPath = args[++i];
    } else if (args[i] === "--pubkey" && args[i + 1]) {
      pubKey = args[++i];
    }
  }

  if (!filePath) {
    console.error("Error: --file argument is required");
    process.exit(1);
  }

  if (!sigPath) {
    sigPath = `${filePath}.sig`;
  }

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  if (!fs.existsSync(sigPath)) {
    console.error(`Error: Signature file not found: ${sigPath}`);
    process.exit(1);
  }

  if (!pubKey) {
    // Attempt to load from tauri.conf.json
    const tauriConfPath = path.resolve("apps/desktop/src-tauri/tauri.conf.json");
    if (fs.existsSync(tauriConfPath)) {
      try {
        const conf = JSON.parse(fs.readFileSync(tauriConfPath, "utf-8"));
        pubKey = conf?.plugins?.updater?.pubkey || "";
      } catch (err) {
        console.error(`Failed to read pubkey from ${tauriConfPath}:`, err.message);
      }
    }
  }

  if (!pubKey) {
    console.error("Error: --pubkey not provided and could not be loaded from tauri.conf.json");
    process.exit(1);
  }

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const sigContent = fs.readFileSync(sigPath, "utf-8");
    const result = verifyMinisignSignature({ fileBuffer, sigContent, pubKey });
    console.log(`[PASS] Minisign signature verified successfully!`);
    console.log(`  File:            ${filePath}`);
    console.log(`  Signature:       ${sigPath}`);
    console.log(`  Key ID:          ${result.keyId}`);
    console.log(`  Prehashed:       ${result.isPrehashed}`);
    console.log(`  Trusted comment: ${result.trustedComment}`);
    process.exit(0);
  } catch (err) {
    console.error(`[FAIL] Minisign verification failed: ${err.message}`);
    process.exit(1);
  }
}
