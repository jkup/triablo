/**
 * A small, deterministic entity-component-system.
 *
 * Deliberately not a high-performance archetype ECS. The priorities here are,
 * in order: determinism, JSON-serializability, and being readable by an agent
 * that has never seen the file before. Performance matters only enough to run
 * thousands of headless dungeon clears per night, which this comfortably does.
 */

import { hashString, stableStringify } from './hash'
import type { RngState } from './rng'
import { Rng } from './rng'

/** An opaque handle to an entity. Ids increase monotonically and are never reused. */
export type EntityId = number & { readonly __brand: 'EntityId' }

/**
 * A component type. Created with {@link defineComponent}.
 *
 * The value type is phantom — it exists only to type `get`/`add`/`query`.
 */
export interface ComponentType<T> {
  readonly id: string
  readonly __value?: T
}

/** An event type. Created with {@link defineEvent}. */
export interface EventType<T> {
  readonly id: string
  readonly __payload?: T
}

/**
 * Declare a component.
 *
 * Component values must be plain JSON-compatible data: no methods, no class
 * instances, no closures, no references to other entities' objects. They are
 * serialized for saves, snapshots, and state hashing, and anything that does
 * not survive that round trip is a bug that will surface as a replay mismatch
 * much later and much more confusingly.
 */
export function defineComponent<T>(id: string): ComponentType<T> {
  return { id }
}

/** Declare an event. */
export function defineEvent<T>(id: string): EventType<T> {
  return { id }
}

/**
 * A unit of simulation logic.
 *
 * Registration order is execution order, and is part of the game's observable
 * behavior. A system that consumes an event must be registered after the system
 * that emits it.
 */
export interface System {
  readonly name: string
  update(world: World): void
}

/** A serializable snapshot of an entire world. Used for saves and state hashing. */
export interface WorldSnapshot {
  tick: number
  nextEntityId: number
  rng: RngState
  /** Alive entity ids, ascending. */
  entities: number[]
  /** Component id -> [entityId, value] pairs, both levels sorted. */
  components: Record<string, Array<[number, unknown]>>
}

/**
 * Deep-copy a plain-JSON component value.
 *
 * `restore` must not share component objects with the snapshot it was given:
 * `snapshot()` returns live references, so without a copy, stepping a restored
 * world would mutate the original world's components through the snapshot.
 * Hand-rolled rather than `structuredClone` because components are contractually
 * plain JSON data (see {@link defineComponent}) and nothing fancier deserves to
 * survive a save.
 */
function cloneJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneJsonValue)
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      out[key] = cloneJsonValue((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

/** Throw a `World.restore` validation error naming the offending field. */
function rejectSnapshot(field: string, problem: string): never {
  throw new Error(`World.restore: snapshot.${field} ${problem}`)
}

type ComponentValue<C> = C extends ComponentType<infer V> ? V : never
type ComponentValues<T extends readonly ComponentType<unknown>[]> = {
  [K in keyof T]: ComponentValue<T[K]>
}

export interface WorldOptions {
  seed: string | number
}

export class World {
  /**
   * The simulation's random source. Never use `Math.random` instead of this.
   *
   * A getter over a private field rather than a `readonly` property so that
   * {@link World.restore} can install a generator rebuilt from saved state;
   * from outside the class it is exactly as immutable as before.
   */
  get rng(): Rng {
    return this.rngInstance
  }

  private rngInstance: Rng

  /** Ticks elapsed. Simulation time; see `time.ts`. There is no wall clock here. */
  private currentTick = 0

  private nextEntityId = 1
  private readonly alive = new Set<number>()
  private readonly stores = new Map<string, Map<number, unknown>>()
  private readonly registeredComponents = new Map<string, ComponentType<unknown>>()
  private readonly pendingDestroy = new Set<number>()
  private readonly systems: System[] = []
  private readonly eventQueues = new Map<string, unknown[]>()
  private stepping = false

  constructor(options: WorldOptions) {
    this.rngInstance = Rng.create(options.seed)
  }

  get tick(): number {
    return this.currentTick
  }

  get entityCount(): number {
    return this.alive.size
  }

  // ---------------------------------------------------------------- entities

  spawn(): EntityId {
    const id = this.nextEntityId++
    this.alive.add(id)
    return id as EntityId
  }

  /**
   * Mark an entity for removal.
   *
   * The entity stops being alive immediately — queries skip it from this moment
   * on — but its components stay readable for the rest of the tick, so a
   * later-registered system can still read a dying entity's position to drop
   * loot there. Storage is released at the end of the tick.
   */
  destroy(entity: EntityId): void {
    if (!this.alive.delete(entity)) return
    this.pendingDestroy.add(entity)
  }

  isAlive(entity: EntityId): boolean {
    return this.alive.has(entity)
  }

  // -------------------------------------------------------------- components

  add<T>(entity: EntityId, type: ComponentType<T>, value: T): void {
    this.storeFor(type).set(entity, value)
  }

  get<T>(entity: EntityId, type: ComponentType<T>): T | undefined {
    return this.stores.get(type.id)?.get(entity) as T | undefined
  }

  /**
   * Read a component that must be present.
   *
   * Prefer this over `get` when the component is guaranteed by the query that
   * produced the entity — it turns a silent `undefined` propagating into NaN
   * damage into a loud, located failure.
   */
  getOrThrow<T>(entity: EntityId, type: ComponentType<T>): T {
    const store = this.stores.get(type.id)
    if (store === undefined || !store.has(entity)) {
      throw new Error(`Entity ${entity} has no component "${type.id}"`)
    }
    return store.get(entity) as T
  }

  has(entity: EntityId, type: ComponentType<unknown>): boolean {
    return this.stores.get(type.id)?.has(entity) ?? false
  }

  remove(entity: EntityId, type: ComponentType<unknown>): void {
    this.stores.get(type.id)?.delete(entity)
  }

  count(type: ComponentType<unknown>): number {
    return this.stores.get(type.id)?.size ?? 0
  }

  /**
   * Find every alive entity that has all of the given components.
   *
   * Returns a materialized array rather than a lazy iterator. Spawning and
   * destroying entities while iterating a query result is normal in game
   * systems, and doing that over a live `Map` iterator is a subtle
   * order-dependent bug. The allocation is worth not having that class of bug.
   *
   * Results are always sorted by **ascending entity id** (decision 0016). This
   * is not a style choice: {@link World.restore} rebuilds component storage in
   * canonical ascending order, which can differ from the live world's insertion
   * order — if query order followed insertion order, a restored world could
   * silently diverge from the original the moment any system consumed rng
   * inside a query loop. Canonical order makes save/restore behavior-preserving
   * by construction, and matches the order combat systems already require
   * (decision 0006).
   *
   * The scan still walks the **first** component's storage, so put the most
   * selective component first: `query(Boss, Position)` not `query(Position, Boss)`.
   */
  query<const T extends readonly ComponentType<unknown>[]>(
    ...types: T
  ): Array<[EntityId, ...ComponentValues<T>]> {
    const results: Array<[EntityId, ...ComponentValues<T>]> = []
    const first = types[0]
    if (first === undefined) return results

    const primary = this.stores.get(first.id)
    if (primary === undefined) return results

    outer: for (const [entity, primaryValue] of primary) {
      if (!this.alive.has(entity)) continue

      const row = [entity, primaryValue] as unknown as [EntityId, ...ComponentValues<T>]
      for (let i = 1; i < types.length; i++) {
        const store = this.stores.get((types[i] as ComponentType<unknown>).id)
        if (store === undefined || !store.has(entity)) continue outer
        row.push(store.get(entity) as never)
      }
      results.push(row)
    }

    // Canonical order: see the doc comment above. Backing maps are usually
    // already ascending (spawn ids are monotonic and components are typically
    // added at spawn time), so this is cheap in practice.
    results.sort((left, right) => left[0] - right[0])
    return results
  }

  /**
   * Resolve a component's backing storage, checking for id collisions.
   *
   * The check runs on every write rather than only on first use — otherwise a
   * second type with the same id would simply find the existing store and
   * silently share it. Reads deliberately skip the check to keep queries cheap;
   * a collision surfaces the moment either type is written, which in practice
   * is immediately.
   */
  private storeFor<T>(type: ComponentType<T>): Map<number, unknown> {
    const registered = this.registeredComponents.get(type.id)
    if (registered === undefined) {
      this.registeredComponents.set(type.id, type as ComponentType<unknown>)
    } else if (registered !== type) {
      throw new Error(
        `Duplicate component id "${type.id}". Two different defineComponent calls share a name, so they would silently share storage.`,
      )
    }

    let store = this.stores.get(type.id)
    if (store === undefined) {
      store = new Map()
      this.stores.set(type.id, store)
    }
    return store
  }

  // ------------------------------------------------------------------ events

  /** Emit an event, visible to systems that run later in this same tick. */
  emit<T>(type: EventType<T>, payload: T): void {
    let queue = this.eventQueues.get(type.id)
    if (queue === undefined) {
      queue = []
      this.eventQueues.set(type.id, queue)
    }
    queue.push(payload)
  }

  /**
   * Every event of this type emitted so far during the current tick.
   *
   * Queues are cleared at the end of each tick, so a consumer must be
   * registered after its producer or it will never see anything.
   */
  events<T>(type: EventType<T>): readonly T[] {
    return (this.eventQueues.get(type.id) ?? []) as T[]
  }

  // ------------------------------------------------------------------- trace

  /**
   * Attach a human-readable trace sink.
   *
   * This is how an agent reads what the simulation actually did. Systems call
   * `world.trace()` at interesting moments; the sim CLI attaches a sink under
   * `--verbose` and prints a timestamped log. Nothing is recorded by default.
   *
   * Trace output is never part of the state hash, so adding or removing a trace
   * call cannot break a golden replay.
   */
  setTraceSink(sink: ((tick: number, message: string) => void) | undefined): void {
    this.traceSink = sink
  }

  private traceSink: ((tick: number, message: string) => void) | undefined

  /**
   * Record an explanation of something that just happened.
   *
   * Takes a thunk so that the message is not built at all when tracing is off —
   * which is the normal case, including every one of the thousands of runs in a
   * nightly balance sweep.
   */
  trace(message: () => string): void {
    if (this.traceSink === undefined) return
    this.traceSink(this.currentTick, message())
  }

  // ----------------------------------------------------------------- systems

  addSystem(system: System): void {
    if (this.stepping) {
      throw new Error(
        `Cannot add system "${system.name}" during a step. System order must be fixed before the simulation runs, or replays are not reproducible.`,
      )
    }
    this.systems.push(system)
  }

  get systemNames(): readonly string[] {
    return this.systems.map((system) => system.name)
  }

  /** Advance the simulation by exactly one tick. */
  step(): void {
    this.currentTick++
    this.stepping = true
    try {
      for (const system of this.systems) {
        system.update(this)
      }
    } finally {
      this.stepping = false
    }

    this.flushDestroyed()
    this.eventQueues.clear()
  }

  /** Advance by `ticks` ticks. */
  run(ticks: number): void {
    for (let i = 0; i < ticks; i++) this.step()
  }

  private flushDestroyed(): void {
    if (this.pendingDestroy.size === 0) return
    for (const entity of this.pendingDestroy) {
      for (const store of this.stores.values()) store.delete(entity)
    }
    this.pendingDestroy.clear()
  }

  // -------------------------------------------------------------- snapshots

  /**
   * A canonical, serializable view of the entire world.
   *
   * Sorted at every level so that two worlds in the same logical state produce
   * identical output regardless of the order operations happened in.
   */
  snapshot(): WorldSnapshot {
    const components: Record<string, Array<[number, unknown]>> = {}

    for (const componentId of [...this.stores.keys()].sort()) {
      const store = this.stores.get(componentId)
      if (store === undefined || store.size === 0) continue

      const entries: Array<[number, unknown]> = []
      for (const [entity, value] of store) {
        if (this.alive.has(entity)) entries.push([entity, value])
      }
      if (entries.length === 0) continue

      entries.sort((left, right) => left[0] - right[0])
      components[componentId] = entries
    }

    // Canonicalize rng words to their signed-int32 representation. Rng's
    // internal arithmetic (`| 0`, `^`) leaves every word signed after any
    // `next()` call — and `create()` warms up with twelve — so for a live world
    // this is a bit-for-bit no-op. But `Rng.fromState` coerces with `>>> 0`,
    // so a *restored* rng reports the unsigned representation of the same
    // bits; without this normalization, restore(s).snapshot() would differ
    // from s in sign only, and a freshly restored world would hash differently
    // from the world it was restored from despite identical behavior.
    const rngState = this.rng.getState()

    return {
      tick: this.currentTick,
      nextEntityId: this.nextEntityId,
      rng: { a: rngState.a | 0, b: rngState.b | 0, c: rngState.c | 0, d: rngState.d | 0 },
      entities: [...this.alive].sort((left, right) => left - right),
      components,
    }
  }

  /**
   * Rebuild a world from a {@link WorldSnapshot} — the load half of save/load.
   *
   * The restored world is behaviorally identical to the one snapshotted: same
   * tick, same entity ids, same component values, same rng position — and,
   * because query order is canonical (ascending entity id, decision 0016), the
   * same *future* once the caller re-registers the same systems in the same
   * order. Systems and trace sinks are code, not data; they are never
   * serialized, and a freshly restored world has none.
   *
   * Only **tick-boundary** snapshots are coherent: `step()` flushes pending
   * destroys and clears event queues before it returns, and `snapshot()`
   * captures neither. Snapshots are only ever taken between steps, so a
   * restored world starts with both empty — exactly like the original did at
   * that boundary.
   *
   * Input is validated strictly and rejected with the offending field named;
   * this method never constructs a corrupt world from malformed data. Component
   * values are deep-copied, so the snapshot (and any live world it came from)
   * is not aliased by the restored world.
   */
  static restore(snapshot: WorldSnapshot): World {
    if (typeof snapshot !== 'object' || snapshot === null) {
      throw new Error('World.restore: snapshot must be an object')
    }
    const { tick, nextEntityId, rng, entities, components } = snapshot

    if (!Number.isInteger(tick) || tick < 0) {
      rejectSnapshot('tick', `must be a non-negative integer, got ${String(tick)}`)
    }
    if (!Number.isInteger(nextEntityId) || nextEntityId < 1) {
      rejectSnapshot('nextEntityId', `must be a positive integer, got ${String(nextEntityId)}`)
    }

    if (typeof rng !== 'object' || rng === null) {
      rejectSnapshot('rng', 'is missing or not an object')
    }
    for (const key of ['a', 'b', 'c', 'd'] as const) {
      const word = (rng as unknown as Record<string, unknown>)[key]
      // Snapshots always carry rng words in signed-int32 form (see snapshot()).
      // Anything outside that range would silently wrap through Rng's `>>> 0`
      // coercion, so it is malformed, not merely unusual.
      if (typeof word !== 'number' || !Number.isInteger(word) || (word | 0) !== word) {
        rejectSnapshot(`rng.${key}`, `must be a signed 32-bit integer, got ${String(word)}`)
      }
    }

    if (!Array.isArray(entities)) {
      rejectSnapshot('entities', 'must be an array')
    }
    let previousEntity = 0
    for (let i = 0; i < entities.length; i++) {
      const id = entities[i]
      if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
        rejectSnapshot(`entities[${i}]`, `must be a positive integer, got ${String(id)}`)
      }
      if (id <= previousEntity) {
        rejectSnapshot(`entities[${i}]`, `(${id}) must be strictly ascending`)
      }
      if (id >= nextEntityId) {
        rejectSnapshot(`entities[${i}]`, `(${id}) must be below nextEntityId (${nextEntityId})`)
      }
      previousEntity = id
    }
    const aliveIds = new Set<number>(entities)

    if (typeof components !== 'object' || components === null || Array.isArray(components)) {
      rejectSnapshot('components', 'must be an object mapping component id to entries')
    }
    for (const componentId of Object.keys(components)) {
      const entries = components[componentId] as unknown
      const where = `components["${componentId}"]`
      if (!Array.isArray(entries) || entries.length === 0) {
        rejectSnapshot(where, 'must be a non-empty array of [entityId, value] pairs')
      }
      let previousInStore = 0
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i] as unknown
        if (!Array.isArray(entry) || entry.length !== 2) {
          rejectSnapshot(`${where}[${i}]`, 'must be an [entityId, value] pair')
        }
        const entityId = entry[0] as unknown
        if (typeof entityId !== 'number' || !Number.isInteger(entityId)) {
          rejectSnapshot(`${where}[${i}]`, `entity id must be an integer, got ${String(entityId)}`)
        }
        if (entityId <= previousInStore) {
          rejectSnapshot(`${where}[${i}]`, `entity id ${entityId} must be strictly ascending`)
        }
        if (!aliveIds.has(entityId)) {
          rejectSnapshot(where, `refers to entity ${entityId}, which is not in snapshot.entities`)
        }
        previousInStore = entityId
      }
    }

    const world = new World({ seed: 0 })
    world.rngInstance = Rng.fromState(rng)
    world.currentTick = tick
    world.nextEntityId = nextEntityId
    for (const id of entities) world.alive.add(id)

    // Sorted keys so the stores map is built identically no matter what key
    // order a parsed save file happens to carry. snapshot() writes them sorted,
    // so for well-formed input this is a no-op.
    for (const componentId of Object.keys(components).sort()) {
      const store = new Map<number, unknown>()
      for (const [entityId, value] of components[componentId] as Array<[number, unknown]>) {
        store.set(entityId, cloneJsonValue(value))
      }
      world.stores.set(componentId, store)
    }

    return world
  }

  /**
   * A 64-bit hash of the entire simulation state.
   *
   * This is the backbone of replay regression: record it once for a known-good
   * run, compare on every CI run afterwards. A mismatch means simulation
   * behavior changed — which is either a bug or an intentional change that
   * needs the replay re-blessed on purpose.
   */
  hash(): string {
    return hashString(stableStringify(this.snapshot()))
  }
}
