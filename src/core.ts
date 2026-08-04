// @ts-check

import { cat, eq, text, utf8, wipe } from "./bytes.ts";
import { expand, shrink } from "./cmp.ts";
import { edPub, lockKey, rand, rootFor, signSeed } from "./crypto.ts";
import { makeHead2, prodIter, readBox, tagSize } from "./fmt.ts";
import { Id } from "./id.ts";
import { canon, parse } from "./json.ts";
import { decodePb } from "./pb.ts";
import { decodePb2, encodePb2 } from "./pb2.ts";
import { auditPwd, pwdInput, pwdOk } from "./pwd.ts";

const aes = async (raw, use) => crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [use]);

const wipeAll = (...values) => {
  for (const value of values) {
    if (value instanceof Uint8Array) wipe(value);
  }
};

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
  let root;
  let doc;
  let seed;
  let raw;
  let smallData;
  let rawKey;

  try {
    const identity = await rootFor(json, ent);
    root = identity.root;
    doc = identity.doc;
    seed = await signSeed(root, doc);
    const pub = await edPub(seed);
    raw = encodePb2(value, ent);
    const small = await shrink(raw, opt.codec ?? null);
    smallData = small.data;
    const cipherSize = smallData.byteLength + tagSize;
    const head = makeHead2(
      iterations,
      salt,
      nonce,
      pub.text,
      cipherSize,
      small.id,
      raw.byteLength,
    );
    rawKey = await lockKey(password, salt, iterations);
    const key = await aes(rawKey, "encrypt");
    const cipher = new Uint8Array(await crypto.subtle.encrypt({
      name: "AES-GCM",
      iv: nonce,
      additionalData: head,
      tagLength: 128,
    }, key, smallData));
    return {
      bytes: cat(head, cipher),
      pub: pub.text,
      info: {
        json: json.byteLength,
        pb: raw.byteLength,
        packed: smallData.byteLength,
        codec: small.id,
      },
    };
  } finally {
    wipeAll(rawKey, root, doc, seed, ent, json, raw, smallData);
  }
};

export const pack = (source, password) => packWith(source, password);

export const readPub = (data) => readBox(data).pub;

export const open = async (data, password) => {
  needInput(password);
  const box = readBox(data);
  let rawKey;
  let packed;
  let raw;
  let sourceBytes;
  let ent;
  let cleanBytes;
  let root;
  let doc;
  let seed;

  try {
    rawKey = await lockKey(password, box.salt, box.iterations);
    try {
      const key = await aes(rawKey, "decrypt");
      packed = new Uint8Array(await crypto.subtle.decrypt({
        name: "AES-GCM",
        iv: box.nonce,
        additionalData: box.head,
        tagLength: 128,
      }, key, box.cipher));
    } catch {
      throw new Error("Wrong password or damaged container");
    } finally {
      wipeAll(rawKey);
      rawKey = undefined;
    }

    let value;
    let clean;

    if (box.ver === 1) {
      const decoded = decodePb(packed);
      sourceBytes = decoded.json;
      ent = decoded.ent;
      const source = text(sourceBytes);
      value = parse(source);
      clean = canon(value);
      cleanBytes = utf8(clean);
      if (!eq(cleanBytes, sourceBytes)) throw new Error("Encrypted JSON is not canonical");
    } else {
      raw = await expand(box.codec, packed, box.rawSize);
      const decoded = decodePb2(raw);
      value = decoded.value;
      ent = decoded.ent;
      clean = canon(value);
      cleanBytes = utf8(clean);
    }

    const identity = await rootFor(cleanBytes, ent);
    root = identity.root;
    doc = identity.doc;
    seed = await signSeed(root, doc);
    const pub = await edPub(seed);
    if (!eq(utf8(pub.text), utf8(box.pub))) {
      throw new Error("Public key does not match the encrypted identity");
    }

    const id = new Id(root, doc, box.pub);
    root = undefined;
    doc = undefined;
    return { json: value, source: clean, pub: box.pub, id };
  } finally {
    wipeAll(rawKey, packed, raw, sourceBytes, ent, cleanBytes, seed, root, doc);
  }
};
