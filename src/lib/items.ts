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

// Tab cykluje TYLKO znaczniki opisujące stan pozycji w tym dniu. `scheduled`
// i `migrated` są poza cyklem, bo ich ustawienie zapisuje do listy innego
// dnia — dwa naciśnięcia w tę i z powrotem zostawiłyby tam duplikaty.
export const CYCLE = ['task', 'done', 'note'] as const;

export function cycleType(type: ItemType, dir: 1 | -1 = 1): ItemType {
  const i = CYCLE.indexOf(type as (typeof CYCLE)[number]);
  if (i < 0) return 'task'; // wyjście ze stanu przeniesionego
  return CYCLE[(i + dir + CYCLE.length) % CYCLE.length]!;
}

/** Nowa pozycja dziedziczy typ, ale nigdy nie rodzi się w stanie końcowym. */
export const typeAfterEnter = (type: ItemType): ItemType =>
  type === 'note' ? 'note' : 'task';

// Kopia trafia na koniec listy dnia docelowego, źródło dostaje znacznik
// i `movedTo`. Ustawione `movedTo` blokuje powtórkę: bez tego ponowny wybór
// tego samego typu dosypywałby kopie do dnia, na który nikt nie patrzy.
export function migrateTo(
  items: readonly Item[],
  id: string,
  targetDay: string,
  created: number,
  makeId: () => string,
  type: 'migrated' | 'scheduled' = 'migrated',
): Item[] {
  const src = items.find((i) => i.id === id);
  if (!src || src.movedTo) return [...items];

  const copy: Item = { id: makeId(), day: targetDay, text: src.text, type: 'task', created };
  const withCopy = insertAfter(items, null, copy);
  return withCopy.map((i) => (i.id === id ? { ...i, type, movedTo: targetDay } : i));
}
