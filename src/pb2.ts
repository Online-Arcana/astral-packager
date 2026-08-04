// @ts-check

import { cat, text, utf8 } from "./bytes.ts";

const max = 64 * 1024 * 1024;

const vint = (value) => {
  let left = BigInt(value);
  if (left < 0n) throw new Error("Negative protobuf integer");
  const out = [];
  do {
    let byte = Number(left & 0x7fn);
    left >>= 7n;
    if (left > 0n) byte |= 0x80;
    out.push(byte);
  } while (left > 0n);
  return Uint8Array.from(out);
};

const tag = (id, wire) => vint(BigInt((id << 3) | wire));
const len = (id, data) => cat(tag(id, 2), vint(data.byteLength), data);
const num = (id, value) => cat(tag(id, 0), vint(value));

const f64 = (id, value) => {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setFloat64(0, value, true);
  return cat(tag(id, 1), out);
};

const collect = (value, keys = new Set()) => {
  if (Array.isArray(value)) {
    for (const item of value) collect(item, keys);
    return keys;
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      keys.add(key);
      collect(value[key], keys);
    }
  }
  return keys;
};

const zig = (value) => value >= 0
  ? BigInt(value) * 2n
  : (-BigInt(value) * 2n) - 1n;

const writeValue = (value, keys) => {
  if (value === null) return num(7, 1);
  if (typeof value === "boolean") return num(6, value ? 1 : 0);
  if (typeof value === "string") return len(3, utf8(value));
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("JSON contains a non-finite number");
    return Number.isSafeInteger(value) ? num(4, zig(value)) : f64(5, value);
  }
  if (Array.isArray(value)) {
    const body = cat(...value.map((item) => len(1, writeValue(item, keys))));
    return len(2, body);
  }
  if (typeof value === "object") {
    const fields = [];
    for (const key of Object.keys(value).sort()) {
      const ref = keys.get(key);
      if (!ref) throw new Error("Missing protobuf key reference");
      fields.push(len(1, cat(num(1, ref), len(2, writeValue(value[key], keys)))));
    }
    return len(1, cat(...fields));
  }
  throw new Error(`Unsupported JSON value: ${typeof value}`);
};

export const encodePb2 = (value, entropy) => {
  if (entropy.byteLength !== 32) throw new Error("Identity entropy must contain 32 bytes");
  const names = [...collect(value)].sort();
  const refs = new Map(names.map((name, index) => [name, index + 1]));
  return cat(
    num(1, 2),
    len(2, entropy),
    ...names.map((name) => len(3, utf8(name))),
    len(4, writeValue(value, refs)),
  );
};

