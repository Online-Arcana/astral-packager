// @ts-check

import test from "node:test";
import assert from "node:assert/strict";
import { cat, get32, text, utf8 } from "../src/bytes.ts";
import { packWith, open, readMeta, readPub, readPubRaw, readWheel } from "../src/core.ts";
import { edPub, lockKey, rootFor, signSeed } from "../src/crypto.ts";
import { makeHead, makeHead2, makeHead3, makeHead4, tagSize } from "../src/fmt.ts";
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

const position = (sign, longitudeDegrees) => ({ position: { value: { sign, longitudeDegrees } } });

const chart = {
  "astral-calculation": {
    system: {
      points: {
        sun: position("capricorn", 281.25),
        moon: position("virgo", 166.5),
        ascendant: position("capricorn", 294.125),
        midheaven: position("libra", 201.75),
        descendant: position("cancer", 114.125),
        imum_coeli: position("aries", 21.75),
      },
    },
  },
};

const houses = Object.fromEntries(Array.from({ length: 12 }, (_, index) => {
  const number = index + 1;
  const cusp = (294.125 + index * 30) % 360;
  const end = (294.125 + (index + 1) * 30) % 360;
  return [String(number), {
    number,
    cusp: { value: { longitudeDegrees: cusp } },
    end: { value: { longitudeDegrees: end } },
  }];
}));

