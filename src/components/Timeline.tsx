"use client";

import { useState } from "react";
import {
  CLEARED, HEAVY_TERM_CU, compareTerms, earlierThanWindow, isBreakTerm, termCalendar, termLabel,
} from "@/lib/model";
import { updateEntry, updateExtra } from "@/lib/plan-actions";
import type { PlacedModule, PlanState, Slot, TermId } from "@/lib/types";
import type { EditTarget } from "./Editor";
import ModuleCard, { sectionTone } from "./ModuleCard";
import { LOAD_OPTIONS, clearSuggestions, suggestPlan } from "@/lib/suggest";
import { useCourses } from "@/lib/use-courses";

interface Props {
  terms: TermId[];
  modules: PlacedModule[];
  slots: Slot[];
  intakeYear: number;
  now: TermId | "";
  state: PlanState;
  onChange: (s: PlanState) => void;
  onOpen: (t: EditTarget) => void;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

export default function Timeline({ terms, modules, slots, intakeYear, now, state, onChange, onOpen }: Props) {
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [targetCu, setTargetCu] = useState<number>(4);
  const { courses } = useCourses();
  const byCode = new Map(courses.map((c) => [c.c, c]));
  const [message, setMessage] = useState("");
  const hasSuggestions = modules.some((m) => m.suggested);

  const suggest = () => {
    const { state: next, placed, leftover } = suggestPlan(state, slots, terms, now, targetCu);
    onChange(next);
    setMessage(
      placed
        ? `Placed ${placed} requirement${placed === 1 ? "" : "s"} at about ${targetCu} CU per term.${leftover.length ? ` ${leftover.length} didn't fit before your last term; extend "Plan until" in settings.` : ""} Tap any card to pick the actual course.`
        : leftover.length
          ? "No empty terms left to fill. Extend \"Plan until\" in settings or clear a term."
          : "Everything already has a term.",
    );
  };

  const undo = () => {
    const { state: next, cleared } = clearSuggestions(state);
    onChange(next);
    setMessage(`Cleared ${cleared} suggestion${cleared === 1 ? "" : "s"}.`);
  };
  const waiting = modules.filter((m) => m.kind === "slot" && !m.term && !CLEARED.has(m.status));
  const clearedNoTerm = modules.filter((m) => !m.term && CLEARED.has(m.status));
  const grads = slots.filter((s) => s.grad);
  const sections = Array.from(new Set(waiting.map((m) => m.slot?.sectionName ?? "")));

  const moveTo = (ref: string, term: TermId | "") => {
    const m = modules.find((x) => x.ref === ref);
    if (!m || m.term === term) return;
    const status = m.status === "none" && term ? "planned" : m.status;
    onChange(m.kind === "slot"
      ? updateEntry(state, ref, { term, status })
      : updateExtra(state, ref, { term, status }));
  };

  const dropProps = (id: string, term: TermId | "") => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDropTarget(id); },
    onDragLeave: () => setDropTarget((d) => (d === id ? null : d)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDropTarget(null);
      moveTo(e.dataTransfer.getData("text/plain"), term);
    },
  });

  const open = (m: PlacedModule) => onOpen(m.kind === "slot" ? { kind: "slot", key: m.ref } : { kind: "extra", id: m.ref });

  const years = Array.from(new Set(terms.map((t) => Number(t[1]))));

  const renderTerm = (term: TermId) => {
    const inTerm = modules.filter((m) => m.term === term);
    const load = inTerm.reduce((acc, m) => acc + m.cu, 0);
    const { months } = termCalendar(term, intakeYear);
    const past = now && compareTerms(term, now) < 0;
    const brk = isBreakTerm(term);
    return (
      <li
        key={term}
        className={`term ${term === now ? "is-now" : ""} ${past ? "is-past" : ""} ${brk ? "is-break" : ""} ${dropTarget === term ? "is-drop" : ""}`}
        {...dropProps(term, term)}
      >
        <header className="term-head">
          <div>
            <h3>{termLabel(term).replace(/^Y\d /, "")}</h3>
            <p className="term-cal">{months}</p>
          </div>
          {term === now && <span className="now-pill">Now</span>}
          {term === state.settings.exchangeTerm && <span className="now-pill exchange-pill">Exchange</span>}
        </header>
        <ul className="term-list">
          {inTerm.map((m) => (
            <li key={m.ref}>
              <ModuleCard
                module={m}
                grads={grads}
                early={!CLEARED.has(m.status) && earlierThanWindow(m.slot, term)}
                course={m.code ? byCode.get(m.code.replace(".", "")) : undefined}
                notOnExchange={term === state.settings.exchangeTerm && Boolean(m.slot) && !m.slot?.exchange}
                onOpen={() => open(m)}
              />
            </li>
          ))}
        </ul>
        <footer className="term-foot">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpen({ kind: "new", term })}>
            + Add{brk ? "" : " module"}
          </button>
          <span className={`term-load num ${load > HEAVY_TERM_CU ? "is-heavy" : ""}`}>
            {fmt(load)} CU
          </span>
        </footer>
      </li>
    );
  };

  return (
    <div className="board-wrap">
      <div className="board-tools">
        <button type="button" className="btn btn-primary" onClick={suggest}>
          Suggest for empty terms
        </button>
        <label className="load-pick">
          <span>Load</span>
          <select className="input" value={targetCu} onChange={(e) => setTargetCu(Number(e.target.value))}>
            {LOAD_OPTIONS.map((n) => <option key={n} value={n}>{n} CU / term</option>)}
          </select>
        </label>
        {hasSuggestions && (
          <button type="button" className="btn" onClick={undo}>Clear suggestions</button>
        )}
        {message && <p className="board-msg" role="status">{message}</p>}
      </div>
      <div className="board" role="region" aria-label="Term board">
        {years.map((year) => {
          const yearTerms = terms.filter((t) => Number(t[1]) === year);
          const yearLoad = modules.filter((m) => yearTerms.includes(m.term as TermId)).reduce((a, m) => a + m.cu, 0);
          return (
            <section key={year} className="year" aria-label={`Year ${year}`}>
              <header className="year-head">
                <h2>Year {year}</h2>
                <span className="year-meta num">{termCalendar(`Y${year}T1`, intakeYear).ay} · {fmt(yearLoad)} CU</span>
              </header>
              <ol className={`year-terms ${yearTerms.some(isBreakTerm) ? "has-breaks" : ""}`}>
                {yearTerms.map(renderTerm)}
              </ol>
            </section>
          );
        })}
      </div>
      <section
        className={`waiting ${dropTarget === "waiting" ? "is-drop" : ""}`}
        aria-label="Requirements without a term"
        {...dropProps("waiting", "")}
      >
        <div className="waiting-head">
          <h2>Not placed yet <span className="waiting-count num">{waiting.length}</span></h2>
          <p>Tap a requirement to choose its module and term, or drag it onto a term.</p>
        </div>
        {waiting.length > 0 ? (
          <div className="waiting-groups">
            {sections.map((section) => (
              <div key={section} className="waiting-group">
                <h3>{section}</h3>
                <ul className="pills">
                  {waiting.filter((m) => m.slot?.sectionName === section).map((m) => (
                    <li key={m.ref}>
                      <button
                        type="button"
                        className={`pill tone-${sectionTone(section)}`}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", m.ref); e.dataTransfer.effectAllowed = "move"; }}
                        onClick={() => open(m)}
                      >
                        {m.code ? <><span className="mono">{m.code}</span> {m.name}</> : m.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty">Every requirement has a term.</p>
        )}
        {clearedNoTerm.length > 0 && (
          <p className="waiting-foot">
            Cleared without a term (exempted or done): {clearedNoTerm.map((m) => m.code || m.label).join(", ")}
          </p>
        )}
      </section>
    </div>
  );
}
