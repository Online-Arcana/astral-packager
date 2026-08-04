// @ts-check

import test from "node:test";
import assert from "node:assert/strict";
import { cat, get32, text, utf8 } from "../src/bytes.ts";
import { packWith, open, readMeta, readPub } from "../src/core.ts";
import { edPub, lockKey, rootFor, signSeed } from "../src/crypto.ts";
import { makeHead, makeHead2, tagSize } from "../src/fmt.ts";
import { clean, parse, canon } from "../src/json.ts";
import { encodePb } from "../src/pb.ts";
import { encodePb2 } from "../src/pb2.ts";

const password = "correct horse battery staple";
const opt = {
  iterations: 100_000,
  ent: Uint8Array.from({ length: 32 }, (_, i) => i),
  salt: Uint8Array.from({ length: 16 }, (_, i) => i + 32),
  nonce: Uint8Array.from({ length: 12 }, (_, i) => i + 48),
};

const chart = {
  "astral-calculation": {
    system: {
      points: {
        sun: { position: { value: { sign: "capricorn" } } },
        moon: { position: { value: { sign: "virgo" } } },
        ascendant: { position: { value: { sign: "capricorn" } } },
        midheaven: { position: { value: { sign: "libra" } } },
        descendant: { position: { value: { sign: "cancer" } } },
        imum_coeli: { position: { value: { sign: "aries" } } },
      },
    },
  },
};

const expectedSigns = {
  solar: "capricorn",
  lunar: "virgo",
  ascending: "capricorn",
  midheaven: "libra",
  descending: "cancer",
  imumCoeli: "aries",
};

