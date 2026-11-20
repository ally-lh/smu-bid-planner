"use client";

import { useState } from "react";
import { termLabel } from "@/lib/model";
import { PROGRAMMES, gpaFit, readiness, universitiesOf } from "@/lib/exchange";
import { addUniversity } from "@/lib/exchange-actions";
import { updateSettings } from "@/lib/plan-actions";
import type { ExchangeKind, PlacedModule, PlanState, ProgramPlan, Slot } from "@/lib/types";
import UniversityCard from "./UniversityCard";

interface Props {
  slots: Slot[];
  plan: ProgramPlan;
  modules: PlacedModule[];
  state: PlanState;
  onChange: (s: PlanState) => void;
}

type Filter = "all" | ExchangeKind | "gpa";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "semester", label: "Semester" },
  { id: "winter", label: "Winter" },
  { id: "summer", label: "Summer" },
  { id: "gpa", label: "My GPA qualifies" },
];

export default function Exchange({ slots, plan, modules, state, onChange }: Props) {
  const { gpa, exchangeTerm } = state.settings;
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [gpaText, setGpaText] = useState(gpa === undefined ? "" : String(gpa));
  const universities = universitiesOf(state);
  const checks = exchangeTerm ? readiness(exchangeTerm, modules, gpa) : [];

  const shown = universities.filter((u) => {
    if (filter === "all") return true;
    if (filter === "gpa") return gpaFit(u, gpa) !== "below";
    return u.kinds.includes(filter);
  });

  const onGpa = (raw: string) => {
    setGpaText(raw);
    const n = Number(raw);
    if (raw.trim() === "") onChange(updateSettings(state, { gpa: undefined }));
    else if (Number.isFinite(n) && n >= 0 && n <= 4.3) onChange(updateSettings(state, { gpa: n }));
  };

  const add = () => {
    const { state: next, id } = addUniversity(state, { term: exchangeTerm ?? "", kinds: exchangeTerm ? ["semester"] : [] });
    onChange(next);
    setOpenId(id);
  };

  return (
    <div className="exchange">
      <section className="exchange-me" aria-label="Your eligibility">
        <div className="exchange-me-head">
          <h2>Can I go?</h2>
          <label className="field exchange-gpa">
            <span>My GPA</span>
            <input className="input num" type="number" inputMode="decimal" min={0} max={4.3} step={0.01}
              value={gpaText} placeholder="e.g. 3.50" onChange={(e) => onGpa(e.target.value)} />
          </label>
        </div>
        {exchangeTerm ? (
          <>
            <p className="hint">Semester exchange planned for <strong>{termLabel(exchangeTerm)}</strong> (change it in Programme &amp; settings). Checked against SMU&rsquo;s ISEP rules for SCIS:</p>
            <ul className="checklist">
              {checks.map((c) => (
                <li key={c.id} className={c.ok === null ? "is-unknown" : c.ok ? "is-ok" : "is-bad"}>
                  <span className="checklist-mark" aria-hidden="true">{c.ok === null ? "?" : c.ok ? "✓" : "✕"}</span>
                  <span>{c.label}</span>
                  <span className="hint">{c.detail}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="hint">No semester exchange term set. Pick one in Programme &amp; settings to check eligibility.</p>
        )}
      </section>

      <section className="exchange-rules" aria-label="Exchange options">
        {PROGRAMMES.map((p) => (
          <article key={p.kind} className="rule-card">
            <header>
              <h3>{p.label}</h3>
              <p className="rule-meta"><span>{p.when}</span><span className="num">up to {p.maxCu} CU</span></p>
            </header>
            <p className="rule-apply">{p.apply}</p>
            <ul>{p.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </article>
        ))}
      </section>
      <p className="hint">
        SMU keeps the partner list, each university&rsquo;s GPA cut-off and past course mappings in OASIS (Global Exchange) and the GEO
        partner fact sheets, so add the universities you&rsquo;re looking at below as you research them. Questions: isep.outbound@smu.edu.sg (semester) · smushortterm@smu.edu.sg (winter/summer).
      </p>

      <section className="shortlist" aria-label="University shortlist">
        <div className="shortlist-head">
          <h2>My shortlist <span className="waiting-count">{universities.length}</span></h2>
          <div className="need-chips" role="tablist" aria-label="Filter universities">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={filter === f.id}
                className={`need ${filter === f.id ? "is-active" : ""}`} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={add}>+ Add university</button>
        </div>
        {shown.length === 0 && (
          <p className="empty">
            {universities.length
              ? "No universities match this filter."
              : "Nothing yet. Add a university to record its requirements, GPA cut-off and which courses you'd map back to SMU."}
          </p>
        )}
        <ul className="uni-list">
          {shown.map((u) => (
            <li key={u.id}>
              <UniversityCard uni={u} open={openId === u.id} onToggle={() => setOpenId(openId === u.id ? null : u.id)}
                slots={slots} plan={plan} state={state} onChange={onChange} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
