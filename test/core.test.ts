// @ts-check

import test from "node:test";
import assert from "node:assert/strict";
import { utf8 } from "../src/bytes.ts";
import { packWith, open, readPub } from "../src/core.ts";
import { clean } from "../src/json.ts";

const password = "correct horse battery staple";
const opt = {
  iterations: 100_000,
  ent: Uint8Array.from({ length: 32 }, (_, i) => i),
  salt: Uint8Array.from({ length: 16 }, (_, i) => i + 32),
  nonce: Uint8Array.from({ length: 12 }, (_, i) => i + 48),
};

test("canonical JSON rejects duplicate keys and ignores formatting", () => {
  assert.equal(clean('{"b":2,"a":1}'), '{"a":1,"b":2}');
  assert.throws(() => clean('{"a":1,"a":2}'), /Duplicate JSON key/u);
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

test("wrong passwords and altered bytes fail", async () => {
  const packed = await packWith('{"ok":true}', password, opt);
  await assert.rejects(() => open(packed.bytes, "this password is definitely wrong"), /Wrong password or damaged/u);
  const changed = packed.bytes.slice();
  changed[changed.length - 20] ^= 1;
  await assert.rejects(() => open(changed, password), /Wrong password or damaged/u);
  const head = packed.bytes.slice();
  head[56] ^= 1;
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
