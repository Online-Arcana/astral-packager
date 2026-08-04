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
const confirmRow = one("#confirm-row");
const confirmError = one("#confirm-error");
const passwordReveal = one("#password-reveal");
const confirmReveal = one("#confirm-reveal");
const button = one("#make");
const status = one("#status");
const result = one("#result");
const publicKey = one("#public-key");
const download = one("#download");
const auditBox = one("#pwd-audit");
const meter = one("#pwd-meter");
const score = one("#pwd-score");
const tips = one("#pwd-tips");
const codec = ["raw", "Brotli", "DEFLATE"];
let url = null;

const outputName = (name) => {
  if (name.endsWith(".astral.raw")) return name.slice(0, -4);
  if (name.endsWith(".json")) return `${name.slice(0, -5)}.astral`;
  if (name.endsWith(".astral")) return `${name.slice(0, -7)}.packed.astral`;
  return `${name}.astral`;
};

const setReveal = (toggle, input, shown) => {
  const open = toggle.querySelector(".eye-open");
  const closed = toggle.querySelector(".eye-closed");
  input.type = shown ? "text" : "password";
  toggle.setAttribute("aria-pressed", String(shown));
  toggle.setAttribute("aria-label", shown ? "Hide password" : "Reveal password");
  open.hidden = !shown;
  closed.hidden = shown;
  open.style.display = shown ? "block" : "none";
  closed.style.display = shown ? "none" : "block";
};

const setRepeat = (needed) => {
  confirmRow.hidden = !needed;
  confirmRow.style.display = needed ? "grid" : "none";
  confirm.required = needed;
  confirm.disabled = !needed;
  if (needed) return;
  confirm.value = "";
  confirm.setCustomValidity("");
  confirm.setAttribute("aria-invalid", "false");
  confirmError.hidden = true;
  confirmError.style.display = "none";
};

const confirmNeeded = () => !confirm.disabled;

const checkMatch = () => {
  const needed = confirmNeeded();
  const matches = !needed || confirm.value === password.value;
  const show = needed && confirm.value.length > 0 && !matches;
  confirm.setCustomValidity(matches ? "" : "Passwords do not match.");
  confirm.setAttribute("aria-invalid", String(!matches));
  confirmError.hidden = !show;
  confirmError.style.display = show ? "block" : "none";
  return matches;
};

const showAudit = () => {
  const audit = auditPwd(password.value);
  auditBox.dataset.score = String(audit.score);
  meter.value = audit.score;
  score.textContent = password.value.length === 0
    ? "Not scored"
    : `${audit.score}/4 — ${audit.label}`;
  const suggestions = audit.ok
    ? []
    : [...new Set(["Use at least 10 characters.", ...audit.suggestions])];
  tips.replaceChildren(...suggestions.map((tip) => {
    const item = document.createElement("li");
    item.textContent = tip;
    return item;
  }));
  return audit;
};

const toggleMain = () => {
  const shown = password.type === "password";
  setReveal(passwordReveal, password, shown);
  setRepeat(!shown);
  setReveal(confirmReveal, confirm, false);
  checkMatch();
};

passwordReveal.addEventListener("click", toggleMain);
confirmReveal.addEventListener("click", () => {
  setReveal(confirmReveal, confirm, confirm.type === "password");
});
password.addEventListener("input", () => {
  showAudit();
  checkMatch();
});
confirm.addEventListener("input", checkMatch);
setReveal(passwordReveal, password, false);
setReveal(confirmReveal, confirm, false);
setRepeat(true);
showAudit();
checkMatch();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  result.hidden = true;
  const selected = file.files?.[0];
  if (!selected) return status.textContent = "Choose a JSON-style file.";
  const audit = showAudit();
  if (!audit.ok) return status.textContent = "Choose a password scored Strong or Excellent.";
  if (!checkMatch()) return status.textContent = "Passwords do not match.";
  button.disabled = true;
  status.textContent = "Encoding, compressing and encrypting locally…";
  try {
    const source = await selected.text();
    const value = await pack(source, password.value);
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(new Blob([value.bytes], { type: "application/octet-stream" }));
    download.href = url;
    download.download = outputName(selected.name);
    publicKey.value = value.pub;
    result.hidden = false;
    status.textContent = `Ready: ${value.info.json} B JSON → ${value.info.pb} B protobuf → ${value.info.packed} B ${codec[value.info.codec]}. Nothing was uploaded.`;
    password.value = "";
    confirm.value = "";
    setReveal(passwordReveal, password, false);
    setReveal(confirmReveal, confirm, false);
    setRepeat(true);
    checkMatch();
    showAudit();
  } catch (cause) {
    status.textContent = cause instanceof Error ? cause.message : "Packaging failed.";
  } finally {
    button.disabled = false;
  }
});
