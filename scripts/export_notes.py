"""Write each session's full notes from the bot's Google Doc export to data/notes/<n>.md.

Usage: python3 scripts/export_notes.py notes.md [session numbers...]

With no session numbers every session in the export is written; otherwise only
the ones listed. The text is kept as the bot wrote it (## headings, paragraphs,
"- " bullet lists), minus the session heading itself and markdown escapes.
"""
import pathlib, re, sys

HEAD = re.compile(r"^# \*\*Session (\d+) – (.+?) – ([\d/]+)\*\*\s*$")
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "notes"

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
