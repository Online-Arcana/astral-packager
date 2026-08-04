// @ts-check

const unicode = (value) => {
  for (let i = 0; i < value.length; i += 1) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (next < 0xdc00 || next > 0xdfff) throw new Error("JSON contains an unpaired surrogate");
      i += 1;
      continue;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) throw new Error("JSON contains an unpaired surrogate");
  }
};

class Reader {
  constructor(source) {
    this.source = source;
    this.at = 0;
  }

  parse() {
    this.ws();
    const value = this.value();
    this.ws();
    if (this.at !== this.source.length) throw new Error(`Unexpected JSON data at byte ${this.at}`);
    return value;
  }

  ws() {
    while (" \t\r\n".includes(this.source[this.at] ?? "\0")) this.at += 1;
  }

  value() {
    this.ws();
    const char = this.source[this.at];
    if (char === "{") return this.object();
    if (char === "[") return this.array();
    if (char === '"') return this.string();
    if (char === "t") return this.literal("true", true);
    if (char === "f") return this.literal("false", false);
    if (char === "n") return this.literal("null", null);
    return this.number();
  }

  literal(word, value) {
    if (this.source.slice(this.at, this.at + word.length) !== word) {
      throw new Error(`Invalid JSON token at byte ${this.at}`);
    }
    this.at += word.length;
    return value;
  }

  string() {
    const start = this.at;
    this.at += 1;
    let escaped = false;
    while (this.at < this.source.length) {
      const char = this.source[this.at];
      if (!escaped && char === '"') {
        this.at += 1;
        const value = JSON.parse(this.source.slice(start, this.at));
        unicode(value);
        return value;
      }
      if (!escaped && char === "\\") escaped = true;
      else escaped = false;
      this.at += 1;
    }
    throw new Error(`Unterminated JSON string at byte ${start}`);
  }

  number() {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(this.source.slice(this.at));
    if (!match) throw new Error(`Invalid JSON value at byte ${this.at}`);
    this.at += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) throw new Error("JSON number is outside the supported range");
    return value;
  }

  array() {
    this.at += 1;
    const result = [];
    this.ws();
    if (this.source[this.at] === "]") {
      this.at += 1;
      return result;
    }
    for (;;) {
      result.push(this.value());
      this.ws();
      const char = this.source[this.at];
      if (char === "]") {
        this.at += 1;
        return result;
      }
      if (char !== ",") throw new Error(`Expected ',' or ']' at byte ${this.at}`);
      this.at += 1;
    }
  }

  object() {
    this.at += 1;
    const result = Object.create(null);
    const keys = new Set();
    this.ws();
    if (this.source[this.at] === "}") {
      this.at += 1;
      return result;
    }
    for (;;) {
      this.ws();
      if (this.source[this.at] !== '"') throw new Error(`Expected an object key at byte ${this.at}`);
      const key = this.string();
      if (keys.has(key)) throw new Error(`Duplicate JSON key: ${key}`);
      keys.add(key);
      this.ws();
      if (this.source[this.at] !== ":") throw new Error(`Expected ':' at byte ${this.at}`);
      this.at += 1;
      result[key] = this.value();
      this.ws();
      const char = this.source[this.at];
      if (char === "}") {
        this.at += 1;
        return result;
      }
      if (char !== ",") throw new Error(`Expected ',' or '}' at byte ${this.at}`);
      this.at += 1;
    }
  }
}

const write = (value) => {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "string") {
    if (typeof value === "string") unicode(value);
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("JSON contains a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(write).join(",")}]`;
  if (typeof value !== "object") throw new Error(`Unsupported JSON value: ${typeof value}`);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new Error("JSON contains a non-plain object");
  return `{${Object.keys(value).sort().map((key) => {
    unicode(key);
    return `${JSON.stringify(key)}:${write(value[key])}`;
  }).join(",")}}`;
};

export const parse = (source) => new Reader(source).parse();
export const canon = (value) => write(value);
export const clean = (source) => canon(parse(source));
