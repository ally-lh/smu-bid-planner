"""Parse SMU SCIS course-progression workbook into planner JSON."""
import json
import re
import sys

import openpyxl

SRC, OUT = sys.argv[1], sys.argv[2]

PROGRAMS = [
    # (sheet, id, label)
    ("SCIS_2024_IS", "is-2024", "BSc (IS) · Information Systems · AY2024+"),
    ("SCIS_2023_IS", "is-2023", "BSc (IS) · Information Systems · AY2023"),
    ("SCIS_2021&2022_IS", "is-2021", "BSc (IS) · Information Systems · AY2021–22"),
    ("SCIS_2023_SMT", "smt-2023", "BSc (IS) · Smart-City Mgmt & Tech · AY2023"),
    ("SCIS_2022_SMT", "smt-2022", "BSc (IS) · Smart-City Mgmt & Tech · AY2022"),
    ("SCIS_2026_CS", "cs-2026", "BSc (CS) · IT Solution Development · AY2026+"),
    ("SCIS_2024-2025_CS", "cs-2024", "BSc (CS) · IT Solution Development · AY2024–25"),
    ("SCIS_2023_CS", "cs-2023", "BSc (CS) · IT Solution Development · AY2023"),
    ("SCIS_2020-2022_CS", "cs-2020", "BSc (CS) · IT Solution Development · AY2020–22"),
    ("SCIS_2019_CS", "cs-2019", "BSc (CS) · IT Solution Development · AY2019"),
    ("SCIS_2024_SE", "se-2024", "BSc (SE) · Software Engineering · AY2024+"),
    ("SCIS_2023_SE", "se-2023", "BSc (SE) · Software Engineering · AY2023"),
    ("SCIS_2022_SE", "se-2022", "BSc (SE) · Software Engineering · AY2022"),
    ("SCIS_2024_C&L", "cl-2024", "BSc (IS) · Computing & Law · AY2024+"),
    ("SCIS_2023_C&L", "cl-2023", "BSc (IS) · Computing & Law · AY2023"),
    ("SCIS_2022_C&L", "cl-2022", "BSc (IS) · Computing & Law · AY2022"),
]

SECTION_RE = re.compile(r"=\s*(\d+(?:\.\d+)?)\s*CU", re.I)
CODE_RE = re.compile(r"\b((?:COR-)?[A-Z]{2,5}\.?\d{3,4}[A-Z]?)\b\s*[-–:]?\s*([^/#*\n]{3,80})?")
CU_RE = re.compile(r"\((\d(?:\.\d+)?)\s*CUs?\)", re.I)


def clean(v):
    if v is None:
        return ""
    return re.sub(r"[ \t]+", " ", str(v)).strip()


def term_columns(ws):
    """Map column letter -> term id like 'Y1T1' using year row + term row."""
    years, cols = {}, {}
    for row in ws.iter_rows(min_row=1, max_row=3):
        for c in row:
            v = clean(c.value)
            m = re.match(r"YEAR\s*(\d)", v, re.I)
            if m:
                years[c.column] = int(m.group(1))
    # forward-fill years over merged cells
    max_col = ws.max_column
    cur = None
    year_of = {}
    for col in range(1, max_col + 1):
        if col in years:
            cur = years[col]
        year_of[col] = cur
    for row in ws.iter_rows(min_row=1, max_row=3):
        for c in row:
            v = clean(c.value)
            if re.fullmatch(r"T[123]", v) and year_of.get(c.column):
                cols[c.column] = f"Y{year_of[c.column]}{v}"
    if not cols:  # sheets with only year headers: assume T1/T2 pairs
        seen = {}
        for col in range(5, max_col + 1):
            y = year_of.get(col)
            if not y:
                continue
            seen[y] = seen.get(y, 0) + 1
            cols[col] = f"Y{y}T{seen[y]}"
    return cols


