import CryptoJS from "crypto-js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required. Generate with: openssl rand -hex 32`);
  }
  return value;
}

const ENCRYPTION_KEY = requireEnv("ENCRYPTION_KEY");

export function encrypt(plaintext: string): string {
  return CryptoJS.AES.encrypt(plaintext, ENCRYPTION_KEY).toString();
}

export function decrypt(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

export function encryptJson(data: Record<string, unknown>): string {
  return encrypt(JSON.stringify(data));
}

export function decryptJson<T = Record<string, unknown>>(ciphertext: string): T {
  const json = decrypt(ciphertext);
  if (!json) throw new Error("Failed to decrypt config");
  return JSON.parse(json) as T;
}
