# Monsters leave what they drop: wire loot into the crawl and the client

- **Role:** systems
- **Phase:** 3
- **Priority:** 2 (lower runs first)
- **Depends on:** 0420-loot-drop-on-death.md,
  0680-wire-progression-into-crawl-and-client.md, 0730-wire-level-life-grant.md

## Goal

Task 0420 lands `lootDropSystem`, `LootDomain`, `LootSource` and `GroundItem`
attached to nothing and registered nowhere — its own Out of scope says so:
"Registering `lootDropSystem` in any existing scenario or the client … is out
of scope — a follow-up qa task wires drops into dungeon-crawl." **This is that
follow-up**, extended to the browser because the same four lines are needed in
both worlds and DESIGN.md pillar 2 ("Loot is the story. The moment-to-moment
motivation is the next drop") is not served by a mechanism a human cannot see.

After this task, the eight monsters of `dungeon-crawl` each leave exactly one
rolled item on the tile where they fell, `npm run sim -- run dungeon-crawl
--seed 1 --verbose` prints eight drop lines with base id, rarity and position,
and a human running `npm run dev` sees eight new circles appear in the rooms
they cleared. No new rendering code is needed for that last part — see Notes.

## This moves a replay, and that is the point

`packages/sim/replays/dungeon-crawl.seed1.json` moves. It is the **third**
budgeted re-bless of that one file: task 0680 paid the first (the avatar gained
`Progression`), task 0730 the second (the level life grant). **No other replay
moves** — `duel`, `skill-strike`, `status-dot`, `content-seam` and
`harness-selftest` populate no dungeon, spawn no `LootSource`, and register no
`lootDropSystem`, so nothing there can drop or draw.

Two independent reasons this one moves, and the guard needs both stated:

1. **New entities.** Eight `GroundItem` + `Position` entities exist at the end
   of the run and `snapshot()` serializes every live entity verbatim
   (`packages/core/src/ecs.ts`).
2. **New rng draws.** `lootDropSystem` consumes `world.rng`, and the rng words
   are part of the snapshot (decision 0017).

Reason 2 is the one to be careful about, so measure it rather than trusting it:
**the crawl consumes no rng today.** Verified while writing this file — `npm
run sim -- run dungeon-crawl --seed 2` reports byte-identical metrics to seed 1
(`monstersRemaining 0`, `avatarDamageDealt 362`, `avatarLife 59/200`,
`lastMonsterDeathTick 1466`, `waypointsReached 7/7`) and differs only in the
state hash. Nothing crits, so combat never draws. After this task the drops
*will* differ between seeds while combat still must not — the seed-2 criterion
below is exactly that check.

## Files in scope

- `packages/sim/src/scenarios/dungeon-crawl.ts`
- `packages/sim/replays/dungeon-crawl.seed1.json` — re-blessed hash **and** its
  `note` field
- `packages/client/src/game.ts`
- `packages/client/src/game.test.ts` — the pinned system-name list
- `docs/decisions/` — only if you settle something new (see Requirement 5)

## Out of scope

- **Any change under `packages/core`.** Task 0420 shipped the components and
  the system. If `LootDomain` cannot be built from the registry without a core
  edit, stop and record it under Notes — do not widen core here.
- **Any change under `packages/content`.** No new loot tables, no schema edits,
  no "no drop" weight. Task 0420 rules v1 as exactly one item per sourced
  death; that is the behaviour this task wires, and changing it is a separate
  content-schema task.
- **Pickup, inventory, equipping.** A `GroundItem` just exists (task 0420).
  Nothing walks over it, nothing picks it up, nothing equips it.
- **`packages/client/src/scene.ts`, `raster.ts`, `effects.ts`.** Do not add a
  loot sprite kind, a loot colour, a pickup highlight, or a drop animation.
  Ground items already render through the existing contract (Notes); making
  them *look* like loot extends `buildScene`'s contract and needs its own
  decision per 0027/0034.
- **Re-blessing any replay other than `dungeon-crawl.seed1.json`.** If a second
  one moves you changed behaviour: find it, do not bless it.
- Magic-find, quantity, gold, legendaries, drop chances below 100%.

## Requirements

### 1. Build the `LootDomain` once, from the registry, sorted by id

Core cannot import content, so both callers build the domain themselves. The
exact pattern already exists at `packages/sim/src/scenarios/loot-smoke.ts:374-409`:

```ts
const baseIds = [...registry.items.keys()].sort()
const affixIds = [...registry.affixes.keys()].sort()
const pool = affixIds.map((id) => registry.affix(id))
```

Value-copy the ranges into plain JSON (loot-smoke's `context` construction is
the template) — the domain is snapshot-visible state, not a bag of registry
references. **The trap:** passing the pool in registry-glob order instead of
sorted-by-id order works on your machine and diverges on another, because
`rollItem`'s draw order is defined against the order it is handed
(`packages/core/src/loot/roll.ts:126`). Sorted arrays, built once at setup.

Attach the domain exactly as `lootDropSystem`'s landed doc comment prescribes
(a dedicated entity, or an `attachLootDomain` helper if task 0420 shipped one).

**Spawn the domain entity last** — after the avatar and, in the crawl, after
the `CrawlRecord` monitor. Every existing entity then keeps the id it has
today, which keeps the diff to "new entities appended" instead of "every id
shifted", and keeps `attackSystem`'s ascending-id iteration order untouched.

### 2. `monsterFor` returns the monster's authored loot

Both worlds already close over the registry in `monsterFor`
(`dungeon-crawl.ts:436-441`, `game.ts:93-99`). Add the `loot` field task 0420
made optional:

- `entries` from `registry.lootTable(monster.lootTable).entries` — **in
  authored order, not sorted.** Task 0420 pins table entries as authored order;
  sorting them silently re-weights the draw.
- `itemLevel: monster.level`.

Every shipped monster already carries a `lootTable`, and `checkReferences`
(`packages/content/src/registry.ts:202`) already proves each one resolves — so
no monster needs a fallback and none should get one. The authored mapping,
measured from `packages/content/data/monsters/`:

| monster | level | loot table |
|---|---|---|
| skeleton-warrior | 1 | skeleton-common |
| skeleton-archer | 2 | skeleton-common |
| zombie | 2 | skeleton-common |
| bone-mage | 3 | skeleton-common |
| grave-hulk | 5 | undead-elite |

### 3. Register `lootDropSystem` after every damage source, before `deathSystem`

Task 0420 fixes the slot: after the damage-dealing systems and before the
reaper, because `World.destroy` removes the entity from `query` immediately and
a system behind the reaper sees no corpse at all.

- **Crawl** (`dungeon-crawl.ts:486-490`, as task 0680 left it): `move-order →
  approach → attack → xp-award → `**`loot-drop`**` → death → crawl-bot`.
- **Client** (`game.ts:112-119`, as tasks 0680/0730 left it): `move-order →
  approach → attack → skill-cast → skill-resolve → projectile-flight →
  status-tick → xp-award → `**`loot-drop`**` → death`. It must sit **after
  `status-tick`**: `statusTickSystem` is a damage source (decision 0036), so a
  monster killed by a bleed must still drop.

`loot-drop` and `xp-award` do not read each other's state (`xpAwardSystem`
writes an `XpAwarded` marker, `lootDropSystem` removes `LootSource`), and
`xpAwardSystem` draws no rng, so the two orders are behaviourally identical.
Pick the one above, state in both doc comments that the order between them is
free but the order against `death` is not, and do not silently choose the
other.

