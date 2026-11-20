"use client";

import { useState } from "react";
import {
  CLEARED, STATUSES, earlierThanWindow, entryOf, gradStatus, planFor, plannedByCode, termLabel, windowChips,
} from "@/lib/model";
import { addExtra, assignCourse, clearEntry, removeExtra, updateEntry, updateExtra } from "@/lib/plan-actions";
import { gradKeysFor, type Course } from "@/lib/courses";
import CourseFinder from "./CourseFinder";
import type { Entry, PlacedModule, PlanState, Slot, Status, TermId } from "@/lib/types";
import Sheet from "./Sheet";
import ModuleFields from "./ModuleFields";

export type EditTarget =
  | { kind: "slot"; key: string }
  | { kind: "extra"; id: string }
  | { kind: "new"; term: TermId };

interface Props {
  target: EditTarget | null;
  onClose: () => void;
  state: PlanState;
  onChange: (s: PlanState) => void;
  slots: Slot[];
  modules: PlacedModule[];
  terms: TermId[];
  catalogue: Record<string, string>;
}

export default function Editor(props: Props) {
  const { target, onClose } = props;
  // Keep showing the last target while the sheet animates out.
  const [shown, setShown] = useState<EditTarget | null>(target);
  if (target && target !== shown) setShown(target);
  const t = target ?? shown;

  let title = "Module";
  let eyebrow = "";
  let body: React.ReactNode = null;
  if (t?.kind === "slot") {
    const slot = props.slots.find((s) => s.key === t.key);
    if (slot) {
      title = slot.title;
      eyebrow = slot.sectionName;
      body = slot.grad ? <GradEditor slot={slot} {...props} /> : <SlotEditor slot={slot} {...props} />;
    }
  } else if (t?.kind === "extra") {
    title = "Extra module";
    eyebrow = "Outside the sheet";
    body = <ExtraEditor id={t.id} {...props} />;
  } else if (t?.kind === "new") {
    title = `Add to ${termLabel(t.term)}`;
    eyebrow = "New module";
    body = <NewEditor key={t.term} term={t.term} {...props} />;
  }

  return (
    <Sheet open={Boolean(target)} onClose={onClose} title={title} eyebrow={eyebrow}>
      {body}
    </Sheet>
  );
}

/** Plain-language answer to "what does this module clear?" */
function ClearsSummary({ slot, entry, grads }: { slot: Slot; entry: Entry; grads: Slot[] }) {
  const also = grads.filter((g) => entry.alsoClears?.includes(g.key)).map((g) => g.title);
  return (
    <div className="clears-box">
      <p className="clears-course">
        {entry.code || entry.name
          ? <><span className="mono">{entry.code}</span> {entry.name}</>
          : <em>No course picked yet</em>}
      </p>
      <p className="clears-line">
        <span className="clears-label">Counts as</span>
        <span className="clear-chip">{slot.title}</span>
        <span className="hint">{slot.sectionName} · {entry.cu ?? slot.cu} CU</span>
      </p>
      <p className="clears-line">
        <span className="clears-label">Also clears</span>
        {also.length
          ? also.map((t) => <span key={t} className="clear-chip is-grad">{t}</span>)
          : <span className="hint">No graduation requirement</span>}
      </p>
    </div>
  );
}

