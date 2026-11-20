import { examLabel, termCodeLabel, type Course } from "@/lib/courses";
import type { ReactNode } from "react";

interface Props {
  course: Course;
  /** What this course would clear for the student, e.g. ["Cultures of the Modern World", "SG & Asia Studies"]. */
  clears: string[];
  action?: ReactNode;
  selected?: boolean;
}

export default function CourseRow({ course: c, clears, action, selected }: Props) {
  const exam = examLabel(c);
  return (
    <div className={`course ${selected ? "is-selected" : ""}`}>
      <div className="course-main">
        <p className="course-title">
          <span className="mono">{c.c}</span> {c.n}
          <span className="course-cu num">{c.u} CU</span>
        </p>
        {clears.length > 0 && (
          <p className="course-clears">
            <span className="visually-hidden">Clears: </span>
            {clears.map((l) => <span key={l} className="clear-chip">{l}</span>)}
          </p>
        )}
        <p className="course-meta">
          <span
            className={`exam exam-${exam.tone}`}
            title={c.xt ? `From the exam schedule for ${termCodeLabel(c.xt)}` : "Not offered in recent terms"}
          >
            {exam.text}
          </span>
          {c.g === "P" && <span className="exam exam-none">Pass/Fail</span>}
          {c.d && <span className="course-desc">{c.d}</span>}
        </p>
      </div>
      {action && <div className="course-action">{action}</div>}
    </div>
  );
}
