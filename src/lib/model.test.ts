import { describe, expect, it } from "vitest";
import curriculum from "@/data/curriculum.json";
import {
  buildSlots, buildTerms, compareTerms, currentTerm, earlierThanWindow, gradStatus,
  modulesOf, overall, sectionProgress, termCalendar, termLabel, windowChips,
} from "./model";
import {
  addExtra, autofillPreassigned, clearEntry, createInitialState, parseState, validateState,
  removeExtra, resetProgram, updateEntry, updateExtra, updateSettings,
} from "./plan-actions";
import type { Curriculum, PlanState } from "./types";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const data = curriculum as Curriculum;
const is2024 = data.programs.find((p) => p.id === "is-2024")!;
const se2024 = data.programs.find((p) => p.id === "se-2024")!;
const ids = data.programs.map((p) => p.id);
const slots = buildSlots(is2024);
const plan = (s: PlanState) => s.plans[s.settings.programId] ?? { slots: {}, extras: [] };
const slotByCode = (code: string) => slots.find((s) => s.suggestedCode === code)!;
// My real plan is personal data, kept out of git; tests that use it run only where the file exists.
const PLAN_FILE = resolve(__dirname, "../../private/my-plan.json");
const hasPlan = existsSync(PLAN_FILE);
const starter: unknown = hasPlan ? JSON.parse(readFileSync(PLAN_FILE, "utf8")) : null;

describe("curriculum parsing", () => {
  it("reads every programme with credit sections that add up", () => {
    expect(data.programs).toHaveLength(16);
    const core = is2024.sections.find((s) => s.name === "IS Major Core")!;
    expect(core.cus).toBe(12);
    expect(core.items).toHaveLength(12);
  });

  it("pulls course codes and pre-assigned terms out of sheet labels", () => {
    const is114 = slotByCode("IS114");
    expect(is114.suggestedName).toBe("Computing Fundamentals");
    expect(is114.pasg).toBe("Y1T1");
    const me1 = slotByCode("COR1305");
    expect(me1.title).toBe("Managing Elective 1");
  });

  it("marks graduation requirements and Global Exposure as non-credit", () => {
    const grads = slots.filter((s) => s.grad).map((s) => s.title);
    expect(grads).toEqual(expect.arrayContaining(["Global Exposure", "Sustainability"]));
  });
});

describe("terms", () => {
  const base = createInitialState(is2024).settings;

  it("runs Y1T1 to Y5T1 by default without summers", () => {
    const terms = buildTerms(is2024, base);
    expect(terms[0]).toBe("Y1T1");
    expect(terms.at(-1)).toBe("Y5T1");
    expect(terms).toHaveLength(9);
  });

  it("adds summer terms when asked or when the programme uses them", () => {
    expect(buildTerms(is2024, { ...base, showSummer: true })).toContain("Y2T3");
    expect(buildTerms(se2024, { ...base, endTerm: "Y4T2" })).toContain("Y3T3");
  });

  it("orders, labels and dates terms", () => {
    expect(compareTerms("Y1T2", "Y2T1")).toBeLessThan(0);
    expect(termLabel("Y3T3")).toBe("Y3 Summer");
    expect(termCalendar("Y2T1", 2024)).toEqual({ ay: "AY25/26", months: "Aug–Dec" });
    expect(currentTerm(2024, new Date("2026-10-21"))).toBe("Y3T1");
    expect(currentTerm(2024, new Date("2027-02-01"))).toBe("Y3T2");
    expect(currentTerm(2030, new Date("2026-10-21"))).toBe("");
  });
});

