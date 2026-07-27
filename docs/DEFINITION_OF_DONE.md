# Definition of done

A task is done when every line below is true. Not "mostly true".

## Always

- [ ] `npm run verify` passes locally.
- [ ] There is a test that **fails without your change**. Verify this by
      reverting your change and watching it fail, not by assuming.
- [ ] You touched only the files the task file listed. If you needed others,
      you wrote down why in the task file.
- [ ] No new dependency was added.
- [ ] No test was deleted, skipped, or loosened to reach green.

## If you changed simulation behavior

- [ ] Golden replays either still pass, or you re-blessed them **and** the task
      file records which replays changed and what behavior change explains it.
- [ ] You ran the relevant scenario and read the output:
      `npm run sim -- run <scenario> --seed 1 --verbose`.
- [ ] The change is deterministic: the same seed twice gives the same hash.

## If you added content

- [ ] `npm run content:validate` passes.
- [ ] Filename equals the `id` field.
- [ ] You did not add or edit a central index/manifest file.
- [ ] Cross-references (loot tables, skill ids, monster families) resolve.

## If you added a system to `core`

- [ ] Its position in the system order is deliberate, and you said why in a
      comment if it is not obvious.
- [ ] It has no dependency on wall-clock time, `Math.random`, or the client.
- [ ] Components it introduces are plain JSON-serializable data.

## What "not done" looks like

These are the specific failure modes this project is trying to avoid. If you
catch yourself doing one, stop and report instead.

- Writing a test that asserts whatever the code currently does.
- Re-blessing a golden replay to clear a failure you do not understand.
- Widening a type to `any` or adding `@ts-expect-error` to get past typecheck.
- "Fixing" a balance problem by editing the test's expected numbers.
- Redesigning an interface because the existing one was inconvenient.
- Reporting success without having run the thing.