### 4. Report the drops, and pin them with an invariant

- `crawlReport` (`dungeon-crawl.ts:403`) gains a `groundItemsDropped` count. It
  returns `Record<string, string | number>`, so this is additive.
- Add one crawl invariant: **`groundItems + livingMonsters ===
  authoredSpawnCount`**, checked the same way the existing invariants are. It
  holds at every tick boundary because `lootDropSystem` runs in the same tick
  as the fatal hit and before the reaper, so a monster is never simultaneously
  dead and undropped when an invariant runs (`run()` checks every 25 ticks and
  on the last tick — `packages/sim/src/scenario.ts:82,110`). If it does *not*
  hold at some check point, name the tick and the cause in your Outcome; do not
  weaken the invariant to make the run pass.
- Update the scenario header comment. Two sentences there are now wrong: the
  `CRAWL_DEADLINE_TICKS` note claims "no rng is consumed: nobody crits, so
  every seed walks the identical crawl", and the header's list of what the
  invariants judge does not mention loot. Combat still walks identically across
  seeds; the *loot* does not.

### 5. Decisions

No new decision is expected — task 0420's entry rules the drop semantics,
rarity weights and item level, and decision 0059 already rules what happens to
ground loot on a map transition ("Ground loot left behind on a cleared map is
destroyed with it"). Write an entry only if you settle something they did not.
If you do, check the highest number on `main` first: **0064, 0065, 0066 and
0067 are reserved by other agents in flight**, so take a number above those.

### 6. The replay

Bless with `npm run replay:bless` **only after** the sim run reproduces the
behaviour proof below, and rewrite the `note` field. It currently claims
"avatarLife 59/200"; tasks 0680 and 0730 will already have moved that, and this
task adds the drops. The new note must say: eight monsters now carry a
`LootSource` and each leaves one `GroundItem` where it fell, the combat trace
is unchanged (same eight death ticks, same 362 damage dealt, same 141 taken),
and the hash moved because of new entities plus new `world.rng` draws.

## The behaviour proof — measured, and what it should read after

On `main` **today** (before 0680 and 0730), `npm run sim -- run dungeon-crawl
--seed 1` reports:

```
monstersRemaining     0
monstersAuthored      8
avatarLife            59/200
avatarDamageDealt     362
totalMonsterLife      362
avatarTile            (20, 15)
exitTile              (20, 15)
lastMonsterDeathTick  1466
waypointsReached      7/7
state hash            f7dc3d682f986a80
```

and the eight deaths land at ticks **244, 484, 649, 784, 920, 1290, 1362,
1466** — in order `zombie`, `zombie`, `skeleton-warrior`, `skeleton-archer`,
`skeleton-warrior`, `grave-hulk`, `skeleton-archer`, `bone-mage`.

After this task **every line above except `avatarLife` and the hash must be
identical**, plus `groundItemsDropped 8`.

`avatarLife` should read **83/224** by the time you run it, and here is the
arithmetic so you can tell a wrong number from a right one. Task 0730 spawns
the avatar with `levelStatMods(PLAYER_LEVEL)`; measured by calling the real
functions, `maxLifeGrantForLevel(5)` is **24**, so `makeCombatant('avatar', 5,
PLAYER_STATS, levelStatMods(5))` yields `maxLife` **224** with only `life` and
`maxLife` differing from the ungeared avatar. No level-up happens during this
run: measured with the real `xpForKill`, the eight kills are worth
`14 + 14 + 11 + 12 + 11 + 32 + 12 + 13 = 119` XP at tier 1, against
`xpToNextLevel(5) = 500`. So decision 0060's full heal never fires, `maxLife`
stays 224 all run, damage taken stays 141, and `life` is `224 − 141 = 83`.
**Task 0730's Outcome is the authority** — if it recorded different numbers,
use its and say so in yours.

Any drift in the eight death ticks or in `avatarDamageDealt` means an rng draw
leaked into combat or a component write moved a timer. Find it before blessing.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/replays/` lists **exactly one file**,
      `dungeon-crawl.seed1.json`. Paste the output.
- [ ] `npm run sim -- run dungeon-crawl --seed 1` reproduces the table above
      (`avatarLife` per the arithmetic) and reports `groundItemsDropped 8`.
      Paste the full report.
- [ ] `npm run sim -- run dungeon-crawl --seed 1 --verbose | grep dies` shows
      the same eight deaths at ticks 244, 484, 649, 784, 920, 1290, 1362, 1466.
      Paste them.
- [ ] The verbose trace contains **eight** drop lines, each naming a base id, a
      rarity and a position. Paste all eight and confirm each position matches
      the corresponding corpse's tile.
- [ ] **The seed-independence check.** `npm run sim -- run dungeon-crawl --seed
      2` reports the identical eight death ticks, `avatarDamageDealt 362`,
      `monstersRemaining 0`, `waypointsReached 7/7` and `groundItemsDropped 8`,
      while its eight drop lines differ from seed 1's in at least one item.
      Paste both sets. This is the proof that loot rng did not reach combat.
- [ ] The `groundItems + livingMonsters === authoredSpawnCount` invariant is
      registered and the run reports no violation.
- [ ] Test (client): a `createGame` world stepped until at least one monster
      dies contains at least one `GroundItem`, and `world.systemNames` equals
      the order in Requirement 3.
- [ ] Test (client): the number of `GroundItem`s never exceeds the number of
      monsters that have died — the double-drop guard, observed in the live
      browser world rather than in a hand-built one.
- [ ] `npm run replay:check` is green after blessing, and the blessed file's
      `note` explains the change as described in Requirement 6.
- [ ] The Outcome records the before hash (task 0730's) and the after hash,
      with the one-sentence explanation the guard needs.

## Notes for the implementer

- **Read first:** task 0420 **as landed** (its doc comments are the contract:
  draw order, pool ordering, the `LootDomain`-missing trace-and-skip rule),
  then decision 0059 (ground loot dies with its map), then tasks 0680 and 0730
  as landed — you are registering into the system order they built.
- **You do not need to write any rendering code for a human to see the drops.**
  `buildScene` emits a sprite for every entity carrying core `Position`
  (`packages/client/src/scene.ts:463-490`), with `lifeFrac: null` when there is
  no `Combatant` and a colour seeded from the entity id when no component
  carries a string `monsterId` — decision 0027's cosmetic exception. A
  `GroundItem` entity therefore draws as a small unlabelled circle on the floor
  for free. `cameraFor` follows the `PlayerControlled` entity (decision 0033),
  so eight new positioned entities cannot move the camera. Confirm this by
  running `npm run dev`, and say in the Outcome what you saw.
- **No dry-pool risk at these item levels.** Measured across the authored
  affix pool (22 affixes): at item levels 1–5 every slot the shipped tables
  can drop into has **≥3 eligible prefixes and ≥3 eligible suffixes**
  (`main-hand` 3/3, `chest` 3/4, `ring` 3/4), so even a rare (3–6 affixes, cap
  3 per kind — decision 0014) can always be filled. `rollItem` does not throw
  on a short pool anyway (`roll.ts:144`), but you will not be exercising that
  path, so do not build for it.
- The three bases the shipped tables can drop are `rusted-cleaver`
  (`main-hand`), `tattered-tunic` (`chest`) and `copper-band` (`ring`).
- **The trap.** Building the `LootDomain` inside `monsterFor`, or per death.
  It is a whole-registry snapshot; rebuilding it per monster is 8× the work and
  invites a different sort order on one of the builds. Build it once at setup.
- **The second trap.** Blessing early. If you bless before the sim run
  reproduces the eight death ticks and 362 damage, a behaviour change is baked
  into the golden file and the evidence is gone.
- Tasks 0420, 0680 and 0730 must all be on `main` first. If any is still open,
  do not start — half of this task's file set does not exist yet.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** `packages/sim/replays/dungeon-crawl.seed1.json`
  because `<state the new-entities + new-rng-draws reason and both hashes>`
- **Scope deviations:**
- **Follow-ups worth a new task:**