describe("progress", () => {
  it("counts done, exempted and planned CUs per section", () => {
    let s = createInitialState(is2024);
    s = updateEntry(s, slotByCode("IS114").key, { status: "done" });
    s = updateEntry(s, slotByCode("IS112").key, { status: "exempt" });
    s = updateEntry(s, slotByCode("IS216").key, { status: "planned", term: "Y2T1" });
    const mods = modulesOf(slots, plan(s));
    const prog = sectionProgress(is2024, slots, plan(s), mods);
    const core = prog.find((p) => p.name === "IS Major Core")!;
    expect(core).toMatchObject({ done: 2, planned: 1, total: 12 });
    expect(overall(prog).done).toBe(2);
  });

  it("clears a grad requirement through a tagged module", () => {
    const sus = slots.find((x) => x.title === "Sustainability")!;
    let s = createInitialState(is2024);
    const key = slots.find((x) => x.title === "SMU Course 1")!.key;
    s = updateEntry(s, key, { code: "IS468", status: "planned", alsoClears: [sus.key] });
    expect(gradStatus(sus, plan(s), modulesOf(slots, plan(s))).status).toBe("planned");
    s = updateEntry(s, key, { status: "done" });
    const r = gradStatus(sus, plan(s), modulesOf(slots, plan(s)));
    expect(r.status).toBe("done");
    expect(r.by[0].code).toBe("IS468");
  });

  it("flags a term earlier than the sheet window", () => {
    const is212 = slotByCode("IS212");
    expect(earlierThanWindow(is212, "Y1T1")).toBe(true);
    expect(earlierThanWindow(is212, "Y4T1")).toBe(false);
    expect(earlierThanWindow(null, "Y1T1")).toBe(false);
  });

  it("summarises term windows as chips", () => {
    expect(windowChips({ Y1T1: "PASG" })).toEqual([{ text: "Y1T1 · PASG", kind: "pasg" }]);
    expect(windowChips({ Y1T1: "*", Y2T2: "*" })).toEqual([{ text: "Y1T1–Y2T2", kind: "open" }]);
  });
});

describe("plan actions are immutable", () => {
  it("never mutates the previous state", () => {
    const s0 = createInitialState(is2024);
    const frozen = JSON.stringify(s0);
    const s1 = updateEntry(s0, "s0-0", { code: "X" });
    expect(JSON.stringify(s0)).toBe(frozen);
    expect(plan(s1).slots["s0-0"].code).toBe("X");
    expect(plan(clearEntry(s1, "s0-0")).slots["s0-0"]).toBeUndefined();
  });

  it("adds, edits and removes extras", () => {
    const { state, id } = addExtra(createInitialState(is2024), { label: "2nd Major", code: "ACCT101" });
    expect(plan(updateExtra(state, id, { term: "Y2T1" })).extras[0].term).toBe("Y2T1");
    expect(plan(removeExtra(state, id)).extras).toHaveLength(0);
  });

  it("autofills pre-assigned courses once", () => {
    const { state, count } = autofillPreassigned(createInitialState(is2024), slots);
    expect(count).toBeGreaterThan(3);
    expect(plan(state).slots[slotByCode("IS114").key]).toMatchObject({ term: "Y1T1", status: "planned" });
    expect(autofillPreassigned(state, slots).count).toBe(0);
  });

  it("keeps a plan per programme and resets only the current one", () => {
    let s = updateEntry(createInitialState(is2024), "s0-0", { code: "A" });
    s = updateSettings(s, { programId: "cs-2024" });
    s = updateEntry(s, "s0-0", { code: "B" });
    s = resetProgram(s);
    expect(s.plans["is-2024"].slots["s0-0"].code).toBe("A");
    expect(s.plans["cs-2024"].slots).toEqual({});
  });
});

describe("backup parsing", () => {
  it("round-trips a valid state", () => {
    const s = updateEntry(createInitialState(is2024), "s0-0", { code: "A" });
    const { state, error } = parseState(JSON.stringify(s), ids);
    expect(error).toBe("");
    expect(state?.plans["is-2024"].slots["s0-0"].code).toBe("A");
  });

  it("rejects junk with a readable reason", () => {
    expect(parseState("not json", ids).error).toMatch(/isn.t a plan/);
    expect(parseState("{}", ids).error).toMatch(/Bid Planner backup/);
    const wrong = { ...createInitialState(is2024), settings: { ...createInitialState(is2024).settings, programId: "nope" } };
    expect(parseState(JSON.stringify(wrong), ids).error).toMatch(/programme/);
    expect(parseState("x".repeat(300_000), ids).error).toMatch(/too large/);
  });
});

describe("exchange flags", () => {
  it("marks the slots the sheet colours red as exchange-clearable", () => {
    const ex = slots.filter((s) => s.exchange).map((s) => s.title);
    expect(ex).toEqual(expect.arrayContaining(["IS Track Course 3", "SMU Course 6"]));
    expect(slotByCode("IS114").exchange).toBe(false);
  });
});

describe.skipIf(!hasPlan)("my plan file", () => {
  it("is a valid IS AY2024+ plan with the OASIS exemptions", () => {
    const { state, error } = validateState(starter, ids);
    expect(error).toBe("");
    const p = plan(state!);
    const exempt = Object.values(p.slots).filter((e) => e.status === "exempt").map((e) => e.code);
    expect(exempt).toEqual(expect.arrayContaining(["COR-IS1704", "IS112", "IS113", "IS114", "IS211", "XFE800", "COR1201"]));
    const prog = overall(sectionProgress(is2024, slots, p, modulesOf(slots, p)));
    expect(prog.total).toBe(36);
    expect(prog.done + prog.planned).toBe(31);
  });
});

