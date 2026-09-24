import type { Item, ItemType } from './types';

/** Notacja bullet journal. Jeden znak na typ, bez powtórzeń. */
export const MARK: Record<ItemType, string> = {
  task: '·',
  done: '×',
  note: '–',
  scheduled: '<',
  migrated: '>',
};

/** Lista jednego dnia. `filter` zachowuje kolejność tablicy, więc pozycja
 *  w tablicy JEST kolejnością — nie ma osobnego pola `order`. */
export const dayItems = (items: readonly Item[], day: string): Item[] =>
  items.filter((i) => i.day === day);

export const newItem = (
  day: string,
  type: ItemType,
  created: number,
  makeId: () => string,
): Item => ({ id: makeId(), day, text: '', type, created });

// Indeks liczony w PEŁNEJ tablicy, nie w przefiltrowanej: dni mogą się
// przeplatać, a wstawka ma trafić tuż za swoją pozycją, nie za pozycją
// o tym samym numerze w innym dniu.
export function insertAfter(
  items: readonly Item[],
  afterId: string | null,
  item: Item,
): Item[] {
  const out = [...items];
  if (afterId === null) {
    const last = out.map((x) => x.day).lastIndexOf(item.day);
    out.splice(last < 0 ? out.length : last + 1, 0, item);
    return out;
  }
  const i = out.findIndex((x) => x.id === afterId);
  out.splice(i < 0 ? out.length : i + 1, 0, item);
  return out;
}

export const removeById = (items: readonly Item[], id: string): Item[] =>
  items.filter((i) => i.id !== id);
