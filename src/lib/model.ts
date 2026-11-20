/* Pure helpers: curriculum → slots, plan → progress. No DOM, no mutation. */
import type {
  Entry, PlacedModule, PlanState, Program, ProgramPlan, Settings, Slot, Status, TermId,
} from "./types";

export const STATUSES: { id: Status; label: string }[] = [
  { id: "none", label: "Not yet" },
  { id: "planned", label: "Planned" },
  { id: "bidding", label: "Bidding" },
  { id: "taking", label: "Taking" },
  { id: "done", label: "Done" },
  { id: "exempt", label: "Exempted" },
];
export const CLEARED: ReadonlySet<Status> = new Set<Status>(["done", "exempt"]);
export const IN_PLAN: ReadonlySet<Status> = new Set<Status>(["planned", "bidding", "taking"]);
export const END_TERMS: TermId[] = ["Y4T2", "Y5T1", "Y5T2"];
export const HEAVY_TERM_CU = 5;
export const EMPTY_PLAN: ProgramPlan = { slots: {}, extras: [] };

const CODE_RE = /^(?:.*?\s-\s)?((?:COR-)?[A-Z]{2,5}\.?\d{3,4}[A-Z]?)\s+(.+)$/;

/** Term ids: T1 (Aug–Dec), T4 = winter session (Dec), T2 (Jan–Apr), T3 = summer (May–Jul). */
const TERM_RANK: Record<string, number> = { "1": 1, "4": 1.5, "2": 2, "3": 3 };
const termParts = (t: TermId): [number, number] => [Number(t[1]), TERM_RANK[t[3]] ?? Number(t[3])];
export const isBreakTerm = (t: TermId) => t.endsWith("T3") || t.endsWith("T4");

export function compareTerms(a: TermId, b: TermId): number {
  const [ya, ta] = termParts(a);
  const [yb, tb] = termParts(b);
  return ya - yb || ta - tb;
}

export function termLabel(t: TermId): string {
  const y = Number(t[1]);
  if (t.endsWith("T3")) return `Y${y} Summer`;
  if (t.endsWith("T4")) return `Y${y} Winter`;
  return `Y${y} T${t[3]}`;
}

function splitLabel(label: string) {
  const [raw, ...rest] = label.split("\n");
  const first = raw.replace(/\b([A-Z]{2,5})\.(\d{3})/g, "$1$2").replace("Projet", "Project");
  const detail = rest.join(" ").trim();
  // Long trailing parentheticals are guidance, not part of the name: "Internship (after Year 2, …)".
  const m = first.trim().match(/^(.*?)\s*\((.{12,})\)\s*$/);
  if (m) return { title: m[1].trim(), detail: [m[2], detail].filter(Boolean).join(" · ") };
  return { title: first.trim(), detail };
}

function guessCourse(title: string) {
  const m = title.match(CODE_RE);
  if (!m) return { code: "", name: "" };
  return { code: m[1].replace(".", ""), name: m[2].replace(/\s*\(\d(?:\.\d+)?\s*CUs?\)/i, "").trim() };
}

function requirementName(title: string, code: string) {
  if (!code) return title;
  const before = title.split(/\s-\s/)[0];
  return before !== title ? before.trim() : title;
}

export function buildSlots(program: Program): Slot[] {
  return program.sections.flatMap((section, si) =>
    section.items.map((item, ii): Slot => {
      const { title, detail } = splitLabel(item.label);
      const course = guessCourse(title);
      const pasg = Object.entries(item.window).find(([, v]) => /PASG/i.test(v));
      return {
        key: `s${si}-${ii}`,
        sectionIndex: si,
        sectionName: section.name,
        title: requirementName(title, course.code),
        fullTitle: title,
        detail,
        suggestedCode: course.code,
        suggestedName: course.name,
        cu: item.cu,
        credit: item.credit,
        grad: !item.credit,
        compulsory: item.compulsory,
        exchange: Boolean(item.exchange),
        ec: item.ec,
        prereq: item.prereq,
        window: item.window,
        pasg: pasg ? pasg[0] : "",
      };
    }),
  );
}

export function buildTerms(program: Program, settings: Settings): TermId[] {
  const end = END_TERMS.includes(settings.endTerm) ? settings.endTerm : "Y5T1";
  const programT3 = new Set(program.terms.filter((t) => t.endsWith("T3")));
  const terms: TermId[] = [];
  for (let y = 1; y <= 5; y += 1) {
    if (compareTerms(`Y${y}T1`, end) <= 0) terms.push(`Y${y}T1`);
    if (settings.showSummer && compareTerms(`Y${y}T2`, end) <= 0) terms.push(`Y${y}T4`);
    if (compareTerms(`Y${y}T2`, end) <= 0) terms.push(`Y${y}T2`);
    const summerWanted = settings.showSummer || programT3.has(`Y${y}T3`);
    if (summerWanted && compareTerms(`Y${y}T2`, end) <= 0) terms.push(`Y${y}T3`);
  }
  return terms;
}

/** SMU calendar: T1 Aug–Dec, T2 Jan–Apr, summer May–Jul. */
export function termCalendar(term: TermId, intakeYear: number) {
  const y = Number(term[1]);
  const start = intakeYear + y - 1;
  const ay = `AY${String(start).slice(2)}/${String(start + 1).slice(2)}`;
  const months = { "1": "Aug–Dec", "2": "Jan–Apr", "3": "May–Jul", "4": "Dec" }[term[3]] ?? "";
  return { ay, months };
}

