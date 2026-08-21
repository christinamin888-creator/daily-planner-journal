import { Buffer } from "buffer";

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

export const REFLECTION_VAULT_ITERATIONS = 310_000;

export type ReflectionVault = {
  algorithm: "AES-GCM";
  ciphertext: string;
  iterations: number;
  iv: string;
  kdf: "PBKDF2-SHA256";
  protectedDates?: string[];
  salt: string;
  updatedAt: number;
  version: 1;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return window.btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = window.atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function isReflectionVault(value: unknown): value is ReflectionVault {
  if (!value || typeof value !== "object") {
    return false;
  }

  const vault = value as Partial<ReflectionVault>;

  return (
    vault.version === 1 &&
    vault.algorithm === "AES-GCM" &&
    vault.kdf === "PBKDF2-SHA256" &&
    typeof vault.ciphertext === "string" &&
    typeof vault.iv === "string" &&
    typeof vault.salt === "string" &&
    typeof vault.iterations === "number" &&
    Number.isInteger(vault.iterations) &&
    vault.iterations >= 100_000 &&
    (vault.protectedDates === undefined ||
      (Array.isArray(vault.protectedDates) &&
        vault.protectedDates.every((date) => typeof date === "string"))) &&
    typeof vault.updatedAt === "number" &&
    Number.isFinite(vault.updatedAt)
  );
}

export async function deriveReflectionVaultKey(
  password: string,
  salt: string,
  iterations = REFLECTION_VAULT_ITERATIONS,
): Promise<CryptoKey> {
  const passwordKey = await window.crypto.subtle.importKey(
    "raw",
    TEXT_ENCODER.encode(password.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return window.crypto.subtle.deriveKey(
    {
      hash: "SHA-256",
      iterations,
      name: "PBKDF2",
      salt: base64ToBytes(salt),
    },
    passwordKey,
    { length: 256, name: "AES-GCM" },
    false,
    ["decrypt", "encrypt"],
  );
}

export async function encryptReflectionData<T extends object>(
  value: T,
  options: { key?: CryptoKey; password?: string; salt?: string; iterations?: number } = {},
): Promise<{ key: CryptoKey; vault: ReflectionVault }> {
  const saltBytes = options.salt
    ? base64ToBytes(options.salt)
    : window.crypto.getRandomValues(new Uint8Array(16));
  const salt = bytesToBase64(saltBytes);
  const iterations = options.iterations ?? REFLECTION_VAULT_ITERATIONS;
  const key =
    options.key ??
    (await deriveReflectionVaultKey(options.password ?? "", salt, iterations));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    { iv, name: "AES-GCM" },
    key,
    TEXT_ENCODER.encode(JSON.stringify(value)),
  );

  return {
    key,
    vault: {
      algorithm: "AES-GCM",
      ciphertext: bytesToBase64(new Uint8Array(encrypted)),
      iterations,
      iv: bytesToBase64(iv),
      kdf: "PBKDF2-SHA256",
      salt,
      updatedAt: Date.now(),
      version: 1,
    },
  };
}

export async function decryptReflectionData<T>(
  vault: ReflectionVault,
  password: string,
): Promise<{ key: CryptoKey; value: T }> {
  const key = await deriveReflectionVaultKey(password, vault.salt, vault.iterations);

  return {
    key,
    value: await decryptReflectionDataWithKey<T>(vault, key),
  };
}

export async function decryptReflectionDataWithKey<T>(
  vault: ReflectionVault,
  key: CryptoKey,
): Promise<T> {
  const decrypted = await window.crypto.subtle.decrypt(
    { iv: base64ToBytes(vault.iv), name: "AES-GCM" },
    key,
    base64ToBytes(vault.ciphertext),
  );

  return JSON.parse(TEXT_DECODER.decode(decrypted)) as T;
}

export async function encryptWordBlob(blob: Blob, password: string): Promise<Blob> {
  const officeCrypto = (await import("officecrypto-tool")).default;
  const plainBytes = new Uint8Array(await blob.arrayBuffer());
  const encrypted = officeCrypto.encrypt(Buffer.from(plainBytes), { password });
  const encryptedBytes = new Uint8Array(
    encrypted.buffer,
    encrypted.byteOffset,
    encrypted.byteLength,
  );

  return new Blob([encryptedBytes.slice()], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
