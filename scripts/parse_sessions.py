"""Split the bot's Google Doc export (markdown text) into per-session records.

Usage: python3 scripts/parse_sessions.py notes.md > data/sessions.json
"""
import json, re, sys

HEAD = re.compile(r"^# \*\*Session (\d+) – (.+?) – ([\d/]+)\*\*\s*$")
SUB = re.compile(r"^## \*\*(.+?)\*\*\s*$")

def clean(s):
    s = re.sub(r"\\([!*_])", r"\1", s)
    s = re.sub(r"\bBrockettes\b", "Brocettes", s)
    s = re.sub(r"\bBrock\b", "Broc", s)  # the notes bot sometimes misspells Broc
    return re.sub(r"\s+", " ", s).strip()

def scene_name(title):
    """Recaps of the previous session aren't scenes. Mirrors export_notes.py, which drops
    the same sections from the full notes: any heading with "Recap" is skipped, except
    "Recap and X" (X being new events), which becomes "X"."""
    if not re.search(r"recap", title, re.I):
        return title
    rest = re.match(r"recap and (.+)", title, re.I)
    if rest and not re.search(r"recap|question of the day|inspiration", rest[1], re.I):
        return rest[1].strip()
    return None

def norm_date(d):
    m, day, y = d.split("/")
    y = int(y); y = y + 2000 if y < 100 else y
    return f"{y:04d}-{int(m):02d}-{int(day):02d}"

def parse(text):
    sessions, cur, sec = [], None, None
    for line in text.splitlines():
        h = HEAD.match(line)
        if h:
            cur = {"number": int(h[1]), "title": clean(h[2]), "date": norm_date(h[3]),
                   "sections": []}
            sessions.append(cur); sec = None; continue
        if cur is None: continue
        s = SUB.match(line)
        if s:
            sec = {"heading": clean(s[1]), "text": ""}; cur["sections"].append(sec); continue
        if line.strip():
            if sec is None:
                sec = {"heading": "Notes", "text": ""}; cur["sections"].append(sec)
            sec["text"] += line.strip() + "\n"
    out = []
    for c in sessions:
        secs = [{"heading": x["heading"], "text": clean(x["text"])} for x in c["sections"]]
        get = lambda name: next((x["text"] for x in secs if x["heading"] == name), None)
        out.append({
            "number": c["number"], "title": c["title"], "date": c["date"],
            "overview": get("Overview"),
            "where_we_left_off": get("End of Session"),
            "scenes": [n for x in secs if x["heading"] not in ("Overview", "End of Session")
                       for n in [scene_name(x["heading"])] if n],
        })
    return sorted(out, key=lambda x: x["number"])

if __name__ == "__main__":
    print(json.dumps(parse(open(sys.argv[1], encoding="utf-8").read()), indent=2, ensure_ascii=False))