const encrypt = async (head, payload) => {
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

const oldPack = async (source) => {
  const value = parse(source);
  const json = utf8(canon(value));
  const { root, doc } = await rootFor(json, opt.ent);
  const seed = await signSeed(root, doc);
  const pub = await edPub(seed);
  const payload = encodePb(json, opt.ent);
  const head = makeHead(opt.iterations, opt.salt, opt.nonce, pub.text, payload.byteLength + tagSize);
  return encrypt(head, payload);
};

const oldPack2 = async (source) => {
  const value = parse(source);
  const json = utf8(canon(value));
  const { root, doc } = await rootFor(json, opt.ent);
  const seed = await signSeed(root, doc);
  const pub = await edPub(seed);
  const payload = encodePb2(value, opt.ent);
  const head = makeHead2(
    opt.iterations,
    opt.salt,
    opt.nonce,
    pub.text,
    payload.byteLength + tagSize,
    0,
    payload.byteLength,
  );
  return encrypt(head, payload);
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

test("version 3 exposes public signs without removing them from the payload", async () => {
  const packed = await packWith(JSON.stringify(chart), password, opt);
  assert.equal(text(packed.bytes.slice(0, 8)), "ASTRPKG3");
  const meta = readMeta(packed.bytes);
  assert.equal(meta.ver, 3);
  assert.equal(meta.pub, packed.pub);
  assert.deepEqual(meta.signs, expectedSigns);
  assert.deepEqual(packed.signs, expectedSigns);

  const headSize = get32(packed.bytes, 28);
  assert.equal(text(packed.bytes.slice(103, headSize)), [
    "solar=capricorn",
    "lunar=virgo",
    "ascending=capricorn",
    "midheaven=libra",
    "descending=cancer",
    "imum_coeli=aries",
    "",
  ].join("\n"));

  const value = await open(packed.bytes, password);
  assert.deepEqual(value.signs, expectedSigns);
  assert.equal(value.json["astral-calculation"].system.points.sun.position.value.sign, "capricorn");
  assert.equal(value.json["astral-calculation"].system.points.imum_coeli.position.value.sign, "aries");
  value.id.drop();
});

test("generic JSON keeps blank public sign fields", async () => {
  const packed = await packWith('{"generic":true}', password, opt);
  assert.deepEqual(readMeta(packed.bytes).signs, {
    solar: "",
    lunar: "",
    ascending: "",
    midheaven: "",
    descending: "",
    imumCoeli: "",
  });
  const value = await open(packed.bytes, password);
  assert.deepEqual(value.signs, readMeta(packed.bytes).signs);
  value.id.drop();
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

test("pack weights progress toward real compression work", async () => {
  const seen = [];
  const packed = await packWith(JSON.stringify({
    bodies: Array.from({ length: 400 }, (_, index) => ({ name: "Mars", index })),
  }), password, {
    ...opt,
    progress: (value) => seen.push(value),
  });
  assert.equal(seen[0].pct, 0);
  assert.equal(seen.at(-1).pct, 100);
  const first = seen.findIndex((value) => value.stage.startsWith("Compressing with "));
  assert.ok(first > 0);
  assert.ok(seen.slice(0, first + 1).every((value) => value.pct <= 1));
  assert.ok(seen.some((value) => value.pct > 1 && value.pct <= 97));
  assert.ok(seen.every((value) => !value.stage.startsWith("Testing ")));
  for (let index = 1; index < seen.length; index += 1) {
    assert.ok(seen[index].pct >= seen[index - 1].pct);
  }
  const value = await open(packed.bytes, password);
  assert.equal(value.pub, packed.pub);
  value.id.drop();
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
  const zstd = await packWith(source, password, {
    ...opt,
    codec: 3,
    nonce: Uint8Array.from({ length: 12 }, (_, i) => i + 96),
  });
  assert.equal(raw.pub, br.pub);
  assert.equal(raw.pub, zstd.pub);
  assert.equal(raw.info.codec, 0);
  assert.equal(br.info.codec, 1);
  assert.equal(zstd.info.codec, 3);
  assert.ok(br.info.packed < br.info.pb);
  assert.ok(zstd.info.packed < zstd.info.pb);
  assert.ok(br.bytes.byteLength < raw.bytes.byteLength);
  assert.ok(zstd.bytes.byteLength < raw.bytes.byteLength);
  const restored = await open(zstd.bytes, password);
  assert.equal(restored.pub, raw.pub);
  restored.id.drop();
});

test("version 1 and version 2 containers remain readable", async () => {
  const v1 = await oldPack('{"old":true,"n":7}');
  const value1 = await open(v1, password);
  assert.equal(value1.source, '{"n":7,"old":true}');
  assert.equal(readPub(v1), value1.pub);
  assert.equal(readMeta(v1).ver, 1);
  value1.id.drop();

  const v2 = await oldPack2(JSON.stringify(chart));
  const value2 = await open(v2, password);
  assert.equal(readMeta(v2).ver, 2);
  assert.deepEqual(readMeta(v2).signs, {
    solar: "",
    lunar: "",
    ascending: "",
    midheaven: "",
    descending: "",
    imumCoeli: "",
  });
  assert.deepEqual(value2.signs, expectedSigns);
  value2.id.drop();
});

test("wrong passwords and altered bytes fail", async () => {
  const packed = await packWith(JSON.stringify(chart), password, opt);
  await assert.rejects(() => open(packed.bytes, "this password is definitely wrong"), /Wrong password or damaged/u);
  const changed = packed.bytes.slice();
  changed[changed.length - 20] ^= 1;
  await assert.rejects(() => open(changed, password), /Wrong password or damaged/u);
  const head = packed.bytes.slice();
  head[60] ^= 1;
  await assert.rejects(() => open(head, password));
  const signs = packed.bytes.slice();
  signs[109] ^= 1;
  await assert.rejects(() => open(signs, password));
});

test("fresh entropy creates a different public identity", async () => {
  const left = await packWith('{"same":true}', password, opt);
  const right = await packWith('{"same":true}', password, {
    ...opt,
    ent: Uint8Array.from({ length: 32 }, (_, i) => 255 - i),
  });
  assert.notEqual(left.pub, right.pub);
});