def parse_sheet(ws):
    tcols = term_columns(ws)
    sections, notes = [], []
    cur = None
    last_label = ""
    in_notes = False
    for row in ws.iter_rows(min_row=3):
        cells = {c.column: c for c in row}
        a = clean(cells.get(1).value if 1 in cells else None)
        b = clean(cells.get(2).value if 2 in cells else None)
        c_ = clean(cells.get(3).value if 3 in cells else None)
        d = clean(cells.get(4).value if 4 in cells else None)
        window = {}
        for col, tid in tcols.items():
            v = clean(cells[col].value) if col in cells else ""
            if v and not re.fullmatch(r"-?\d+(\.\d+)?", v):
                window[tid] = v
        if not a and not b:
            continue
        if b.lower().startswith(("pasg - pre", "pre-assigned", "* can be taken")):
            in_notes = True
        if in_notes:
            if b:
                notes.append(b)
            continue
        sm = SECTION_RE.search(b)
        if sm and not a:
            cur = {"name": re.sub(r"\s*=.*$", "", b).strip().title().replace("Cus", "CUs"),
                   "cus": float(sm.group(1)), "items": []}
            cur["name"] = fix_name(cur["name"])
            sections.append(cur)
            continue
        if b.lower().startswith("graduation requirements"):
            cur = {"name": "Graduation Requirements", "cus": 0, "items": [], "grad": True}
            sections.append(cur)
            continue
        if re.search(r"second major add-ons", b, re.I):
            cur = None
            continue
        if cur is None or b.lower() == "add-ons":
            continue
        is_num = bool(re.fullmatch(r"\d+(\.0)?", a))
        label = b or (f"{last_label.split(' / ')[0]} (cont.)" if is_num else "")
        if not label:
            continue
        if b:
            last_label = b
        cu = 1.0
        m = CU_RE.search(label)
        if m:
            cu = float(m.group(1))
        if not is_num:
            cu = 0.0  # Global Exposure, grad reqs: non-credit checks
        compulsory = "#" in label
        exchange = is_red(cells.get(2))
        title = re.sub(r"\s*#+\s*", " ", label).strip()
        title = re.sub(r"\s*\^+\s*$", "", title).strip()
        cur["items"].append({
            "label": title,
            "cu": cu,
            "credit": is_num,
            "compulsory": compulsory,
            "exchange": exchange,
            "ec": c_ or "",
            "prereq": d,
            "window": window,
        })
    return {"terms": sorted(set(tcols.values()), key=term_key), "sections": sections, "notes": notes}


def is_red(cell):
    """The sheet marks 'can clear on exchange' with red label text."""
    color = cell.font.color if cell is not None and cell.font else None
    rgb = getattr(color, "rgb", None) if color else None
    if not isinstance(rgb, str) or len(rgb) < 6:
        return False
    r, g, b = (int(rgb[-6:][i:i + 2], 16) for i in (0, 2, 4))
    return r >= 0xC0 and g <= 0x70 and b <= 0x70


def fix_name(n):
    return (n.replace("Is ", "IS ").replace("Cs)", "CS)").replace("Itsd", "ITSD")
             .replace("Smt ", "SMT ").replace("Se ", "SE ").replace("C&L", "C&L")
             .replace("Uni Core", "Uni Core").replace("C&l", "C&L"))


def term_key(t):
    return (int(t[1]), int(t[3]))


OVERRIDES = {
    "CS102": "Programming Fundamentals II",
    "CS201": "Data Structures and Algorithms",
    "CS203": "Collaborative Software Development",
    "IS211": "Interaction Design and Prototyping",
    "IS212": "Software Project Management",
    "LGST102": "The Singapore Legal System and Legal Analysis Skills",
    "IS483": "IS Project Experience (Applied)",
    "IS484": "IS Project Experience (Industry)",
    "IS485": "IS Project Experience (Research)",
    "COR-STAT1202": "Introductory Statistics",
    "COR1201": "Calculus",
}


def catalogue(wb):
    """Course code -> name. Names come only from cells/lines that start with the code."""
    cat = {}
    line_re = re.compile(r"^(?:[-–•]\s*)?(?:.*?\s-\s)?((?:COR-)?[A-Z]{2,5}\.?\d{3,4}[A-Z]?)\s+(.+)$")
    for ws in wb:
        for row in ws.iter_rows():
            for c in row:
                for line in clean(c.value).split("\n"):
                    m = line_re.match(line.strip())
                    if not m or m.group(1).startswith("AY"):
                        continue
                    code = m.group(1).replace(".", "")
                    name = re.split(r"\s[/(*#]|\s&\s[A-Z]{2,5}\d|\s+-\s", m.group(2))[0]
                    name = name.strip(" -–,#*")
                    if len(name) < 4 or re.match(r"^(and|or|&|Pre|Co|Prog)\b", name):
                        cat.setdefault(code, "")
                        continue
                    if not cat.get(code) or len(name) < len(cat[code]):
                        cat[code] = name
    cat.update(OVERRIDES)
    return dict(sorted(cat.items()))


def tracks_text(ws):
    lines = []
    for row in ws.iter_rows():
        vals = [clean(c.value) for c in row if clean(c.value)]
        if vals:
            lines.append(" | ".join(vals))
    return lines


def main():
    wb = openpyxl.load_workbook(SRC, data_only=True)  # fonts are kept, used by is_red
    progs = []
    for sheet, pid, label in PROGRAMS:
        data = parse_sheet(wb[sheet])
        progs.append({"id": pid, "label": label, "sheet": sheet, **data})
    out = {
        "programs": progs,
        "catalogue": catalogue(wb),
        "reference": {
            "IS Tracks": tracks_text(wb["IS Tracks_2019 onwards"]),
            "CS Tracks": tracks_text(wb["CS Tracks"]),
            "SMT Electives Basket": tracks_text(wb["SMT_Basket"]),
            "2nd Majors": tracks_text(wb["2nd Majors"]),
        },
    }
    with open(OUT, "w") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    for p in progs:
        n = sum(len(s["items"]) for s in p["sections"])
        print(p["id"], p["terms"], [(s["name"], s["cus"], len(s["items"])) for s in p["sections"]], n)
    print("catalogue", len(out["catalogue"]))


main()
