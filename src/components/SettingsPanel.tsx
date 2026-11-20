"use client";

import { useState } from "react";
import { END_TERMS, intakeFromProgram, termLabel } from "@/lib/model";
import { autofillPreassigned, resetProgram, updateSettings } from "@/lib/plan-actions";
import type { PlanState, Program, Slot } from "@/lib/types";
import Sheet from "./Sheet";
import PlanData from "./PlanData";
import { IS_TRACKS } from "@/lib/courses";

interface Props {
  open: boolean;
  onClose: () => void;
  state: PlanState;
  onChange: (s: PlanState) => void;
  programs: Program[];
  slots: Slot[];
}

const MIN_YEAR = 2018;
const EXCHANGE_TERMS = ["Y2T2", "Y3T1", "Y3T2", "Y4T1", "Y4T2"];
const MAX_YEAR = 2032;

export default function SettingsPanel({ open, onClose, state, onChange, programs, slots }: Props) {
  const { settings } = state;
  const program = programs.find((p) => p.id === settings.programId) ?? programs[0];
  const [message, setMessage] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  const pickProgram = (id: string) => {
    const p = programs.find((x) => x.id === id);
    if (!p) return;
    onChange(updateSettings(state, { programId: id, intakeYear: intakeFromProgram(p) }));
  };

  const autofill = () => {
    const { state: next, count } = autofillPreassigned(state, slots);
    onChange(next);
    setMessage(count ? `Placed ${count} pre-assigned course${count === 1 ? "" : "s"}.` : "Pre-assigned courses are already placed.");
  };

  return (
    <Sheet open={open} onClose={onClose} title="Programme & settings" eyebrow="Your plan">
      <div className="editor">
        <label className="field">
          <span>Programme (from the SCIS course-sequence sheet)</span>
          <select className="input" value={settings.programId} onChange={(e) => pickProgram(e.target.value)}>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <p className="hint">Each programme keeps its own plan, so switching doesn&rsquo;t erase anything.</p>
        <div className="field-row">
          <label className="field">
            <span>Intake year</span>
            <input className="input num" type="number" min={MIN_YEAR} max={MAX_YEAR} value={settings.intakeYear}
              onChange={(e) => {
                const y = Number(e.target.value);
                if (Number.isInteger(y) && y >= MIN_YEAR && y <= MAX_YEAR) onChange(updateSettings(state, { intakeYear: y }));
              }} />
          </label>
          <label className="field">
            <span>Plan until</span>
            <select className="input" value={settings.endTerm}
              onChange={(e) => onChange(updateSettings(state, { endTerm: e.target.value }))}>
              {END_TERMS.map((t) => <option key={t} value={t}>{termLabel(t)}</option>)}
            </select>
          </label>
        </div>
        <div className="field-row two">
          <label className="field">
            <span>IS track</span>
            <select className="input" value={settings.track ?? ""}
              onChange={(e) => onChange(updateSettings(state, { track: e.target.value }))}>
              <option value="">Not declared / not IS</option>
              {IS_TRACKS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Exchange term</span>
            <select className="input" value={settings.exchangeTerm ?? ""}
              onChange={(e) => onChange(updateSettings(state, { exchangeTerm: e.target.value }))}>
              <option value="">No exchange</option>
              {EXCHANGE_TERMS.map((t) => <option key={t} value={t}>{termLabel(t)}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Name on exported PDF (optional)</span>
          <input className="input" value={settings.studentName ?? ""} maxLength={80} placeholder="Your name"
            onChange={(e) => onChange(updateSettings(state, { studentName: e.target.value }))} />
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.showSummer}
            onChange={(e) => onChange(updateSettings(state, { showSummer: e.target.checked }))} />
          <span>Show winter (Dec) and summer (May–Jul) sessions: short programmes, internships, community service</span>
        </label>

        <PlanData state={state} onChange={onChange} programs={programs} program={program} slots={slots} />

        <div className="facts-block">
          <h3>Quick start</h3>
          <p className="hint">Puts every pre-assigned (PASG) course into the term the sheet gives it. Anything you&rsquo;ve already placed stays put.</p>
          <button type="button" className="btn btn-sm" onClick={autofill}>Place pre-assigned courses</button>
        </div>

        {message && <p className="notice" role="status">{message}</p>}

        <div className="facts-block">
          <h3>Start over</h3>
          {confirmReset ? (
            <div className="button-row">
              <button type="button" className="btn btn-danger btn-sm"
                onClick={() => { onChange(resetProgram(state)); setConfirmReset(false); setMessage("This programme's plan was cleared."); }}>
                Yes, clear this programme&rsquo;s plan
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(false)}>Keep it</button>
            </div>
          ) : (
            <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmReset(true)}>Clear plan…</button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
