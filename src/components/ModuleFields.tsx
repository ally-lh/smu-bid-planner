"use client";

import { useId } from "react";
import { useCourses } from "@/lib/use-courses";
import { termLabel } from "@/lib/model";
import type { Entry, Slot, TermId } from "@/lib/types";

interface Props {
  entry: Entry;
  defaultCu: number;
  terms: TermId[];
  catalogue: Record<string, string>;
  grads: Slot[];
  onPatch: (patch: Entry) => void;
  hideTerm?: boolean;
  earlyWarning?: boolean;
}

const CODE_PATTERN = /^[A-Z0-9-]{0,14}$/;
const MAX_CU = 6;

export default function ModuleFields({
  entry, defaultCu, terms, catalogue, grads, onPatch, hideTerm, earlyWarning,
}: Props) {
  const listId = useId();
  const { courses } = useCourses();
  // Full SMU catalogue first, then any sheet-only codes (older courses) it doesn't have.
  const names: Record<string, string> = { ...catalogue, ...Object.fromEntries(courses.map((c) => [c.c, c.n])) };
  const code = entry.code ?? "";
  const cu = typeof entry.cu === "number" ? entry.cu : defaultCu;
  const clears = entry.alsoClears ?? [];

  const onCode = (raw: string) => {
    const next = raw.toUpperCase().replace(/\s+/g, "");
    if (!CODE_PATTERN.test(next)) return;
    const known = names[next];
    const autoName = !entry.name || entry.name === names[code];
    onPatch(known && autoName ? { code: next, name: known } : { code: next });
  };

  const onCu = (raw: string) => {
    const n = Number(raw);
    if (raw === "" || Number.isNaN(n)) return;
    onPatch({ cu: Math.min(MAX_CU, Math.max(0, n)) });
  };

  const toggleClear = (key: string) =>
    onPatch({ alsoClears: clears.includes(key) ? clears.filter((k) => k !== key) : [...clears, key] });

  return (
    <div className="module-fields">
      <div className="field-row">
        <label className="field field-code">
          <span>Course code</span>
          <input className="input mono" list={listId} value={code} placeholder="IS216"
            autoComplete="off" spellCheck={false} onChange={(e) => onCode(e.target.value)} />
          <datalist id={listId}>
            {Object.entries(names).map(([c, n]) => (
              <option key={c} value={c}>{n}</option>
            ))}
          </datalist>
        </label>
        <label className="field field-cu">
          <span>CU</span>
          <input className="input num" type="number" inputMode="decimal" min={0} max={MAX_CU} step={0.25}
            value={cu} onChange={(e) => onCu(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Course name</span>
        <input className="input" value={entry.name ?? ""} placeholder="Web Application Development II"
          maxLength={120} onChange={(e) => onPatch({ name: e.target.value })} />
      </label>
      {!hideTerm && (
        <label className="field">
          <span>Term</span>
          <select className="input" value={entry.term ?? ""} onChange={(e) => onPatch({ term: e.target.value })}>
            <option value="">Not placed yet</option>
            {terms.map((t) => <option key={t} value={t}>{termLabel(t)}</option>)}
          </select>
        </label>
      )}
      {earlyWarning && (
        <p className="chip chip-warn">This term is earlier than the sheet suggests. Check pre-requisites before bidding.</p>
      )}
      {grads.length > 0 && (
        <fieldset className="checks">
          <legend>Graduation requirements this course also clears</legend>
          <p className="hint">Ticked automatically when you pick a course from the list. Untick if your DPR disagrees.</p>
          {grads.map((g) => (
            <label key={g.key} className="check">
              <input type="checkbox" checked={clears.includes(g.key)} onChange={() => toggleClear(g.key)} />
              <span>{g.title}</span>
            </label>
          ))}
        </fieldset>
      )}
      <label className="field">
        <span>Notes</span>
        <textarea className="input" value={entry.note ?? ""} maxLength={600}
          placeholder="Prof, bid amount, section, why you picked it…"
          onChange={(e) => onPatch({ note: e.target.value })} />
      </label>
    </div>
  );
}
