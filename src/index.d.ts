export interface Packed {
  bytes: Uint8Array;
  pub: string;
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

export function pwdOk(password: string): boolean;
export function pack(source: string, password: string): Promise<Packed>;
export function open(data: Uint8Array, password: string): Promise<Opened>;
export function readPub(data: Uint8Array): string;
