import { describe, expect, it } from "vitest";
import curriculum from "@/data/curriculum.json";
import { buildSlots } from "./model";
import { createInitialState, parseState, updateEntry } from "./plan-actions";
import { buildAiPrompt, extractJson } from "./ai-import";
import type { Curriculum } from "./types";

const data = curriculum as Curriculum;
const is2024 = data.programs.find((p) => p.id === "is-2024")!;
const ids = data.programs.map((p) => p.id);
const slots = buildSlots(is2024);

describe("AI import prompt", () => {
  it("lists the programme's requirement keys, programme ids and the JSON shape", () => {
    const prompt = buildAiPrompt(is2024, slots, data.programs, createInitialState(is2024));
    expect(prompt).toContain('"programId": "is-2024"');
    expect(prompt).toMatch(/s3-7 · IS Major Core · IS212 Software Project Management · 1 CU/);
    expect(prompt).toMatch(/s1-2 .*Cultures of the Modern World Elective.*exchange OK/);
    expect(prompt).toMatch(/s6-1 · Sustainability/);
    expect(prompt).toContain("se-2024");
    expect(prompt).toMatch(/ONLY the JSON/);
  });

  it("includes the plan already on this device so the AI can merge into it", () => {
    const s = updateEntry(createInitialState(is2024), "s3-7", { code: "IS212", status: "planned", term: "Y3T1" });
    expect(buildAiPrompt(is2024, slots, data.programs, s)).toContain('"IS212"');
  });
});

describe("extractJson", () => {
  it("pulls the JSON object out of an AI reply with fences and chatter", () => {
    const reply = 'Here you go!\n```json\n{"version": 1, "a": {"b": 2}}\n```\nLet me know.';
    expect(JSON.parse(extractJson(reply))).toEqual({ version: 1, a: { b: 2 } });
    expect(extractJson("  {\"x\":1}  ")).toBe('{"x":1}');
    expect(extractJson("no json here")).toBe("no json here");
  });

  it("lets parseState load a fenced AI reply", () => {
    const state = createInitialState(is2024);
    const reply = "```json\n" + JSON.stringify(updateEntry(state, "s3-7", { code: "IS212", status: "planned" })) + "\n```";
    const { state: loaded, error } = parseState(reply, ids);
    expect(error).toBe("");
    expect(loaded!.plans["is-2024"].slots["s3-7"].code).toBe("IS212");
  });
});
