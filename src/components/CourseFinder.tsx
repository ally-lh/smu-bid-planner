"use client";

import { useState } from "react";
import { badgesFor, ruleFor, type Course } from "@/lib/courses";
import { useCourses } from "@/lib/use-courses";
import { termLabel } from "@/lib/model";
import type { PlacedModule, Slot } from "@/lib/types";
import CourseRow from "./CourseRow";

interface Props {
  slot: Slot | null;
  track: string;
  currentCode: string;
  /** Courses already used elsewhere in the plan; shown but not pickable again. */
  taken: Map<string, PlacedModule>;
  onPick: (course: Course) => void;
}

const PAGE = 15;

/** "Pick a course" list inside the editor: every catalogue course that clears this requirement. */
export default function CourseFinder({ slot, track, currentCode, taken, onPick }: Props) {
  const { courses, loading } = useCourses();
  const [query, setQuery] = useState("");
  const [noFinals, setNoFinals] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const rule = ruleFor(slot, track);
  if (!rule) return null;

  const q = query.trim().toLowerCase();
  const usedElsewhere = (code: string) => code !== currentCode && taken.has(code);
  const matches = courses
    .filter(rule.test)
    .filter((c) => !noFinals || c.x === "N")
    .filter((c) => !q || c.c.toLowerCase().includes(q) || c.n.toLowerCase().includes(q))
    .sort((a, b) => Number(b.c === currentCode) - Number(a.c === currentCode)
      || Number(usedElsewhere(a.c)) - Number(usedElsewhere(b.c))
      || badgesFor(b, track).length - badgesFor(a, track).length
      || a.c.localeCompare(b.c));

  return (
    <section className="finder" aria-label="Pick a course">
      <div className="finder-head">
        <h3>Pick a course</h3>
        <span className="hint">{loading ? "Loading catalogue…" : `${matches.length} courses clear ${rule.label}`}</span>
      </div>
      <div className="finder-filters">
        <input className="input" type="search" placeholder="Search code or name" value={query}
          aria-label="Search courses" onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} />
        <label className="check">
          <input type="checkbox" checked={noFinals} onChange={(e) => setNoFinals(e.target.checked)} />
          <span>No final exam</span>
        </label>
      </div>
      <ul className="course-list compact">
        {matches.slice(0, limit).map((c) => (
          <li key={c.c}>
            <CourseRow
              course={c}
              clears={badgesFor(c, track)}
              selected={c.c === currentCode}
              action={c.c === currentCode
                ? <span className="picked">✓ Picked</span>
                : usedElsewhere(c.c)
                  ? <InPlan module={taken.get(c.c)!} />
                  : <button type="button" className="btn btn-sm" onClick={() => onPick(c)}>Use</button>}
            />
          </li>
        ))}
      </ul>
      {matches.length > limit && (
        <button type="button" className="btn btn-sm" onClick={() => setLimit((n) => n + PAGE)}>
          Show more ({matches.length - limit} left)
        </button>
      )}
    </section>
  );
}

/** "Already in your plan" marker, so one course can't fill two requirements. */
export function InPlan({ module: m }: { module: PlacedModule }) {
  return (
    <span className="in-plan" title={`Already counts as ${m.label}`}>
      In plan{m.term ? ` · ${termLabel(m.term)}` : ""}
    </span>
  );
}
