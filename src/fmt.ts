// @ts-check

import { b64u, get32, text, u32, unb64u, utf8 } from "./bytes.ts";
import { decodeSigns, emptySigns, encodeSigns } from "./meta.ts";

const magic1 = utf8("ASTRPKG1");
const magic2 = utf8("ASTRPKG2");
const magic3 = utf8("ASTRPKG3");
const magic4 = utf8("ASTRPKG4");
const fixed1 = 28;
const fixed2 = 32;
const codecs = [0, 1, 2, 3];
export const saltSize = 16;
export const nonceSize = 12;
export const pubTextSize = 43;
export const pubRawSize = 32;
export const tagSize = 16;
export const maxCipher = 64 * 1024 * 1024;
export const maxPayload = 64 * 1024 * 1024;
export const minIter = 100_000;
export const maxIter = 10_000_000;
export const prodIter = 1_200_000;

const same = (left, right) => left.byteLength === right.byteLength
  && left.every((value, index) => value === right[index]);

const validPub = (value) => /^[A-Za-z0-9_-]{43}$/u.test(value);

const needCore = (iterations, salt, nonce, cipherSize) => {
  if (!Number.isSafeInteger(iterations) || iterations < minIter || iterations > maxIter) {
    throw new Error("Invalid password KDF cost");
  }
  if (salt.byteLength !== saltSize || nonce.byteLength !== nonceSize) {
    throw new Error("Invalid encryption metadata size");
  }
  if (!Number.isSafeInteger(cipherSize) || cipherSize < tagSize || cipherSize > maxCipher) {
    throw new Error("Invalid ciphertext size");
  }
};

const needPayload = (codec, rawSize) => {
  if (!codecs.includes(codec)) throw new Error("Invalid compression codec");
  if (!Number.isSafeInteger(rawSize) || rawSize < 1 || rawSize > maxPayload) {
    throw new Error("Invalid unpacked payload size");
  }
};

