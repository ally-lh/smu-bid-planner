import { CLEARED, gradStatus, type SectionProgress } from "@/lib/model";
import type { PlacedModule, ProgramPlan, Slot } from "@/lib/types";

interface Props {
  programLabel: string;
  totals: { total: number; done: number; planned: number };
  progress: SectionProgress[];
  modules: PlacedModule[];
  slots: Slot[];
  plan: ProgramPlan;
}

const pct = (n: number, d: number) => (d > 0 ? Math.min(100, (n / d) * 100) : 0);
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

export default function Summary({ programLabel, totals, progress, modules, slots, plan }: Props) {
  const remaining = Math.max(0, totals.total - totals.done - totals.planned);
  const gradSlots = slots.filter((s) => s.grad);
  const gradCleared = gradSlots.filter((s) => CLEARED.has(gradStatus(s, plan, modules).status)).length;
  const unscheduled = modules.filter(
    (m) => m.kind === "slot" && !m.term && !CLEARED.has(m.status),
  ).length;

  return (
    <section className="summary" aria-label="Degree progress">
      <div className="summary-head">
        <p className="summary-program">{programLabel}</p>
        <p className="summary-figure">
          <span className="num">{fmt(totals.done)}</span>
          <span className="summary-of"> / {fmt(totals.total)} CU cleared</span>
        </p>
      </div>

      <div
        className="meter"
        role="img"
        aria-label={`${fmt(totals.done)} CU cleared, ${fmt(totals.planned)} planned, ${fmt(remaining)} not yet placed`}
      >
        <span className="meter-done" style={{ width: `${pct(totals.done, totals.total)}%` }} />
        <span className="meter-planned" style={{ width: `${pct(totals.planned, totals.total)}%` }} />
      </div>

      <dl className="stats">
        <div><dt>Cleared</dt><dd className="num">{fmt(totals.done)} CU</dd></div>
        <div><dt>Taking &amp; planned</dt><dd className="num">{fmt(totals.planned)} CU</dd></div>
        <div><dt>Still to place</dt><dd className="num">{fmt(remaining)} CU</dd></div>
        <div><dt>Grad requirements</dt><dd className="num">{gradCleared} / {gradSlots.length}</dd></div>
        <div><dt>Slots without a term</dt><dd className="num">{unscheduled}</dd></div>
      </dl>

      <ul className="section-bars">
        {progress.filter((p) => !p.grad).map((p) => (
          <li key={p.index}>
            <span className="section-bars-name">{p.name}</span>
            <span className="mini-meter" aria-hidden="true">
              <span className="meter-done" style={{ width: `${pct(p.done, p.total)}%` }} />
              <span className="meter-planned" style={{ width: `${pct(Math.min(p.planned, p.total - p.done), p.total)}%` }} />
            </span>
            <span className="section-bars-value num">{fmt(p.done + p.planned)}/{fmt(p.total)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
