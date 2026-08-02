import type { Scenario } from '../scenario'
import {
  addAttackTimerSystem,
  ATTACK_TIMER_INVARIANTS,
  attackTimerReport,
  spawnMonsters,
} from './attack-timers'

/**
 * Instantiate EVERY monster in the content registry and tick them.
 *
 * This is the breadth check on the content-to-simulation seam: content that is
 * individually well-formed but produces a broken entity once loaded — a zero
 * attack interval, a stat that arrives as a string, a life value that goes NaN.
 *
 * Deliberately NOT hash-pinned by a golden replay: its state depends on the
 * whole registry, so a pin would be invalidated by every content addition and
 * turn parallel content work into a merge bottleneck. The fixed-roster
 * `content-seam` scenario carries the pin instead. This one is covered by
 * smoke (invariants + determinism) only.
 */
export const contentSmoke: Scenario = {
  name: 'content-smoke',
  description: 'Spawns every monster in the registry and runs its attack timer.',
  defaultTicks: 300,

  setup(world, registry) {
    // Spawn positions are derived from roster index (see spawnMonsters), so
    // the roster order must be deterministic. The registry's Map order is
    // already filename-sorted (node.ts sorts the directory listing), but that
    // guarantee lives far from here — sort by id explicitly, with a plain
    // code-unit comparison (localeCompare would drag the host locale into
    // the state hash). Ids equal filenames, so this reproduces today's order.
    const roster = [...registry.monsters.values()].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    )
    spawnMonsters(world, roster)
    addAttackTimerSystem(world)
  },

  invariants: ATTACK_TIMER_INVARIANTS,
  report: attackTimerReport,
}
