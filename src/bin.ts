#!/usr/bin/env node
// @ts-check

import { readFile, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { emitKeypressEvents } from "node:readline";
import { auditPwd, open, pack, readPub } from "./core.ts";

const help = () => {
  console.log(`astral-packager 0.2.1

Usage:
  astral-pack <json-file>
  astral-pack open <container>
  astral-pack pub <container>

The pack and open commands request passwords without echoing them.`);
};

const hidden = (label) => new Promise((resolve, reject) => {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    reject(new Error("A terminal is required for secure password input"));
    return;
  }
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stderr.write(label);
  let value = "";
  const done = (error = null) => {
    process.stdin.off("keypress", onKey);
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stderr.write("\n");
    if (error) reject(error);
    else resolve(value);
  };
  const onKey = (char, key) => {
    if (key?.ctrl && key.name === "c") return done(new Error("Cancelled"));
    if (key?.name === "return" || key?.name === "enter") return done();
    if (key?.name === "backspace") {
      value = [...value].slice(0, -1).join("");
      return;
    }
    if (typeof char === "string" && !key?.ctrl && !key?.meta) value += char;
  };
  process.stdin.on("keypress", onKey);
});

const showAudit = (audit) => {
  process.stderr.write(`Password score: ${audit.score}/4 — ${audit.label}\n`);
  if (audit.ok) return;
  for (const tip of audit.suggestions) process.stderr.write(`- ${tip}\n`);
};

const password = async (confirm) => {
  const first = await hidden("Password: ");
  if (!confirm) return first;
  const audit = auditPwd(first);
  showAudit(audit);
  if (!audit.ok) throw new Error("Choose a password scored Strong or Excellent");
  const second = await hidden("Again: ");
  if (first !== second) throw new Error("Passwords do not match");
  return first;
};

const outPack = (file) => {
  const dir = dirname(file);
  const name = basename(file);
  if (name.endsWith(".astral.raw")) return join(dir, `${name.slice(0, -4)}`);
  if (name.endsWith(".json")) return join(dir, `${name.slice(0, -5)}.astral`);
  if (name.endsWith(".astral")) return join(dir, `${name.slice(0, -7)}.packed.astral`);
  return join(dir, `${name}.astral`);
};

const outOpen = (file) => {
  const dir = dirname(file);
  const name = basename(file, extname(file));
  return join(dir, `${name}.raw.json`);
};

const absent = async (file) => {
  try {
    await access(file, constants.F_OK);
    throw new Error(`Output already exists: ${file}`);
  } catch (cause) {
    if (cause?.code !== "ENOENT") throw cause;
  }
};

const run = async () => {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") return help();
  if (args[0] === "--version" || args[0] === "-v") return console.log("0.2.1");
  const cmd = args[0] === "open" || args[0] === "pub" ? args.shift() : "pack";
  const file = args[0];
  if (!file || args.length !== 1) throw new Error("Exactly one input file is required");
  const data = new Uint8Array(await readFile(file));
  if (cmd === "pub") {
    console.log(readPub(data));
    return;
  }
  if (cmd === "open") {
    const target = outOpen(file);
    await absent(target);
    const pwd = await password(false);
    const value = await open(data, pwd);
    await writeFile(target, `${JSON.stringify(value.json, null, 2)}\n`, { mode: 0o600 });
    value.id.drop();
    console.log(`Wrote ${target}`);
    console.log(`Public key: ${value.pub}`);
    return;
  }
  const target = outPack(file);
  await absent(target);
  const source = new TextDecoder("utf-8", { fatal: true }).decode(data);
  const pwd = await password(true);
  const value = await pack(source, pwd);
  await writeFile(target, value.bytes, { mode: 0o600 });
  console.log(`Wrote ${target}`);
  console.log(`Public key: ${value.pub}`);
};

run().catch((cause) => {
  console.error(`Error: ${cause instanceof Error ? cause.message : String(cause)}`);
  process.exitCode = 1;
});
