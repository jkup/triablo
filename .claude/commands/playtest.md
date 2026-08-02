---
description: Record an owner playtest verbatim and turn it into planner-ready work
argument-hint: <raw feedback notes — unpolished is fine, fragments welcome>
---

The owner just played the game. Their raw notes: **$ARGUMENTS**

Playtest feedback is the rarest signal in this repo — the only sensor for
*fun*. Your job is to capture it losslessly, triage it honestly, and route
each piece to the mechanism that can act on it. Never polish away the
owner's phrasing; "combat feels floaty" is data, not a draft.

## Record

1. Find the next number in `docs/playtests/` (create the directory on
   first use; numbering starts at 0001). Write
   `docs/playtests/NNNN-YYYY-MM-DD.md`:
   - **Build:** `git rev-parse --short HEAD` plus the date.
   - **Owner's notes, verbatim:** the raw `$ARGUMENTS`, quoted exactly.
   - **Context:** one short paragraph you write — current phase, what
     landed recently that the notes likely touch (check `git log` and
     `tasks/done/`), relevant decision numbers.
2. If the notes are empty or you only received a greeting, ask the owner
   for their notes and stop — do not invent a playtest.

## Triage

3. In the same file, add a **Triage** table: each distinct observation
   from the notes, classified one of:
   - **bug** — behavior contradicts a recorded decision or obvious intent
     → candidate task (qa-first if reproduction is nontrivial).
   - **tuning** — numbers feel wrong (damage, speed, pacing, drop rates)
     → candidate task, usually superseding or amending a decision entry;
     name the decision that owns the number.
   - **direction** — taste the current DESIGN.md does not settle (wants a
     new feel, questions a pillar) → **owner territory**: agents may not
     decide these. Flag it back to the owner with the specific DESIGN.md
     section or decision it touches; it becomes work only after they rule.
   - **keep** — something they liked → record it so future work does not
     undo it; no task.
4. Reproduce cheaply where possible before triaging as bug vs tuning: a
   sim run, a shot at the relevant tick, a read of the decision entry.
   Do not build fixes here — this command produces *routing*, not code.

## Land and route

5. Branch (`playtest/NNNN`), commit the playtest file, PR, merge on green
   checks (`docs/playtests/` is not guard-protected). Everything reaches
   `main` through a PR like all other work.
6. Spawn a `planner` agent (worktree isolation) with the playtest file as
   first-class input alongside the roadmap: it decides which bug/tuning
   candidates become `tasks/open/` files, honors phase gating, and
   records what it declines. Direction items are NOT the planner's — they
   stay flagged to the owner. If you cannot spawn agents, say so and
   leave the triage table as the planner's queued input for the next
   refill.
7. Report back: the playtest file's path, the triage table, any tasks the
   planner minted, and the direction items awaiting the owner's ruling —
   each phrased as a concrete question they can answer in one line.
