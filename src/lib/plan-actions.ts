/* Immutable state transitions for the plan. Every function returns a new PlanState. */
import { extractJson } from "./ai-import";
import { cleanExchange } from "./exchange-validate";
import { EMPTY_PLAN, END_TERMS, intakeFromProgram, planFor } from "./model";
import type { Entry, Extra, PlanState, Program, ProgramPlan, Settings, Slot } from "./types";

const MAX_IMPORT_BYTES = 200_000;

export function createInitialState(program: Program): PlanState {
  return {
    version: 1,
    settings: {
      programId: program.id,
      intakeYear: intakeFromProgram(program),
      endTerm: "Y5T1",
      showSummer: false,
      track: "",
      exchangeTerm: "",
    },
    plans: {},
    updatedAt: 0,
  };
}

function withPlan(state: PlanState, next: ProgramPlan): PlanState {
  return {
    ...state,
    plans: { ...state.plans, [state.settings.programId]: next },
    updatedAt: Date.now(),
  };
}

export function updateSettings(state: PlanState, patch: Partial<Settings>): PlanState {
  return { ...state, settings: { ...state.settings, ...patch }, updatedAt: Date.now() };
}

export function updateEntry(state: PlanState, key: string, patch: Entry): PlanState {
  const plan = planFor(state);
  // Any manual edit turns a suggestion into the student's own choice.
  const merged = { ...(plan.slots[key] ?? {}), ...patch, suggested: patch.suggested ?? false };
  return withPlan(state, { ...plan, slots: { ...plan.slots, [key]: merged } });
}

/** Put a catalogue course into a requirement slot, merging the grad requirements it also clears. */
export function assignCourse(
  state: PlanState,
  key: string,
  course: { code: string; name: string; cu: number },
  gradKeys: string[],
  term?: string,
): PlanState {
  const current = planFor(state).slots[key] ?? {};
  const alsoClears = Array.from(new Set([...(current.alsoClears ?? []), ...gradKeys]));
  return updateEntry(state, key, {
    code: course.code,
    name: course.name,
    cu: course.cu,
    alsoClears,
    ...(term !== undefined ? { term } : {}),
    status: current.status && current.status !== "none" ? current.status : "planned",
  });
}

export function clearEntry(state: PlanState, key: string): PlanState {
  const plan = planFor(state);
  const rest = Object.fromEntries(Object.entries(plan.slots).filter(([k]) => k !== key));
  return withPlan(state, { ...plan, slots: rest });
}

