import { z } from 'zod'

import { IdSchema } from './common'

/**
 * Dungeon templates: hand-authored room layouts.
 *
 * This schema mirrors `DungeonTemplate` in `@triablo/core` (core cannot
 * import content, so the shape is duplicated by design; this file is the
 * follower if they diverge). The tiles are the single source of truth for
 * geometry — there is deliberately no door/edge list to drift out of sync
 * with them. Legend and shape are decision 0024; the geometric rules the
 * schema cannot see (overlap, connectivity, spawn placement) are enforced by
 * running the real `buildDungeon` during cross-reference checking.
 */

/** `#` wall, `.` floor, `E` entrance, `X` exit. `E`/`X` count as floor. */
const TileRowSchema = z
  .string()
  .min(1)
  .regex(/^[#.EX]+$/, "tile rows may only contain '#', '.', 'E', and 'X'")

/** A monster placement in room-local coordinates. Must land on a floor tile. */
const DungeonSpawnSchema = z
  .object({
    /** Reference to a Monster id. Checked by checkReferences(). */
    monster: IdSchema,
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
  })
  .strict()

const DungeonRoomSchema = z
  .object({
    id: IdSchema,
    /** Top-left corner of the room in dungeon space. */
    offset: z
      .object({
        x: z.number().int().nonnegative(),
        y: z.number().int().nonnegative(),
      })
      .strict(),
    tiles: z.array(TileRowSchema).min(1),
    spawns: z.array(DungeonSpawnSchema).default([]),
  })
  .strict()
  .superRefine((room, ctx) => {
    const firstRow = room.tiles[0]
    if (firstRow === undefined) return
    room.tiles.forEach((row, index) => {
      if (row.length !== firstRow.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `ragged tile rows: row 0 has width ${firstRow.length}, row ${index} has width ${row.length}`,
          path: ['tiles', index],
        })
      }
    })
  })

export const DungeonSchema = z
  .object({
    id: IdSchema,
    name: z.string().min(1),
    rooms: z.array(DungeonRoomSchema).min(1),
  })
  .strict()
  .superRefine((dungeon, ctx) => {
    // Exactly one entrance and one exit across the whole dungeon. The builder
    // re-checks this (core cannot assume schema-validated input), but catching
    // it here points at the file with a schema-shaped message.
    let entrances = 0
    let exits = 0
    for (const room of dungeon.rooms) {
      for (const row of room.tiles) {
        for (const ch of row) {
          if (ch === 'E') entrances++
          if (ch === 'X') exits++
        }
      }
    }
    if (entrances !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `expected exactly one entrance 'E' across all rooms, found ${entrances}`,
        path: ['rooms'],
      })
    }
    if (exits !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `expected exactly one exit 'X' across all rooms, found ${exits}`,
        path: ['rooms'],
      })
    }
  })
export type Dungeon = z.infer<typeof DungeonSchema>
