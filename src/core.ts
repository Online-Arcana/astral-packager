// @ts-check

import { cat, eq, text, utf8, wipe } from "./bytes.ts";
import { expand, rawCodec, shrink } from "./cmp.ts";
import { edPub, lockKey, rand, rootFor, signSeed } from "./crypto.ts";
import { makeHead3, prodIter, readBox, tagSize } from "./fmt.ts";
import { Id } from "./id.ts";
import { canon, parse } from "./json.ts";
import { sameSigns, signsFor } from "./meta.ts";
import { decodePb } from "./pb.ts";
import { decodePb2, encodePb2 } from "./pb2.ts";
import { auditPwd, pwdInput, pwdOk } from "./pwd.ts";

const aes = async (raw, use) => crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [use]);

const wipeAll = (...values) => {
  for (const value of values) {
    if (value instanceof Uint8Array) wipe(value);
  }
};

const mark = (opt, pct, stage) => {
  if (typeof opt.progress !== "function") return;
  const value = Math.max(0, Math.min(100, Math.round(pct)));
  try {
    opt.progress({ pct: value, stage });
  } catch {
    // Progress observers must not affect cryptographic output.
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
  mark(opt, 0, "Reading and validating profile");
  const value = parse(source);
  const signs = signsFor(value);
  mark(opt, 0, "Canonicalising profile");
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
    mark(opt, 0, "Generating identity");
    const identity = await rootFor(json, ent);
    root = identity.root;
    doc = identity.doc;
    seed = await signSeed(root, doc);
    const pub = await edPub(seed);
    mark(opt, 0, "Encoding protobuf");
    raw = encodePb2(value, ent);
    mark(opt, 1, "Protobuf ready");
    const small = await shrink(raw, opt.codec ?? null, ({ done, total, name, active }) => {
      const count = Math.max(1, total);
      const pct = 1 + ((done / count) * 84);
      const stage = active
        ? `Compressing with ${name}`
        : name === "raw protobuf"
          ? "Compression not needed"
          : `Compressed with ${name}`;
      mark(opt, pct, stage);
    });
    smallData = small.data;
    mark(opt, 85, small.id === rawCodec ? "Using raw protobuf" : "Compressed payload ready");
    const cipherSize = smallData.byteLength + tagSize;
    const head = makeHead3(
      iterations,
      salt,
      nonce,
      pub.text,
      signs,
      cipherSize,
      small.id,
      raw.byteLength,
    );
    mark(opt, 85, "Deriving encryption key");
    rawKey = await lockKey(password, salt, iterations);
    mark(opt, 99, "Encrypting payload");
    const key = await aes(rawKey, "encrypt");
    const cipher = new Uint8Array(await crypto.subtle.encrypt({
      name: "AES-GCM",
      iv: nonce,
      additionalData: head,
      tagLength: 128,
    }, key, smallData));
    const bytes = cat(head, cipher);
    mark(opt, 100, "Container complete");
    return {
      bytes,
      pub: pub.text,
      signs,
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

export const pack = (source, password, progress = null) => packWith(source, password, { progress });

export const readPub = (data) => readBox(data).pub;

export const readMeta = (data) => {
  const box = readBox(data);
  return { ver: box.ver, pub: box.pub, signs: box.signs };
};

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

    const signs = signsFor(value);
    if (box.ver === 3 && !sameSigns(signs, box.signs)) {
      throw new Error("Public signs do not match the encrypted chart");
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
    return { json: value, source: clean, pub: box.pub, signs, id };
  } finally {
    wipeAll(rawKey, packed, raw, sourceBytes, ent, cleanBytes, seed, root, doc);
  }
};
