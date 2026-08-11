export interface Signs {
  solar: string;
  lunar: string;
  ascending: string;
  midheaven: string;
  descending: string;
  imumCoeli: string;
}

export type PublicPointId =
  | "sun" | "moon" | "mercury" | "venus" | "mars"
  | "jupiter" | "saturn" | "uranus" | "neptune" | "pluto"
  | "north_node_true" | "south_node_true" | "north_node_mean" | "south_node_mean"
  | "ascendant" | "descendant" | "midheaven" | "imum_coeli"
  | "vertex" | "antivertex" | "east_point"
  | "part_of_fortune" | "part_of_spirit" | "lilith_mean" | "lilith_true";

export type PublicHouseSystem = "placidus" | "whole_sign" | "equal" | "porphyry";
export type PublicHouseStatus = "calculated" | "fallback" | "unavailable";
export type PublicHouseNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export type PublicAspectKind =
  | "conjunction" | "opposition" | "trine" | "square" | "sextile"
  | "quincunx" | "semisextile" | "semisquare" | "sesquiquadrate"
  | "quintile" | "biquintile";
export type PublicAspectClass = "major" | "minor";
export type PublicAspectCharacter = "flowing" | "challenging" | "contextual" | "adjusting" | "creative";

export interface PublicHouse {
  number: PublicHouseNumber;
  cuspLongitudeDegrees: number | null;
  endLongitudeDegrees: number | null;
}

export interface PublicAspect {
  id: string;
  a: PublicPointId;
  b: PublicPointId;
  kind: PublicAspectKind;
  class: PublicAspectClass;
  character: PublicAspectCharacter;
}

export interface PublicWheelMeta {
  schema: "astral-public-wheel/1.0.0";
  calculationFingerprint: string;
  primaryHouseSystem: PublicHouseSystem;
  points: Record<PublicPointId, number | null>;
  houses: {
    status: PublicHouseStatus;
    houses: Record<string, PublicHouse>;
  };
  aspects: PublicAspect[];
}

export interface PublicMeta {
  ver: 1 | 2 | 3 | 4 | 5;
  pub: string;
  pubRaw: Uint8Array;
  signs: Signs;
  wheel: PublicWheelMeta | null;
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
  wheel: PublicWheelMeta | null;
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
  wheel: PublicWheelMeta | null;
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
export function readWheel(data: Uint8Array): PublicWheelMeta | null;
