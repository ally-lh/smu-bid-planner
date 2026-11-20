@AGENTS.md

# SMU Bid Planner

## Module planning memory

`PLAN.md` (gitignored, local only) is the source of truth for my real degree plan (programme, exemptions, term-by-term modules, grad-requirement mapping, decisions). Read it at the start of any conversation about modules, bidding, or graduation requirements. When we decide something (pick a module, move a term, confirm an exemption), update the relevant table and add a dated line to the **Decisions log**. Keep it short and factual.

## App

- Next.js 16 App Router, client-rendered planner in `src/components`, pure logic in `src/lib/model.ts` and `src/lib/plan-actions.ts` (immutable updates, unit-tested in `src/lib/model.test.ts`).
- Curriculum data: `src/data/curriculum.json`, generated from the SCIS course-progression workbook by `scripts/parse_workbook.py <workbook.xlsx> src/data/curriculum.json`.
- Course catalogue: `public/data/courses.json` (lazy-loaded) from `scripts/fetch_catalogue.py` + `scripts/fetch_exams.py`. Requirement → course-area mapping lives in `src/lib/courses.ts` (`ruleFor`).
- Exchange tab: rules + eligibility in `src/lib/exchange.ts`, shortlist actions in `src/lib/exchange-actions.ts` (stored as `state.exchange`, validated by `exchange-validate.ts`). Partner lists/GPA cut-offs/mappings aren't public (OASIS), so universities are entered by hand.
- Export PDF prints `src/components/ProgressionReport.tsx` (print-only) via the browser's Save as PDF.
- My plan as an app file: `private/my-plan.json` (gitignored; keep in sync with PLAN.md, I load it via Settings → Load plan file). Never commit personal data (GPA, DPR, plan): the repo and GitHub Pages site are public. A fresh device starts blank.
- Persistence: browser localStorage only (no database, by choice). Plans move between devices as plan files or via the "Copy AI prompt" import (`src/lib/ai-import.ts`).
- Deploy: GitHub Pages static export via `.github/workflows/pages.yml` (https://ally-lh.github.io/smu-bid-planner/). OG image is `public/og.png` (1200×630).
- Checks: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
