// Public surface of @triablo/content.
//
// Platform-neutral: schemas, validation, and indexed lookup. The disk loader
// lives in `@triablo/content/node` because browsers have no filesystem.

export {
  checkReferences,
  ContentRegistry,
  emptyRawBundle,
  loadContent,
  parseBundle,
} from './registry'
export type { ContentBundle, ContentIssue, RawBundle, RawEntry } from './registry'

export * from './schemas'
