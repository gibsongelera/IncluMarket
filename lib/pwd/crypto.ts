import "server-only";
import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes } from "node:crypto";

/**
 * Keys for the PWD ID number (migration 0017, ADR-7).
 *
 * PWD_ID_HASH_KEY  — HMAC key for the one-account-per-number lookup. A plain
 *                    hash of a 16-digit number with a known structure could be
 *                    brute-forced from a database dump; a keyed one cannot.
 * PWD_ID_ENC_KEY   — AES-256-GCM key. The full number is kept encrypted only
 *                    while a submission waits for review, so the admin can
 *                    paste it into the DOH registry; it is wiped at the
 *                    decision.
 *
 * Either may be any long random string (e.g. `openssl rand -base64 32`); it
 * is stretched to 32 bytes with SHA-256. Rotating PWD_ID_HASH_KEY breaks the
 * duplicate check against existing rows, so do not rotate it casually.
 *
 * In production both are required and verification refuses to run without
 * them. In development a fixed, clearly-labelled key keeps the flow testable.
 */

const DEV_FALLBACK = "inclusivemarket-dev-only-pwd-key-do-not-use-in-production";

function key(name: "PWD_ID_HASH_KEY" | "PWD_ID_ENC_KEY"): Buffer | null {
  const raw = process.env[name];
  if (raw && raw.length >= 16) return createHash("sha256").update(raw).digest();
  if (process.env.NODE_ENV === "production") return null;
  return createHash("sha256").update(`${DEV_FALLBACK}:${name}`).digest();
}

export function pwdKeysConfigured(): boolean {
  return key("PWD_ID_HASH_KEY") !== null && key("PWD_ID_ENC_KEY") !== null;
}

/** Keyed hash of the normalized number (hex). */
export function hashPwdIdNumber(normalized: string): string | null {
  const k = key("PWD_ID_HASH_KEY");
  if (!k) return null;
  return createHmac("sha256", k).update(normalized).digest("hex");
}

/** "v1.<iv>.<tag>.<ciphertext>", each base64url. */
export function encryptPwdIdNumber(normalized: string): string | null {
  const k = key("PWD_ID_ENC_KEY");
  if (!k) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptPwdIdNumber(sealed: string | null | undefined): string | null {
  const k = key("PWD_ID_ENC_KEY");
  if (!k || !sealed) return null;
  const [version, iv, tag, ct] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !ct) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
