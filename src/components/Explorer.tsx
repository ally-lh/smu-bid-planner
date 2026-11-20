"use client";

import { useMemo, useState } from "react";
import { clearsFor, gradKeysFor, openCategories, type Category, type Course } from "@/lib/courses";
import { CLEARED, IN_PLAN, compareTerms, entryOf, gradStatus, plannedByCode, termLabel } from "@/lib/model";
import { assignCourse } from "@/lib/plan-actions";
import { useCourses } from "@/lib/use-courses";
import type { PlacedModule, PlanState, ProgramPlan, Slot, TermId } from "@/lib/types";
import CourseRow from "./CourseRow";
import { InPlan } from "./CourseFinder";

interface Props {
  slots: Slot[];
  plan: ProgramPlan;
  modules: PlacedModule[];
  terms: TermId[];
  now: TermId | "";
  state: PlanState;
  onChange: (s: PlanState) => void;
}

const PAGE = 40;
const ALL = "__all";

export default function Explorer({ slots, plan, modules, terms, now, state, onChange }: Props) {
  const { courses, loading } = useCourses();
  const track = state.settings.track ?? "";
  const [pick, setPick] = useState<string>("");
  const [query, setQuery] = useState("");
  const [noFinals, setNoFinals] = useState(false);
  const [gradFilter, setGradFilter] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [adding, setAdding] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const gradSlots = useMemo(() => slots.filter((s) => s.grad), [slots]);
  const isOpen = (s: Slot) => {
    if (s.grad) return !CLEARED.has(gradStatus(s, plan, modules).status) && !IN_PLAN.has(gradStatus(s, plan, modules).status);
    const e = entryOf(plan, s.key);
    return !e.code && !CLEARED.has(e.status ?? "none");
  };
  const categories = openCategories(slots, isOpen, track);
  const creditCats = categories.filter((c) => !c.grad);
  const gradCats = categories.filter((c) => c.grad);
  const selected = categories.find((c) => c.key === pick) ?? (pick === ALL ? null : categories[0] ?? null);
  const upcoming = terms.filter((t) => !now || compareTerms(t, now) > 0);
  const taken = plannedByCode(modules);

  // ~1,200 courses: filtering every render is cheap and keeps this simple.
  const q = query.trim().toLowerCase();
  const results = (() => {
    const gradCat = gradCats.find((g) => g.key === gradFilter);
    return courses
      .filter((c) => !selected || selected.test(c))
      .filter((c) => !gradCat || gradCat.test(c))
      .filter((c) => !noFinals || c.x === "N")
      .filter((c) => !q || c.c.toLowerCase().includes(q) || c.n.toLowerCase().includes(q))
      .map((c) => ({ c, clears: clearsFor(c, categories) }))
      .sort((a, b) => Number(taken.has(a.c.c)) - Number(taken.has(b.c.c)) || b.clears.length - a.clears.length || Number(a.c.x === "F") - Number(b.c.x === "F") || a.c.c.localeCompare(b.c.c));
  })();

  const exchangeTerm = state.settings.exchangeTerm ?? "";
  const onExchange = (cat: Category) =>
    exchangeTerm ? cat.slots.filter((s) => entryOf(plan, s.key).term === exchangeTerm).length : 0;
  const choose = (key: string) => { setPick(key); setLimit(PAGE); setAdding(null); };

  return (
    <div className="explorer">
      <section className="explorer-need" aria-label="What you still need">
        <h2>What do you still need?</h2>
        <p className="hint">Pick a requirement to see every SMU course that clears it. Counts come from your plan.</p>
        <div className="need-chips" role="tablist">
          {creditCats.map((cat) => (
            <NeedChip key={cat.key} cat={cat} onExchange={onExchange(cat)} active={selected?.key === cat.key} onClick={() => choose(cat.key)} />
          ))}
          {gradCats.map((cat) => (
            <NeedChip key={cat.key} cat={cat} onExchange={0} active={selected?.key === cat.key} onClick={() => choose(cat.key)} />
          ))}
          <button type="button" role="tab" aria-selected={pick === ALL} className={`need ${pick === ALL ? "is-active" : ""}`} onClick={() => choose(ALL)}>
            Browse all courses
          </button>
        </div>
      </section>

      <div className="explorer-filters">
        <label className="field explorer-search">
          <span className="visually-hidden">Search courses</span>
          <input className="input" type="search" placeholder="Search code or name, e.g. IS469 or ethics" value={query}
            onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} />
        </label>
        <label className="check">
          <input type="checkbox" checked={noFinals} onChange={(e) => setNoFinals(e.target.checked)} />
          <span>No final exam</span>
        </label>
        {gradCats.map((g) => (
          <label key={g.key} className="check">
            <input type="checkbox" checked={gradFilter === g.key} onChange={(e) => setGradFilter(e.target.checked ? g.key : "")} />
            <span>Also clears {g.slots[0].title}</span>
          </label>
        ))}
      </div>

      {message && <p className="notice" role="status">{message}</p>}

      {loading ? (
        <p className="hint">Loading the SMU course catalogue…</p>
      ) : courses.length === 0 ? (
        <p className="notice">Couldn&rsquo;t load the course catalogue. Check your connection and reload.</p>
      ) : (
        <>
          <p className="hint num">
            {results.length} course{results.length === 1 ? "" : "s"}
            {selected ? ` clear ${selected.label}` : ""}{noFinals ? ", no final exam" : ""}.
            {" "}Exam info is from SMU&rsquo;s published exam schedule for the latest term each course ran; check the BOSS course outline before bidding.
          </p>
          <ul className="course-list">
            {results.slice(0, limit).map(({ c, clears }) => (
              <li key={c.c}>
                <CourseRow
                  course={c}
                  clears={clears.map((x) => x.label)}
                  selected={adding === c.c}
                  action={taken.has(c.c) ? <InPlan module={taken.get(c.c)!} /> : (
                    <button type="button" className="btn btn-sm" onClick={() => setAdding(adding === c.c ? null : c.c)}>
                      {adding === c.c ? "Cancel" : "Add"}
                    </button>
                  )}
                />
                {adding === c.c && !taken.has(c.c) && (
                  <AddForm
                    course={c}
                    creditCats={creditCats}
                    preferred={selected && !selected.grad ? selected : null}
                    terms={upcoming}
                    exchangeTerm={state.settings.exchangeTerm ?? ""}
                    onAdd={(slot, term) => {
                      onChange(assignCourse(state, slot.key, { code: c.c, name: c.n, cu: c.u }, gradKeysFor(c, gradSlots), term));
                      setAdding(null);
                      setMessage(`Added ${c.c} ${c.n} to ${termLabel(term)} as ${slot.title}.`);
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
          {results.length > limit && (
            <button type="button" className="btn" onClick={() => setLimit((n) => n + PAGE)}>
              Show more ({results.length - limit} left)
            </button>
          )}
        </>
      )}
    </div>
  );
}

function NeedChip({ cat, active, onExchange, onClick }: {
  cat: Category; active: boolean; onExchange: number; onClick: () => void;
}) {
  const n = cat.slots.length - onExchange;
  const count = cat.grad
    ? "grad req"
    : [n > 0 ? `${n} needed` : "", onExchange ? `${onExchange} on exchange` : ""].filter(Boolean).join(" · ");
  return (
    <button type="button" role="tab" aria-selected={active} className={`need ${active ? "is-active" : ""} ${cat.grad ? "is-grad" : ""}`} onClick={onClick}>
      <span>{cat.grad ? cat.slots[0].title : cat.label}</span>
      <span className="need-count num">{count}</span>
    </button>
  );
}

function AddForm({ course, creditCats, preferred, terms, exchangeTerm, onAdd }: {
  course: Course;
  creditCats: Category[];
  preferred: Category | null;
  terms: TermId[];
  exchangeTerm: TermId | "";
  onAdd: (slot: Slot, term: TermId) => void;
}) {
  const fits = creditCats.filter((cat) => cat.test(course));
  const options = (preferred && preferred.test(course) ? [preferred, ...fits.filter((f) => f !== preferred)] : fits)
    .flatMap((cat) => cat.slots);
  const [slotKey, setSlotKey] = useState(options[0]?.key ?? "");
  const [term, setTerm] = useState<TermId>(terms.find((t) => t !== exchangeTerm) ?? terms[0] ?? "");
  const slot = options.find((s) => s.key === slotKey);

  if (!options.length) {
    return <p className="add-form hint">This course doesn&rsquo;t fill any requirement you still have open.</p>;
  }
  return (
    <div className="add-form">
      <label className="field">
        <span>Counts as</span>
        <select className="input" value={slotKey} onChange={(e) => setSlotKey(e.target.value)}>
          {options.map((s) => <option key={s.key} value={s.key}>{s.title} ({s.sectionName})</option>)}
        </select>
      </label>
      <label className="field">
        <span>Term</span>
        <select className="input" value={term} onChange={(e) => setTerm(e.target.value)}>
          {terms.map((t) => <option key={t} value={t}>{termLabel(t)}{t === exchangeTerm ? " (exchange)" : ""}</option>)}
        </select>
      </label>
      {slot && term === exchangeTerm && !slot.exchange && (
        <p className="chip chip-warn">The sheet doesn&rsquo;t allow {slot.title} to be cleared on exchange.</p>
      )}
      <button type="button" className="btn btn-primary" disabled={!slot || !term} onClick={() => slot && onAdd(slot, term)}>
        Add to plan
      </button>
    </div>
  );
}
