// @ts-check

import { b64u, cat, unb64u, utf8 } from "./bytes.ts";

const edPrefix = Uint8Array.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
  0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);
const empty = new Uint8Array();

export const rand = (size) => crypto.getRandomValues(new Uint8Array(size));

export const hash = async (data) => new Uint8Array(await crypto.subtle.digest("SHA-256", data));

export const hkdf = async (key, salt, info, size = 32) => {
  const base = await crypto.subtle.importKey("raw", key, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: utf8(info) }, base, size * 8);
  return new Uint8Array(bits);
};

export const lockKey = async (password, salt, iterations) => {
  const base = await crypto.subtle.importKey("raw", utf8(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt,
    iterations,
  }, base, 256);
  return new Uint8Array(bits);
};

const edPriv = async (seed, extractable) => {
  if (seed.byteLength !== 32) throw new Error("Ed25519 seed must contain 32 bytes");
  return crypto.subtle.importKey("pkcs8", cat(edPrefix, seed), { name: "Ed25519" }, extractable, ["sign"]);
};

export const edPub = async (seed) => {
  const key = await edPriv(seed, true);
  const jwk = await crypto.subtle.exportKey("jwk", key);
  if (jwk.crv !== "Ed25519" || typeof jwk.x !== "string") throw new Error("Runtime did not expose the Ed25519 public key");
  return { text: jwk.x, raw: unb64u(jwk.x) };
};

export const edSign = async (seed, data) => {
  const key = await edPriv(seed, false);
  return new Uint8Array(await crypto.subtle.sign("Ed25519", key, data));
};

export const rootFor = async (json, ent) => {
  const doc = await hash(json);
  const root = await hkdf(ent, doc, "astral-pack/root/v1");
  return { root, doc };
};

export const signSeed = (root, doc) => hkdf(root, doc, "astral-pack/sign/ed25519/v1");
export const child = (root, doc, name, ctx = empty) => hkdf(root, cat(doc, ctx), `astral-pack/key/v1/${name}`);
export const keyText = (raw) => b64u(raw);
