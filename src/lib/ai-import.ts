/* Bring a plan in through any AI chat: a prompt describing the plan format, and a parser for its reply. Pure. */
import { IS_TRACKS } from "./courses";
import type { PlanState, Program, Slot } from "./types";

const STATUSES = "none, planned, bidding, taking, done, exempt";

function slotLine(s: Slot): string {
  const extra = [s.cu ? `${s.cu} CU` : "", s.exchange ? "exchange OK" : ""].filter(Boolean).join(" · ");
  return `${s.key} · ${s.sectionName} · ${s.fullTitle}${extra ? ` · ${extra}` : ""}`;
}

/** Prompt for ChatGPT/Claude/Gemini: read my documents, answer with a plan file this app can load. */
export function buildAiPrompt(program: Program, slots: Slot[], programs: Program[], current: PlanState): string {
  const credit = slots.filter((s) => s.credit).map(slotLine).join("\n");
  const grads = slots.filter((s) => s.grad).map((s) => `${s.key} · ${s.title}`).join("\n");
  const example = {
    version: 1,
    settings: {
      programId: program.id, intakeYear: current.settings.intakeYear, endTerm: "Y5T1", showSummer: true,
      track: "", exchangeTerm: "", gpa: 3.5,
    },
    plans: {
      [program.id]: {
        slots: {
          "<slot key>": { code: "IS212", name: "Software Project Management", term: "Y3T1", status: "planned", cu: 1, alsoClears: [], note: "" },
        },
        extras: [{ id: "x1", label: "2nd major: Analytics", code: "", name: "", term: "Y3T2", status: "planned", cu: 1 }],
      },
    },
    updatedAt: 0,
  };

  return `I'm loading my SMU degree plan into a web app called SMU Bid Planner. Read what I've attached (a course progression PDF exported from the app, my OASIS Degree Progress Report, a transcript, or my notes) and turn it into the app's plan format.

Reply with ONLY the JSON object, no explanation and no markdown.

FORMAT
${JSON.stringify(example, null, 1)}

RULES
- programId: "${program.id}" (${program.label}). If my documents show a different programme, stop and tell me to switch programme in the app's settings and copy this prompt again. Other ids: ${programs.map((p) => p.id).join(", ")}.
- intakeYear: the calendar year my first term (Y1 T1) started.
- Terms are Y<year>T<n>: T1 = Aug–Dec, T2 = Jan–Apr, T3 = summer (May–Jul), T4 = winter (Dec).
- status is one of: ${STATUSES}. Exemptions and credit transfers are "exempt" with no term.
- Each slot key below holds exactly one course. Put each course in the requirement it counts toward, using the key on the left.
- Courses that fit no slot go in "extras", with a "label" saying what they count toward and a unique "id".
- Graduation requirements have no CU. A course that also clears one lists that requirement's key in its "alsoClears".
- track: "" or one of: ${IS_TRACKS.join(", ")}.
- exchangeTerm: the term I go on semester exchange, or "".
- Leave out anything you can't tell from my documents rather than guessing. Put doubts in that course's "note".

REQUIREMENT SLOTS (${program.label})
${credit}

GRADUATION REQUIREMENTS (use in alsoClears)
${grads}

WHAT'S IN THE APP NOW (keep anything my documents don't contradict)
${JSON.stringify(current)}`;
}

/** The JSON object inside an AI reply: drops code fences and any text before or after it. */
export function extractJson(text: string): string {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}
