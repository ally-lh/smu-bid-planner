import { STATUSES } from "@/lib/model";
import { examLabel, type Course } from "@/lib/courses";
import type { PlacedModule, Slot } from "@/lib/types";

interface Props {
  module: PlacedModule;
  grads: Slot[];
  compact?: boolean;
  early?: boolean;
  notOnExchange?: boolean;
  /** Catalogue entry for this module's code, if known. */
  course?: Course;
  onOpen: () => void;
}

export function sectionTone(sectionName: string | undefined): string {
  if (!sectionName) return "extra";
  const name = sectionName.toLowerCase();
  if (name.includes("uni core")) return "uni";
  if (name.includes("free")) return "free";
  if (name.includes("elective")) return "elective";
  if (name.includes("graduation")) return "grad";
  return "core";
}

/** The requirement line under the module name, skipping it when it would repeat the name. */
function reqLine(m: PlacedModule): string {
  const section = m.slot?.sectionName ?? m.label;
  if (!m.code && !m.name) return section;
  const repeats = (m.code && m.label.includes(m.code)) || (m.name && m.label.includes(m.name));
  return repeats ? section : m.label;
}

export default function ModuleCard({ module: m, grads, compact, early, notOnExchange, course, onOpen }: Props) {
  const status = STATUSES.find((s) => s.id === m.status)?.label ?? "";
  const clears = grads.filter((g) => m.alsoClears.includes(g.key)).map((g) => g.title);
  const heading = m.code || m.name ? (
    <>
      {m.code && <span className="card-code mono">{m.code}</span>}
      <span className="card-name">{m.name || m.label}</span>
    </>
  ) : (
    <span className="card-name card-name-empty">{m.label}</span>
  );

  return (
    <button
      type="button"
      className={`card tone-${sectionTone(m.slot?.sectionName)} ${compact ? "is-compact" : ""} ${m.suggested ? "is-suggested" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", m.ref);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
    >
      <span className="card-title">{heading}</span>
      <span className="card-req">{reqLine(m)}</span>
      {!compact && (
        <span className="card-meta">
          <span className={`status status-${m.status}`}>{m.suggested ? "Suggested" : status}</span>
          <span className="card-cu num">{m.cu} CU</span>
        </span>
      )}
      {!compact && course && !["done", "exempt"].includes(m.status) && (
        <span className="card-exam">
          <span className={`exam exam-${examLabel(course).tone}`}>{examLabel(course).text}</span>
          {course.g === "P" && <span className="exam exam-none">Pass/Fail</span>}
        </span>
      )}
      {!compact && clears.length > 0 && (
        <span className="card-clears">Also clears: {clears.join(", ")}</span>
      )}
      {early && <span className="chip chip-warn">Earlier than the sheet suggests</span>}
      {notOnExchange && <span className="chip chip-warn">Not clearable on exchange</span>}
    </button>
  );
}