function StatusPicker({ value, onPick, label = "Status" }: { value: Status; onPick: (s: Status) => void; label?: string }) {
  return (
    <fieldset className="segmented">
      <legend>{label}</legend>
      {STATUSES.map((s) => (
        <label key={s.id} className={`seg seg-${s.id}`}>
          <input type="radio" name="status" checked={value === s.id} onChange={() => onPick(s.id)} />
          <span>{s.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function SheetFacts({ slot }: { slot: Slot }) {
  const chips = windowChips(slot.window);
  return (
    <dl className="facts">
      {slot.fullTitle !== slot.title && (<div><dt>Sheet says</dt><dd>{slot.fullTitle}</dd></div>)}
      {chips.length > 0 && (
        <div><dt>When</dt><dd className="chips">{chips.map((c) => (
          <span key={c.text} className={`chip ${c.kind === "pasg" ? "chip-pasg" : ""}`}>{c.text}</span>
        ))}</dd></div>
      )}
      {slot.exchange && (<div><dt>Exchange</dt><dd>Can be cleared on exchange (map it in the OASIS exchange worksheet)</dd></div>)}
      {slot.prereq && (<div><dt>Pre/co-req</dt><dd>{slot.prereq}</dd></div>)}
      {slot.ec && (<div><dt>Exploratory</dt><dd>{slot.ec.startsWith("Y") || slot.ec === "^" ? "Can declare as Exploratory Course" : slot.ec.startsWith("N") ? "Cannot be Exploratory Course" : slot.ec}</dd></div>)}
      {slot.detail && (<div><dt>Note</dt><dd>{slot.detail}</dd></div>)}
    </dl>
  );
}

function SlotEditor({ slot, state, onChange, slots, modules, terms, catalogue, onClose }: Props & { slot: Slot }) {
  const e = entryOf(planFor(state), slot.key);
  const set = (patch: Entry) => onChange(updateEntry(state, slot.key, patch));
  const status = e.status ?? "none";
  const grads = slots.filter((s) => s.grad);
  const track = state.settings.track ?? "";
  const pickCourse = (c: Course) =>
    onChange(assignCourse(state, slot.key, { code: c.c, name: c.n, cu: c.u }, gradKeysFor(c, grads)));
  return (
    <div className="editor">
      <ClearsSummary slot={slot} entry={e} grads={grads} />
      <StatusPicker value={status} onPick={(s) => set({ status: s })} />
      <label className="field">
        <span>Term</span>
        <select className="input" value={e.term ?? ""} onChange={(ev) => set({ term: ev.target.value })}>
          <option value="">Not placed yet</option>
          {terms.map((t) => (
            <option key={t} value={t}>{termLabel(t)}{t === state.settings.exchangeTerm ? " (exchange)" : ""}</option>
          ))}
        </select>
      </label>
      {e.term && e.term === state.settings.exchangeTerm && !slot.exchange && (
        <p className="chip chip-warn">The sheet doesn&rsquo;t list {slot.title} as clearable on exchange.</p>
      )}
      {!slot.suggestedCode && status !== "exempt" && (
        <CourseFinder slot={slot} track={track} currentCode={e.code ?? ""} taken={plannedByCode(modules)} onPick={pickCourse} />
      )}
      {!e.code && slot.suggestedCode && (
        <button
          type="button"
          className="btn btn-sm suggestion"
          onClick={() => set({ code: slot.suggestedCode, name: slot.suggestedName, status: status === "none" ? "planned" : status, term: e.term || slot.pasg || undefined })}
        >
          Use {slot.suggestedCode} {slot.suggestedName}{slot.pasg ? ` in ${termLabel(slot.pasg)}` : ""}
        </button>
      )}
      <details className="manual">
        <summary>Edit details by hand (code, CU, grad requirements, notes)</summary>
        <ModuleFields
          entry={e}
          defaultCu={slot.cu}
          terms={terms}
          catalogue={catalogue}
          grads={grads}
          onPatch={set}
          hideTerm
          earlyWarning={earlierThanWindow(slot, e.term ?? "")}
        />
      </details>
      <SheetFacts slot={slot} />
      {status === "exempt" && (
        <p className="hint">Exempted requirements count as cleared. If the exemption is replaced by another course (e.g. a free elective), add that as an extra module.</p>
      )}
      <div className="editor-actions">
        <button type="button" className="btn btn-danger btn-sm" onClick={() => { onChange(clearEntry(state, slot.key)); onClose(); }}>
          Clear this slot
        </button>
        <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function GradEditor({ slot, state, onChange, modules, onClose }: Props & { slot: Slot }) {
  const plan = planFor(state);
  const own = entryOf(plan, slot.key);
  const { status, by } = gradStatus(slot, plan, modules);
  return (
    <div className="editor">
      <SheetFacts slot={slot} />
      <div className="facts-block">
        <h3>Modules that clear this</h3>
        {by.length ? (
          <ul className="plain-list">
            {by.map((m) => (
              <li key={m.ref}>
                <span className="mono">{m.code}</span> {m.name || m.label}
                {" · "}{CLEARED.has(m.status) ? "cleared" : m.term ? termLabel(m.term) : "planned"}
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">None yet. Open any module and tick “{slot.title}” under Also clears. A course with the matching “Grad –” attribute in BOSS can double-count.</p>
        )}
      </div>
      <StatusPicker
        label={`Mark directly (currently ${STATUSES.find((s) => s.id === status)?.label})`}
        value={own.status ?? "none"}
        onPick={(s) => onChange(updateEntry(state, slot.key, { status: s }))}
      />
      <label className="field">
        <span>Note</span>
        <textarea className="input" value={own.note ?? ""} placeholder="e.g. Exchange to Korea Univ, Y3T2"
          onChange={(ev) => onChange(updateEntry(state, slot.key, { note: ev.target.value }))} />
      </label>
      <div className="editor-actions">
        <span />
        <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function ExtraEditor({ id, state, onChange, slots, terms, catalogue, onClose }: Props & { id: string }) {
  const x = planFor(state).extras.find((e) => e.id === id);
  if (!x) return <p className="hint">This module was removed.</p>;
  const set = (patch: Partial<typeof x>) => onChange(updateExtra(state, id, patch));
  return (
    <div className="editor">
      <label className="field">
        <span>Counts towards</span>
        <input className="input" value={x.label} placeholder="e.g. 2nd Major: Analytics core"
          onChange={(ev) => set({ label: ev.target.value })} />
      </label>
      <StatusPicker value={x.status ?? "planned"} onPick={(s) => set({ status: s })} />
      <ModuleFields entry={x} defaultCu={1} terms={terms} catalogue={catalogue}
        grads={slots.filter((s) => s.grad)} onPatch={set} />
      <div className="editor-actions">
        <button type="button" className="btn btn-danger btn-sm" onClick={() => { onChange(removeExtra(state, id)); onClose(); }}>
          Remove module
        </button>
        <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function NewEditor({ term, state, onChange, slots, modules, terms, catalogue, onClose }: Props & { term: TermId }) {
  const open = modules.filter((m) => m.kind === "slot" && !m.term && !CLEARED.has(m.status));
  const [target, setTarget] = useState<string>(open[0]?.ref ?? "extra");
  const [draft, setDraft] = useState<Entry>({ term, status: "planned" });
  const slot = slots.find((s) => s.key === target) ?? null;
  const grads = slots.filter((s) => s.grad);
  const patch = (p: Entry) => setDraft((d) => ({ ...d, ...p }));

  // A different requirement means a different course list, so drop the course picked for the old one.
  const pickTarget = (key: string) => {
    setTarget(key);
    setDraft((d) => ({ term, status: "planned", ...(d.note ? { note: d.note } : {}) }));
  };
  const pickCourse = (c: Course) => patch({ code: c.c, name: c.n, cu: c.u, alsoClears: gradKeysFor(c, grads) });

  const save = () => {
    if (slot) {
      onChange(updateEntry(state, slot.key, { ...draft, term, cu: draft.cu ?? slot.cu }));
    } else {
      onChange(addExtra(state, { label: "Extra module", ...draft, term, cu: draft.cu ?? 1 }).state);
    }
    onClose();
  };

  return (
    <div className="editor">
      <label className="field">
        <span>Counts towards</span>
        <select className="input" value={target} onChange={(ev) => pickTarget(ev.target.value)}>
          {Array.from(new Set(open.map((m) => m.slot?.sectionName))).map((section) => (
            <optgroup key={section} label={section}>
              {open.filter((m) => m.slot?.sectionName === section).map((m) => (
                <option key={m.ref} value={m.ref}>{m.label}</option>
              ))}
            </optgroup>
          ))}
          <option value="extra">Extra module (not in the sheet)</option>
        </select>
      </label>
      {slot && <ClearsSummary slot={slot} entry={draft} grads={grads} />}
      {slot?.suggestedCode ? (
        draft.code !== slot.suggestedCode && (
          <button type="button" className="btn btn-sm suggestion"
            onClick={() => patch({ code: slot.suggestedCode, name: slot.suggestedName })}>
            Use {slot.suggestedCode} {slot.suggestedName}
          </button>
        )
      ) : (
        <CourseFinder key={target} slot={slot} track={state.settings.track ?? ""} currentCode={draft.code ?? ""}
          taken={plannedByCode(modules)} onPick={pickCourse} />
      )}
      <details className="manual">
        <summary>Edit details by hand (code, CU, grad requirements, notes)</summary>
        <ModuleFields entry={draft} defaultCu={slot?.cu ?? 1} terms={terms} catalogue={catalogue}
          grads={grads} onPatch={patch} hideTerm earlyWarning={earlierThanWindow(slot, term)} />
      </details>
      {slot && <SheetFacts slot={slot} />}
      <div className="editor-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={save}>Add to {termLabel(term)}</button>
      </div>
    </div>
  );
}
