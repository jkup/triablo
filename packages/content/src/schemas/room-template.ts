import { z } from 'zod'

import { IdSchema } from './common'

/**
 * Room templates: the reusable rooms procedural generation recombines.
 *
 * A room template is a dungeon room (decision 0024) with the dungeon-level
 * parts subtracted:
 *
 * - **No `offset`.** Placement belongs to the generator, which assigns each
 *   placed copy a non-negative offset in dungeon space (decision 0026).
 * - **No `E`/`X`.** Those are dungeon-level singletons — exactly one of each
 *   per dungeon (decision 0024) — so a reusable room cannot carry one. The
 *   generator rewrites one floor tile in its first and last room. The
 *   surviving legend is therefore `#` wall and `.` floor, which is exactly
 *   the subset `Grid.fromAscii` accepts; `checkReferences` exploits that to
 *   run real geometry checks on a template that has no fixed position.
 * - **No monster ids.** `spawnSlots` say *where* a monster may stand, never
 *   *what* stands there. Decision 0026 already made spawns room-local so
 *   rooms could be recombined; positions-only slots finish the job — the
 *   recipe picks the monsters, so the same room serves a crypt and a nest.
 * - **No door list**, as everywhere: connectivity is derived from the tiles
 *   (decision 0025). A template's connection points are its edge floor
 *   tiles; the chain generator needs a west and an east one, which
 *   `checkReferences` requires.
 *
 * Size caps are decision 0037 (owner-ratified, not to be tuned here) and
 * decision 0041 records the rest of the above.
 */

/** Owner-ratified template size caps (decision 0037). */
export const ROOM_TEMPLATE_MIN_SIZE = 3
export const ROOM_TEMPLATE_MAX_WIDTH = 11
export const ROOM_TEMPLATE_MAX_HEIGHT = 9

/** `#` wall, `.` floor. No `E`/`X`: those are dungeon-level, not room-level. */
const TileRowSchema = z
  .string()
  .min(1)
  .regex(/^[#.]+$/, "room template tile rows may only contain '#' and '.'")

/**
 * A place a monster may be placed, in room-local coordinates. Must land on a
 * floor tile — proved against the real grid in `checkReferences`.
 */
const SpawnSlotSchema = z
  .object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
  })
  .strict()

export const RoomTemplateSchema = z
  .object({
    id: IdSchema,
    tiles: z.array(TileRowSchema).min(ROOM_TEMPLATE_MIN_SIZE).max(ROOM_TEMPLATE_MAX_HEIGHT),
    spawnSlots: z.array(SpawnSlotSchema).default([]),
  })
  .strict()
  .superRefine((template, ctx) => {
    const firstRow = template.tiles[0]
    if (firstRow === undefined) return

    template.tiles.forEach((row, index) => {
      if (row.length !== firstRow.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `ragged tile rows: row 0 has width ${firstRow.length}, row ${index} has width ${row.length}`,
          path: ['tiles', index],
        })
      }
    })

    // Width is a property of the rows, so it cannot be expressed as an array
    // constraint the way height is; height's bounds live on the array above.
    if (firstRow.length < ROOM_TEMPLATE_MIN_SIZE || firstRow.length > ROOM_TEMPLATE_MAX_WIDTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `room width must be between ${ROOM_TEMPLATE_MIN_SIZE} and ${ROOM_TEMPLATE_MAX_WIDTH} tiles, got ${firstRow.length}`,
        path: ['tiles', 0],
      })
    }
  })
export type RoomTemplate = z.infer<typeof RoomTemplateSchema>
