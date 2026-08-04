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
  ["solar", "sun"],
  ["lunar", "moon"],
  ["ascending", "ascendant"],
  ["midheaven", "midheaven"],
  ["descending", "descendant"],
  ["imum_coeli", "imum_coeli"],
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
  if (typeof value !== "string") throw new Error(`Invalid public ${name} sign`);
  const clean = value.toLowerCase();
  if (!zodiac.has(clean)) throw new Error(`Invalid public ${name} sign`);
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
  for (const [name, point] of fields) {
    const key = name === "imum_coeli" ? "imumCoeli" : name;
    out[key] = sign(at(points, [point, "position", "value", "sign"]), name);
  }
  return out;
};

export const encodeSigns = (value) => utf8([
  `solar=${value.solar}`,
  `lunar=${value.lunar}`,
  `ascending=${value.ascending}`,
  `midheaven=${value.midheaven}`,
  `descending=${value.descending}`,
  `imum_coeli=${value.imumCoeli}`,
  "",
].join("\n"));

export const decodeSigns = (value) => {
  const source = text(value);
  if (!source.endsWith("\n")) throw new Error("Invalid public sign block");
  const lines = source.slice(0, -1).split("\n");
  if (lines.length !== fields.length) throw new Error("Invalid public sign block");
  const out = emptySigns();
  for (let index = 0; index < fields.length; index += 1) {
    const [name] = fields[index];
    const prefix = `${name}=`;
    if (!lines[index].startsWith(prefix)) throw new Error("Invalid public sign block");
    const key = name === "imum_coeli" ? "imumCoeli" : name;
    out[key] = sign(lines[index].slice(prefix.length), name);
  }
  return out;
};

export const sameSigns = (left, right) => eq(encodeSigns(left), encodeSigns(right));