const readVint = (data, state) => {
  let value = 0n;
  let shift = 0n;
  while (state.at < data.byteLength && shift <= 63n) {
    const byte = data[state.at++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return value;
    shift += 7n;
  }
  throw new Error("Invalid protobuf varint");
};

const readSize = (data, state) => {
  const value = readVint(data, state);
  if (value > BigInt(max)) throw new Error("Protobuf field is too large");
  return Number(value);
};

const readBytes = (data, state) => {
  const size = readSize(data, state);
  const end = state.at + size;
  if (end > data.byteLength) throw new Error("Truncated protobuf field");
  const value = data.slice(state.at, end);
  state.at = end;
  return value;
};

const skip = (data, state, wire) => {
  if (wire === 0) readVint(data, state);
  else if (wire === 1) state.at += 8;
  else if (wire === 2) state.at += readSize(data, state);
  else if (wire === 5) state.at += 4;
  else throw new Error(`Unsupported protobuf wire type: ${wire}`);
  if (state.at > data.byteLength) throw new Error("Truncated protobuf payload");
};

const readValue = (data, keys) => {
  const state = { at: 0 };
  let found = false;
  let result;

  while (state.at < data.byteLength) {
    const raw = Number(readVint(data, state));
    const id = raw >>> 3;
    const wire = raw & 7;
    if (found && id >= 1 && id <= 7) throw new Error("Multiple protobuf JSON kinds");

    if (id === 1 && wire === 2) {
      found = true;
      const body = readBytes(data, state);
      const objectState = { at: 0 };
      const object = Object.create(null);
      let last = 0;

      while (objectState.at < body.byteLength) {
        const objectTag = Number(readVint(body, objectState));
        if ((objectTag >>> 3) !== 1 || (objectTag & 7) !== 2) {
          skip(body, objectState, objectTag & 7);
          continue;
        }
        const pair = readBytes(body, objectState);
        const pairState = { at: 0 };
        let ref = 0;
        let value;
        let hasValue = false;

        while (pairState.at < pair.byteLength) {
          const pairTag = Number(readVint(pair, pairState));
          const pairId = pairTag >>> 3;
          const pairWire = pairTag & 7;
          if (pairId === 1 && pairWire === 0) {
            ref = Number(readVint(pair, pairState));
            continue;
          }
          if (pairId === 2 && pairWire === 2) {
            if (hasValue) throw new Error("Duplicate protobuf object value");
            value = readValue(readBytes(pair, pairState), keys);
            hasValue = true;
            continue;
          }
          skip(pair, pairState, pairWire);
        }

        if (!hasValue || ref <= last || ref > keys.length) {
          throw new Error("Invalid protobuf object field");
        }
        last = ref;
        object[keys[ref - 1]] = value;
      }
      result = object;
      continue;
    }

    if (id === 2 && wire === 2) {
      found = true;
      const body = readBytes(data, state);
      const arrayState = { at: 0 };
      const array = [];
      while (arrayState.at < body.byteLength) {
        const arrayTag = Number(readVint(body, arrayState));
        if ((arrayTag >>> 3) === 1 && (arrayTag & 7) === 2) {
          array.push(readValue(readBytes(body, arrayState), keys));
          continue;
        }
        skip(body, arrayState, arrayTag & 7);
      }
      result = array;
      continue;
    }

    if (id === 3 && wire === 2) {
      found = true;
      result = text(readBytes(data, state));
      continue;
    }

    if (id === 4 && wire === 0) {
      found = true;
      const rawInteger = readVint(data, state);
      const integer = (rawInteger & 1n) === 1n
        ? -((rawInteger + 1n) >> 1n)
        : rawInteger >> 1n;
      if (integer < BigInt(Number.MIN_SAFE_INTEGER) || integer > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("Protobuf integer is outside the JSON safe range");
      }
      result = Number(integer);
      continue;
    }

    if (id === 5 && wire === 1) {
      found = true;
      if (state.at + 8 > data.byteLength) throw new Error("Truncated protobuf double");
      result = new DataView(data.buffer, data.byteOffset + state.at, 8).getFloat64(0, true);
      state.at += 8;
      if (!Number.isFinite(result)) throw new Error("Protobuf contains a non-finite number");
      continue;
    }

    if (id === 6 && wire === 0) {
      found = true;
      const boolean = readVint(data, state);
      if (boolean !== 0n && boolean !== 1n) throw new Error("Invalid protobuf boolean");
      result = boolean === 1n;
      continue;
    }

    if (id === 7 && wire === 0) {
      found = true;
      if (readVint(data, state) !== 1n) throw new Error("Invalid protobuf null");
      result = null;
      continue;
    }

    skip(data, state, wire);
  }

  if (!found) throw new Error("Missing protobuf JSON value");
  return result;
};

export const decodePb2 = (data) => {
  if (data.byteLength > max) throw new Error("Protobuf payload is too large");
  const state = { at: 0 };
  let version = null;
  let entropy = null;
  let root;
  let hasRoot = false;
  const keys = [];

  while (state.at < data.byteLength) {
    const raw = Number(readVint(data, state));
    const id = raw >>> 3;
    const wire = raw & 7;

    if (id === 1 && wire === 0) {
      if (version !== null) throw new Error("Duplicate protobuf version");
      version = Number(readVint(data, state));
      continue;
    }
    if (id === 2 && wire === 2) {
      if (entropy !== null) throw new Error("Duplicate protobuf entropy");
      entropy = readBytes(data, state);
      continue;
    }
    if (id === 3 && wire === 2) {
      const key = text(readBytes(data, state));
      if (keys.length > 0 && keys.at(-1) >= key) throw new Error("Unsorted protobuf key table");
      keys.push(key);
      continue;
    }
    if (id === 4 && wire === 2) {
      if (hasRoot) throw new Error("Duplicate protobuf root");
      root = readValue(readBytes(data, state), keys);
      hasRoot = true;
      continue;
    }
    skip(data, state, wire);
  }

  if (version !== 2 || entropy === null || entropy.byteLength !== 32 || !hasRoot) {
    throw new Error("Invalid typed protobuf payload");
  }
  return { value: root, ent: entropy };
};
