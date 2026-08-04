// @ts-check

export const rawCodec = 0;
export const brCodec = 1;
export const defCodec = 2;
export const zstdCodec = 3;
export const maxRaw = 64 * 1024 * 1024;
export const minCmp = 1024;
export const maxCmpMs = 20_000;

const isNode = typeof process !== "undefined" && Boolean(process.versions?.node);

const nodeCall = (fn, data, options = null) => new Promise((resolve, reject) => {
  const done = (error, value) => {
    if (error) reject(error);
    else resolve(new Uint8Array(value));
  };
  if (options === null) fn(data, done);
  else fn(data, options, done);
});

const nodePack = async (id, data) => {
  const zlib = await import("node:zlib");
  if (id === zstdCodec && typeof zlib.zstdCompress === "function") {
    return nodeCall(zlib.zstdCompress, data, {
      params: {
        [zlib.constants.ZSTD_c_compressionLevel]: 3,
        [zlib.constants.ZSTD_c_checksumFlag]: 0,
        [zlib.constants.ZSTD_c_contentSizeFlag]: 1,
      },
    });
  }
  if (id === brCodec) {
    return nodeCall(zlib.brotliCompress, data, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
        [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_GENERIC,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.byteLength,
      },
    });
  }
  if (id === defCodec) {
    return nodeCall(zlib.deflateRaw, data, { level: 6, memLevel: 8 });
  }
  throw new Error("Unsupported compression codec");
};

const nodeChoice = async (force) => {
  if (force !== null) return force;
  const zlib = await import("node:zlib");
  return typeof zlib.zstdCompress === "function" ? zstdCodec : brCodec;
};

const streamName = (id) => id === zstdCodec
  ? "zstd"
  : id === brCodec
    ? "brotli"
    : id === defCodec
      ? "deflate-raw"
      : null;

const label = (id) => id === zstdCodec
  ? "Zstandard"
  : id === brCodec
    ? "Brotli"
    : id === defCodec
      ? "DEFLATE"
      : "raw protobuf";

const browserTransform = (id, open = false) => {
  const name = streamName(id);
  if (!name) return null;
  const Transform = open ? DecompressionStream : CompressionStream;
  try {
    return new Transform(name);
  } catch {
    return null;
  }
};

const browserPack = async (id, data, transform = null) => {
  const value = transform ?? browserTransform(id);
  if (!value) throw new Error("Unsupported compression codec");
  const writer = value.writable.getWriter();
  const output = new Response(value.readable).arrayBuffer();
  let timer;
  const work = (async () => {
    await writer.write(data);
    await writer.close();
    return new Uint8Array(await output);
  })();
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => {
      void writer.abort(new Error("Compression time limit exceeded"));
      reject(new Error("Compression time limit exceeded"));
    }, maxCmpMs);
  });
  try {
    return await Promise.race([work, limit]);
  } finally {
    clearTimeout(timer);
  }
};

const browserChoice = (force) => {
  const ids = force === null
    ? [zstdCodec, defCodec, brCodec]
    : [force];
  for (const id of ids) {
    const transform = browserTransform(id);
    if (transform) return { id, transform };
  }
  throw new Error("No supported lossless compression codec is available");
};

export const shrink = async (data, force = null, onStep = null) => {
  if (data.byteLength > maxRaw) throw new Error("Payload is too large");
  if (force !== null && ![rawCodec, brCodec, defCodec, zstdCodec].includes(force)) {
    throw new Error("Unsupported compression codec");
  }
  if (force === rawCodec || (force === null && data.byteLength < minCmp)) {
    onStep?.({ done: 1, total: 1, name: "raw protobuf", active: false });
    return { id: rawCodec, data: data.slice() };
  }

  let id;
  let packed;
  try {
    if (isNode) {
      id = await nodeChoice(force);
      onStep?.({ done: 0, total: 1, name: label(id), active: true });
      packed = await nodePack(id, data);
    } else {
      const choice = browserChoice(force);
      id = choice.id;
      onStep?.({ done: 0, total: 1, name: label(id), active: true });
      packed = await browserPack(id, data, choice.transform);
    }
  } catch (cause) {
    if (force !== null) throw cause;
    onStep?.({ done: 1, total: 1, name: "raw protobuf", active: false });
    return { id: rawCodec, data: data.slice() };
  }
  onStep?.({ done: 1, total: 1, name: label(id), active: false });

  if (force === null && packed.byteLength >= data.byteLength) {
    packed.fill(0);
    return { id: rawCodec, data: data.slice() };
  }
  return { id, data: packed };
};

export const expand = async (id, data, size) => {
  if (!Number.isSafeInteger(size) || size < 0 || size > maxRaw) {
    throw new Error("Invalid unpacked payload size");
  }

  let out;
  if (id === rawCodec) {
    out = data.slice();
  } else if (isNode) {
    const zlib = await import("node:zlib");
    const fn = id === brCodec
      ? zlib.brotliDecompress
      : id === defCodec
        ? zlib.inflateRaw
        : id === zstdCodec
          ? zlib.zstdDecompress
          : null;
    if (typeof fn !== "function") throw new Error("Unsupported compression codec");
    out = await nodeCall(fn, data);
  } else {
    const transform = browserTransform(id, true);
    if (!transform) throw new Error("This browser cannot unpack the container compression codec");
    try {
      const writer = transform.writable.getWriter();
      const output = new Response(transform.readable).arrayBuffer();
      await writer.write(data);
      await writer.close();
      out = new Uint8Array(await output);
    } catch {
      throw new Error("This browser cannot unpack the container compression codec");
    }
  }

  if (out.byteLength !== size) {
    out.fill(0);
    throw new Error("Decompressed payload length does not match the container header");
  }
  return out;
};
