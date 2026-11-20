"""Fetch SMU's public course catalogue (ccms.smu.edu.sg, Coursedog) into a trimmed JSON index.

Usage: python3 scripts/fetch_catalogue.py src/data/courses.json
Keeps active undergraduate courses with their course-area (AREA/TRCK) tags, which say what each course clears.
"""
import json
import re
import sys
import urllib.request

OUT = sys.argv[1]
SCHOOL = "smu_peoplesoft"
CATALOG_ID = "uWo7JLgaLmgvZNKHLPy1"
PAGE = 1000
DESC_CHARS = 140
API = (
    f"https://app.coursedog.com/api/v1/cm/{SCHOOL}/courses/search/%24filters"
    f"?catalogId={CATALOG_ID}&skip={{skip}}&limit={PAGE}&orderBy=code&includePending=false"
    "&returnResultsWithTotalCount=true"
    "&columns=code,name,longName,career,attributes,credits.creditHours,departments,description,status,gradeMode"
)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (bid-planner)",
    "Origin": "https://ccms.smu.edu.sg",
    "Referer": "https://ccms.smu.edu.sg/",
    "Content-Type": "application/json",
}


def fetch_all():
    rows, skip, total = [], 0, None
    while total is None or skip < total:
        req = urllib.request.Request(API.format(skip=skip), data=b'{"condition":"AND","filters":[]}',
                                     headers=HEADERS, method="POST")
        with urllib.request.urlopen(req, timeout=60) as res:
            body = json.load(res)
        if "data" not in body:
            raise SystemExit(f"Unexpected response: {str(body)[:200]}")
        rows += body["data"]
        total = body.get("listLength", len(rows))
        skip += PAGE
    return rows


# Only tags that map to SCIS (IS/CS/SE/SMT/C&L) requirements; the rest bloat the file.
RELEVANT = re.compile(
    r"^(Capabilities|Communities|Civilisations|University Core|Grad Req .*Intake 2024|IS Depth|IS Related|"
    r"IS/T4BS|IS Management|IS Technology|Information Systems Core \(Intake 2024|IT Solution Development|"
    r"Smart-City|Computing & Law|Software Engineering|Free Electives Only)"
)


def dept_code(dept):
    """Departments come back either as an id string or as a full department object."""
    if isinstance(dept, dict):
        return str(dept.get("displayName") or dept.get("id") or "")
    return str(dept or "")


def grade_mode(mode):
    m = str(mode or "")
    if not m or m.startswith("GRD"):
        return "G"
    return "P" if m.upper().startswith(("P", "PF", "SU", "S/U")) or "pass" in m.lower() else m[:24]


def trim(r):
    tags = [re.sub(r"^(AREA|TRCK) - ", "", a) for a in r.get("attributes", []) if a.startswith(("AREA - ", "TRCK - "))]
    tags = [t for t in tags if RELEVANT.match(t)]
    cu = (r.get("credits") or {}).get("creditHours") or {}
    desc = re.sub(r"\s+", " ", r.get("description") or "").strip()
    return {
        "c": r["code"].replace(".", ""),
        "k": r["code"],  # catalogue's own code (may contain a dot); needed for the schedule API
        "n": (r.get("longName") or r.get("name") or "").strip(),
        "u": cu.get("max") or cu.get("min") or 1,
        "s": dept_code((r.get("departments") or [""])[0]),
        "t": tags,
        "d": desc[:DESC_CHARS] + ("…" if len(desc) > DESC_CHARS else ""),
        # Grading basis: "G" graded, "P" pass/fail (or another non-letter mode, kept verbatim)
        "g": grade_mode(r.get("gradeMode")),
    }


def keep_exam_info(courses):
    """Carry over x/xt written by fetch_exams.py so refreshing the catalogue doesn't lose them."""
    try:
        with open(OUT) as f:
            old = {c["c"]: c for c in json.load(f).get("courses", [])}
    except (OSError, ValueError):
        return courses
    return [{**c, **{k: old[c["c"]][k] for k in ("x", "xt") if c["c"] in old and k in old[c["c"]]}} for c in courses]


def main():
    rows = fetch_all()
    keep = [
        trim(r) for r in rows
        if r.get("career") == "Undergraduate" and r.get("status", "Active") == "Active"
        and not r["code"].startswith("X")  # X-codes are exchange/exemption placeholders
    ]
    seen, out = set(), []
    for c in sorted(keep, key=lambda x: x["c"]):
        if c["c"] not in seen:
            seen.add(c["c"])
            out.append(c)
    out = keep_exam_info(out)
    with open(OUT, "w") as f:
        json.dump({"source": "ccms.smu.edu.sg", "courses": out}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(out)} undergraduate courses → {OUT}")


main()
