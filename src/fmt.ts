// @ts-check

import { get32, text, u32, utf8 } from "./bytes.ts";

const magic1 = utf8("ASTRPKG1");
const magic2 = utf8("ASTRPKG2");
const fixed1 = 28;
const fixed2 = 32;
const codecs = [0, 1, 2, 3];
export const saltSize = 16;
export const nonceSize = 12;
export const pubSize = 43;
export const tagSize = 16;
export const maxCipher = 64 * 1024 * 1024;
export const maxPayload = 64 * 1024 * 1024;
export const minIter = 100_000;
export const maxIter = 10_000_000;
export const prodIter = 1_200_000;

const same = (left, right) => left.byteLength === right.byteLength
  && left.every((value, index) => value === right[index]);

const validPub = (value) => /^[A-Za-z0-9_-]{43}$/u.test(value);

const needBase = (iterations, salt, nonce, pub, cipherSize) => {
  if (!Number.isSafeInteger(iterations) || iterations < minIter || iterations > maxIter) {
    throw new Error("Invalid password KDF cost");
  }
  if (salt.byteLength !== saltSize || nonce.byteLength !== nonceSize) {
    throw new Error("Invalid encryption metadata size");
  }
  if (!validPub(pub)) throw new Error("Invalid Ed25519 public key text");
  if (!Number.isSafeInteger(cipherSize) || cipherSize < tagSize || cipherSize > maxCipher) {
    throw new Error("Invalid ciphertext size");
  }
};

export const makeHead = (iterations, salt, nonce, pub, cipherSize) => {
  needBase(iterations, salt, nonce, pub, cipherSize);
  const pubBytes = utf8(pub);
  const headSize = fixed1 + salt.byteLength + nonce.byteLength + pubBytes.byteLength;
  const out = new Uint8Array(headSize);
  out.set(magic1, 0);
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
  let at = fixed1;
  out.set(salt, at);
  at += salt.byteLength;
  out.set(nonce, at);
  at += nonce.byteLength;
  out.set(pubBytes, at);
  return out;
};

export const makeHead2 = (iterations, salt, nonce, pub, cipherSize, codec, rawSize) => {
  needBase(iterations, salt, nonce, pub, cipherSize);
  if (!codecs.includes(codec)) throw new Error("Invalid compression codec");
  if (!Number.isSafeInteger(rawSize) || rawSize < 1 || rawSize > maxPayload) {
    throw new Error("Invalid unpacked payload size");
  }

  const pubBytes = utf8(pub);
  const headSize = fixed2 + salt.byteLength + nonce.byteLength + pubBytes.byteLength;
  const out = new Uint8Array(headSize);
  out.set(magic2, 0);
  out[8] = 2;
  out[9] = 0;
  out[10] = 1;
  out[11] = 1;
  out[12] = codec;
  out[13] = 2;
  out[14] = 0;
  out[15] = 0;
  out.set(u32(iterations), 16);
  out.set(u32(rawSize), 20);
  out.set(u32(cipherSize), 24);
  out.set(u32(headSize), 28);
  let at = fixed2;
  out.set(salt, at);
  at += salt.byteLength;
  out.set(nonce, at);
  at += nonce.byteLength;
  out.set(pubBytes, at);
  return out;
};

const tail = (data, fixed, iterations, saltLen, nonceLen, pubLen, cipherLen, headLen) => {
  if (saltLen !== saltSize || nonceLen !== nonceSize || pubLen !== pubSize) {
    throw new Error("Invalid astral-pack header");
  }
  if (iterations < minIter || iterations > maxIter || cipherLen < tagSize || cipherLen > maxCipher) {
    throw new Error("Unsafe astral-pack parameters");
  }
  if (headLen !== fixed + saltLen + nonceLen + pubLen || data.byteLength !== headLen + cipherLen) {
    throw new Error("Truncated or extended astral-pack container");
  }

  let at = fixed;
  const salt = data.slice(at, at + saltLen);
  at += saltLen;
  const nonce = data.slice(at, at + nonceLen);
  at += nonceLen;
  const pub = text(data.slice(at, at + pubLen));
  if (!validPub(pub)) throw new Error("Invalid public key header");

  return {
    iterations,
    salt,
    nonce,
    pub,
    head: data.slice(0, headLen),
    cipher: data.slice(headLen),
  };
};

export const readBox = (data) => {
  if (data.byteLength < fixed1) throw new Error("Not an astral-pack container");

  if (same(data.slice(0, 8), magic1)) {
    if (data[8] !== 1 || data[9] !== 0) throw new Error("Unsupported astral-pack version");
    if (data[10] !== 1) throw new Error("Unsupported password KDF");
    if (data[11] !== 1) throw new Error("Unsupported encryption algorithm");
    if (data[19] !== 0) throw new Error("Unsupported astral-pack flags");
    return {
      ver: 1,
      codec: 0,
      payload: 1,
      rawSize: null,
      ...tail(
        data,
        fixed1,
        get32(data, 12),
        data[16],
        data[17],
        data[18],
        get32(data, 20),
        get32(data, 24),
      ),
    };
  }

  if (same(data.slice(0, 8), magic2)) {
    if (data.byteLength < fixed2) throw new Error("Truncated astral-pack header");
    if (data[8] !== 2 || data[9] !== 0) throw new Error("Unsupported astral-pack version");
    if (data[10] !== 1) throw new Error("Unsupported password KDF");
    if (data[11] !== 1) throw new Error("Unsupported encryption algorithm");
    if (!codecs.includes(data[12])) throw new Error("Unsupported compression codec");
    if (data[13] !== 2) throw new Error("Unsupported encrypted payload format");
    if (data[14] !== 0 || data[15] !== 0) throw new Error("Unsupported astral-pack flags");

    const rawSize = get32(data, 20);
    if (rawSize < 1 || rawSize > maxPayload) throw new Error("Unsafe unpacked payload size");
    return {
      ver: 2,
      codec: data[12],
      payload: data[13],
      rawSize,
      ...tail(
        data,
        fixed2,
        get32(data, 16),
        saltSize,
        nonceSize,
        pubSize,
        get32(data, 24),
        get32(data, 28),
      ),
    };
  }

  throw new Error("Not an astral-pack container");
};
