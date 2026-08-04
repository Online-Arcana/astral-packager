// @ts-check

export const rawCodec = 0;
export const brCodec = 1;
export const defCodec = 2;
export const zstdCodec = 3;
export const maxRaw = 64 * 1024 * 1024;

const isNode = typeof process !== "undefined" && Boolean(process.versions?.node);

const stream = async (name, data, open = false) => {
  const Transform = open ? DecompressionStream : CompressionStream;
  const transform = new Transform(name);
  const writer = transform.writable.getWriter();
  await writer.write(data);
  await writer.close();
  return new Uint8Array(await new Response(transform.readable).arrayBuffer());
};

const nodeCall = (fn, data, options = null) => new Promise((resolve, reject) => {
  const done = (error, value) => {
    if (error) reject(error);
    else resolve(new Uint8Array(value));
  };
  if (options === null) fn(data, done);
  else fn(data, options, done);
});

const nodeCandidates = async (data) => {
  const zlib = await import("node:zlib");
  const brBase = {
    [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
    [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.byteLength,
  };
  const base = await Promise.all([
    nodeCall(zlib.brotliCompress, data, {
      params: {
        ...brBase,
        [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_GENERIC,
      },
    }),
    nodeCall(zlib.brotliCompress, data, {
      params: {
        ...brBase,
        [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
      },
    }),
    nodeCall(zlib.deflateRaw, data, { level: 9, memLevel: 9 }),
    nodeCall(zlib.deflateRaw, data, {
      level: 9,
      memLevel: 9,
      strategy: zlib.constants.Z_FILTERED,
    }),
  ]);
  const out = [
    { id: brCodec, data: base[0] },
    { id: brCodec, data: base[1] },
    { id: defCodec, data: base[2] },
    { id: defCodec, data: base[3] },
  ];

  if (typeof zlib.zstdCompress === "function") {
    const zstd = await nodeCall(zlib.zstdCompress, data, {
      params: {
        [zlib.constants.ZSTD_c_compressionLevel]: 22,
        [zlib.constants.ZSTD_c_strategy]: zlib.constants.ZSTD_btultra2,
        [zlib.constants.ZSTD_c_checksumFlag]: 0,
        [zlib.constants.ZSTD_c_contentSizeFlag]: 1,
      },
    });
    out.push({ id: zstdCodec, data: zstd });
  }
  return out;
};

const browserCandidates = async (data) => {
  const out = [];
  for (const [id, name] of [
    [brCodec, "brotli"],
    [defCodec, "deflate-raw"],
    [zstdCodec, "zstd"],
  ]) {
    try {
      out.push({ id, data: await stream(name, data) });
    } catch {
      // Runtime does not expose this lossless codec.
    }
  }
  return out;
};

export const shrink = async (data, force = null) => {
  if (data.byteLength > maxRaw) throw new Error("Payload is too large");
  if (force !== null && ![rawCodec, brCodec, defCodec, zstdCodec].includes(force)) {
    throw new Error("Unsupported compression codec");
  }
  if (force === rawCodec) return { id: rawCodec, data: data.slice() };

  const compressed = isNode
    ? await nodeCandidates(data)
    : await browserCandidates(data);
  const all = [{ id: rawCodec, data: data.slice() }, ...compressed];
  const candidates = all.filter((candidate) => force === null || candidate.id === force);
  if (candidates.length === 0) {
    for (const candidate of all) candidate.data.fill(0);
    throw new Error("Requested compression codec is unavailable");
  }
  candidates.sort((left, right) => left.data.byteLength - right.data.byteLength || left.id - right.id);
  const winner = candidates[0];
  for (const candidate of all) {
    if (candidate !== winner) candidate.data.fill(0);
  }
  return winner;
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
    const name = id === brCodec
      ? "brotli"
      : id === defCodec
        ? "deflate-raw"
        : id === zstdCodec
          ? "zstd"
          : null;
    if (!name) throw new Error("Unsupported compression codec");
    try {
      out = await stream(name, data, true);
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
