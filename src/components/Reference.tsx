import type { Program } from "@/lib/types";

const SHEET_URL = "https://docs.google.com/spreadsheets/d/1BsFDCIxF9m6EU_xIGCseESiO9mWxK2VVEBOCvqnd6i8/edit";

interface Props {
  program: Program;
  reference: Record<string, string[]>;
}

/** Pick the reference sheets relevant to the programme first. */
function orderFor(program: Program, keys: string[]) {
  const prefix = program.id.split("-")[0];
  const wants = prefix === "cs" ? "CS" : prefix === "smt" ? "SMT" : "IS";
  return [...keys].sort((a, b) => Number(b.includes(wants)) - Number(a.includes(wants)));
}

export default function Reference({ program, reference }: Props) {
  return (
    <div className="reference">
      <section className="ref-card">
        <h2>Notes for {program.label}</h2>
        <ul className="ref-notes">
          {program.notes.map((n, i) => <li key={i}>{n.replace(/^[#*^@]+\s*/, "")}</li>)}
        </ul>
        <p className="hint">
          Source: SCIS course-sequence sheet, tab <span className="mono">{program.sheet}</span>.{" "}
          <a href={SHEET_URL} target="_blank" rel="noreferrer">Open the sheet</a>
        </p>
      </section>
      {orderFor(program, Object.keys(reference)).map((name) => (
        <details key={name} className="ref-card" open={name.includes("Tracks") && orderFor(program, Object.keys(reference))[0] === name}>
          <summary><h2>{name}</h2></summary>
          <div className="ref-table">
            {reference[name].map((line, i) => {
              const cells = line.split(" | ");
              return (
                <div key={i} className={`ref-line ${cells.length > 1 ? "is-row" : ""}`}>
                  {cells.map((c, j) => <span key={j}>{c}</span>)}
                </div>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}
