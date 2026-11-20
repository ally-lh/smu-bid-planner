import {
  CLEARED, STATUSES, compareTerms, gradStatus, termCalendar, termLabel, type SectionProgress,
} from "@/lib/model";
import { universitiesOf } from "@/lib/exchange";
import type { PlacedModule, PlanState, Program, ProgramPlan, Slot, TermId } from "@/lib/types";

interface Props {
  program: Program;
  state: PlanState;
  slots: Slot[];
  plan: ProgramPlan;
  modules: PlacedModule[];
  progress: SectionProgress[];
  totals: { total: number; done: number; planned: number };
  /** Client-side only: dates can't be read while prerendering. */
  ready: boolean;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));
const statusLabel = (id: string) => STATUSES.find((s) => s.id === id)?.label ?? "";
const termCu = (mods: PlacedModule[]) => mods.reduce((acc, m) => acc + m.cu, 0);

/** Print-only course progression for a course counsellor. Hidden on screen; Export PDF prints it. */
export default function ProgressionReport({ program, state, slots, plan, modules, progress, totals, ready }: Props) {
  const { settings } = state;
  const placed = modules.filter((m) => m.term && m.status !== "none");
  const terms = Array.from(new Set(placed.map((m) => m.term as TermId))).sort(compareTerms);
  const exempted = modules.filter((m) => !m.term && CLEARED.has(m.status));
  const unplaced = modules.filter((m) => m.kind === "slot" && !m.term && !CLEARED.has(m.status));
  const grads = slots.filter((s) => s.grad);
  const exchanges = universitiesOf(state).filter((u) => u.status !== "dropped" && u.modules.some((m) => m.slotKey));
  const slotTitle = (key: string) => slots.find((s) => s.key === key)?.title ?? "";
  const remaining = Math.max(0, totals.total - totals.done - totals.planned);
  const generated = ready && new Date().toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" });

  return (
    <article className="report">
      <header className="report-head">
        <p className="report-eyebrow">SMU · School of Computing and Information Systems</p>
        <h1>Course progression plan</h1>
        <dl className="report-meta">
          {settings.studentName && <div><dt>Student</dt><dd>{settings.studentName}</dd></div>}
          <div><dt>Programme</dt><dd>{program.label}</dd></div>
          <div><dt>Intake</dt><dd>AY{settings.intakeYear}/{String(settings.intakeYear + 1).slice(2)}</dd></div>
          {settings.track && <div><dt>Track</dt><dd>{settings.track}</dd></div>}
          {settings.gpa !== undefined && <div><dt>GPA</dt><dd>{settings.gpa.toFixed(2)}</dd></div>}
          {settings.exchangeTerm && <div><dt>Exchange</dt><dd>{termLabel(settings.exchangeTerm)}</dd></div>}
          {generated && <div><dt>Generated</dt><dd>{generated}</dd></div>}
        </dl>
      </header>

      <section>
        <h2>Summary</h2>
        <p>
          <strong>{fmt(totals.done)}</strong> of {fmt(totals.total)} CU cleared · {fmt(totals.planned)} CU taking or planned ·{" "}
          {fmt(remaining)} CU not yet placed.
        </p>
        <table>
          <thead><tr><th>Requirement area</th><th className="r">Needed</th><th className="r">Cleared</th><th className="r">Planned</th></tr></thead>
          <tbody>
            {progress.filter((p) => !p.grad).map((p) => (
              <tr key={p.index}>
                <td>{p.name}</td>
                <td className="r">{fmt(p.total)}</td>
                <td className="r">{fmt(Math.min(p.done, p.total))}</td>
                <td className="r">{fmt(Math.max(0, Math.min(p.planned, p.total - p.done)))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Term by term</h2>
        {terms.map((t) => {
          const mods = placed.filter((m) => m.term === t);
          const { ay, months } = termCalendar(t, settings.intakeYear);
          return (
            <div key={t} className="report-term">
              <h3>
                {termLabel(t)} <span className="report-sub">{ay} · {months}{t === settings.exchangeTerm ? " · Exchange" : ""}</span>
                <span className="report-cu">{fmt(termCu(mods))} CU</span>
              </h3>
              <ModuleTable mods={mods} />
            </div>
          );
        })}
      </section>

      {exempted.length > 0 && (
        <section>
          <h2>Exemptions and credit transfers</h2>
          <ModuleTable mods={exempted} />
        </section>
      )}

      {unplaced.length > 0 && (
        <section>
          <h2>Requirements not yet scheduled</h2>
          <ul className="report-list">
            {unplaced.map((m) => <li key={m.ref}>{m.label} <span className="report-sub">({m.slot?.sectionName}, {fmt(m.cu)} CU)</span></li>)}
          </ul>
        </section>
      )}

      <section>
        <h2>Graduation requirements</h2>
        <table>
          <thead><tr><th>Requirement</th><th>Cleared by</th><th>Status</th></tr></thead>
          <tbody>
            {grads.map((g) => {
              const { status, by } = gradStatus(g, plan, modules);
              return (
                <tr key={g.key}>
                  <td>{g.title}</td>
                  <td>{by.map((m) => [m.code, m.name].filter(Boolean).join(" ") || m.label).join(", ") || "—"}</td>
                  <td>{statusLabel(status)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {exchanges.length > 0 && (
        <section>
          <h2>Exchange course mapping (proposed)</h2>
          {exchanges.map((u) => (
            <div key={u.id} className="report-term">
              <h3>
                {u.name}{u.country ? `, ${u.country}` : ""}
                <span className="report-sub">{u.term ? ` · ${termLabel(u.term)}` : ""} · {u.status}</span>
              </h3>
              <table>
                <thead><tr><th>Host course</th><th>Maps to</th><th className="r">CU</th></tr></thead>
                <tbody>
                  {u.modules.filter((m) => m.slotKey).map((m) => (
                    <tr key={m.id}>
                      <td><span className="mono">{m.code}</span> {m.name}</td>
                      <td>{slotTitle(m.slotKey)}</td>
                      <td className="r">{fmt(m.cu)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}

      <footer className="report-foot">
        Planned modules are intentions, not enrolments. Verify against the Degree Progress Report (DPR) in OASIS.
      </footer>
    </article>
  );
}

function ModuleTable({ mods }: { mods: PlacedModule[] }) {
  return (
    <table className="report-modules">
      <colgroup><col style={{ width: "48%" }} /><col style={{ width: "36%" }} /><col style={{ width: "5%" }} /><col /></colgroup>
      <thead><tr><th>Course</th><th>Counts as</th><th className="r">CU</th><th>Status</th></tr></thead>
      <tbody>
        {mods.map((m) => (
          <tr key={m.ref}>
            <td><span className="mono">{m.code}</span> {m.name || <em>Course to be chosen</em>}</td>
            <td>{m.label}</td>
            <td className="r">{fmt(m.cu)}</td>
            <td>{statusLabel(m.status)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
