"use client";

import { useEffect, useState } from "react";
import { loadCourses, type Course } from "./courses";

/** Lazily loads the catalogue the first time a component needs it. */
export function useCourses(): { courses: Course[]; loading: boolean } {
  const [courses, setCourses] = useState<Course[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadCourses().then((c) => { if (alive) setCourses(c); });
    return () => { alive = false; };
  }, []);
  return { courses: courses ?? [], loading: courses === null };
}
