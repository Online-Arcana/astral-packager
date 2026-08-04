// @ts-check

const enc = new TextEncoder();

const top = new Set(`
123456 123456789 qwerty password 12345 12345678 111111 1234567 123123
qwerty123 1q2w3e4r 1234567890 default abc123 654321 123321 qwertyuiop
iloveyou admin welcome monkey dragon football baseball letmein login princess
solo passw0rd master sunshine shadow superman access freedom whatever qazwsx
trustno1 starwars hello secret lovely computer cookie summer winter spring
autumn pokemon mustang matrix killer password1 password12 password123
password1234 password12345 admin123 welcome1 letmein1 changeme newpassword
test testing test123 user guest root toor contrasena contraseña tequiero hola123
`.trim().split(/\s+/u));

const dict = new Set(`
a i the and or but if then this that these those my your our their his her its me
you we they he she it is are was were be been being have has had do does did can
could should would will may might must like love want need know think feel make
made get got go went come came see saw say said tell told give gave take took
find found look use work call try ask help play run move live believe bring
happen write sit stand lose pay meet include continue set learn change lead
understand watch follow stop create speak read allow add spend grow open walk win
offer remember consider appear buy wait serve die send expect build stay fall cut
reach kill remain suggest raise pass sell require report decide pull return
explain hope develop carry break receive agree support hit produce eat cover
catch draw choose cause point listen realise place close involve increase improve
save protect secure safe security password pass phrase word words random secret
key keys file chart astral identity user account public private sign signing
encrypt encryption cake cakes cat cats dog dogs horse battery staple correct
common admin welcome hello world home family friend friends baby birthday name
names company service online arcana tarot astrology kitty crow moon sun star
stars el la los las un una y o pero si entonces este esta mi tu su nuestro
nosotros ellos ella es son fue ser tener hacer poder querer saber pensar sentir
amor quiero gusta casa familia amigo amigos gato gatos perro perros luna sol
estrella estrellas secreto clave archivo carta identidad usuario cuenta publico
privado firma cifrar cifrado pastel pasteles
`.trim().split(/\s+/u));

const seq = [
  "abcdefghijklmnopqrstuvwxyz",
  "zyxwvutsrqponmlkjihgfedcba",
  "0123456789",
  "9876543210",
  "qwertyuiop",
  "poiuytrewq",
  "asdfghjkl",
  "lkjhgfdsa",
  "zxcvbnm",
  "mnbvcxz",
];

const leet = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "@": "a",
  "$": "s",
  "!": "i",
  "+": "t",
};

const fold = (value) => value
  .normalize("NFKD")
  .replace(/\p{M}/gu, "")
  .toLowerCase()
  .replace(/[0134578@$!+]/gu, (ch) => leet[ch] ?? ch);

