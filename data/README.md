# Campaign data

Built from the session-notes Google Doc *Phandelver and Below: The Shattered Obelisk (Tuesdays)*,
sessions 1–41 (through 11/24/26). Every fact cites the session number(s) it came from. Session `0` means the backstories players shared at session zero, before play began (shown as "S0", with no session page).

| File | What's in it |
|---|---|
| `sessions.json` | One record per session: title, date, the bot's overview, where we left off and scene list (from `scripts/parse_sessions.py`), plus fields written by hand or by the weekly import: `recap` (a friendly read-aloud "last time on…", 90–150 words), `big_moments` (0–4 headline events), `qotd` (`{question, answers:[{who, answer}]}` or null; question is null when the notes don't say it), `recap_duty` (`{by, how, inspiration}` or null) and `quotes` (`[{who, text, context}]`, only lines the notes quote word for word). |
| `map.json` | Pin positions for the region and Phandalin maps (`#/map`). Add a pin when a new location appears; `"approx": true` marks a guess. |
| `notes/<n>.md` | The full session notes for session *n*, as the bot wrote them. The site shows the summary first and loads these when someone expands "Full session notes". Written by `scripts/export_notes.py`. |
| `characters.json` | Player characters, current and departed (Caine, Craig), with backstory beats, items and personal quests. |
| `npcs.json` | NPCs with other spellings, role, status, attitude toward the party, and facts tagged `confirmed` / `claimed` / `rumoured`. |
| `quests.json` | Main, side, faction and personal quests with status and objectives. |
| `mysteries.json` | Open questions with clues by session and party theories, plus resolved ones. |
| `items.json` | Notable items, who holds them, and where they were found. |
| `locations.json` | Places, nested with `parent`. |
| `factions.json` | Organizations and the party's standing with them. |
| `ledger.json` | Party level, in-game date, gold log, debts and favours both ways, property. |
| `lore.json` | World facts the party has learned. |

IDs are unique across all files, so any `related`, `holder`, `giver`, `location` or `factions`
value can point at anything. Run `python3 scripts/validate.py` after editing to check references.

Known inconsistencies in the source notes are kept as other spellings: Allyanna/Eliana,
Torra/Cora Ironwell, Toblen/Toblin, Trilena/Trelenna, Lenine Graywind/Greywind,
and Bowgentle's buyer "Tsarnaev" vs "Samber" of Erebor.
