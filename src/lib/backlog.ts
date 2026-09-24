import type { Item } from './types';

/** Backlog to wszystko, co nie należy do dziś: przyszłość i rzeczy bez daty. */
export const isBacklog = (item: Item, today: string): boolean =>
  item.day === null || item.day > today;

export const backlogItems = (items: readonly Item[], today: string): Item[] =>
  items.filter((i) => isBacklog(i, today));

/** Data, po której pozycja jest sortowana: powtarzalna używa najbliższego wystąpienia. */
const sortDate = (i: Item): string | null => i.nextOn ?? i.day;

export function sortBacklog(items: readonly Item[]): Item[] {
  const dated = items.filter((i) => sortDate(i) !== null);
  const undated = items.filter((i) => sortDate(i) === null);
  dated.sort((a, b) => {
    const d = (sortDate(a) as string).localeCompare(sortDate(b) as string);
    return d !== 0 ? d : (a.at ?? -1) - (b.at ?? -1);
  });
  return [...dated, ...undated];
}

/** Najpóźniejszy dzień z pozycjami, wcześniejszy niż `before`. */
export function lastDayWithItems(items: readonly Item[], before: string): string | null {
  let best: string | null = null;
  for (const i of items) {
    if (i.day === null || i.day >= before) continue;
    if (best === null || i.day > best) best = i.day;
  }
  return best;
}

/**
 * Niedokończone zadania z `sourceDay` stają się dzisiejsze i lądują na początku
 * tablicy. Pomijane są rzeczy zrobione (zostają w dniu, w którym je zrobiono),
 * notatki (opisują tamten dzień) i pozycje powiązane z blokiem (blok jest
 * zapisem czasu, który minął).
 *
 * Idempotentne z natury: po przeniesieniu w dniu źródłowym nie ma już czego brać.
 */
export function carryOver(
  items: readonly Item[],
  today: string,
  sourceDay: string | null,
): Item[] {
  if (sourceDay === null) return [...items];
  const moves = items.filter((i) => i.day === sourceDay && i.type === 'task' && !i.block);
  if (!moves.length) return [...items];

  const ids = new Set(moves.map((i) => i.id));
  return [...moves.map((i) => ({ ...i, day: today })), ...items.filter((i) => !ids.has(i.id))];
}
