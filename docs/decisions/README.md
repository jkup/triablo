# Decision log

One file per decision, numbered, append-only. This is how judgment calls made
during autonomous work stay visible to the human who owns the game.

## When an agent must write one

Whenever you settle something that (a) the task file did not specify, (b) is
not already in `docs/ARCHITECTURE.md` or `docs/DESIGN.md`, and (c) future work
will build on. The armor formula's constant. What rarity means for affix
counts. Whether both duelists can die on the same tick. If a future agent
could reasonably have chosen differently, it is a decision — log it.

Do **not** log restatements of the task file, pure implementation detail with
no downstream contract, or anything already decided elsewhere.

## Format

`NNNN-short-kebab-title.md`, next free number, using this skeleton:

```markdown
# NNNN. Title as a decision, e.g. "Armor uses asymptotic reduction"

- **Date:** YYYY-MM-DD
- **Decided by:** human | agent (task NNNN)
- **Status:** accepted | superseded by NNNN

## Context
Two or three sentences: the question and why it had to be answered now.

## Decision
The decision itself, concrete enough to implement from.

## Consequences
What this makes easier, what it forecloses, what would trigger revisiting.
```

Keep the whole file under ~25 lines. A decision log nobody reads is worse
than none.

## Rules

- Append-only: never edit an accepted decision. To reverse one, write a new
  decision that supersedes it and flip the old file's Status line — that pair
  of changes is the one exception to append-only.
- The human owner may veto any agent decision by superseding it; the
  superseding file then wins.
- Numbering collisions between parallel PRs are resolved at merge by whoever
  merges second renumbering theirs (strict up-to-date checks force the rebase
  anyway).