export function currentTerm(intakeYear: number, today: Date): TermId | "" {
  const month = today.getMonth() + 1;
  const offset = today.getFullYear() - intakeYear;
  const [y, t] = month >= 8 ? [offset + 1, 1] : month >= 5 ? [offset, 3] : [offset, 2];
  return y >= 1 && y <= 5 ? `Y${y}T${t}` : "";
}

export function entryOf(plan: ProgramPlan, key: string): Entry {
  return plan.slots[key] ?? {};
}

export function modulesOf(slots: Slot[], plan: ProgramPlan): PlacedModule[] {
  const fromSlots = slots
    .filter((s) => s.credit)
    .map((s): PlacedModule => {
      const e = entryOf(plan, s.key);
      return {
        ref: s.key,
        kind: "slot",
        slot: s,
        label: s.title,
        code: e.code ?? "",
        name: e.name ?? "",
        term: e.term ?? "",
        status: e.status ?? "none",
        cu: typeof e.cu === "number" ? e.cu : s.cu,
        alsoClears: e.alsoClears ?? [],
        note: e.note ?? "",
        suggested: Boolean(e.suggested),
      };
    });
  const extras = plan.extras.map((x): PlacedModule => ({
    ref: x.id,
    kind: "extra",
    slot: null,
    label: x.label || "Extra module",
    code: x.code ?? "",
    name: x.name ?? "",
    term: x.term ?? "",
    status: x.status ?? "planned",
    cu: typeof x.cu === "number" ? x.cu : 1,
    alsoClears: x.alsoClears ?? [],
    note: x.note ?? "",
    suggested: false,
  }));
  return [...fromSlots, ...extras];
}

/** Courses already in the plan, by code, so the same course isn't picked for two requirements. */
export function plannedByCode(modules: PlacedModule[]): Map<string, PlacedModule> {
  return new Map(modules.filter((m) => m.code && m.status !== "none").map((m) => [m.code, m]));
}

export interface GradResult { status: Status; by: PlacedModule[] }

/** Non-credit requirements (grad reqs, Global Exposure) clear via own status or a tagged module. */
export function gradStatus(slot: Slot, plan: ProgramPlan, modules: PlacedModule[]): GradResult {
  const own = entryOf(plan, slot.key).status ?? "none";
  const by = modules.filter((m) => m.alsoClears.includes(slot.key) && m.status !== "none");
  if (CLEARED.has(own)) return { status: own, by };
  if (by.some((m) => CLEARED.has(m.status))) return { status: "done", by };
  if (by.length) return { status: "planned", by };
  return { status: own, by };
}

export interface SectionProgress {
  name: string;
  index: number;
  grad: boolean;
  total: number;
  done: number;
  planned: number;
}

export function sectionProgress(
  program: Program, slots: Slot[], plan: ProgramPlan, modules: PlacedModule[],
): SectionProgress[] {
  return program.sections.map((section, index) => {
    const mine = slots.filter((s) => s.sectionIndex === index);
    if (mine.every((s) => s.grad)) {
      const results = mine.map((s) => gradStatus(s, plan, modules).status);
      return {
        name: section.name, index, grad: true, total: mine.length,
        done: results.filter((st) => CLEARED.has(st)).length,
        planned: results.filter((st) => IN_PLAN.has(st)).length,
      };
    }
    const sum = (pred: (s: Status) => boolean) =>
      mine.filter((s) => s.credit).reduce((acc, s) => {
        const e = entryOf(plan, s.key);
        const cu = typeof e.cu === "number" ? e.cu : s.cu;
        return pred(e.status ?? "none") ? acc + cu : acc;
      }, 0);
    return {
      name: section.name, index, grad: false, total: section.cus,
      done: sum((st) => CLEARED.has(st)),
      planned: sum((st) => IN_PLAN.has(st)),
    };
  });
}

export function overall(progress: SectionProgress[]) {
  return progress.filter((p) => !p.grad).reduce(
    (acc, p) => {
      const done = Math.min(p.done, p.total);
      return {
        total: acc.total + p.total,
        done: acc.done + done,
        planned: acc.planned + Math.max(0, Math.min(p.planned, p.total - done)),
      };
    },
    { total: 0, done: 0, planned: 0 },
  );
}

export interface WindowChip { text: string; kind: "pasg" | "mark" | "open" }

export function windowChips(window: Record<TermId, string>): WindowChip[] {
  const entries = Object.entries(window).sort(([a], [b]) => compareTerms(a, b));
  const marked = entries.filter(([, v]) => v !== "*");
  const open = entries.filter(([, v]) => v === "*").map(([t]) => t);
  const chips: WindowChip[] = marked.map(([t, v]) => ({
    text: `${t} · ${v.replace(/\s*#$/, "")}`,
    kind: /PASG/i.test(v) ? "pasg" : "mark",
  }));
  if (open.length === 1) chips.push({ text: open[0], kind: "open" });
  if (open.length > 1) chips.push({ text: `${open[0]}–${open[open.length - 1]}`, kind: "open" });
  return chips;
}

/** True when a term is earlier than the sheet's earliest suggested term for the slot. */
export function earlierThanWindow(slot: Slot | null, term: TermId | ""): boolean {
  if (!slot || !term) return false;
  const keys = Object.keys(slot.window);
  if (!keys.length) return false;
  const first = keys.reduce((a, b) => (compareTerms(a, b) <= 0 ? a : b));
  return compareTerms(term, first) < 0;
}

export function planFor(state: PlanState): ProgramPlan {
  return state.plans[state.settings.programId] ?? EMPTY_PLAN;
}

export function intakeFromProgram(program: Program): number {
  const m = program.label.match(/AY(\d{4})/);
  return m ? Number(m[1]) : new Date().getFullYear();
}
