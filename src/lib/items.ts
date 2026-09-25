import type { Event, Item } from './machine';
import type { ItemType } from './types';
import { kindOf, openFree } from './view';

/** Notacja bullet journal. Jeden znak na typ, bez powtórzeń. */
export const MARK: Record<ItemType, string> = {
  task: '·',
  done: '×',
  note: '–',
};

export const removeById = (items: readonly Item[], id: string): Item[] =>
  items.filter((i) => i.id !== id);

/**
 * Kolejność pozycji swobodnych to kolejność tablicy — nie ma osobnego pola.
 * Stawia pozycję `id` tuż za `afterId`; `null` zostawia ją tam, gdzie jest
 * (maszyna dokłada nowe na koniec, a koniec listy to właściwe miejsce).
 */
export function placeAfter(items: readonly Item[], id: string, afterId: string | null): Item[] {
  if (afterId === null || afterId === id) return [...items];
  const src = items.find((i) => i.id === id);
  if (!src) return [...items];
  const out = items.filter((i) => i.id !== id);
  const at = out.findIndex((i) => i.id === afterId);
  out.splice(at < 0 ? out.length : at + 1, 0, src);
  return out;
}

/**
 * Przestawienie nieodhaczonej pozycji swobodnej dziś; `toIndex` liczy się w liście
 * takich pozycji BEZ niej. Wykonanych się nie przestawia — stoją w kolejności odhaczenia.
 */
export function moveFree(items: readonly Item[], id: string, toIndex: number): Item[] {
  const free = openFree(items);
  const from = free.findIndex((i) => i.id === id);
  if (from < 0) return [...items];

  const rest = free.filter((i) => i.id !== id);
  const to = Math.min(Math.max(toIndex, 0), rest.length);
  if (to === from) return [...items];

  const src = free[from]!;
  const out = items.filter((i) => i.id !== id);
  const anchor = rest[to];
  const at = anchor ? out.findIndex((i) => i.id === anchor.id) : -1;
  if (at >= 0) out.splice(at, 0, src);
  else {
    // Na koniec listy swobodnych: tuż za ostatnią z nich.
    const last = rest.at(-1);
    const after = last ? out.findIndex((i) => i.id === last.id) : -1;
    out.splice(after < 0 ? out.length : after + 1, 0, src);
  }
  return out;
}

// Trzy znaczniki opisujące pozycję. Przenoszenie między polami odbywa się
// przeciągnięciem, nie zmianą znacznika.
export const CYCLE = ['task', 'done', 'note'] as const;

export function cycleType(type: ItemType, dir: 1 | -1 = 1): ItemType {
  const i = CYCLE.indexOf(type);
  return CYCLE[(i + dir + CYCLE.length) % CYCLE.length]!;
}

/** Nowa pozycja dziedziczy typ, ale nigdy nie rodzi się w stanie końcowym. */
export const typeAfterEnter = (type: ItemType): ItemType => (type === 'note' ? 'note' : 'task');

/**
 * Zdarzenia zamieniające typ pozycji. Graf nie ma bezpośredniego przejścia
 * wykonane ↔ notatka, więc ta zamiana idzie przez otwarte zadanie — dwa
 * zwykłe przejścia, które maszyna sprawdza każde z osobna.
 */
export function retype(item: Item, target: ItemType, copyId: string): Event[] {
  const id = item.id;
  const from = kindOf(item);
  if (from === target) return [];
  const toTask: Event[] =
    from === 'done' ? [{ type: 'markOpen', id }] : from === 'note' ? [{ type: 'toTask', id }] : [];
  if (target === 'task') return toTask;
  if (target === 'done') return [...toTask, { type: 'markDone', id, copyId }];
  return [...toTask, { type: 'toNote', id }];
}
