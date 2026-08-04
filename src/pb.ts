// @ts-check

import { cat } from "./bytes.ts";

const vint = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid protobuf integer");
  const out = [];
  do {
    let byte = value & 0x7f;
    value = Math.floor(value / 128);
    if (value > 0) byte |= 0x80;
    out.push(byte);
  } while (value > 0);
  return Uint8Array.from(out);
};

const field = (id, value) => cat(vint((id << 3) | 2), vint(value.byteLength), value);

export const encodePb = (json, ent) => {
  if (ent.byteLength !== 32) throw new Error("Identity entropy must contain 32 bytes");
  return cat(vint(8), vint(1), field(2, json), field(3, ent));
};

const readVint = (data, state) => {
  let result = 0;
  let shift = 0;
  while (state.at < data.byteLength && shift <= 49) {
    const byte = data[state.at++];
    result += (byte & 0x7f) * (2 ** shift);
    if ((byte & 0x80) === 0) return result;
    shift += 7;
  }
  throw new Error("Invalid protobuf varint");
};

const bytes = (data, state) => {
  const size = readVint(data, state);
  const end = state.at + size;
  if (!Number.isSafeInteger(size) || size < 0 || end > data.byteLength) throw new Error("Invalid protobuf field length");
  const value = data.slice(state.at, end);
  state.at = end;
  return value;
};

const skip = (data, state, wire) => {
  if (wire === 0) {
    readVint(data, state);
    return;
  }
  if (wire === 1) {
    state.at += 8;
  } else if (wire === 2) {
    state.at += readVint(data, state);
  } else if (wire === 5) {
    state.at += 4;
  } else {
    throw new Error(`Unsupported protobuf wire type: ${wire}`);
  }
  if (state.at > data.byteLength) throw new Error("Truncated protobuf payload");
};

export const decodePb = (data) => {
  const state = { at: 0 };
  let version = null;
  let json = null;
  let ent = null;
  while (state.at < data.byteLength) {
    const tag = readVint(data, state);
    const id = tag >>> 3;
    const wire = tag & 7;
    if (id === 0) throw new Error("Invalid protobuf field number");
    if (id === 1 && wire === 0) {
      if (version !== null) throw new Error("Duplicate protobuf version");
      version = readVint(data, state);
      continue;
    }
    if (id === 2 && wire === 2) {
      if (json !== null) throw new Error("Duplicate protobuf JSON field");
      json = bytes(data, state);
      continue;
    }
    if (id === 3 && wire === 2) {
      if (ent !== null) throw new Error("Duplicate protobuf entropy field");
      ent = bytes(data, state);
      continue;
    }
    skip(data, state, wire);
  }
  if (version !== 1) throw new Error("Unsupported encrypted payload version");
  if (json === null || json.byteLength === 0) throw new Error("Encrypted payload has no JSON document");
  if (ent === null || ent.byteLength !== 32) throw new Error("Encrypted payload has invalid identity entropy");
  return { json, ent };
};