describe("winter session", () => {
  it("slots winter between T1 and T2 when break terms are shown", () => {
    const terms = buildTerms(is2024, { ...createInitialState(is2024).settings, showSummer: true });
    expect(terms.slice(0, 4)).toEqual(["Y1T1", "Y1T4", "Y1T2", "Y1T3"]);
    expect(termLabel("Y2T4")).toBe("Y2 Winter");
    expect(termCalendar("Y2T4", 2025).months).toBe("Dec");
    expect(compareTerms("Y1T4", "Y1T2")).toBeLessThan(0);
  });
});

describe.skipIf(!hasPlan)("suggest for empty terms", () => {
  const base = hasPlan ? validateState(starter, ids).state! : createInitialState(is2024);
  const terms = buildTerms(is2024, base.settings);

  it("fills only future empty terms, within windows and load", async () => {
    const { suggestPlan } = await import("./suggest");
    const { state, placed } = suggestPlan(base, slots, terms, "Y2T1", 4);
    const p = plan(state);
    expect(placed).toBe(5); // 5 CU left after exchange slots and Ethics
    const entries = Object.entries(p.slots).filter(([, e]) => e.suggested);
    expect(entries.every(([, e]) => compareTerms(e.term!, "Y2T1") > 0)).toBe(true);
    // IS212 is Y3T1-only in the sheet window; project experience must come after it.
    const term = (code: string) => p.slots[slotByCode(code).key].term!;
    expect(compareTerms(term("IS212"), "Y3T1")).toBeGreaterThanOrEqual(0);
    const px = slots.find((s) => s.title.includes("Project Experience"))!;
    expect(compareTerms(p.slots[px.key].term!, term("IS212"))).toBeGreaterThan(0);
    // Internship goes to a summer.
    const intern = slots.find((s) => s.title.startsWith("Internship"))!;
    expect(p.slots[intern.key].term!.endsWith("T3")).toBe(true);
  });

  it("clears its own suggestions but keeps manual edits", async () => {
    const { suggestPlan, clearSuggestions } = await import("./suggest");
    const { state } = suggestPlan(base, slots, terms, "Y2T1", 4);
    const key = slotByCode("IS212").key;
    const edited = updateEntry(state, key, { note: "keep me" });
    const { state: after, cleared } = clearSuggestions(edited);
    expect(cleared).toBeGreaterThan(0);
    expect(plan(after).slots[key].term).toBe(plan(state).slots[key].term);
    expect(Object.values(plan(after).slots).some((e) => e.suggested)).toBe(false);
  });
});

describe.skipIf(!hasPlan)("exchange term", () => {
  it("fills the exchange term only with exchange-clearable slots, up to 5 CU", async () => {
    const { suggestPlan, clearSuggestions } = await import("./suggest");
    const base = clearSuggestions(validateState(starter, ids).state!).state;
    expect(base.settings.exchangeTerm).toBe("Y3T2");
    const terms = buildTerms(is2024, base.settings);
    const { state } = suggestPlan(base, slots, terms, "Y2T1", 4);
    const inExchange = slots.filter((s) => plan(state).slots[s.key]?.term === "Y3T2");
    expect(inExchange.length).toBe(5);
    expect(inExchange.every((s) => s.exchange)).toBe(true);
  });
});

describe("course catalogue matching", () => {
  it("maps requirement slots to catalogue course areas", async () => {
    const { ruleFor, gradKeysFor } = await import("./courses");
    const course = (t: string[]) => ({ c: "X1", n: "x", u: 1, s: "", t, d: "" });
    const cmw = ruleFor(slots.find((s) => s.title.startsWith("Cultures"))!, "")!;
    expect(cmw.test(course(["Communities - Cultures of the Modern World"]))).toBe(true);
    expect(cmw.test(course(["Communities - Technology, Science and Society"]))).toBe(false);
    const track = ruleFor(slots.find((s) => s.title === "IS Track Course 3")!, "Product Development Track")!;
    expect(track.test(course(["IS/T4BS: Product Development Track"]))).toBe(true);
    expect(track.test(course(["IS/T4BS: Business Analytics Track"]))).toBe(false);
    const grads = slots.filter((s) => s.grad);
    expect(gradKeysFor(course(["Grad Req - SG & Asia Studies (Intake 2024 onwards)"]), grads))
      .toEqual([grads.find((g) => g.title.startsWith("Singapore"))!.key]);
  });
});
