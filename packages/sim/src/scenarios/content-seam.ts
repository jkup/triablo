import type { Scenario } from '../scenario'
import {
  addAttackTimerSystem,
  ATTACK_TIMER_INVARIANTS,
  attackTimerReport,
  spawnMonsters,
} from './attack-timers'

/**
 * A FIXED roster of monsters, hash-pinned by a golden replay.
 *
 * Why this exists separately from content-smoke: golden replays should pin
 * *code behavior*, not *content breadth*. If the replay hashed a scenario that
 * iterates every monster in the registry, then every added monster would
 * invalidate it — and twenty parallel content agents would each need to
 * re-bless the same replay file, colliding on every merge.
 *
 * So the pinned scenario names its monsters explicitly. Adding new content
 * cannot change its hash. What does change it:
 *   - editing the stats of a monster on this roster (intended: stat changes
 *     to existing content should be deliberate, visible, and explained)
 *   - changing seconds-to-ticks conversion, the ECS, or the RNG
 *
 * When one of these monsters is deleted, registry.monster() throws and this
 * scenario fails loudly — update the roster and re-bless, and say why.
 */
const ROSTER = ['skeleton-archer', 'skeleton-warrior'] as const

export const contentSeam: Scenario = {
  name: 'content-seam',
  description: `Fixed monster roster (${ROSTER.join(', ')}), hash-pinned by replay.`,
  defaultTicks: 300,

  setup(world, registry) {
    spawnMonsters(
      world,
      ROSTER.map((id) => registry.monster(id)),
    )
    addAttackTimerSystem(world)
  },

  invariants: ATTACK_TIMER_INVARIANTS,
  report: attackTimerReport,
}
