import {
  STATUSES, entryOf, gradStatus, termLabel, windowChips, type SectionProgress,
} from "@/lib/model";
import { addExtra } from "@/lib/plan-actions";
import type { PlacedModule, PlanState, Program, ProgramPlan, Slot } from "@/lib/types";
import type { EditTarget } from "./Editor";
import { sectionTone } from "./ModuleCard";

interface Props {
  program: Program;
  slots: Slot[];
  plan: ProgramPlan;
  modules: PlacedModule[];
  progress: SectionProgress[];
  state: PlanState;
  onChange: (s: PlanState) => void;
  onOpen: (t: EditTarget) => void;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));
const statusLabel = (id: string) => STATUSES.find((s) => s.id === id)?.label ?? "";

export default function Requirements({ program, slots, plan, modules, progress, state, onChange, onOpen }: Props) {
  const addExtraModule = () => {
    const { state: next, id } = addExtra(state, { label: "Extra module", status: "planned", cu: 1 });
    onChange(next);
    onOpen({ kind: "extra", id });
  };

  return (
    <div className="ledger">
      {program.sections.map((section, si) => {
        const p = progress[si];
        const mine = slots.filter((s) => s.sectionIndex === si);
        return (
          <section key={si} className={`ledger-section tone-${sectionTone(section.name)}`}>
            <header className="ledger-head">
              <h2>{section.name}</h2>
              <p className="ledger-count num">
                {p.grad
                  ? `${p.done} of ${p.total} cleared`
                  : `${fmt(p.done)} cleared · ${fmt(p.planned)} planned · ${fmt(p.total)} CU needed`}
              </p>
            </header>
            <ul className="ledger-rows">
              {mine.map((slot) => (
                <li key={slot.key}>
                  {slot.grad
                    ? <GradRow slot={slot} plan={plan} modules={modules} onOpen={onOpen} />
                    : <SlotRow slot={slot} plan={plan} onOpen={onOpen} />}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className="ledger-section tone-extra">
        <header className="ledger-head">
          <h2>Extra modules</h2>
          <p className="ledger-count">Second major, double degree, overloads, or anything not in the sheet.</p>
        </header>
        <ul className="ledger-rows">
          {plan.extras.map((x) => (
            <li key={x.id}>
              <button type="button" className="row" onClick={() => onOpen({ kind: "extra", id: x.id })}>
                <span className="row-req">{x.label || "Extra module"}</span>
                <span className="row-module">
                  {x.code && <span className="mono">{x.code}</span>} {x.name || <em>No module yet</em>}
                </span>
                <span className="row-side">
                  {x.term && <span className="chip">{termLabel(x.term)}</span>}
                  <span className={`status status-${x.status ?? "planned"}`}>{statusLabel(x.status ?? "planned")}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="ledger-foot">
          <button type="button" className="btn btn-sm" onClick={addExtraModule}>+ Add extra module</button>
        </div>
      </section>
    </div>
  );
}

function SlotRow({ slot, plan, onOpen }: { slot: Slot; plan: ProgramPlan; onOpen: (t: EditTarget) => void }) {
  const e = entryOf(plan, slot.key);
  const status = e.status ?? "none";
  return (
    <button type="button" className="row" onClick={() => onOpen({ kind: "slot", key: slot.key })}>
      <span className="row-req">
        {slot.title}
        {slot.compulsory && <span className="row-tag">Compulsory</span>}
        {slot.exchange && <span className="row-tag row-tag-exchange">Exchange OK</span>}
      </span>
      <span className="row-module">
        {e.code || e.name ? (
          <>{e.code && <span className="mono">{e.code}</span>} {e.name}</>
        ) : slot.suggestedCode ? (
          <span className="row-hint"><span className="mono">{slot.suggestedCode}</span> {slot.suggestedName}</span>
        ) : (
          <em>Choose a module</em>
        )}
      </span>
      <span className="row-side">
        {e.term
          ? <span className="chip chip-pasg">{termLabel(e.term)}</span>
          : windowChips(slot.window).slice(0, 2).map((c) => (
            <span key={c.text} className={`chip ${c.kind === "pasg" ? "chip-pasg" : ""}`}>{c.text}</span>
          ))}
        <span className={`status status-${status}`}>{statusLabel(status)}</span>
      </span>
    </button>
  );
}

function GradRow({ slot, plan, modules, onOpen }: {
  slot: Slot; plan: ProgramPlan; modules: PlacedModule[]; onOpen: (t: EditTarget) => void;
}) {
  const { status, by } = gradStatus(slot, plan, modules);
  return (
    <button type="button" className="row" onClick={() => onOpen({ kind: "slot", key: slot.key })}>
      <span className="row-req">{slot.title}</span>
      <span className="row-module">
        {by.length
          ? <>Cleared by {by.map((m) => m.code || m.name || m.label).join(", ")}</>
          : <em>Tag a module that clears this</em>}
      </span>
      <span className="row-side">
        <span className={`status status-${status}`}>{statusLabel(status)}</span>
      </span>
    </button>
  );
}