const pool = (value) => {
  let size = 0;
  if (/\p{Ll}/u.test(value)) size += 26;
  if (/\p{Lu}/u.test(value)) size += 26;
  if (/\p{N}/u.test(value)) size += 10;
  if (/[\x20-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/u.test(value)) size += 33;
  if (/[^\x00-\x7f]/u.test(value)) size += 64;
  return Math.max(size, 1);
};

const words = (token) => {
  const len = token.length;
  const best = Array.from({ length: len + 1 }, () => ({ cover: -1, parts: 0 }));
  best[0] = { cover: 0, parts: 0 };

  for (let at = 0; at < len; at += 1) {
    const cur = best[at];
    if (cur.cover < 0) continue;
    if (cur.cover > best[at + 1].cover) best[at + 1] = { ...cur };

    for (let end = at + 2; end <= Math.min(len, at + 14); end += 1) {
      if (!dict.has(token.slice(at, end))) continue;
      const next = { cover: cur.cover + end - at, parts: cur.parts + 1 };
      const old = best[end];
      if (next.cover < old.cover) continue;
      if (next.cover === old.cover && next.parts >= old.parts) continue;
      best[end] = next;
    }
  }

  return best[len];
};

const hasSeq = (value) => {
  const text = value.toLowerCase();
  for (const row of seq) {
    for (let size = 3; size <= Math.min(8, text.length); size += 1) {
      for (let at = 0; at + size <= text.length; at += 1) {
        if (row.includes(text.slice(at, at + size))) return true;
      }
    }
  }
  return false;
};

const repeats = (value) => /(.)\1{2,}/u.test(value)
  || /^(.{1,8})\1+$/u.test(value)
  || /(.{2,6})\1/u.test(value);

export const pwdMin = 10;

export const auditPwd = (input) => {
  const value = input.normalize("NFKC");
  const length = [...value].length;
  const byteLength = enc.encode(value).byteLength;
  const lower = value.toLowerCase();
  const raw = lower.replace(/[^\p{L}\p{N}]+/gu, "");
  const folded = fold(value);
  const compact = folded.replace(/[^\p{L}\p{N}]+/gu, "");
  const alpha = lower.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z]+/gu, "");
  const flags = new Set();
  let bits = length * Math.log2(pool(value));

  const exact = top.has(raw)
    || top.has(compact)
    || top.has(alpha)
    || [...top].some((word) => alpha.startsWith(word) && alpha.length - word.length <= 4);

  if (exact) {
    bits = Math.min(bits, 8);
    flags.add("common");
  }

  const tokens = folded.split(/[^a-z]+/u).filter(Boolean);
  let covered = 0;
  let parts = 0;
  for (const token of tokens) {
    const found = words(token);
    covered += found.cover;
    parts += found.parts;
  }

  const letters = tokens.reduce((sum, token) => sum + token.length, 0);
  const ratio = letters === 0 ? 0 : covered / letters;
  const separated = /[^\p{L}\p{N}]/u.test(value) && tokens.length >= 3;

  if (ratio >= 0.72 && parts >= 2) {
    const left = Math.max(0, letters - covered) * Math.log2(pool(value));
    const wordBits = separated ? parts * 12 + Math.max(0, parts - 1) * 1.5 : parts * 4 + left;
    bits = Math.min(bits, wordBits);
    flags.add("words");
  }

  if (hasSeq(raw)) {
    bits -= 8;
    flags.add("sequence");
  }
  if (repeats(compact)) {
    bits -= 10;
    flags.add("repeat");
  }
  if (/(?:19|20)\d{2}|\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?/u.test(lower)) {
    bits -= 8;
    flags.add("date");
  }
  if (/^[A-Z][a-z]+\d{1,4}[^\p{L}\p{N}]?$/u.test(value)) {
    bits -= 10;
    flags.add("shape");
  }

  bits = Math.max(0, bits);
  let score = bits < 18 ? 0 : bits < 30 ? 1 : bits < 44 ? 2 : bits < 58 ? 3 : 4;

  if (length < pwdMin) {
    score = Math.min(score, 1);
    flags.add("short");
  }
  if (byteLength > 1024) {
    score = 0;
    flags.add("long");
  }

  const suggestions = [];
  if (flags.has("short")) suggestions.push(`Use at least ${pwdMin} characters.`);
  if (flags.has("long")) suggestions.push("Use at most 1024 UTF-8 bytes.");
  if (score < 3 && (flags.has("common") || flags.has("words"))) {
    suggestions.push("Avoid common passwords, familiar phrases and predictable word chains.");
  }
  if (flags.has("sequence") || flags.has("repeat") || flags.has("date") || flags.has("shape")) {
    suggestions.push("Remove dates, counting runs, keyboard walks, repeats and predictable substitutions.");
  }
  if (score < 3) {
    suggestions.push("Use a password manager, random characters, or unrelated words selected randomly.");
  }

  const labels = ["Unsafe", "Weak", "Fair", "Strong", "Excellent"];
  const empty = length === 0;
  const ok = !empty && byteLength <= 1024 && length >= pwdMin && score >= 3;
  const warning = empty
    ? "Enter a password to score it."
    : ok
      ? "Strong enough for this container."
      : "Too guessable for an offline-encrypted identity file.";

  return {
    score,
    label: labels[score],
    ok,
    length,
    bits: Math.round(bits),
    warning,
    suggestions: [...new Set(suggestions)],
  };
};

export const pwdOk = (password) => auditPwd(password).ok;

export const pwdInput = (password) => {
  const value = password.normalize("NFKC");
  return value.trim().length > 0 && enc.encode(value).byteLength <= 1024;
};
