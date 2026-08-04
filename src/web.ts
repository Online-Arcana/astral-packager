// @ts-check

import { auditPwd, pack } from "./core.ts";

const one = (selector) => {
  const value = document.querySelector(selector);
  if (!value) throw new Error(`Missing page element: ${selector}`);
  return value;
};

const form = one("#pack");
const file = one("#file");
const password = one("#password");
const confirm = one("#confirm");
const button = one("#make");
const status = one("#status");
const result = one("#result");
const publicKey = one("#public-key");
const download = one("#download");
const auditBox = one("#pwd-audit");
const meter = one("#pwd-meter");
const score = one("#pwd-score");
const note = one("#pwd-note");
const tips = one("#pwd-tips");
let url = null;

const outputName = (name) => {
  if (name.endsWith(".astral.raw")) return name.slice(0, -4);
  if (name.endsWith(".json")) return `${name.slice(0, -5)}.astral`;
  if (name.endsWith(".astral")) return `${name.slice(0, -7)}.packed.astral`;
  return `${name}.astral`;
};

const showAudit = () => {
  const audit = auditPwd(password.value);
  auditBox.dataset.score = String(audit.score);
  meter.value = audit.score;
  score.textContent = password.value.length === 0
    ? "Not scored"
    : `${audit.score}/4 — ${audit.label}`;
  note.textContent = audit.warning;
  tips.replaceChildren(...audit.suggestions.map((tip) => {
    const item = document.createElement("li");
    item.textContent = tip;
    return item;
  }));
  return audit;
};

password.addEventListener("input", showAudit);
showAudit();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  result.hidden = true;
  const selected = file.files?.[0];
  if (!selected) return status.textContent = "Choose a JSON-style file.";
  const audit = showAudit();
  if (!audit.ok) return status.textContent = "Choose a password scored Strong or Excellent.";
  if (password.value !== confirm.value) return status.textContent = "Passwords do not match.";
  button.disabled = true;
  status.textContent = "Encrypting locally…";
  try {
    const source = await selected.text();
    const value = await pack(source, password.value);
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(new Blob([value.bytes], { type: "application/octet-stream" }));
    download.href = url;
    download.download = outputName(selected.name);
    publicKey.value = value.pub;
    result.hidden = false;
    status.textContent = "Container ready. Nothing was uploaded.";
    password.value = "";
    confirm.value = "";
    showAudit();
  } catch (cause) {
    status.textContent = cause instanceof Error ? cause.message : "Packaging failed.";
  } finally {
    button.disabled = false;
  }
});
