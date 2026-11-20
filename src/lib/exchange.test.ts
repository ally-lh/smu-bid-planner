import { describe, expect, it } from "vitest";
import curriculum from "@/data/curriculum.json";
import { buildSlots, modulesOf, plannedByCode } from "./model";
import { createInitialState, updateEntry, validateState } from "./plan-actions";
import {
  addHostModule, addUniversity, applyToPlan, removeHostModule, removeUniversity, updateHostModule, updateUniversity,
} from "./exchange-actions";
import { gpaFit, kindOfTerm, mappingIssues, readiness, universitiesOf } from "./exchange";
import type { Curriculum, PlanState, University } from "./types";

const data = curriculum as Curriculum;
const is2024 = data.programs.find((p) => p.id === "is-2024")!;
const ids = data.programs.map((p) => p.id);
const slots = buildSlots(is2024);
const plan = (s: PlanState) => s.plans[s.settings.programId] ?? { slots: {}, extras: [] };
const byTitle = (t: string) => slots.find((s) => s.title === t)!;

function withUni(patch: Partial<University> = {}) {
  const base = createInitialState(is2024);
  const { state, id } = addUniversity(base, { name: "Test Uni", country: "Korea", ...patch });
  return { state, id, uni: () => universitiesOf(state).find((u) => u.id === id)! };
}

describe("plannedByCode", () => {
  it("lists courses already placed so they aren't picked twice", () => {
    let s = createInitialState(is2024);
    s = updateEntry(s, byTitle("IS Track Course 3").key, { code: "IS469", name: "Gen AI", status: "planned", term: "Y2T2" });
    s = updateEntry(s, byTitle("IS Track Course 4").key, { code: "IS446", status: "none" });
    const taken = plannedByCode(modulesOf(slots, plan(s)));
    expect(taken.get("IS469")?.term).toBe("Y2T2");
    expect(taken.has("IS446")).toBe(false);
  });
});

describe("exchange rules", () => {
  it("reads the programme type from the term", () => {
    expect(kindOfTerm("Y3T2")).toBe("semester");
    expect(kindOfTerm("Y3T4")).toBe("winter");
    expect(kindOfTerm("Y2T3")).toBe("summer");
  });

  it("checks GPA against a university's minimum", () => {
    const { uni } = withUni({ minGpa: 3.5 });
    expect(gpaFit(uni(), 3.7)).toBe("meets");
    expect(gpaFit(uni(), 3.2)).toBe("below");
    expect(gpaFit(uni(), undefined)).toBe("unknown");
    expect(gpaFit({ ...uni(), minGpa: null }, 3.7)).toBe("unknown");
  });

  it("checks ISEP eligibility: GPA, 4 terms and 16 CU at SMU before the exchange term", () => {
    let s = createInitialState(is2024);
    s = updateEntry(s, byTitle("IS114 Computing Fundamentals").key, { status: "exempt" });
    const mods = modulesOf(slots, plan(s));
    const checks = readiness("Y3T2", mods, 3.7);
    expect(checks.find((c) => c.id === "terms")?.ok).toBe(true);
    expect(checks.find((c) => c.id === "cu")?.ok).toBe(false);
    expect(checks.find((c) => c.id === "gpa")?.ok).toBe(true);
    expect(readiness("Y2T2", mods, 3.7).find((c) => c.id === "terms")?.ok).toBe(false);
    expect(readiness("Y3T2", mods, undefined).find((c) => c.id === "gpa")?.ok).toBeNull();
  });

  it("flags mappings the sheet or ISEP caps don't allow", () => {
    const made = withUni({ term: "Y3T2" });
    const { id } = made;
    let { state } = made;
    const core = byTitle("IS212 Software Project Management").key;
    const add = (slotKey: string, cu = 1) => {
      const r = addHostModule(state, id);
      state = updateHostModule(r.state, id, r.id, { code: "H1", name: "Host", cu, slotKey });
    };
    add(core);
    add(byTitle("SMU Course 4").key);
    add(byTitle("SMU Course 4").key);
    add(byTitle("SMU Course 5").key, 3);
    const uni = universitiesOf(state).find((u) => u.id === id)!;
    const issues = mappingIssues(uni, slots, plan(state)).join("\n");
    expect(issues).toMatch(/IS212.*can't be cleared on exchange/);
    expect(issues).toMatch(/SMU Course 4.*twice/);
    expect(issues).toMatch(/6 CU.*5 CU/);
  });

  it("caps track electives at 2 and short programmes at their CU limit", () => {
    const made = withUni({ term: "Y3T4" });
    const { id } = made;
    let { state } = made;
    for (const t of ["IS Track Course 3", "IS Track Course 4"]) {
      const r = addHostModule(state, id);
      state = updateHostModule(r.state, id, r.id, { slotKey: byTitle(t).key, cu: 1 });
    }
    const uni = universitiesOf(state).find((u) => u.id === id)!;
    expect(mappingIssues(uni, slots, plan(state)).join("\n")).toMatch(/2 CU.*Winter.*1 CU/);
  });
});

describe("exchange actions", () => {
  it("adds, edits and removes universities and host modules without mutating", () => {
    const { state, id } = withUni();
    const before = JSON.stringify(state);
    const edited = updateUniversity(state, id, { minGpa: 3.3, kinds: ["semester", "summer"] });
    expect(JSON.stringify(state)).toBe(before);
    expect(universitiesOf(edited)[0]).toMatchObject({ minGpa: 3.3, kinds: ["semester", "summer"] });
    const { state: withMod, id: modId } = addHostModule(edited, id);
    expect(universitiesOf(withMod)[0].modules).toHaveLength(1);
    expect(universitiesOf(removeHostModule(withMod, id, modId))[0].modules).toHaveLength(0);
    expect(universitiesOf(removeUniversity(withMod, id))).toHaveLength(0);
  });

  it("puts mapped host courses into their requirement slots for the exchange term", () => {
    const made = withUni({ name: "Korea University", term: "Y3T2" });
    const { id } = made;
    let { state } = made;
    const cmw = byTitle("Cultures of the Modern World Elective").key;
    const r = addHostModule(state, id);
    state = updateHostModule(r.state, id, r.id, { code: "KU101", name: "Korean Culture", cu: 1, slotKey: cmw });
    state = addHostModule(state, id).state; // unmapped: ignored
    const { state: next, count } = applyToPlan(state, id);
    expect(count).toBe(1);
    expect(plan(next).slots[cmw]).toMatchObject({ code: "KU101", term: "Y3T2", status: "planned" });
    expect(plan(next).slots[cmw].note).toMatch(/Korea University/);
  });

  it("survives a backup round trip and drops malformed universities", () => {
    const { state } = withUni({ minGpa: 3.4, kinds: ["winter"] });
    const raw = JSON.parse(JSON.stringify(state));
    raw.exchange.universities.push({ nope: true }, "junk");
    raw.settings.gpa = 3.7;
    const { state: back } = validateState(raw, ids);
    expect(universitiesOf(back!)).toHaveLength(1);
    expect(universitiesOf(back!)[0]).toMatchObject({ name: "Test Uni", minGpa: 3.4, kinds: ["winter"] });
    expect(back!.settings.gpa).toBe(3.7);
  });
});
