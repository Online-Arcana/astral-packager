// @ts-check

import { eq, text, utf8 } from "./bytes.ts";

const zodiac = new Set([
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
]);

const fields = [
  ["solar_sign", "solar", "sun"],
  ["lunar_sign", "lunar", "moon"],
  ["ascending_sign", "ascending", "ascendant"],
  ["midheaven_sign", "midheaven", "midheaven"],
  ["descending_sign", "descending", "descendant"],
  ["imum_coeli_sign", "imumCoeli", "imum_coeli"],
];

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const at = (value, path) => {
  let current = value;
  for (const part of path) {
    if (!object(current)) return undefined;
    current = current[part];
  }
  return current;
};

const sign = (value, name) => {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new Error(`Invalid public ${name}`);
  const clean = value.toLowerCase();
  if (!zodiac.has(clean)) throw new Error(`Invalid public ${name}`);
  return clean;
};

export const emptySigns = () => ({
  solar: "",
  lunar: "",
  ascending: "",
  midheaven: "",
  descending: "",
  imumCoeli: "",
});

export const signsFor = (value) => {
  const points = at(value, ["astral-calculation", "system", "points"]);
  const out = emptySigns();
  for (const [label, key, point] of fields) {
    out[key] = sign(at(points, [point, "position", "value", "sign"]), label);
  }
  return out;
};

export const encodeSigns = (value) => utf8([
  "",
  ...fields.map(([label, key]) => `${label}=${value[key]}`),
  "",
].join("\n"));

export const decodeSigns = (value) => {
  const source = text(value);
  if (!source.startsWith("\n") || !source.endsWith("\n")) {
    throw new Error("Invalid public sign block");
  }
  const lines = source.slice(1, -1).split("\n");
  if (lines.length !== fields.length) throw new Error("Invalid public sign block");
  const out = emptySigns();
  for (let index = 0; index < fields.length; index += 1) {
    const [label, key] = fields[index];
    const prefix = `${label}=`;
    if (!lines[index].startsWith(prefix)) throw new Error("Invalid public sign block");
    out[key] = sign(lines[index].slice(prefix.length), label);
  }
  return out;
};

export const sameSigns = (left, right) => eq(encodeSigns(left), encodeSigns(right));
