/* SMU course catalogue (public/data/courses.json, from ccms.smu.edu.sg) and requirement matching. */
import type { Slot } from "./types";

export interface Course {
  c: string; // code, e.g. IS469
  n: string; // name
  u: number; // credit units
  s: string; // school
  t: string[]; // course-area tags, e.g. "Communities - Cultures of the Modern World"
  d: string; // short description
  k?: string; // catalogue's raw code
  x?: "F" | "N" | ""; // final exam scheduled / none / unknown
  xt?: string; // term the exam info comes from, e.g. "2610"
  g?: string; // grading basis: "G" graded, "P" pass/fail
}

/** "2610" → "AY26/27 T1" */
export function termCodeLabel(code: string | undefined): string {
  if (!code || code.length !== 4) return "";
  const y = Number(code.slice(0, 2));
  return `AY${y}/${y + 1} T${code[2]}`;
}

export const IS_TRACKS = [
  "Product Development Track",
  "Business Analytics Track",
  "Financial Technology Track",
  "Smart-City Management & Technology Track",
  "Digitalisation & Cloud Solutions",
] as const;

const GRAD_TAGS: { match: RegExp; tag: string; short: string }[] = [
  { match: /sustainab/i, tag: "Grad Req - Sustainability", short: "Sustainability" },
  { match: /singapore|asia/i, tag: "Grad Req - SG & Asia Studies", short: "SG & Asia" },
  { match: /digital tech|data analytics/i, tag: "Grad Req - Dig Tech/Data Ana", short: "Digital Tech" },
];

let cache: Promise<Course[]> | null = null;

/** Loads once per page; resolves [] (and logs) if the file can't be fetched. */
export function loadCourses(): Promise<Course[]> {
  cache ??= fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/courses.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<{ courses: Course[] }>;
    })
    .then((d) => (Array.isArray(d.courses) ? d.courses : []))
    .catch((err) => {
      console.error("Couldn't load the course catalogue", err);
      cache = null;
      return [];
    });
  return cache;
}

const has = (c: Course, prefix: string) => c.t.some((t) => t.startsWith(prefix));

export interface Rule {
  label: string;
  test: (c: Course) => boolean;
}

/** Which catalogue courses can fill a requirement slot. null = not a "pick a course" slot. */
export function ruleFor(slot: Slot | null, track: string): Rule | null {
  if (!slot) return { label: "All undergraduate courses", test: () => true };
  const t = slot.title;
  if (slot.grad) {
    const g = GRAD_TAGS.find((x) => x.match.test(t));
    return g ? { label: `Courses tagged ${g.short}`, test: (c) => has(c, g.tag) } : null;
  }
  if (/managing elective/i.test(t)) return { label: "Capabilities – Managing", test: (c) => has(c, "Capabilities - Managing") };
  if (/technology.*society/i.test(t)) return { label: "Technology, Science & Society", test: (c) => has(c, "Communities - Technology, Science and Society") };
  if (/cultures of the modern world/i.test(t)) return { label: "Cultures of the Modern World", test: (c) => has(c, "Communities - Cultures of the Modern World") };
  if (/ethics/i.test(t)) return { label: "Civilisations – Ethics", test: (c) => has(c, "Civilisations") && /ethic/i.test(c.n) };
  if (/^IS Track Course \d/i.test(t)) {
    const tag = track ? `IS/T4BS: ${track}` : "IS/T4BS:";
    return { label: track ? `IS ${track}` : "Any IS track", test: (c) => has(c, tag) };
  }
  if (/IS Depth|ISRC|Any IS Track|ISxxx|Computing Elective/i.test(t)) {
    return {
      label: "IS track, IS Depth Electives or IS Related Courses",
      test: (c) => has(c, "IS/T4BS:") || has(c, "IS Depth") || has(c, "IS Related") || has(c, "IS Management") || has(c, "IS Technology"),
    };
  }
  if (/CS .*Track|CS Elective/i.test(t)) return { label: "IT Solution Development electives", test: (c) => has(c, "IT Solution Development") };
  if (/SMU Course|Free Elective|Social and Management/i.test(t)) return { label: "Any SMU course", test: () => true };
  return null;
}

/** Grad requirements a course also clears, as slot keys of the programme's grad slots. */
export function gradKeysFor(course: Course, gradSlots: Slot[]): string[] {
  return gradSlots
    .filter((g) => GRAD_TAGS.some((x) => x.match.test(g.title) && has(course, x.tag)))
    .map((g) => g.key);
}

/** Short badges for what else a course counts toward. */
export function badgesFor(course: Course, track: string): string[] {
  const out = GRAD_TAGS.filter((g) => has(course, g.tag) && g.short !== "Digital Tech").map((g) => g.short);
  if (track && has(course, `IS/T4BS: ${track}`)) out.push(track.replace(/ Track$/, ""));
  if (has(course, "IS Depth")) out.push("IS Depth");
  if (has(course, "Capabilities - Managing")) out.push("Managing");
  if (has(course, "Communities - Cultures")) out.push("CMW");
  if (has(course, "Communities - Technology")) out.push("TSS");
  return out;
}

export interface Category {
  key: string;
  label: string;
  test: (c: Course) => boolean;
  /** Open (not yet cleared/placed) slots this category can fill. */
  slots: Slot[];
  grad: boolean;
}

/**
 * Group open requirements by what kind of course fills them, e.g. both "SMU Course 4" and "SMU Course 5"
 * become one "Any SMU course" category with 2 slots.
 */
export function openCategories(slots: Slot[], isOpen: (s: Slot) => boolean, track: string): Category[] {
  const byLabel = new Map<string, Category>();
  for (const slot of slots) {
    if (!isOpen(slot)) continue;
    const rule = ruleFor(slot, track);
    if (!rule) continue;
    const existing = byLabel.get(rule.label);
    if (existing) {
      byLabel.set(rule.label, { ...existing, slots: [...existing.slots, slot] });
    } else {
      byLabel.set(rule.label, { key: rule.label, label: rule.label, test: rule.test, slots: [slot], grad: slot.grad });
    }
  }
  return [...byLabel.values()];
}

/** Category labels (excluding the catch-all free elective) a course could clear. */
export function clearsFor(course: Course, categories: Category[]): Category[] {
  return categories.filter((cat) => cat.label !== "Any SMU course" && cat.test(course));
}

export function examLabel(c: Course): { text: string; tone: "final" | "none" | "unknown" } {
  if (c.x === "F") return { text: "Final exam", tone: "final" };
  if (c.x === "N") return { text: "No final", tone: "none" };
  return { text: "Exam: no data", tone: "unknown" };
}
