/* Validation for the exchange shortlist in plan files and pasted backups: keep known fields with the right types. */
import type { ExchangeKind, HostModule, University, UniStatus } from "./types";

const KINDS: ReadonlySet<string> = new Set<ExchangeKind>(["semester", "winter", "summer"]);
const UNI_STATUSES: ReadonlySet<string> = new Set<UniStatus>(["considering", "applying", "offered", "dropped"]);
const TERM_RE = /^Y[1-5]T[1-4]$/;
const MAX_UNIS = 60;
const MAX_MODULES = 20;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

function cleanModule(raw: unknown): HostModule | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  const cu = typeof raw.cu === "number" && Number.isFinite(raw.cu) && raw.cu >= 0 && raw.cu <= 6 ? raw.cu : 1;
  return { id: str(raw.id, 40), code: str(raw.code, 20), name: str(raw.name, 160), cu, slotKey: str(raw.slotKey, 20) };
}

function cleanUniversity(raw: unknown): University | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.name !== "string") return null;
  const gpa = typeof raw.minGpa === "number" && raw.minGpa >= 0 && raw.minGpa <= 4.3 ? raw.minGpa : null;
  return {
    id: str(raw.id, 40),
    name: str(raw.name, 120),
    country: str(raw.country, 60),
    kinds: Array.isArray(raw.kinds) ? raw.kinds.filter((k): k is ExchangeKind => typeof k === "string" && KINDS.has(k)) : [],
    minGpa: gpa,
    requirements: str(raw.requirements, 1000),
    term: typeof raw.term === "string" && TERM_RE.test(raw.term) ? raw.term : "",
    link: /^https?:\/\//.test(str(raw.link, 400)) ? str(raw.link, 400) : "",
    notes: str(raw.notes, 2000),
    status: typeof raw.status === "string" && UNI_STATUSES.has(raw.status) ? (raw.status as UniStatus) : "considering",
    modules: Array.isArray(raw.modules)
      ? raw.modules.map(cleanModule).filter((m): m is HostModule => m !== null).slice(0, MAX_MODULES)
      : [],
  };
}

export function cleanExchange(raw: unknown): { universities: University[] } | undefined {
  if (!isRecord(raw) || !Array.isArray(raw.universities)) return undefined;
  return {
    universities: raw.universities.map(cleanUniversity).filter((u): u is University => u !== null).slice(0, MAX_UNIS),
  };
}
