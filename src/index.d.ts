export interface PackInfo {
  json: number;
  pb: number;
  packed: number;
  codec: 0 | 1 | 2;
}

export interface Packed {
  bytes: Uint8Array;
  pub: string;
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
  id: Id;
}

export const pwdMin: 10;
export function auditPwd(password: string): PwdAudit;
export function pwdOk(password: string): boolean;
export function pack(source: string, password: string): Promise<Packed>;
export function open(data: Uint8Array, password: string): Promise<Opened>;
export function readPub(data: Uint8Array): string;
