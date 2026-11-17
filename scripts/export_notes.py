"""Write each session's full notes from the bot's Google Doc export to data/notes/<n>.md.

Usage: python3 scripts/export_notes.py notes.md [session numbers...]

With no session numbers every session in the export is written; otherwise only
the ones listed. The text is kept as the bot wrote it (## headings, paragraphs,
"- " bullet lists), minus the session heading itself and markdown escapes.

The site already shows the summary, so two kinds of section are skipped:
- the Overview (it repeats the session summary), and
- recaps of the previous session (any heading containing "Recap"). A heading like
  "Recap and Tharden's Funeral" that also covers new events is kept as
  "Tharden's Funeral" with only its recap sentences removed.
"""
import pathlib, re, sys

HEAD = re.compile(r"^# \*\*Session (\d+) – (.+?) – ([\d/]+)\*\*\s*$")
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "notes"

SENT = re.compile(r"(?<=[.!?…])\s+(?=[A-Z“\"])")

def drop_summary_sections(body):
    """Remove the Overview and previous-session recap sections (see module docstring)."""
    parts = re.split(r"(?m)^(?=## )", body)
    out = []
    for part in parts:
        m = re.match(r"## \*\*(.+?)\*\*\s*\n?", part) or re.match(r"## (.+)\n?", part)
        if not m:
            out.append(part); continue
        title = m[1].strip()
        if title.lower() == "overview":
            continue
        if re.search(r"recap", title, re.I):
            rest = re.match(r"recap and (.+)", title, re.I)
            if rest and not re.search(r"recap|question of the day|inspiration", rest[1], re.I):
                text = part[m.end():].strip()
                paras = [" ".join(s for s in SENT.split(p) if not re.search(r"recap", s, re.I)) for p in text.split("\n\n")]
                paras = [p for p in paras if p.strip()]
                if paras:
                    out.append(f"## **{rest[1].strip()}**\n\n" + "\n\n".join(paras) + "\n\n")
            continue
        out.append(part)
    return "".join(out)

# Names the notes bot gets wrong. Broc is never "Brock".
NAME_FIXES = [(re.compile(r"\bBrockettes\b"), "Brocettes"), (re.compile(r"\bBrock\b"), "Broc")]

def fix_names(s):
    for pat, rep in NAME_FIXES:
        s = pat.sub(rep, s)
    return s

def split(text):
    sessions, cur = {}, None
    for line in text.splitlines():
        h = HEAD.match(line)
        if h:
            cur = int(h[1]); sessions[cur] = []; continue
        if line.startswith("# "):  # any other top-level heading ends the session
            cur = None; continue
        if cur is not None:
            sessions[cur].append(line.rstrip())
    out = {}
    for n, lines in sessions.items():
        body = "\n".join(lines)
        body = re.sub(r"\\([!*_#>\-.()\[\]])", r"\1", body)
        body = fix_names(body)
        body = drop_summary_sections(body.strip() + "\n")
        body = re.sub(r"\n{3,}", "\n\n", body).strip()
        out[n] = body + "\n"
    return out

if __name__ == "__main__":
    notes = split(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
    wanted = {int(x) for x in sys.argv[2:]} or set(notes)
    OUT.mkdir(parents=True, exist_ok=True)
    for n in sorted(wanted):
        if n not in notes:
            sys.exit(f"session {n} not found in export")
        (OUT / f"{n}.md").write_text(notes[n], encoding="utf-8")
    print(f"wrote {len(wanted)} note file(s) to {OUT}")
