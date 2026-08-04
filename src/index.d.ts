export interface Signs {
  solar: string;
  lunar: string;
  ascending: string;
  midheaven: string;
  descending: string;
  imumCoeli: string;
}

export interface PublicMeta {
  ver: 1 | 2 | 3 | 4;
  pub: string;
  pubRaw: Uint8Array;
  signs: Signs;
}

export interface PackInfo {
  json: number;
  pb: number;
  packed: number;
  codec: 0 | 1 | 2 | 3;
}

export interface PackProgress {
  pct: number;
  stage: string;
}

export interface Packed {
  bytes: Uint8Array;
  pub: string;
  pubRaw: Uint8Array;
  signs: Signs;
  info: PackInfo;
}

export interface PwdAudit {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Unsafe" | "Weak" | "Fair" | "Strong" | "Excellent";
  ok: boolean;
  length: number;
  bits: number;
  warning: string;
  suggestions: string[];
}

export class Id {
  readonly pub: string;
  sign(data: Uint8Array): Promise<Uint8Array>;
  key(name: string, ctx?: Uint8Array): Promise<Uint8Array>;
  drop(): void;
}

export interface Opened {
  json: unknown;
  source: string;
  pub: string;
  pubRaw: Uint8Array;
  signs: Signs;
  id: Id;
}

export const pwdMin: 10;
export function auditPwd(password: string): PwdAudit;
export function pwdOk(password: string): boolean;
export function pack(
  source: string,
  password: string,
  progress?: (value: PackProgress) => void,
): Promise<Packed>;
export function open(data: Uint8Array, password: string): Promise<Opened>;
export function readPub(data: Uint8Array): string;
export function readPubRaw(data: Uint8Array): Uint8Array;
export function readMeta(data: Uint8Array): PublicMeta;
