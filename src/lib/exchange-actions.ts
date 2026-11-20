/* Immutable state transitions for the exchange shortlist. Every function returns a new PlanState. */
import { CLEARED, planFor } from "./model";
import { universitiesOf } from "./exchange";
import { updateEntry } from "./plan-actions";
import type { HostModule, PlanState, University } from "./types";

const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function withUniversities(state: PlanState, universities: University[]): PlanState {
  return { ...state, exchange: { universities }, updatedAt: Date.now() };
}

function mapUni(state: PlanState, id: string, fn: (u: University) => University): PlanState {
  return withUniversities(state, universitiesOf(state).map((u) => (u.id === id ? fn(u) : u)));
}

export function addUniversity(state: PlanState, patch: Partial<University> = {}): { state: PlanState; id: string } {
  const id = newId("u");
  const uni: University = {
    name: "", country: "", kinds: [], minGpa: null, requirements: "", term: "",
    link: "", notes: "", status: "considering", modules: [], ...patch, id,
  };
  return { state: withUniversities(state, [...universitiesOf(state), uni]), id };
}

export function updateUniversity(state: PlanState, id: string, patch: Partial<Omit<University, "id">>): PlanState {
  return mapUni(state, id, (u) => ({ ...u, ...patch }));
}

export function removeUniversity(state: PlanState, id: string): PlanState {
  return withUniversities(state, universitiesOf(state).filter((u) => u.id !== id));
}

export function addHostModule(state: PlanState, uniId: string): { state: PlanState; id: string } {
  const id = newId("h");
  const mod: HostModule = { id, code: "", name: "", cu: 1, slotKey: "" };
  return { state: mapUni(state, uniId, (u) => ({ ...u, modules: [...u.modules, mod] })), id };
}

export function updateHostModule(state: PlanState, uniId: string, id: string, patch: Partial<Omit<HostModule, "id">>): PlanState {
  return mapUni(state, uniId, (u) => ({ ...u, modules: u.modules.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
}

export function removeHostModule(state: PlanState, uniId: string, id: string): PlanState {
  return mapUni(state, uniId, (u) => ({ ...u, modules: u.modules.filter((m) => m.id !== id) }));
}

/** Put every mapped host course into its requirement slot, in the university's term. */
export function applyToPlan(state: PlanState, uniId: string): { state: PlanState; count: number } {
  const uni = universitiesOf(state).find((u) => u.id === uniId);
  if (!uni || !uni.term) return { state, count: 0 };
  const term = uni.term;
  const mapped = uni.modules.filter((m) => m.slotKey);
  const next = mapped.reduce((s, m) => {
    const current = planFor(s).slots[m.slotKey]?.status ?? "none";
    return updateEntry(s, m.slotKey, {
      code: m.code,
      name: m.name,
      cu: m.cu,
      term,
      status: CLEARED.has(current) ? current : "planned",
      note: `Exchange at ${uni.name}. Map in the OASIS exchange worksheet.`,
    });
  }, state);
  return { state: next, count: mapped.length };
}
