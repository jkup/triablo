# Design

**Human-owned. This is the creative direction of the game.** Agents read this
before making any decision a task file does not settle; where this document and
an agent's instinct disagree, this document wins. Where this document is
silent, the agent records its judgment call in `docs/decisions/` so the owner
can review and veto it.

> **Owner's note (edit me!):** The pillars below are a starter set written to
> be concrete enough to steer agents on day one. Rewrite them until they
> describe the game *you* want. This file is guard-protected: changing it goes
> through a `gate-change`-labeled PR, which is the point — direction changes
> should be deliberate and visible.

## What this game is

A single-player action RPG in the Diablo lineage: an isometric-style
hack-and-slash about carving through hordes of monsters in procedurally
generated dungeons, powered by an endless stream of loot. No online play, no
multiplayer, no monetization — a complete, self-contained game.

## Pillars

Every design decision should serve at least one of these. A feature that
serves none of them is out, no matter how cool.

1. **Combat is readable at a glance.** You always know what is about to hit
   you and what you can do about it. Few-but-meaningful enemy attack patterns
   beat visual noise. When in doubt, fewer particles, clearer telegraphs.

2. **Loot is the story.** The moment-to-moment motivation is the next drop.
   Item generation should regularly produce *interesting* choices (a tradeoff,
   a build-enabler), not just bigger numbers. A legendary should change how
   you play, not just how hard you hit.

3. **Builds are discoveries, not spreadsheets.** Skills and affixes should
   combine in ways that make a player feel clever for noticing. Prefer a small
   number of deep, interacting systems over many shallow parallel ones.

4. **Death is a lesson, not a punishment.** Dying costs progress on the
   current run, never your character or gear. The game should make it obvious
   *why* you died.

5. **Respect the player's time.** Sessions of 20 minutes should feel complete:
   a dungeon cleared, a drop evaluated, a level gained. No daily-login
   psychology, no artificial gates.

## Tone

Gothic, grounded, a little grim — closer to a plague-era woodcut than to high
fantasy. Monsters are menacing rather than wacky. Item and skill names are
evocative but terse ("Rusted Cleaver", not "Gorehowl the Unforgiven Mk. III").
Flavor text is one sentence and earns its place.

## The five classes (fantasy in one line each)

- **Barbarian** — overwhelming physical violence, up close, shrugging off harm.
- **Sorcerer** — glass cannon channeling the elements; positioning is life.
- **Rogue** — speed, precision, and exploiting openings; ranged or melee.
- **Druid** — shapeshifting and the wild; storms and claws; adaptable.
- **Necromancer** — an army of the dead does the fighting; attrition and dread.

Class identity is mechanical, not just cosmetic: a Barbarian solves a room
differently than a Necromancer does.

## Non-goals

Explicitly out, to save agents from speculating:

- PvP, trading, seasons, leaderboards, or any online feature.
- Crafting systems beyond simple affix rerolling (revisit post-phase 6).
- An open world. The structure is hub → dungeon → hub.
- Story cutscenes or dialogue trees. Ambient storytelling only.
- Difficulty settings below "the intended experience" (accessibility options
  are in scope; a story mode is not).

## How to change this document

Owner: edit freely via a `gate-change`-labeled PR.
Agents: never edit this file. If a task seems to require contradicting it,
stop and say so in the task file — the conflict itself is the finding.
