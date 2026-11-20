"use client";

import { useState } from "react";
import { entryOf, termLabel } from "@/lib/model";
import { gpaFit, kindOfTerm, mappingIssues, programmeOf } from "@/lib/exchange";
import {
  addHostModule, applyToPlan, removeHostModule, removeUniversity, updateHostModule, updateUniversity,
} from "@/lib/exchange-actions";
import type { ExchangeKind, HostModule, PlanState, ProgramPlan, Slot, University, UniStatus } from "@/lib/types";

interface Props {
  uni: University;
  open: boolean;
  onToggle: () => void;
  slots: Slot[];
  plan: ProgramPlan;
  state: PlanState;
  onChange: (s: PlanState) => void;
}

const KIND_LABEL: Record<ExchangeKind, string> = { semester: "Semester", winter: "Winter", summer: "Summer" };
const STATUS_LABEL: Record<UniStatus, string> = {
  considering: "Considering", applying: "Applying", offered: "Offered", dropped: "Dropped",
};
const TERM_CHOICES = ["Y2T3", "Y3T4", "Y3T1", "Y3T2", "Y3T3", "Y4T4", "Y4T1", "Y4T2"];
const safeLink = (url: string) => (/^https?:\/\//.test(url) ? url : "");

export default function UniversityCard({ uni, open, onToggle, slots, plan, state, onChange }: Props) {
  const gpa = state.settings.gpa;
  const fit = gpaFit(uni, gpa);
  const issues = mappingIssues(uni, slots, plan);
  const mappedCu = uni.modules.filter((m) => m.slotKey).reduce((acc, m) => acc + m.cu, 0);
  const cap = programmeOf(uni.term ? kindOfTerm(uni.term) : "semester").maxCu;
  const [message, setMessage] = useState("");
  const set = (patch: Partial<Omit<University, "id">>) => onChange(updateUniversity(state, uni.id, patch));

  return (
    <article className={`uni ${open ? "is-open" : ""} ${uni.status === "dropped" ? "is-dropped" : ""}`}>
      <button type="button" className="uni-summary" aria-expanded={open} onClick={onToggle}>
        <span className="uni-name">
          {uni.name || <em>Unnamed university</em>}
          {uni.country && <span className="uni-country">{uni.country}</span>}
        </span>
        <span className="uni-badges">
          {uni.kinds.map((k) => <span key={k} className="chip">{KIND_LABEL[k]}</span>)}
          {uni.minGpa !== null && (
            <span className={`gpa-fit gpa-${fit}`}>
              GPA ≥ {uni.minGpa.toFixed(2)}{fit === "meets" ? " ✓" : fit === "below" ? " ✕" : ""}
            </span>
          )}
          {uni.term && <span className="chip chip-pasg">{termLabel(uni.term)}</span>}
          <span className="chip num">{mappedCu}/{cap} CU mapped</span>
          {issues.length > 0 && <span className="chip chip-warn">{issues.length} to check</span>}
          <span className={`uni-status uni-status-${uni.status}`}>{STATUS_LABEL[uni.status]}</span>
        </span>
      </button>

      {open && (
        <div className="uni-body">
          <div className="uni-grid">
            <label className="field">
              <span>University</span>
              <input className="input" value={uni.name} maxLength={120} placeholder="e.g. Korea University"
                onChange={(e) => set({ name: e.target.value })} />
            </label>
            <label className="field">
              <span>Country / city</span>
              <input className="input" value={uni.country} maxLength={60} placeholder="Seoul, South Korea"
                onChange={(e) => set({ country: e.target.value })} />
            </label>
            <label className="field">
              <span>Min GPA (from OASIS / fact sheet)</span>
              <input className="input num" type="number" inputMode="decimal" min={0} max={4.3} step={0.01}
                value={uni.minGpa ?? ""} placeholder="Not stated"
                onChange={(e) => {
                  const n = Number(e.target.value);
                  set({ minGpa: e.target.value === "" || !Number.isFinite(n) ? null : Math.min(4.3, Math.max(0, n)) });
                }} />
            </label>
            <label className="field">
              <span>When I&rsquo;d go</span>
              <select className="input" value={uni.term} onChange={(e) => set({ term: e.target.value })}>
                <option value="">Undecided</option>
                {TERM_CHOICES.map((t) => (
                  <option key={t} value={t}>{termLabel(t)} · {KIND_LABEL[kindOfTerm(t)]}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select className="input" value={uni.status} onChange={(e) => set({ status: e.target.value as UniStatus })}>
                {Object.entries(STATUS_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Link (fact sheet, course catalogue)</span>
              <input className="input" type="url" value={uni.link} maxLength={400} placeholder="https://…"
                onChange={(e) => set({ link: e.target.value.trim() })} />
            </label>
          </div>

          <fieldset className="segmented">
            <legend>Good for</legend>
            {(Object.keys(KIND_LABEL) as ExchangeKind[]).map((k) => (
              <label key={k} className="seg seg-planned">
                <input type="checkbox" checked={uni.kinds.includes(k)}
                  onChange={() => set({ kinds: uni.kinds.includes(k) ? uni.kinds.filter((x) => x !== k) : [...uni.kinds, k] })} />
                <span>{KIND_LABEL[k]}</span>
              </label>
            ))}
          </fieldset>

          <label className="field">
            <span>Entry requirements</span>
            <textarea className="input" value={uni.requirements} maxLength={1000}
              placeholder="Language test, prerequisites, quota, deadlines, courses closed to exchange students…"
              onChange={(e) => set({ requirements: e.target.value })} />
          </label>

          <HostModules uni={uni} slots={slots} plan={plan} state={state} onChange={onChange} />

          {issues.length > 0 && (
            <ul className="issues">{issues.map((i) => <li key={i}>{i}</li>)}</ul>
          )}

          <label className="field">
            <span>Notes</span>
            <textarea className="input" value={uni.notes} maxLength={2000}
              placeholder="Cost of living, housing, seniors' reviews, why it's on the list…"
              onChange={(e) => set({ notes: e.target.value })} />
          </label>

          {message && <p className="notice" role="status">{message}</p>}
          <div className="editor-actions">
            <button type="button" className="btn btn-danger btn-sm" onClick={() => onChange(removeUniversity(state, uni.id))}>
              Remove
            </button>
            <div className="button-row">
              {safeLink(uni.link) && (
                <a className="btn btn-sm" href={safeLink(uni.link)} target="_blank" rel="noopener noreferrer">Open link</a>
              )}
              <button type="button" className="btn btn-primary btn-sm"
                disabled={!uni.term || !uni.modules.some((m) => m.slotKey)}
                title={uni.term ? "" : "Pick when you'd go first"}
                onClick={() => {
                  const { state: next, count } = applyToPlan(state, uni.id);
                  onChange(next);
                  setMessage(`Put ${count} course${count === 1 ? "" : "s"} into ${termLabel(uni.term as string)} on your term board.`);
                }}>
                Put mapped courses in my plan
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function HostModules({ uni, slots, plan, state, onChange }: Omit<Props, "open" | "onToggle">) {
  const credit = slots.filter((s) => s.credit);
  const exchangeOk = credit.filter((s) => s.exchange);
  const others = credit.filter((s) => !s.exchange);
  const set = (m: HostModule, patch: Partial<Omit<HostModule, "id">>) => onChange(updateHostModule(state, uni.id, m.id, patch));
  const optionLabel = (s: Slot) => {
    const e = entryOf(plan, s.key);
    return `${s.title}${e.code || e.name ? ` (now: ${e.code || e.name})` : ""}`;
  };

  return (
    <div className="host">
      <div className="host-head">
        <h3>Courses I&rsquo;d take there → what they clear at SMU</h3>
        <button type="button" className="btn btn-sm" onClick={() => onChange(addHostModule(state, uni.id).state)}>+ Add course</button>
      </div>
      {uni.modules.length === 0 ? (
        <p className="hint">Add host courses from the university&rsquo;s catalogue, or from past mappings in OASIS, then pick the SMU requirement each one would clear.</p>
      ) : (
        <ul className="host-list">
          {uni.modules.map((m) => (
            <li key={m.id} className="host-row">
              <input className="input mono" aria-label="Host course code" placeholder="Code" maxLength={20}
                value={m.code} onChange={(e) => set(m, { code: e.target.value.toUpperCase() })} />
              <input className="input" aria-label="Host course name" placeholder="Course name" maxLength={160}
                value={m.name} onChange={(e) => set(m, { name: e.target.value })} />
              <input className="input num" aria-label="SMU CU" type="number" min={0} max={6} step={0.5}
                value={m.cu} onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) set(m, { cu: Math.min(6, Math.max(0, n)) });
                }} />
              <select className="input" aria-label="Maps to SMU requirement" value={m.slotKey}
                onChange={(e) => set(m, { slotKey: e.target.value })}>
                <option value="">Maps to…</option>
                <optgroup label="Exchange OK on the sheet">
                  {exchangeOk.map((s) => <option key={s.key} value={s.key}>{optionLabel(s)}</option>)}
                </optgroup>
                <optgroup label="Not allowed on exchange">
                  {others.map((s) => <option key={s.key} value={s.key}>{optionLabel(s)}</option>)}
                </optgroup>
              </select>
              <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove ${m.code || "course"}`}
                onClick={() => onChange(removeHostModule(state, uni.id, m.id))}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