export function addExtra(state: PlanState, extra: Omit<Extra, "id">): { state: PlanState; id: string } {
  const plan = planFor(state);
  const id = `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return { state: withPlan(state, { ...plan, extras: [...plan.extras, { ...extra, id }] }), id };
}

export function updateExtra(state: PlanState, id: string, patch: Partial<Extra>): PlanState {
  const plan = planFor(state);
  return withPlan(state, {
    ...plan,
    extras: plan.extras.map((x) => (x.id === id ? { ...x, ...patch } : x)),
  });
}

export function removeExtra(state: PlanState, id: string): PlanState {
  const plan = planFor(state);
  return withPlan(state, { ...plan, extras: plan.extras.filter((x) => x.id !== id) });
}

/** Fill pre-assigned (PASG) courses into their term without touching anything already filled. */
export function autofillPreassigned(state: PlanState, slots: Slot[]): { state: PlanState; count: number } {
  const plan = planFor(state);
  const additions = slots
    .filter((s) => s.credit && s.pasg && !plan.slots[s.key]?.term)
    .map((s) => [s.key, {
      ...(plan.slots[s.key] ?? {}),
      code: plan.slots[s.key]?.code || s.suggestedCode,
      name: plan.slots[s.key]?.name || s.suggestedName || s.title,
      term: s.pasg,
      status: plan.slots[s.key]?.status && plan.slots[s.key]?.status !== "none"
        ? plan.slots[s.key]?.status
        : "planned",
    } satisfies Entry] as const);
  if (!additions.length) return { state, count: 0 };
  return {
    state: withPlan(state, { ...plan, slots: { ...plan.slots, ...Object.fromEntries(additions) } }),
    count: additions.length,
  };
}

export function resetProgram(state: PlanState): PlanState {
  return withPlan(state, EMPTY_PLAN);
}

/** Validate an imported/remote state. Returns null with a reason when it isn't usable. */
export function parseState(raw: string, programIds: string[]): { state: PlanState | null; error: string } {
  if (raw.length > MAX_IMPORT_BYTES) return { state: null, error: "That backup is too large to be a plan." };
  let data: unknown;
  try {
    data = JSON.parse(extractJson(raw));
  } catch {
    return { state: null, error: "That isn't a plan. Paste the whole JSON from a plan file or your AI's reply." };
  }
  return validateState(data, programIds);
}

const STATUS_IDS: ReadonlySet<string> = new Set(["none", "planned", "bidding", "taking", "done", "exempt"]);
const TERM_RE = /^Y[1-5]T[1-4]$/;

function isRecord(v: unknown): v is Record<string, any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/** Keep only known fields with the right types, so bad data can't break rendering. */
function cleanEntry(raw: unknown): Entry {
  const e = raw as Record<string, unknown>;
  const out: Entry = {};
  if (typeof e.code === "string") out.code = str(e.code, 20);
  if (typeof e.name === "string") out.name = str(e.name, 160);
  if (typeof e.note === "string") out.note = str(e.note, 1000);
  if (typeof e.term === "string" && (e.term === "" || TERM_RE.test(e.term))) out.term = e.term;
  if (typeof e.status === "string" && STATUS_IDS.has(e.status)) out.status = e.status as Entry["status"];
  if (typeof e.cu === "number" && Number.isFinite(e.cu) && e.cu >= 0 && e.cu <= 6) out.cu = e.cu;
  if (e.suggested === true) out.suggested = true;
  if (Array.isArray(e.alsoClears)) out.alsoClears = e.alsoClears.filter((k): k is string => typeof k === "string").slice(0, 20);
  return out;
}

export function validateState(data: unknown, programIds: string[]): { state: PlanState | null; error: string } {
  if (!isRecord(data)) return { state: null, error: "Backup is empty." };
  const s = data as Partial<PlanState>;
  if (s.version !== 1 || !isRecord(s.settings) || !isRecord(s.plans)) {
    return { state: null, error: "This doesn't look like a Bid Planner backup." };
  }
  if (!programIds.includes(s.settings.programId)) {
    return { state: null, error: "Backup refers to a programme this planner doesn't know." };
  }
  const settings: Settings = {
    programId: s.settings.programId,
    intakeYear: Number.isInteger(s.settings.intakeYear) ? s.settings.intakeYear : new Date().getFullYear(),
    endTerm: END_TERMS.includes(s.settings.endTerm) ? s.settings.endTerm : "Y5T1",
    showSummer: Boolean(s.settings.showSummer),
    track: typeof s.settings.track === "string" ? s.settings.track.slice(0, 80) : "",
    exchangeTerm: typeof s.settings.exchangeTerm === "string" && TERM_RE.test(s.settings.exchangeTerm)
      ? s.settings.exchangeTerm : "",
    ...(typeof s.settings.studentName === "string" && s.settings.studentName
      ? { studentName: s.settings.studentName.slice(0, 80) } : {}),
    ...(typeof s.settings.gpa === "number" && s.settings.gpa >= 0 && s.settings.gpa <= 4.3 ? { gpa: s.settings.gpa } : {}),
  };
  const plans = Object.fromEntries(
    Object.entries(s.plans)
      .filter(([id, p]) => programIds.includes(id) && p && typeof p === "object")
      .map(([id, p]) => [id, {
        slots: isRecord(p.slots)
          ? Object.fromEntries(Object.entries(p.slots).filter(([, e]) => isRecord(e)).map(([k, e]) => [k, cleanEntry(e)]))
          : {},
        extras: Array.isArray(p.extras)
          ? p.extras.filter((x) => isRecord(x) && typeof x.id === "string")
            .map((x) => ({ ...cleanEntry(x), id: String(x.id).slice(0, 40), label: str(x.label, 120) || "Extra module" }))
          : [],
      }]),
  );
  return {
    state: {
      version: 1, settings, plans,
      ...(cleanExchange(s.exchange) ? { exchange: cleanExchange(s.exchange) } : {}),
      updatedAt: Number(s.updatedAt) || Date.now(),
    },
    error: "",
  };
}
