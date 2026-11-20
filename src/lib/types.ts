export type TermId = string; // "Y1T1" … "Y5T3"

export type Status = "none" | "planned" | "bidding" | "taking" | "done" | "exempt";

export interface CurriculumItem {
  label: string;
  cu: number;
  credit: boolean;
  compulsory: boolean;
  exchange?: boolean;
  ec: string;
  prereq: string;
  window: Record<TermId, string>;
}

export interface CurriculumSection {
  name: string;
  cus: number;
  items: CurriculumItem[];
  grad?: boolean;
}

export interface Program {
  id: string;
  label: string;
  sheet: string;
  terms: TermId[];
  sections: CurriculumSection[];
  notes: string[];
}

export interface Curriculum {
  programs: Program[];
  catalogue: Record<string, string>;
  reference: Record<string, string[]>;
}

/** One requirement row from the sheet, flattened. */
export interface Slot {
  key: string;
  sectionIndex: number;
  sectionName: string;
  title: string;
  fullTitle: string;
  detail: string;
  suggestedCode: string;
  suggestedName: string;
  cu: number;
  credit: boolean;
  grad: boolean;
  compulsory: boolean;
  /** Sheet marks this slot as clearable on exchange (red text). */
  exchange: boolean;
  ec: string;
  prereq: string;
  window: Record<TermId, string>;
  pasg: TermId | "";
}

/** What the student has filled in for a slot or an extra module. */
export interface Entry {
  code?: string;
  name?: string;
  term?: TermId;
  status?: Status;
  cu?: number;
  note?: string;
  alsoClears?: string[];
  /** Placed by "Suggest for empty terms"; cleared as soon as the student edits it. */
  suggested?: boolean;
}

export interface Extra extends Entry {
  id: string;
  label: string;
}

export interface ProgramPlan {
  slots: Record<string, Entry>;
  extras: Extra[];
}

export interface Settings {
  programId: string;
  intakeYear: number;
  endTerm: TermId;
  showSummer: boolean;
  /** Declared IS track name, e.g. "Product Development Track" ("" = not declared). */
  track?: string;
  /** Term spent on semester exchange ("" = none). */
  exchangeTerm?: TermId;
  /** Cumulative GPA from the DPR, for exchange eligibility checks. */
  gpa?: number;
  /** Shown on the exported course progression PDF. */
  studentName?: string;
}

export type ExchangeKind = "semester" | "winter" | "summer";
export type UniStatus = "considering" | "applying" | "offered" | "dropped";

/** A host-university course and the SMU requirement it would clear. */
export interface HostModule {
  id: string;
  code: string;
  name: string;
  cu: number;
  /** Requirement slot it maps to ("" = not mapped yet). */
  slotKey: string;
}

export interface University {
  id: string;
  name: string;
  country: string;
  /** Programmes the university offers SMU students. */
  kinds: ExchangeKind[];
  minGpa: number | null;
  /** Language tests, prerequisites, quotas, deadlines… */
  requirements: string;
  /** When I'd go ("" = undecided). */
  term: TermId | "";
  link: string;
  notes: string;
  status: UniStatus;
  modules: HostModule[];
}

export interface PlanState {
  version: 1;
  settings: Settings;
  plans: Record<string, ProgramPlan>;
  /** Exchange shortlist; shared across programmes. */
  exchange?: { universities: University[] };
  updatedAt: number;
}

/** A module occupying a term — either a filled slot or an extra. */
export interface PlacedModule {
  ref: string;
  kind: "slot" | "extra";
  slot: Slot | null;
  label: string;
  code: string;
  name: string;
  term: TermId | "";
  status: Status;
  cu: number;
  alsoClears: string[];
  note: string;
  suggested: boolean;
}
