"""Add final-exam info to public/data/courses.json from SMU's public class & exam schedule (Coursedog).

Usage: python3 scripts/fetch_exams.py public/data/courses.json
For each course, checks the current term first, then earlier terms, and records whether its sections had a
scheduled Final exam. Polite: a few requests at a time.
Fields added per course: "x" = "F" (final exam), "N" (no final exam scheduled), "" (not offered in checked terms);
"xt" = term code checked (e.g. 2610 = AY26/27 T1).
"""
import json
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

PATH = sys.argv[1]  # add --missing to only re-check courses without exam info
BASE = "https://app.coursedog.com/api/v1"
SCHOOL = "smu_peoplesoft"
HEADERS = {"User-Agent": "Mozilla/5.0 (bid-planner)", "Origin": "https://ccms.smu.edu.sg", "Referer": "https://ccms.smu.edu.sg/"}
WORKERS = 4
PAUSE_S = 0.15


def get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                return json.load(res)
        except Exception as err:  # noqa: BLE001 - network hiccups: retry, then give up on this course
            if attempt == 2:
                print(f"  ! {url}: {err}", file=sys.stderr)
                return {}
            time.sleep(1 + attempt)
    return {}


def recent_terms():
    """Current term, then the regular terms before it (newest first)."""
    current = get(f"{BASE}/{SCHOOL}/general/currentTerm").get("id", "")
    terms = get(f"{BASE}/{SCHOOL}/general/terms?filterHistorical=true&sort=true").get("terms", [])
    # Regular terms look like YYT0 with T = 1 (Aug–Dec) or 2 (Jan–Apr); others are special/summer terms.
    ids = sorted({t["id"] for t in terms
                  if t.get("id", "").isdigit() and len(t["id"]) == 4 and t["id"] <= current
                  and t["id"][2] in "12" and t["id"][3] == "0"},
                 reverse=True)
    return ids[:3] or [current]


def exam_for(code, terms):
    catalog_code = code  # the API accepts the plain course code
    for term in terms:
        time.sleep(PAUSE_S)
        sections = get(f"{BASE}/ca/{SCHOOL}/sections/{term}/{catalog_code}?includeRelatedData=true").get("sections", [])
        if not sections:
            continue
        finals = [m for s in sections for m in (s.get("examMeetings") or []) if m.get("type") == "Final"]
        return ("F" if finals else "N"), term
    return "", ""


def main():
    with open(PATH) as f:
        data = json.load(f)
    terms = recent_terms()
    print("terms checked:", terms)
    courses = data["courses"]

    only_missing = "--missing" in sys.argv

    def work(c):
        if only_missing and c.get("x"):
            return c["c"], c["x"], c.get("xt", "")
        x, xt = exam_for(c.get("k") or c["c"], terms)
        return c["c"], x, xt

    results = {}
    with ThreadPoolExecutor(WORKERS) as pool:
        for i, (code, x, xt) in enumerate(pool.map(work, courses), 1):
            results[code] = (x, xt)
            if i % 100 == 0:
                print(f"  {i}/{len(courses)}")
    data["courses"] = [{**c, "x": results[c["c"]][0], "xt": results[c["c"]][1]} for c in courses]
    data["examTerms"] = terms
    with open(PATH, "w") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    counts = {k: sum(1 for c in data["courses"] if c["x"] == k) for k in ("F", "N", "")}
    print("done:", counts)


main()
