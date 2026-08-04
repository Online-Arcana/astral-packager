import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const web = await readFile(new URL("../src/web.ts", import.meta.url), "utf8");

test("password confirmation precedes the strength score", () => {
  assert.ok(html.indexOf('id="confirm-row"') < html.indexOf('id="pwd-audit"'));
});

test("both password inputs expose local SVG reveal controls", () => {
  assert.match(html, /id="password-reveal"[\s\S]*class="eye eye-closed"[\s\S]*class="eye eye-open"/u);
  assert.match(html, /id="confirm-reveal"[\s\S]*class="eye eye-closed"[\s\S]*class="eye eye-open"/u);
});

test("revealing the main password disables and hides confirmation", () => {
  assert.match(web, /confirmRow\.hidden = shown;/u);
  assert.match(web, /confirm\.required = !shown;/u);
  assert.match(web, /confirm\.setCustomValidity\(matches \? "" : "Passwords do not match\."\)/u);
});

test("unsafe scores retain actionable guidance", () => {
  assert.match(web, /Use at least 10 characters\./u);
  assert.match(web, /audit\.ok[\s\S]*\? \[\][\s\S]*new Set/u);
});

test("redundant helper copy is absent", () => {
  assert.doesNotMatch(html, /Randomness matters more than/u);
  assert.doesNotMatch(html, /The public key is the only readable identity field/u);
  assert.doesNotMatch(html, /Strong enough for this container/u);
  assert.doesNotMatch(html, /Too guessable for an offline-encrypted identity file/u);
});
