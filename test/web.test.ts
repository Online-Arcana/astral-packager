import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../public/style.css", import.meta.url), "utf8");
const web = await readFile(new URL("../src/web.ts", import.meta.url), "utf8");

test("password confirmation precedes the strength score", () => {
  assert.ok(html.indexOf('id="confirm-row"') < html.indexOf('id="pwd-audit"'));
});

test("both password inputs expose local SVG reveal controls", () => {
  assert.match(html, /id="password-reveal"[\s\S]*class="eye eye-closed"[\s\S]*class="eye eye-open"/u);
  assert.match(html, /id="confirm-reveal"[\s\S]*class="eye eye-closed"[\s\S]*class="eye eye-open"/u);
  assert.match(web, /open\.style\.display = shown \? "block" : "none";/u);
  assert.match(web, /closed\.style\.display = shown \? "none" : "block";/u);
});

test("revealing the main password disables and hides confirmation", () => {
  assert.match(web, /confirmRow\.style\.display = needed \? "grid" : "none";/u);
  assert.match(web, /confirm\.required = needed;/u);
  assert.match(web, /confirm\.disabled = !needed;/u);
  assert.match(web, /setRepeat\(!shown\);/u);
});

test("password mismatch is visible and blocks submission", () => {
  assert.match(html, /id="confirm-error"[\s\S]*Passwords do not match\./u);
  assert.match(web, /confirm\.setCustomValidity\(matches \? "" : "Passwords do not match\."\)/u);
  assert.match(web, /confirmError\.style\.display = show \? "block" : "none";/u);
  assert.match(css, /input\[aria-invalid="true"\]/u);
});

test("packaging progress reports percentage, elapsed time and ETA", () => {
  assert.match(html, /id="job-bar"[\s\S]*max="100"[\s\S]*id="job-elapsed"[\s\S]*id="job-eta"/u);
  assert.match(web, /elapsed \* \(\(100 - pct\) \/ pct\)/u);
  assert.match(web, /window\.setInterval\(showTime, 100\)/u);
  assert.match(web, /pack\(source, password\.value, \(\{ pct: next, stage \}\) =>/u);
  assert.match(css, /\.job\[hidden\], #result\[hidden\] \{ display: none; \}/u);
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
