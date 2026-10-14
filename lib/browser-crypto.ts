export type EncryptedPayload = {
  version: 1;
  iv: string;
  ciphertext: string;
};

const encodeBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
};

export const createDataKey = () => encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));

export function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return data.version === 1 && typeof data.iv === "string" && typeof data.ciphertext === "string";
}

export async function encryptJson(value: unknown, keyValue: string): Promise<EncryptedPayload> {
  const key = await crypto.subtle.importKey("raw", decodeBase64Url(keyValue), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return { version: 1, iv: encodeBase64Url(iv), ciphertext: encodeBase64Url(new Uint8Array(ciphertext)) };
}

export async function decryptJson<T>(data: EncryptedPayload, keyValue: string): Promise<T> {
  const key = await crypto.subtle.importKey("raw", decodeBase64Url(keyValue), "AES-GCM", false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64Url(data.iv) },
    key,
    decodeBase64Url(data.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
