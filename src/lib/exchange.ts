/* Exchange planning: SMU's outbound rules, eligibility checks and host-course mapping. Pure, no mutation. */
import { compareTerms, entryOf, termLabel } from "./model";
import type { ExchangeKind, PlacedModule, PlanState, ProgramPlan, Slot, TermId, University } from "./types";

export interface Programme {
  kind: ExchangeKind;
  label: string;
  when: string;
  /** Most SMU CUs that can count from one stint. */
  maxCu: number;
  apply: string;
  notes: string[];
}

/** From GEO / SCIS pages, researched 2026-10-22 (see PLAN.md). Confirm with GEO before applying. */
export const PROGRAMMES: Programme[] = [
  {
    kind: "semester",
    label: "Semester exchange (ISEP)",
    when: "One regular term, T1 (Aug–Dec) or T2 (Jan–Apr)",
    maxCu: 5,
    apply: "Fall (T1) round opens ~January; Spring (T2) round opens ~May/June. Plan 6–8 months ahead.",
    notes: [
      "SCIS: at least 4 terms and 16 CU done at SMU, GPA ≥ 2.0, not your final term.",
      "Sheet recommends Y3 T2 or Y4 T1.",
      "Only red-text slots can be cleared: Managing Elective 2, TSS, CMW, IS Track 3 & 4, SMU Course 4–6.",
      "At most 2 ISDE/ISRC and 2 IS/ITSD track electives; no major core.",
      "Map courses in the OASIS exchange worksheet after you accept an offer. Fulfils Global Exposure.",
    ],
  },
  {
    kind: "winter",
    label: "Winter short programme",
    when: "December",
    maxCu: 1,
    apply: "Opens ~Aug/Sep. One spot per round.",
    notes: [
      "Two-week credit SSP: 1 CU, pass/fail. Fulfils Global Exposure.",
      "One-week SSP: no credit, Global Exposure only.",
      "Not allowed in your graduating term.",
    ],
  },
  {
    kind: "summer",
    label: "Summer exchange / short programme",
    when: "May–July",
    maxCu: 2,
    apply: "Opens ~Jan/Feb. One spot per round.",
    notes: [
      "Summer exchange (2–4 weeks): up to 2 CU.",
      "Two-week credit SSP: 1 CU, pass/fail. Fulfils Global Exposure.",
    ],
  },
];

export const ISEP_MIN_GPA = 2.0;
export const ISEP_MIN_TERMS = 4;
export const ISEP_MIN_CU = 16;
const MAX_TRACK = 2;
const MAX_DEPTH = 2;
const TRACK_SLOT = /^IS Track Course \d/i;
const DEPTH_SLOT = /IS Depth|ISRC/i;

export const programmeOf = (kind: ExchangeKind) => PROGRAMMES.find((p) => p.kind === kind)!;

export function kindOfTerm(term: TermId): ExchangeKind {
  if (term.endsWith("T4")) return "winter";
  if (term.endsWith("T3")) return "summer";
  return "semester";
}

export function universitiesOf(state: PlanState): University[] {
  return state.exchange?.universities ?? [];
}

export function gpaFit(uni: University, gpa: number | undefined): "meets" | "below" | "unknown" {
  if (uni.minGpa === null || gpa === undefined) return "unknown";
  return gpa >= uni.minGpa ? "meets" : "below";
}

export interface Check {
  id: "gpa" | "terms" | "cu";
  label: string;
  /** null = can't tell yet (e.g. GPA not entered). */
  ok: boolean | null;
  detail: string;
}

/** ISEP eligibility by the start of `term`, assuming the plan up to then goes ahead. */
export function readiness(term: TermId, modules: PlacedModule[], gpa: number | undefined): Check[] {
  const before = (t: TermId | "") => Boolean(t) && compareTerms(t as TermId, term) < 0;
  // Regular terms (T1/T2) from Y1 T1 up to, not including, the exchange term.
  const terms = (Number(term[1]) - 1) * 2 + (term.endsWith("T1") ? 0 : 1);
  const cu = modules
    .filter((m) => before(m.term) && m.status !== "none" && m.status !== "exempt")
    .reduce((acc, m) => acc + m.cu, 0);
  return [
    {
      id: "gpa",
      label: `GPA ≥ ${ISEP_MIN_GPA.toFixed(1)}`,
      ok: gpa === undefined ? null : gpa >= ISEP_MIN_GPA,
      detail: gpa === undefined ? "Enter your GPA above" : `Yours: ${gpa.toFixed(2)}`,
    },
    {
      id: "terms",
      label: `${ISEP_MIN_TERMS} terms at SMU before ${termLabel(term)}`,
      ok: terms >= ISEP_MIN_TERMS,
      detail: `${terms} term${terms === 1 ? "" : "s"} by then`,
    },
    {
      id: "cu",
      label: `${ISEP_MIN_CU} CU taken at SMU before ${termLabel(term)}`,
      ok: cu >= ISEP_MIN_CU,
      detail: `${cu} CU in your plan (exemptions don't count)`,
    },
  ];
}

/** Problems with a university's course mapping, as plain sentences. */
export function mappingIssues(uni: University, slots: Slot[], plan: ProgramPlan): string[] {
  const kind = uni.term ? kindOfTerm(uni.term) : "semester";
  const prog = programmeOf(kind);
  const mapped = uni.modules
    .map((m) => ({ m, slot: slots.find((s) => s.key === m.slotKey) }))
    .filter((x): x is { m: typeof x.m; slot: Slot } => Boolean(x.slot));
  const issues: string[] = [];

  const total = mapped.reduce((acc, x) => acc + x.m.cu, 0);
  const when = uni.term ? termLabel(uni.term) : prog.label;
  if (total > prog.maxCu) issues.push(`${total} CU mapped, but ${when} counts at most ${prog.maxCu} CU.`);

  for (const { slot } of mapped) {
    if (!slot.exchange) issues.push(`${slot.title} can't be cleared on exchange (major core and non-red-text slots stay at SMU).`);
  }
  const seen = new Set<string>();
  for (const { slot } of mapped) {
    if (seen.has(slot.key)) issues.push(`${slot.title} is mapped twice; each requirement takes one course.`);
    seen.add(slot.key);
  }
  const track = mapped.filter((x) => TRACK_SLOT.test(x.slot.title)).length;
  if (track > MAX_TRACK) issues.push(`${track} track electives mapped; at most ${MAX_TRACK} can come from exchange.`);
  const depth = mapped.filter((x) => DEPTH_SLOT.test(x.slot.title)).length;
  if (depth > MAX_DEPTH) issues.push(`${depth} ISDE/ISRC mapped; at most ${MAX_DEPTH} can come from exchange.`);

  for (const { m, slot } of mapped) {
    const e = entryOf(plan, slot.key);
    if (e.code && e.code !== m.code) issues.push(`${slot.title} already has ${e.code} in your plan; putting this in the plan replaces it.`);
  }
  return issues;
}
