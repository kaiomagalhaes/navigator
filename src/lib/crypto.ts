import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Shared AES-256-GCM helpers for encrypting sensitive values at rest (Google
// OAuth tokens, Fathom transcripts/summaries). Values are stored as
// "iv:authTag:ciphertext", all hex.

// The 32-byte key. Prefers DATA_ENCRYPTION_KEY but falls back to the original
// GOOGLE_TOKEN_ENC_KEY so existing encrypted tokens keep decrypting and no
// .env change is required to start encrypting transcripts.
function encryptionKey(): Buffer {
  const hex = process.env.DATA_ENCRYPTION_KEY ?? process.env.GOOGLE_TOKEN_ENC_KEY;
  if (!hex) {
    throw new Error(
      "DATA_ENCRYPTION_KEY (or GOOGLE_TOKEN_ENC_KEY) is not set. See .env.example."
    );
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error(
      "DATA_ENCRYPTION_KEY must be a 32-byte hex string (64 hex chars)."
    );
  }
  return key;
}

// Stored as "iv:authTag:ciphertext", all hex.
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":");
}

export function decrypt(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
