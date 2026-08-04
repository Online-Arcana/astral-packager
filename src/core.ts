// @ts-check

import { cat, eq, text, utf8, wipe } from "./bytes.ts";
import { edPub, lockKey, rand, rootFor, signSeed } from "./crypto.ts";
import { makeHead, prodIter, readBox, tagSize } from "./fmt.ts";
import { Id } from "./id.ts";
import { canon, parse } from "./json.ts";
import { decodePb, encodePb } from "./pb.ts";
import { auditPwd, pwdInput, pwdOk } from "./pwd.ts";

const aes = async (raw, use) => crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [use]);

const needPwd = (password) => {
  const audit = auditPwd(password);
  if (!audit.ok) throw new Error(audit.warning);
};

const needInput = (password) => {
  if (!pwdInput(password)) throw new Error("Password is required");
};

export { auditPwd, pwdOk };

export const packWith = async (source, password, opt = {}) => {
  needPwd(password);
  const value = parse(source);
  const clean = canon(value);
  const json = utf8(clean);
  const ent = opt.ent ? opt.ent.slice() : rand(32);
  const salt = opt.salt ? opt.salt.slice() : rand(16);
  const nonce = opt.nonce ? opt.nonce.slice() : rand(12);
  const iterations = opt.iterations ?? prodIter;
  const { root, doc } = await rootFor(json, ent);
  const seed = await signSeed(root, doc);
  const pub = await edPub(seed);
  const payload = encodePb(json, ent);
  const cipherSize = payload.byteLength + tagSize;
  const head = makeHead(iterations, salt, nonce, pub.text, cipherSize);
  const rawKey = await lockKey(password, salt, iterations);
  try {
    const key = await aes(rawKey, "encrypt");
    const cipher = new Uint8Array(await crypto.subtle.encrypt({
      name: "AES-GCM",
      iv: nonce,
      additionalData: head,
      tagLength: 128,
    }, key, payload));
    return { bytes: cat(head, cipher), pub: pub.text };
  } finally {
    wipe(rawKey);
    wipe(root);
    wipe(doc);
    wipe(seed);
    wipe(ent);
  }
};

export const pack = (source, password) => packWith(source, password);

export const readPub = (data) => readBox(data).pub;

export const open = async (data, password) => {
  needInput(password);
  const box = readBox(data);
  const rawKey = await lockKey(password, box.salt, box.iterations);
  let payload;
  try {
    const key = await aes(rawKey, "decrypt");
    payload = new Uint8Array(await crypto.subtle.decrypt({
      name: "AES-GCM",
      iv: box.nonce,
      additionalData: box.head,
      tagLength: 128,
    }, key, box.cipher));
  } catch {
    throw new Error("Wrong password or damaged container");
  } finally {
    wipe(rawKey);
  }
  const decoded = decodePb(payload);
  wipe(payload);
  const source = text(decoded.json);
  const value = parse(source);
  const clean = canon(value);
  const cleanBytes = utf8(clean);
  if (!eq(cleanBytes, decoded.json)) throw new Error("Encrypted JSON is not canonical");
  const { root, doc } = await rootFor(cleanBytes, decoded.ent);
  const seed = await signSeed(root, doc);
  const pub = await edPub(seed);
  wipe(seed);
  wipe(decoded.ent);
  if (!eq(utf8(pub.text), utf8(box.pub))) {
    wipe(root);
    wipe(doc);
    throw new Error("Public key does not match the encrypted identity");
  }
  return { json: value, source: clean, pub: box.pub, id: new Id(root, doc, box.pub) };
};
