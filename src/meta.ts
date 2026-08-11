// @ts-check

import { eq, text, utf8 } from "./bytes.ts";
import { canon, parse } from "./json.ts";

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

const pointIds = [
  "sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto",
  "north_node_true", "south_node_true", "north_node_mean", "south_node_mean",
  "ascendant", "descendant", "midheaven", "imum_coeli", "vertex", "antivertex", "east_point",
  "part_of_fortune", "part_of_spirit", "lilith_mean", "lilith_true",
];
const pointIdSet = new Set(pointIds);
const houseSystems = new Set(["placidus", "whole_sign", "equal", "porphyry"]);
const houseStatuses = new Set(["calculated", "fallback", "unavailable"]);
const aspectKinds = new Set([
  "conjunction", "opposition", "trine", "square", "sextile", "quincunx",
  "semisextile", "semisquare", "sesquiquadrate", "quintile", "biquintile",
]);
const aspectClasses = new Set(["major", "minor"]);
const aspectCharacters = new Set(["flowing", "challenging", "contextual", "adjusting", "creative"]);

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

const finiteLongitude = (value, name) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 360) {
    throw new Error(`Invalid public ${name}`);
  }
  return value;
};

const nullableLongitude = (value, name) => {
  if (value === null || value === undefined) return null;
  if (!object(value)) throw new Error(`Invalid public ${name}`);
  return finiteLongitude(value.longitudeDegrees, name);
};

const word = (value, allowed, name) => {
  if (typeof value !== "string" || !allowed.has(value)) throw new Error(`Invalid public ${name}`);
  return value;
};

const plainString = (value, name) => {
  if (typeof value !== "string" || value.length < 1 || value.length > 512) {
    throw new Error(`Invalid public ${name}`);
  }
  return value;
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

export const wheelFor = (value) => {
  const calculation = at(value, ["astral-calculation"]);
  if (!object(calculation)) return null;
  const system = calculation.system;
  const settings = calculation.settings;
  const provenance = calculation.provenance;
  if (!object(system) || !object(settings) || !object(provenance)) return null;
  if (!object(system.points) || !object(system.houses) || !Array.isArray(system.aspects)) return null;

  const primaryHouseSystem = word(settings.primaryHouseSystem, houseSystems, "primary house system");
  const calculationFingerprint = plainString(provenance.calculationFingerprint, "calculation fingerprint");

  const points = {};
  for (const id of pointIds) {
    points[id] = nullableLongitude(at(system.points, [id, "position", "value"]), `${id} longitude`);
  }

  const sourceHouseChart = system.houses[primaryHouseSystem];
  if (!object(sourceHouseChart) || !object(sourceHouseChart.houses)) {
    throw new Error("Invalid public primary house chart");
  }
  const houses = {};
  for (let number = 1; number <= 12; number += 1) {
    const source = sourceHouseChart.houses[String(number)];
    if (!object(source)) throw new Error(`Invalid public house ${number}`);
    houses[String(number)] = {
      number,
      cuspLongitudeDegrees: nullableLongitude(at(source, ["cusp", "value"]), `house ${number} cusp longitude`),
      endLongitudeDegrees: nullableLongitude(at(source, ["end", "value"]), `house ${number} end longitude`),
    };
  }

  const aspects = system.aspects.map((source, index) => {
    if (!object(source)) throw new Error(`Invalid public aspect ${index}`);
    const a = plainString(source.a, `aspect ${index} endpoint A`);
    const b = plainString(source.b, `aspect ${index} endpoint B`);
    if (!pointIdSet.has(a) || !pointIdSet.has(b)) throw new Error(`Invalid public aspect ${index} endpoint`);
    return {
      id: plainString(source.id, `aspect ${index} id`),
      a,
      b,
      kind: word(source.kind, aspectKinds, `aspect ${index} kind`),
      class: word(source.class, aspectClasses, `aspect ${index} class`),
      character: word(source.character, aspectCharacters, `aspect ${index} character`),
    };
  });

  return {
    schema: "astral-public-wheel/1.0.0",
    calculationFingerprint,
    primaryHouseSystem,
    points,
    houses: {
      status: word(sourceHouseChart.status, houseStatuses, "primary house status"),
      houses,
    },
    aspects,
  };
};

export const publicMetaFor = (value) => ({
  schema: "astral-public-meta/1.0.0",
  signs: signsFor(value),
  wheel: wheelFor(value),
});

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

export const encodePublicMeta = (value) => utf8(canon(value));

export const decodePublicMeta = (value) => {
  const decoded = parse(text(value));
  if (!object(decoded) || decoded.schema !== "astral-public-meta/1.0.0") {
    throw new Error("Invalid public metadata block");
  }
  if (!object(decoded.signs)) throw new Error("Invalid public metadata signs");
  const signs = emptySigns();
  for (const [label, key] of fields) signs[key] = sign(decoded.signs[key], label);

  const wheel = decoded.wheel;
  if (wheel === null) return { schema: decoded.schema, signs, wheel: null };
  if (!object(wheel) || wheel.schema !== "astral-public-wheel/1.0.0") {
    throw new Error("Invalid public wheel metadata");
  }

  const primaryHouseSystem = word(wheel.primaryHouseSystem, houseSystems, "primary house system");
  const points = {};
  if (!object(wheel.points)) throw new Error("Invalid public wheel points");
  for (const id of pointIds) {
    const longitude = wheel.points[id];
    points[id] = longitude === null ? null : finiteLongitude(longitude, `${id} longitude`);
  }

  if (!object(wheel.houses) || !object(wheel.houses.houses)) throw new Error("Invalid public wheel houses");
  const houses = {};
  for (let number = 1; number <= 12; number += 1) {
    const source = wheel.houses.houses[String(number)];
    if (!object(source) || source.number !== number) throw new Error(`Invalid public house ${number}`);
    houses[String(number)] = {
      number,
      cuspLongitudeDegrees: source.cuspLongitudeDegrees === null
        ? null
        : finiteLongitude(source.cuspLongitudeDegrees, `house ${number} cusp longitude`),
      endLongitudeDegrees: source.endLongitudeDegrees === null
        ? null
        : finiteLongitude(source.endLongitudeDegrees, `house ${number} end longitude`),
    };
  }

  if (!Array.isArray(wheel.aspects)) throw new Error("Invalid public wheel aspects");
  const aspects = wheel.aspects.map((source, index) => {
    if (!object(source)) throw new Error(`Invalid public aspect ${index}`);
    const a = plainString(source.a, `aspect ${index} endpoint A`);
    const b = plainString(source.b, `aspect ${index} endpoint B`);
    if (!pointIdSet.has(a) || !pointIdSet.has(b)) throw new Error(`Invalid public aspect ${index} endpoint`);
    return {
      id: plainString(source.id, `aspect ${index} id`),
      a,
      b,
      kind: word(source.kind, aspectKinds, `aspect ${index} kind`),
      class: word(source.class, aspectClasses, `aspect ${index} class`),
      character: word(source.character, aspectCharacters, `aspect ${index} character`),
    };
  });

  return {
    schema: decoded.schema,
    signs,
    wheel: {
      schema: wheel.schema,
      calculationFingerprint: plainString(wheel.calculationFingerprint, "calculation fingerprint"),
      primaryHouseSystem,
      points,
      houses: {
        status: word(wheel.houses.status, houseStatuses, "primary house status"),
        houses,
      },
      aspects,
    },
  };
};

export const sameSigns = (left, right) => eq(encodeSigns(left), encodeSigns(right));
export const samePublicMeta = (left, right) => eq(encodePublicMeta(left), encodePublicMeta(right));