const wheelChart = {
  "astral-calculation": {
    subject: { providedName: "Private fixture name" },
    birth: { date: "1991-01-15", time: "12:34:00" },
    settings: { primaryHouseSystem: "placidus" },
    provenance: { calculationFingerprint: "sha256:public-wheel-fixture" },
    system: {
      points: {
        sun: position("capricorn", 281.25),
        moon: position("virgo", 166.5),
        mercury: position("capricorn", 274.0),
        venus: position("aquarius", 301.0),
        mars: position("taurus", 42.0),
        jupiter: position("leo", 131.0),
        saturn: position("capricorn", 296.0),
        uranus: position("capricorn", 279.0),
        neptune: position("capricorn", 284.0),
        pluto: position("scorpio", 228.0),
        north_node_true: position("aquarius", 305.0),
        south_node_true: position("leo", 125.0),
        north_node_mean: position("aquarius", 306.0),
        south_node_mean: position("leo", 126.0),
        ascendant: position("capricorn", 294.125),
        descendant: position("cancer", 114.125),
        midheaven: position("libra", 201.75),
        imum_coeli: position("aries", 21.75),
        vertex: position("leo", 140.0),
        antivertex: position("aquarius", 320.0),
        east_point: position("capricorn", 290.0),
        part_of_fortune: position("gemini", 75.0),
        part_of_spirit: position("scorpio", 220.0),
        lilith_mean: position("sagittarius", 255.0),
        lilith_true: position("sagittarius", 258.0),
      },
      houses: {
        placidus: {
          status: "calculated",
          houses,
        },
      },
      aspects: [
        { id: "sun-trine-mars", a: "sun", b: "mars", kind: "trine", class: "major", character: "flowing" },
        { id: "moon-square-jupiter", a: "moon", b: "jupiter", kind: "square", class: "major", character: "challenging" },
        { id: "sun-conjunction-uranus", a: "sun", b: "uranus", kind: "conjunction", class: "major", character: "contextual" },
      ],
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

const identity = async (source) => {
  const value = parse(source);
  const json = utf8(canon(value));
  const { root, doc } = await rootFor(json, opt.ent);
  const seed = await signSeed(root, doc);
  const pub = await edPub(seed);
  return { value, json, pub };
};

const oldPack = async (source) => {
  const { json, pub } = await identity(source);
  const payload = encodePb(json, opt.ent);
  const head = makeHead(opt.iterations, opt.salt, opt.nonce, pub.text, payload.byteLength + tagSize);
  return encrypt(head, payload);
};

const oldPack2 = async (source) => {
  const { value, pub } = await identity(source);
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

const oldPack3 = async (source) => {
  const { value, pub } = await identity(source);
  const payload = encodePb2(value, opt.ent);
  const head = makeHead3(
    opt.iterations,
    opt.salt,
    opt.nonce,
    pub.text,
    expectedSigns,
    payload.byteLength + tagSize,
    0,
    payload.byteLength,
  );
  return encrypt(head, payload);
};

const oldPack4 = async (source) => {
  const { value, pub } = await identity(source);
  const payload = encodePb2(value, opt.ent);
  const head = makeHead4(
    opt.iterations,
    opt.salt,
    opt.nonce,
    pub.raw,
    expectedSigns,
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

test("version 5 stores the exact raw public key and public signs", async () => {
  const packed = await packWith(JSON.stringify(chart), password, opt);
  assert.equal(text(packed.bytes.slice(0, 8)), "ASTRPKG5");
  const meta = readMeta(packed.bytes);
  assert.equal(meta.ver, 5);
  assert.equal(meta.pub, packed.pub);
  assert.deepEqual(meta.pubRaw, packed.pubRaw);
  assert.deepEqual(readPubRaw(packed.bytes), packed.pubRaw);
  assert.deepEqual(packed.bytes.slice(60, 92), packed.pubRaw);
  assert.deepEqual(meta.signs, expectedSigns);
  assert.deepEqual(packed.signs, expectedSigns);
  assert.equal(meta.wheel, null);

  const headSize = get32(packed.bytes, 28);
  const publicBlock = JSON.parse(text(packed.bytes.slice(92, headSize)));
  assert.equal(publicBlock.schema, "astral-public-meta/1.0.0");
  assert.deepEqual(publicBlock.signs, expectedSigns);
  assert.equal(publicBlock.wheel, null);

  const value = await open(packed.bytes, password);
  assert.deepEqual(value.pubRaw, packed.pubRaw);
  assert.deepEqual(value.signs, expectedSigns);
  assert.equal(value.json["astral-calculation"].system.points.sun.position.value.sign, "capricorn");
  assert.equal(value.json["astral-calculation"].system.points.imum_coeli.position.value.sign, "aries");
  value.id.drop();
});

test("version 5 exposes exactly the metadata needed to reconstruct the natal wheel", async () => {
  const packed = await packWith(JSON.stringify(wheelChart), password, opt);
  const meta = readMeta(packed.bytes);
  const wheel = readWheel(packed.bytes);
  assert.equal(meta.ver, 5);
  assert.deepEqual(wheel, meta.wheel);
  assert.ok(wheel);
  assert.equal(wheel.schema, "astral-public-wheel/1.0.0");
  assert.equal(wheel.calculationFingerprint, "sha256:public-wheel-fixture");
  assert.equal(wheel.primaryHouseSystem, "placidus");
  assert.equal(wheel.points.sun, 281.25);
  assert.equal(wheel.points.moon, 166.5);
  assert.equal(wheel.points.ascendant, 294.125);
  assert.equal(wheel.points.midheaven, 201.75);
  assert.equal(wheel.points.descendant, 114.125);
  assert.equal(wheel.points.imum_coeli, 21.75);
  assert.equal(wheel.houses.status, "calculated");
  assert.equal(wheel.houses.houses["1"].cuspLongitudeDegrees, 294.125);
  assert.equal(wheel.houses.houses["12"].endLongitudeDegrees, 294.125);
  assert.deepEqual(wheel.aspects[0], {
    id: "sun-trine-mars",
    a: "sun",
    b: "mars",
    kind: "trine",
    class: "major",
    character: "flowing",
  });

  const headSize = get32(packed.bytes, 28);
  const publicText = text(packed.bytes.slice(92, headSize));
  assert.match(publicText, /astral-public-wheel\/1\.0\.0/u);
  assert.doesNotMatch(publicText, /Private fixture name|1991-01-15|12:34:00/u);

  const opened = await open(packed.bytes, password);
  assert.deepEqual(opened.wheel, wheel);
  opened.id.drop();
});

test("generic JSON keeps blank public sign fields and no public wheel", async () => {
  const packed = await packWith('{"generic":true}', password, opt);
  assert.deepEqual(readMeta(packed.bytes).signs, {
    solar: "",
    lunar: "",
    ascending: "",
    midheaven: "",
    descending: "",
    imumCoeli: "",
  });
  assert.equal(readMeta(packed.bytes).wheel, null);
  const value = await open(packed.bytes, password);
  assert.deepEqual(value.signs, readMeta(packed.bytes).signs);
  assert.equal(value.wheel, null);
  value.id.drop();
});

test("pack and open use one deterministic identity", async () => {
  const packed = await packWith('{"b":2,"a":1}', password, opt);
  assert.equal(readPub(packed.bytes), packed.pub);
  assert.deepEqual(readPubRaw(packed.bytes), packed.pubRaw);
  const value = await open(packed.bytes, password);
  assert.equal(value.source, '{"a":1,"b":2}');
  assert.equal(value.pub, packed.pub);
  assert.deepEqual(value.pubRaw, packed.pubRaw);
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
  assert.deepEqual(raw.pubRaw, br.pubRaw);
  assert.deepEqual(raw.pubRaw, zstd.pubRaw);
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

test("version 1 through version 4 containers remain readable", async () => {
  const v1 = await oldPack('{"old":true,"n":7}');
  const value1 = await open(v1, password);
  assert.equal(value1.source, '{"n":7,"old":true}');
  assert.equal(readPub(v1), value1.pub);
  assert.equal(readMeta(v1).ver, 1);
  assert.equal(readMeta(v1).wheel, null);
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
  assert.equal(readMeta(v2).wheel, null);
  assert.deepEqual(value2.signs, expectedSigns);
  value2.id.drop();

  const v3 = await oldPack3(JSON.stringify(chart));
  const value3 = await open(v3, password);
  assert.equal(readMeta(v3).ver, 3);
  assert.deepEqual(readMeta(v3).signs, expectedSigns);
  assert.equal(readMeta(v3).wheel, null);
  assert.deepEqual(value3.signs, expectedSigns);
  value3.id.drop();

  const v4 = await oldPack4(JSON.stringify(chart));
  const value4 = await open(v4, password);
  assert.equal(readMeta(v4).ver, 4);
  assert.deepEqual(readMeta(v4).signs, expectedSigns);
  assert.equal(readMeta(v4).wheel, null);
  assert.deepEqual(value4.signs, expectedSigns);
  value4.id.drop();
});

test("wrong passwords and altered bytes fail", async () => {
  const packed = await packWith(JSON.stringify(wheelChart), password, opt);
  await assert.rejects(() => open(packed.bytes, "this password is definitely wrong"), /Wrong password or damaged/u);
  const changed = packed.bytes.slice();
  changed[changed.length - 20] ^= 1;
  await assert.rejects(() => open(changed, password), /Wrong password or damaged/u);
  const head = packed.bytes.slice();
  head[60] ^= 1;
  await assert.rejects(() => open(head, password));
  const metadata = packed.bytes.slice();
  metadata[100] ^= 1;
  await assert.rejects(() => open(metadata, password));
});

test("fresh entropy creates a different public identity", async () => {
  const left = await packWith('{"same":true}', password, opt);
  const right = await packWith('{"same":true}', password, {
    ...opt,
    ent: Uint8Array.from({ length: 32 }, (_, i) => 255 - i),
  });
  assert.notEqual(left.pub, right.pub);
  assert.notDeepEqual(left.pubRaw, right.pubRaw);
});
