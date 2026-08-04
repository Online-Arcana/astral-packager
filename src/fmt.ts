// @ts-check

import { get32, text, u32, utf8 } from "./bytes.ts";

const magic = utf8("ASTRPKG1");
const fixed = 28;
export const saltSize = 16;
export const nonceSize = 12;
export const pubSize = 43;
export const tagSize = 16;
export const maxCipher = 64 * 1024 * 1024;
export const minIter = 100_000;
export const maxIter = 10_000_000;
export const prodIter = 1_200_000;

const same = (left, right) => left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);

export const makeHead = (iterations, salt, nonce, pub, cipherSize) => {
  if (!Number.isSafeInteger(iterations) || iterations < minIter || iterations > maxIter) throw new Error("Invalid password KDF cost");
  if (salt.byteLength !== saltSize || nonce.byteLength !== nonceSize) throw new Error("Invalid encryption metadata size");
  if (!/^[A-Za-z0-9_-]{43}$/u.test(pub)) throw new Error("Invalid Ed25519 public key text");
  if (!Number.isSafeInteger(cipherSize) || cipherSize < tagSize || cipherSize > maxCipher) throw new Error("Invalid ciphertext size");
  const pubBytes = utf8(pub);
  const headSize = fixed + salt.byteLength + nonce.byteLength + pubBytes.byteLength;
  const out = new Uint8Array(headSize);
  out.set(magic, 0);
  out[8] = 1;
  out[9] = 0;
  out[10] = 1;
  out[11] = 1;
  out.set(u32(iterations), 12);
  out[16] = salt.byteLength;
  out[17] = nonce.byteLength;
  out[18] = pubBytes.byteLength;
  out[19] = 0;
  out.set(u32(cipherSize), 20);
  out.set(u32(headSize), 24);
  let at = fixed;
  out.set(salt, at);
  at += salt.byteLength;
  out.set(nonce, at);
  at += nonce.byteLength;
  out.set(pubBytes, at);
  return out;
};

export const readBox = (data) => {
  if (data.byteLength < fixed || !same(data.slice(0, 8), magic)) throw new Error("Not an astral-pack container");
  if (data[8] !== 1 || data[9] !== 0) throw new Error("Unsupported astral-pack version");
  if (data[10] !== 1) throw new Error("Unsupported password KDF");
  if (data[11] !== 1) throw new Error("Unsupported encryption algorithm");
  const iterations = get32(data, 12);
  const saltLen = data[16];
  const nonceLen = data[17];
  const pubLen = data[18];
  const flags = data[19];
  const cipherLen = get32(data, 20);
  const headLen = get32(data, 24);
  if (flags !== 0 || saltLen !== saltSize || nonceLen !== nonceSize || pubLen !== pubSize) throw new Error("Invalid astral-pack header");
  if (iterations < minIter || iterations > maxIter || cipherLen < tagSize || cipherLen > maxCipher) throw new Error("Unsafe astral-pack parameters");
  if (headLen !== fixed + saltLen + nonceLen + pubLen || data.byteLength !== headLen + cipherLen) throw new Error("Truncated or extended astral-pack container");
  let at = fixed;
  const salt = data.slice(at, at + saltLen);
  at += saltLen;
  const nonce = data.slice(at, at + nonceLen);
  at += nonceLen;
  const pub = text(data.slice(at, at + pubLen));
  if (!/^[A-Za-z0-9_-]{43}$/u.test(pub)) throw new Error("Invalid public key header");
  return {
    iterations,
    salt,
    nonce,
    pub,
    head: data.slice(0, headLen),
    cipher: data.slice(headLen),
  };
};
