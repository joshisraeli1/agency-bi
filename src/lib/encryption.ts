import CryptoJS from "crypto-js";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-dev-key-change-in-production";

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
