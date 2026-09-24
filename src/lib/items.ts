import type { ItemType } from './types';

/** Notacja bullet journal. Jeden znak na typ, bez powtórzeń. */
export const MARK: Record<ItemType, string> = {
  task: '·',
  done: '×',
  note: '–',
  scheduled: '<',
  migrated: '>',
};