export const makeHead = (iterations, salt, nonce, pub, cipherSize) => {
  needCore(iterations, salt, nonce, cipherSize);
  if (!validPub(pub)) throw new Error("Invalid Ed25519 public key text");
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

const makeLegacyModern = (magic, major, iterations, salt, nonce, pub, cipherSize, codec, rawSize, extra) => {
  needCore(iterations, salt, nonce, cipherSize);
  needPayload(codec, rawSize);
  if (!validPub(pub)) throw new Error("Invalid Ed25519 public key text");

  const pubBytes = utf8(pub);
  const headSize = fixed2 + salt.byteLength + nonce.byteLength + pubBytes.byteLength + extra.byteLength;
  const out = new Uint8Array(headSize);
  out.set(magic, 0);
  out[8] = major;
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
  at += pubBytes.byteLength;
  out.set(extra, at);
  return out;
};

export const makeHead2 = (iterations, salt, nonce, pub, cipherSize, codec, rawSize) => makeLegacyModern(
  magic2,
  2,
  iterations,
  salt,
  nonce,
  pub,
  cipherSize,
  codec,
  rawSize,
  new Uint8Array(),
);

export const makeHead3 = (iterations, salt, nonce, pub, signs, cipherSize, codec, rawSize) => makeLegacyModern(
  magic3,
  3,
  iterations,
  salt,
  nonce,
  pub,
  cipherSize,
  codec,
  rawSize,
  encodeSigns(signs),
);

export const makeHead4 = (iterations, salt, nonce, pubRaw, signs, cipherSize, codec, rawSize) => {
  needCore(iterations, salt, nonce, cipherSize);
  needPayload(codec, rawSize);
  if (!(pubRaw instanceof Uint8Array) || pubRaw.byteLength !== pubRawSize) {
    throw new Error("Invalid raw Ed25519 public key");
  }

  const extra = encodeSigns(signs);
  const headSize = fixed2 + salt.byteLength + nonce.byteLength + pubRaw.byteLength + extra.byteLength;
  const out = new Uint8Array(headSize);
  out.set(magic4, 0);
  out[8] = 4;
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
  out.set(pubRaw, at);
  at += pubRaw.byteLength;
  out.set(extra, at);
  return out;
};

const tail = (data, fixed, iterations, saltLen, nonceLen, pubLen, cipherLen, headLen, allowExtra = false) => {
  if (saltLen !== saltSize || nonceLen !== nonceSize || pubLen !== pubTextSize) {
    throw new Error("Invalid astral-pack header");
  }
  if (iterations < minIter || iterations > maxIter || cipherLen < tagSize || cipherLen > maxCipher) {
    throw new Error("Unsafe astral-pack parameters");
  }
  const base = fixed + saltLen + nonceLen + pubLen;
  const validHead = allowExtra ? headLen >= base && headLen <= base + 256 : headLen === base;
  if (!validHead || data.byteLength !== headLen + cipherLen) {
    throw new Error("Truncated or extended astral-pack container");
  }

  let at = fixed;
  const salt = data.slice(at, at + saltLen);
  at += saltLen;
  const nonce = data.slice(at, at + nonceLen);
  at += nonceLen;
  const pub = text(data.slice(at, at + pubLen));
  at += pubLen;
  if (!validPub(pub)) throw new Error("Invalid public key header");
  const pubRaw = unb64u(pub);
  if (pubRaw.byteLength !== pubRawSize) throw new Error("Invalid public key header");

  return {
    iterations,
    salt,
    nonce,
    pub,
    pubRaw,
    extra: data.slice(at, headLen),
    head: data.slice(0, headLen),
    cipher: data.slice(headLen),
  };
};

const modern = (data, magic, major, withSigns) => {
  if (!same(data.slice(0, 8), magic)) return null;
  if (data.byteLength < fixed2) throw new Error("Truncated astral-pack header");
  if (data[8] !== major || data[9] !== 0) throw new Error("Unsupported astral-pack version");
  if (data[10] !== 1) throw new Error("Unsupported password KDF");
  if (data[11] !== 1) throw new Error("Unsupported encryption algorithm");
  if (!codecs.includes(data[12])) throw new Error("Unsupported compression codec");
  if (data[13] !== 2) throw new Error("Unsupported encrypted payload format");
  if (data[14] !== 0 || data[15] !== 0) throw new Error("Unsupported astral-pack flags");

  const rawSize = get32(data, 20);
  if (rawSize < 1 || rawSize > maxPayload) throw new Error("Unsafe unpacked payload size");
  const value = tail(
    data,
    fixed2,
    get32(data, 16),
    saltSize,
    nonceSize,
    pubTextSize,
    get32(data, 24),
    get32(data, 28),
    withSigns,
  );
  return {
    ver: major,
    codec: data[12],
    payload: data[13],
    rawSize,
    signs: withSigns ? decodeSigns(value.extra) : emptySigns(),
    ...value,
  };
};

const version4 = (data) => {
  if (!same(data.slice(0, 8), magic4)) return null;
  if (data.byteLength < fixed2) throw new Error("Truncated astral-pack header");
  if (data[8] !== 4 || data[9] !== 0) throw new Error("Unsupported astral-pack version");
  if (data[10] !== 1) throw new Error("Unsupported password KDF");
  if (data[11] !== 1) throw new Error("Unsupported encryption algorithm");
  if (!codecs.includes(data[12])) throw new Error("Unsupported compression codec");
  if (data[13] !== 2) throw new Error("Unsupported encrypted payload format");
  if (data[14] !== 0 || data[15] !== 0) throw new Error("Unsupported astral-pack flags");

  const iterations = get32(data, 16);
  const rawSize = get32(data, 20);
  const cipherLen = get32(data, 24);
  const headLen = get32(data, 28);
  const base = fixed2 + saltSize + nonceSize + pubRawSize;
  if (iterations < minIter || iterations > maxIter || rawSize < 1 || rawSize > maxPayload) {
    throw new Error("Unsafe astral-pack parameters");
  }
  if (cipherLen < tagSize || cipherLen > maxCipher || headLen < base || headLen > base + 256) {
    throw new Error("Unsafe astral-pack parameters");
  }
  if (data.byteLength !== headLen + cipherLen) {
    throw new Error("Truncated or extended astral-pack container");
  }

  let at = fixed2;
  const salt = data.slice(at, at + saltSize);
  at += saltSize;
  const nonce = data.slice(at, at + nonceSize);
  at += nonceSize;
  const pubRaw = data.slice(at, at + pubRawSize);
  at += pubRawSize;
  const extra = data.slice(at, headLen);

  return {
    ver: 4,
    codec: data[12],
    payload: data[13],
    rawSize,
    signs: decodeSigns(extra),
    iterations,
    salt,
    nonce,
    pub: b64u(pubRaw),
    pubRaw,
    extra,
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
      signs: emptySigns(),
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

  const v2 = modern(data, magic2, 2, false);
  if (v2) return v2;
  const v3 = modern(data, magic3, 3, true);
  if (v3) return v3;
  const v4 = version4(data);
  if (v4) return v4;
  throw new Error("Not an astral-pack container");
};
