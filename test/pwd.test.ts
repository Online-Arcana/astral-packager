// @ts-check

import test from "node:test";
import assert from "node:assert/strict";
import { auditPwd, pwdOk } from "../src/pwd.ts";

test("strong random ten-character passwords pass", () => {
  const audit = auditPwd("Q7!m#2Zp@9");
  assert.equal(audit.score, 4);
  assert.equal(audit.ok, true);
});

test("length does not rescue predictable passwords", () => {
  assert.equal(pwdOk("password12345ilikecakeandcats"), false);
  assert.equal(pwdOk("Password1!"), false);
  assert.equal(pwdOk("1234567890"), false);
  assert.equal(pwdOk("asdjkhqwer"), false);
});

test("a strong passphrase remains valid", () => {
  const audit = auditPwd("correct horse battery staple");
  assert.equal(audit.score >= 3, true);
  assert.equal(audit.ok, true);
});
