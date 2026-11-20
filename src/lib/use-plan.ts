"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createInitialState, validateState } from "./plan-actions";
import type { PlanState, Program } from "./types";

/** Plans live only in this browser's localStorage: no account, no server. Plan files move them between devices. */
const LOCAL_KEY = "bid-planner/v1";

function readLocal(): unknown {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn("Could not read the saved plan", err);
    return null;
  }
}

/** False when the browser refuses storage (private mode, blocked site data, full quota). */
function writeLocal(value: PlanState): boolean {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn("Could not save the plan in this browser", err);
    return false;
  }
}

export function usePlan(programs: Program[]) {
  const [state, setState] = useState<PlanState>(() => createInitialState(programs[0]));
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(true);
  const idsRef = useRef(programs.map((p) => p.id));

  useEffect(() => {
    const stored = readLocal();
    const local = stored ? validateState(stored, idsRef.current).state : null;
    if (local) setState(local);
    setReady(true);

    // Keep other open tabs in step with edits made here.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LOCAL_KEY || !e.newValue) return;
      try {
        const next = validateState(JSON.parse(e.newValue), idsRef.current).state;
        if (next) setState(next);
      } catch (err) {
        console.warn("Ignored an unreadable plan from another tab", err);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const commit = useCallback((next: PlanState) => {
    setState(next);
    setSaved(writeLocal(next));
  }, []);

  return { state, commit, ready, saved };
}
