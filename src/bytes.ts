// @ts-check

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: true });

export const utf8 = (value) => enc.encode(value);
export const text = (value) => dec.decode(value);

export const cat = (...parts) => {
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
};

export const eq = (left, right) => {
  if (left.byteLength !== right.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < left.byteLength; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
};

export const wipe = (value) => value.fill(0);

export const b64u = (value) => {
  let raw = "";
  for (const byte of value) raw += String.fromCharCode(byte);
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
};

export const unb64u = (value) => {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("Invalid base64url text");
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const raw = atob(value.replaceAll("-", "+").replaceAll("_", "/") + pad);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
};

export const u32 = (value) => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, false);
  return out;
};

export const get32 = (value, at) => new DataView(value.buffer, value.byteOffset, value.byteLength).getUint32(at, false);
