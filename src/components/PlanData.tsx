"use client";

import { useState } from "react";
import { buildAiPrompt } from "@/lib/ai-import";
import { parseState } from "@/lib/plan-actions";
import type { PlanState, Program, Slot } from "@/lib/types";

interface Props {
  state: PlanState;
  onChange: (s: PlanState) => void;
  programs: Program[];
  program: Program;
  slots: Slot[];
}

/** Everything that moves a plan in or out of this browser: plan files, an AI prompt, pasted JSON. */
export default function PlanData({ state, onChange, programs, program, slots }: Props) {
  const [message, setMessage] = useState("");
  const [pasted, setPasted] = useState("");
  const ids = programs.map((p) => p.id);

  const load = (text: string, source: string) => {
    const { state: next, error } = parseState(text, ids);
    if (!next) { setMessage(error); return false; }
    onChange({ ...next, updatedAt: Date.now() });
    setMessage(`Loaded your plan from ${source}.`);
    return true;
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      load(await file.text(), file.name);
    } catch (err) {
      console.error("Couldn't read plan file", err);
      setMessage("Couldn't read that file. Pick the .json plan file again.");
    }
  };

  const saveFile = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 1)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "my-plan.json" });
    a.click();
    URL.revokeObjectURL(url);
    setMessage("Saved my-plan.json. Load it on any device to pick up where you left off.");
  };

  const copyPrompt = async () => {
    const prompt = buildAiPrompt(program, slots, programs, state);
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage("Prompt copied. Paste it into ChatGPT, Claude or Gemini with your PDF, DPR or notes attached, then paste the reply below.");
    } catch {
      setPasted(prompt);
      setMessage("Couldn't copy automatically. The prompt is in the box below: select it all and copy.");
    }
  };

  return (
    <div className="facts-block">
      <h3>Your plan&rsquo;s data</h3>
      <p className="hint">
        Everything is saved in this browser, so it&rsquo;s here when you come back. Nothing is uploaded. Clearing site data or
        switching device loses it, so save a plan file now and then.
      </p>
      <div className="button-row">
        <button type="button" className="btn btn-sm" onClick={saveFile}>Save plan file</button>
        <label className="btn btn-sm">
          Load plan file…
          <input type="file" accept="application/json,.json,.txt" className="visually-hidden"
            onChange={(e) => { void loadFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </div>

      <h3 className="plan-data-sub">Bring your plan in with AI</h3>
      <ol className="steps">
        <li>Copy the prompt (it lists every {program.label} requirement and the format this app reads).</li>
        <li>Paste it into your AI chat and attach your exported progression PDF, DPR, transcript or notes.</li>
        <li>Paste the AI&rsquo;s reply here and load it. It replaces what&rsquo;s in this browser.</li>
      </ol>
      <button type="button" className="btn btn-sm" onClick={copyPrompt}>Copy AI prompt</button>
      <textarea className="input mono backup" value={pasted} onChange={(e) => setPasted(e.target.value)}
        placeholder="Paste the AI's JSON reply (or a plan file's text) here" aria-label="Plan JSON to load" />
      <button type="button" className="btn btn-primary btn-sm" disabled={!pasted.trim()}
        onClick={() => { if (load(pasted, "the pasted text")) setPasted(""); }}>
        Load pasted plan
      </button>
      {message && <p className="notice" role="status">{message}</p>}
    </div>
  );
}
