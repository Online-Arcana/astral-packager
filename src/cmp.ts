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

const nodeCandidates = async (data, step) => {
  const zlib = await import("node:zlib");
  const brBase = {
    [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
    [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.byteLength,
  };
  const jobs = [
    {
      id: brCodec,
      name: "Brotli generic",
      run: () => nodeCall(zlib.brotliCompress, data, {
        params: {
          ...brBase,
          [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_GENERIC,
        },
      }),
    },
    {
      id: brCodec,
      name: "Brotli text",
      run: () => nodeCall(zlib.brotliCompress, data, {
        params: {
          ...brBase,
          [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
        },
      }),
    },
    {
      id: defCodec,
      name: "DEFLATE default",
      run: () => nodeCall(zlib.deflateRaw, data, { level: 9, memLevel: 9 }),
    },
    {
      id: defCodec,
      name: "DEFLATE filtered",
      run: () => nodeCall(zlib.deflateRaw, data, {
        level: 9,
        memLevel: 9,
        strategy: zlib.constants.Z_FILTERED,
      }),
    },
  ];

  if (typeof zlib.zstdCompress === "function") {
    jobs.push({
      id: zstdCodec,
      name: "Zstandard",
      run: () => nodeCall(zlib.zstdCompress, data, {
        params: {
          [zlib.constants.ZSTD_c_compressionLevel]: 22,
          [zlib.constants.ZSTD_c_strategy]: zlib.constants.ZSTD_btultra2,
          [zlib.constants.ZSTD_c_checksumFlag]: 0,
          [zlib.constants.ZSTD_c_contentSizeFlag]: 1,
        },
      }),
    });
  }

  let done = 0;
  const values = await Promise.all(jobs.map(async (job) => {
    step?.({ done, total: jobs.length, name: job.name, active: true });
    try {
      return { id: job.id, data: await job.run() };
    } catch {
      return null;
    } finally {
      done += 1;
      step?.({ done, total: jobs.length, name: job.name, active: false });
    }
  }));
  return values.filter(Boolean);
};

const browserCandidates = async (data, step) => {
  const jobs = [
    [brCodec, "brotli", "Brotli"],
    [defCodec, "deflate-raw", "DEFLATE"],
    [zstdCodec, "zstd", "Zstandard"],
  ];
  const out = [];
  let done = 0;
  for (const [id, name, label] of jobs) {
    step?.({ done, total: jobs.length, name: label, active: true });
    try {
      out.push({ id, data: await stream(name, data) });
    } catch {
      // Runtime does not expose this lossless codec.
    } finally {
      done += 1;
      step?.({ done, total: jobs.length, name: label, active: false });
    }
  }
  return out;
};

export const shrink = async (data, force = null, onStep = null) => {
  if (data.byteLength > maxRaw) throw new Error("Payload is too large");
  if (force !== null && ![rawCodec, brCodec, defCodec, zstdCodec].includes(force)) {
    throw new Error("Unsupported compression codec");
  }
  if (force === rawCodec) {
    onStep?.({ done: 1, total: 1, name: "raw protobuf", active: false });
    return { id: rawCodec, data: data.slice() };
  }

  const compressed = isNode
    ? await nodeCandidates(data, onStep)
    : await browserCandidates(data, onStep);
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
