// @ts-check

import test from "node:test";
import assert from "node:assert/strict";
import { cat, utf8 } from "../src/bytes.ts";
import { packWith, open, readPub } from "../src/core.ts";
import { edPub, lockKey, rootFor, signSeed } from "../src/crypto.ts";
import { makeHead, tagSize } from "../src/fmt.ts";
import { clean, parse, canon } from "../src/json.ts";
import { encodePb } from "../src/pb.ts";

const password = "correct horse battery staple";
const opt = {
  iterations: 100_000,
  ent: Uint8Array.from({ length: 32 }, (_, i) => i),
  salt: Uint8Array.from({ length: 16 }, (_, i) => i + 32),
  nonce: Uint8Array.from({ length: 12 }, (_, i) => i + 48),
};

const oldPack = async (source) => {
  const value = parse(source);
  const json = utf8(canon(value));
  const { root, doc } = await rootFor(json, opt.ent);
  const seed = await signSeed(root, doc);
  const pub = await edPub(seed);
  const payload = encodePb(json, opt.ent);
  const head = makeHead(opt.iterations, opt.salt, opt.nonce, pub.text, payload.byteLength + tagSize);
  const rawKey = await lockKey(password, opt.salt, opt.iterations);
  const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({
    name: "AES-GCM",
    iv: opt.nonce,
    additionalData: head,
    tagLength: 128,
  }, key, payload));
  return cat(head, cipher);
};

test("canonical JSON rejects duplicate keys and ignores formatting", () => {
  assert.equal(clean('{"b":2,"a":1}'), '{"a":1,"b":2}');
  assert.throws(() => clean('{"a":1,"a":2}'), /Duplicate JSON key/u);
});

test("typed protobuf preserves every JSON value kind", async () => {
  const sources = [
    "null",
    "true",
    "false",
    "-12",
    "1.25",
    '"text"',
    "[]",
    "{}",
    JSON.stringify({
      array: [null, true, false, -12, 1.25, "text", { nested: 9 }],
      empty: {},
    }),
  ];

  for (const source of sources) {
    const packed = await packWith(source, password, opt);
    const value = await open(packed.bytes, password);
    assert.deepEqual(JSON.parse(value.source), JSON.parse(source));
    value.id.drop();
  }
});

test("pack and open use one deterministic identity", async () => {
  const packed = await packWith('{"b":2,"a":1}', password, opt);
  assert.equal(readPub(packed.bytes), packed.pub);
  const value = await open(packed.bytes, password);
  assert.equal(value.source, '{"a":1,"b":2}');
  assert.equal(value.pub, packed.pub);
  const sig = await value.id.sign(utf8("message"));
  assert.equal(sig.byteLength, 64);
  const readingA = await value.id.key("reading", utf8("a"));
  const readingB = await value.id.key("reading", utf8("b"));
  assert.notDeepEqual(readingA, readingB);
  value.id.drop();
  await assert.rejects(() => value.id.sign(utf8("again")), /dropped/u);
});

test("compression does not participate in identity derivation", async () => {
  const source = JSON.stringify({
    bodies: Array.from({ length: 80 }, (_, index) => ({
      name: "Mars",
      index,
      direct: index % 2 === 0,
    })),
  });
  const raw = await packWith(source, password, { ...opt, codec: 0 });
  const br = await packWith(source, password, {
    ...opt,
    codec: 1,
    nonce: Uint8Array.from({ length: 12 }, (_, i) => i + 80),
  });
  assert.equal(raw.pub, br.pub);
  assert.equal(raw.info.codec, 0);
  assert.equal(br.info.codec, 1);
  assert.ok(br.info.packed < br.info.pb);
  assert.ok(br.bytes.byteLength < raw.bytes.byteLength);
});

test("version 1 containers remain readable", async () => {
  const bytes = await oldPack('{"old":true,"n":7}');
  const value = await open(bytes, password);
  assert.equal(value.source, '{"n":7,"old":true}');
  assert.equal(readPub(bytes), value.pub);
  value.id.drop();
});

test("wrong passwords and altered bytes fail", async () => {
  const packed = await packWith('{"ok":true}', password, opt);
  await assert.rejects(() => open(packed.bytes, "this password is definitely wrong"), /Wrong password or damaged/u);
  const changed = packed.bytes.slice();
  changed[changed.length - 20] ^= 1;
  await assert.rejects(() => open(changed, password), /Wrong password or damaged/u);
  const head = packed.bytes.slice();
  head[60] ^= 1;
  await assert.rejects(() => open(head, password));
});

test("fresh entropy creates a different public identity", async () => {
  const left = await packWith('{"same":true}', password, opt);
  const right = await packWith('{"same":true}', password, {
    ...opt,
    ent: Uint8Array.from({ length: 32 }, (_, i) => 255 - i),
  });
  assert.notEqual(left.pub, right.pub);
});
