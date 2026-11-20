# SMU Bid Planner

Plan SMU SCIS modules term by term (Y1 T1 to Y5 T1/T2), see which requirement each module clears, tag the graduation requirements a module double-counts for, and mark exemptions.

Requirements come from the SCIS *General Course Progression* sheet (IS, SMT, CS, SE and C&L programmes, by intake year).

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests for the planning logic
```

## Live site

Deployed to GitHub Pages at **https://ally-lh.github.io/smu-bid-planner/** by `.github/workflows/pages.yml` on every push to `main` (static export; `GITHUB_PAGES_BASE` sets the base path). In the repo settings, Pages → Source must be **GitHub Actions**.

## Where plans are kept

There's no account or database. Each plan is saved in the visitor's browser (localStorage), so it's still there when they come back on the same browser. To move a plan or keep a copy, use **Programme & settings → Your plan's data**:

- **Save / Load plan file**: a `my-plan.json` with everything (modules, notes, exchange shortlist).
- **Copy AI prompt**: paste it into ChatGPT, Claude or Gemini with an exported progression PDF, DPR or notes attached. The reply is JSON the app loads directly ("Load pasted plan").

**Export PDF** (top bar) prints a course progression report for a course counsellor; choose "Save as PDF" in the print dialog.

## Course catalogue, exams and grading

`public/data/courses.json` powers the **Find modules** tab and the "Pick a course" list. It comes from SMU's public course catalogue (ccms.smu.edu.sg):

```bash
python3 scripts/fetch_catalogue.py public/data/courses.json   # courses, course-area tags, grading basis
python3 scripts/fetch_exams.py public/data/courses.json       # final exam yes/no from the published exam schedule
```

Exam info = whether the course's sections had a scheduled Final in the latest term it ran (current term first, then the two before). Assessment breakdowns (projects, quizzes) aren't public; check the course outline in BOSS.

## Updating the curriculum

Download the sheet as `.xlsx`, then:

```bash
python3 scripts/parse_workbook.py path/to/sheet.xlsx src/data/curriculum.json
```
