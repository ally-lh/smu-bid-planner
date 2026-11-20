/* Auto-fill: place every unplaced requirement into upcoming empty terms. Pure, no mutation. */
import { CLEARED, compareTerms, entryOf, isBreakTerm, modulesOf, planFor } from "./model";
import type { Entry, PlanState, Slot, TermId } from "./types";

export const LOAD_OPTIONS = [3, 4, 5] as const;
/** SMU ISEP: up to 5 CUs count toward the degree per exchange term. */
export const EXCHANGE_MAX_CU = 5;
const CODE_IN_TEXT = /\b(?:COR-)?[A-Z]{2,5}\d{3,4}\b/g;

export interface SuggestResult {
  state: PlanState;
  placed: number;
  /** Requirements that didn't fit before the plan's end term. */
  leftover: string[];
}

function earliest(slot: Slot): TermId | "" {
  const keys = Object.keys(slot.window);
  return keys.length ? keys.reduce((a, b) => (compareTerms(a, b) <= 0 ? a : b)) : "";
}

function latest(slot: Slot): TermId | "" {
  const keys = Object.keys(slot.window);
  return keys.length ? keys.reduce((a, b) => (compareTerms(a, b) >= 0 ? a : b)) : "";
}

/** Latest term among courses this slot's pre/co-requisite text names, so it lands after them. */
function afterPrereqs(slot: Slot, termOfCode: Map<string, TermId>): TermId | "" {
  const codes = slot.prereq.match(CODE_IN_TEXT) ?? [];
  return codes
    .map((c) => termOfCode.get(c))
    .filter((t): t is TermId => Boolean(t))
    .reduce<TermId | "">((a, b) => (!a || compareTerms(b, a) > 0 ? b : a), "");
}

export function suggestPlan(
  state: PlanState, slots: Slot[], terms: TermId[], now: TermId | "", targetCu: number,
): SuggestResult {
  const plan = planFor(state);
  const upcoming = terms.filter((t) => !now || compareTerms(t, now) > 0);
  const load = new Map<TermId, number>();
  for (const m of modulesOf(slots, plan)) {
    if (m.term) load.set(m.term, (load.get(m.term) ?? 0) + m.cu);
  }
  const exchange = state.settings.exchangeTerm && upcoming.includes(state.settings.exchangeTerm)
    ? state.settings.exchangeTerm : "";
  const emptyRegular = upcoming.filter((t) => !isBreakTerm(t) && !load.get(t) && t !== exchange);
  const summers = upcoming.filter((t) => t.endsWith("T3") && Number(t[1]) >= 2);

  const termOfCode = new Map<string, TermId>();
  for (const s of slots) {
    const e = entryOf(plan, s.key);
    const code = e.code || s.suggestedCode;
    if (code && e.term) termOfCode.set(code, e.term);
  }

  const open = slots
    .filter((s) => s.credit)
    .filter((s) => {
      const e = entryOf(plan, s.key);
      return !e.term && !CLEARED.has(e.status ?? "none");
    })
    // Most constrained first: the requirement whose sheet window closes earliest gets first pick.
    .sort((a, b) => {
      const la = latest(a) || "Y9T9";
      const lb = latest(b) || "Y9T9";
      return compareTerms(la, lb)
        || Number(b.compulsory) - Number(a.compulsory)
        || compareTerms(earliest(a) || "Y1T1", earliest(b) || "Y1T1");
    });

  const fill = new Map<TermId, number>();
  const additions: [string, Entry][] = [];
  const leftover: string[] = [];
  const place = (slot: Slot, term: TermId) => {
    fill.set(term, (fill.get(term) ?? 0) + (slot.cu || 1));
    const code = entryOf(plan, slot.key).code || slot.suggestedCode;
    if (code) termOfCode.set(code, term);
    additions.push([slot.key, {
      ...entryOf(plan, slot.key),
      code: code || undefined,
      name: entryOf(plan, slot.key).name || slot.suggestedName || undefined,
      term,
      status: "planned",
      suggested: true,
    }]);
  };

  // Exchange term first: only slots the sheet marks as exchange-clearable, up to the ISEP cap.
  const exchangePlaced = new Set<string>();
  if (exchange) {
    let room = EXCHANGE_MAX_CU - (load.get(exchange) ?? 0);
    for (const slot of open.filter((x) => x.exchange).reverse()) {
      if (room < (slot.cu || 1)) break;
      if (compareTerms(exchange, earliest(slot) || "Y1T1") < 0) continue;
      place(slot, exchange);
      exchangePlaced.add(slot.key);
      room -= slot.cu || 1;
    }
  }

  for (const slot of open.filter((x) => !exchangePlaced.has(x.key))) {
    const cu = slot.cu || 1;
    const isInternship = /internship/i.test(slot.title);
    // "Internship (after Year 2, summer or term time)": the summer after Y2 is fine.
    const windowStart = isInternship ? "Y2T3" : earliest(slot);
    const start = [windowStart, afterPrereqs(slot, termOfCode)]
      .filter(Boolean)
      .reduce((a, b) => (compareTerms(b, a) > 0 ? b : a), "Y1T1");
    const prereqTerm = afterPrereqs(slot, termOfCode);
    const allowed = (t: TermId) => compareTerms(t, start) >= 0 && (!prereqTerm || compareTerms(t, prereqTerm) > 0);

    const pool = isInternship && summers.length ? summers : emptyRegular;
    const target = isInternship ? Infinity : targetCu;
    const end = latest(slot);
    const fits = (t: TermId) => allowed(t) && (fill.get(t) ?? 0) + cu <= target;
    const inWindow = (t: TermId) => !end || compareTerms(t, end) <= 0;
    const term = pool.find((t) => fits(t) && inWindow(t))
      ?? pool.find(fits)
      ?? pool.filter(allowed).sort((a, b) => (fill.get(a) ?? 0) - (fill.get(b) ?? 0))[0];

    if (!term) {
      leftover.push(slot.title);
      continue;
    }
    place(slot, term);
  }

  if (!additions.length) return { state, placed: 0, leftover };
  return {
    state: {
      ...state,
      plans: {
        ...state.plans,
        [state.settings.programId]: { ...plan, slots: { ...plan.slots, ...Object.fromEntries(additions) } },
      },
      updatedAt: Date.now(),
    },
    placed: additions.length,
    leftover,
  };
}

/** Remove every suggestion the student hasn't touched since. */
export function clearSuggestions(state: PlanState): { state: PlanState; cleared: number } {
  const plan = planFor(state);
  const cleared = Object.values(plan.slots).filter((e) => e.suggested).length;
  if (!cleared) return { state, cleared: 0 };
  // Undo only what the suggestion added (term + status); keep any code/name/note the student typed.
  const keep = Object.entries(plan.slots).flatMap(([k, e]): [string, Entry][] => {
    if (!e.suggested) return [[k, e]];
    const rest = Object.fromEntries(
      Object.entries(e).filter(([f]) => !["term", "status", "suggested"].includes(f)),
    ) as Entry;
    return rest.note ? [[k, rest]] : [];
  });
  return {
    state: {
      ...state,
      plans: { ...state.plans, [state.settings.programId]: { ...plan, slots: Object.fromEntries(keep) } },
      updatedAt: Date.now(),
    },
    cleared,
  };
}
