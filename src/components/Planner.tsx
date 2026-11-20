"use client";

import { useMemo, useState } from "react";
import {
  buildSlots, buildTerms, currentTerm, modulesOf, overall, planFor, sectionProgress,
} from "@/lib/model";
import { usePlan } from "@/lib/use-plan";
import type { Curriculum, PlanState } from "@/lib/types";
import Summary from "./Summary";
import Timeline from "./Timeline";
import Requirements from "./Requirements";
import Reference from "./Reference";
import Explorer from "./Explorer";
import Editor, { type EditTarget } from "./Editor";
import SettingsPanel from "./SettingsPanel";
import Exchange from "./Exchange";
import ProgressionReport from "./ProgressionReport";

type Tab = "board" | "find" | "requirements" | "exchange" | "reference";
const TABS: { id: Tab; label: string }[] = [
  { id: "board", label: "Term board" },
  { id: "find", label: "Find modules" },
  { id: "requirements", label: "Requirements" },
  { id: "exchange", label: "Exchange" },
  { id: "reference", label: "Tracks & notes" },
];

export default function Planner({ curriculum }: { curriculum: Curriculum }) {
  const { programs, catalogue, reference } = curriculum;
  const { state, commit, ready, saved } = usePlan(programs);
  const [tab, setTab] = useState<Tab>("board");
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const program = programs.find((p) => p.id === state.settings.programId) ?? programs[0];
  const plan = planFor(state);
  const slots = useMemo(() => buildSlots(program), [program]);
  const terms = useMemo(() => buildTerms(program, state.settings), [program, state.settings]);
  const modules = useMemo(() => modulesOf(slots, plan), [slots, plan]);
  const progress = useMemo(() => sectionProgress(program, slots, plan, modules), [program, slots, plan, modules]);
  const totals = overall(progress);
  const now = ready ? currentTerm(state.settings.intakeYear, new Date()) : "";

  const apply = (next: PlanState) => commit(next);

  // The browser's print dialog has "Save as PDF"; the document title becomes the file name.
  const exportPdf = () => {
    const previous = document.title;
    const who = state.settings.studentName?.trim();
    document.title = `Course progression${who ? ` - ${who}` : ""} - ${new Date().toISOString().slice(0, 10)}`;
    window.addEventListener("afterprint", () => { document.title = previous; }, { once: true });
    window.print();
  };

  return (
    <>
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-eyebrow">SMU · SCIS</span>
            <h1>Bid Planner</h1>
          </div>
          <div className="topbar-actions">
            <span className={`sync ${saved ? "sync-synced" : "sync-error"}`} role="status"
              title={saved ? "Your plan stays in this browser. Save a plan file to move it to another device." : undefined}>
              {saved ? "Saved in this browser" : "Not saved here: use Save plan file"}
            </span>
            <button type="button" className="btn" onClick={exportPdf}>Export PDF</button>
            <button type="button" className="btn" onClick={() => setSettingsOpen(true)}>
              Programme &amp; settings
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        <Summary
          programLabel={program.label}
          totals={totals}
          progress={progress}
          modules={modules}
          slots={slots}
          plan={plan}
        />

        {ready && Object.keys(plan.slots).length === 0 && plan.extras.length === 0 && (
          <p className="welcome">
            <span>
              <strong>New here?</strong> Your plan saves in this browser, so it&rsquo;s here when you come back. Already have
              a plan somewhere? Load a plan file, or let any AI read your DPR or progression PDF.
            </span>
            <button type="button" className="btn btn-sm" onClick={() => setSettingsOpen(true)}>Bring my plan in</button>
          </p>
        )}

        <nav className="tabs" aria-label="Views">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="tab"
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "board" && (
          <Timeline
            terms={terms}
            modules={modules}
            slots={slots}
            intakeYear={state.settings.intakeYear}
            now={now}
            onOpen={setEditing}
            state={state}
            onChange={apply}
          />
        )}
        {tab === "find" && (
          <Explorer
            slots={slots}
            plan={plan}
            modules={modules}
            terms={terms}
            now={now}
            state={state}
            onChange={apply}
          />
        )}
        {tab === "requirements" && (
          <Requirements
            program={program}
            slots={slots}
            plan={plan}
            modules={modules}
            progress={progress}
            onOpen={setEditing}
            state={state}
            onChange={apply}
          />
        )}
        {tab === "exchange" && (
          <Exchange slots={slots} plan={plan} modules={modules} state={state} onChange={apply} />
        )}
        {tab === "reference" && <Reference program={program} reference={reference} />}
      </main>

      <Editor
        target={editing}
        onClose={() => setEditing(null)}
        state={state}
        onChange={apply}
        slots={slots}
        modules={modules}
        terms={terms}
        catalogue={catalogue}
      />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        state={state}
        onChange={apply}
        programs={programs}
        slots={slots}
      />
    </div>
    <ProgressionReport program={program} state={state} slots={slots} plan={plan}
      modules={modules} progress={progress} totals={totals} ready={ready} />
    </>
  );
}
