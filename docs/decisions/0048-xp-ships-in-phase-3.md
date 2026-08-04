# 0048. XP ships in phase 3; the player is the killer

- **Date:** 2026-08-04
- **Decided by:** human (owner)
- **Status:** accepted

## Context

Task 0650's cut list deliberately contained **no XP task**, deferring it to
phase 4/6 because `deathSystem` destroys the corpse in-tick and emits no
event, so nothing attributes a kill, and monster-versus-monster kills are
legal (decision 0021). But without XP nothing grants a level at all, so
decision 0045's 1–70 progression would not exist, and DESIGN.md pillar 5
promises "a level gained" inside a twenty-minute session.

## Decision

**XP-on-kill ships in phase 3.** The deferral is overruled.

Attribution is unambiguous because the game is single-player by design
(DESIGN.md non-goals rule out multiplayer entirely): **XP is awarded to the
`PlayerControlled` entity.** Monster-versus-monster kills award nothing.
Where no `PlayerControlled` entity exists — every current sim scenario — no
XP is awarded and no state is written, so those scenarios and their replays
are untouched.

## Consequences

Levels become real, which decision 0045 presupposes and pillar 5 requires.
The implementing task must resolve two things this entry does not: where the
XP award hooks in relative to `deathSystem` (which reaps in-tick and emits
nothing), and where progression state lives — noting that there is **no
canonical system list** in this repo, every scenario registers its own, so
the task must name its registration site and ordering explicitly.

Progression state is a component, so it is hash-visible the moment it is
attached: 0650 measured that adding it moves `dungeon-crawl` only, because
that is the sole scenario with a `PlayerControlled` avatar. That re-bless is
expected and must be explained in the task file, per the guard.

XP *curve* shape — how much a kill grants, how much a level costs — is not
settled here. It is balance work that decision 0045's access-only levels
make low-risk: getting it wrong changes pacing, not power.
