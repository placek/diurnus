import { occ } from './occupancy';
import type { Block, Item } from './types';

/** Blok, którego odbiciem jest ta pozycja. */
export const blockOfItem = (blocks: readonly Block[], item: Item): Block | undefined =>
  item.block ? blocks.find((b) => b.id === item.block) : undefined;

// Bloki `discarded` nie są blokami dnia w sensie siatki — nie zajmują miejsca
// i nie dostają pozycji.
const live = (blocks: readonly Block[], day: string | null) =>
  blocks.filter((b) => b.status !== 'discarded' && (day === null || b.day === day));

/**
 * Cały niezmiennik: każdy blok ma dokładnie jedną pozycję, każda pozycja
 * z `block` ma swój blok. Dwie operacje, obie idempotentne — funkcja wykonuje
 * się przy KAŻDEJ mutacji, więc drugie wywołanie nie może nic dodać.
 *
 * `day === null` uzgadnia wszystkie dni (migracja schematu); konkretny dzień
 * ogranicza się do niego i nie rusza pozycji z pozostałych.
 */
export function reconcile(
  items: readonly Item[],
  blocks: readonly Block[],
  day: string | null,
  created: number,
  makeId: () => string,
): Item[] {
  const inScope = (d: string) => day === null || d === day;
  const alive = new Set(live(blocks, day).map((b) => b.id));

  // 1. Usuń pozycje wskazujące na blok, którego nie ma (albo już nie liczy się jako blok).
  const kept = items.filter((i) => !i.block || !inScope(i.day) || alive.has(i.block));

  // 2. Dołóż pozycje dla bloków, które jeszcze swojej nie mają.
  const taken = new Set(kept.map((i) => i.block).filter(Boolean) as string[]);
  const added: Item[] = live(blocks, day)
    .filter((b) => !taken.has(b.id))
    .map((b) => ({
      id: makeId(),
      day: b.day,
      text: b.title,
      type: 'task' as const,
      created,
      block: b.id,
    }));

  return added.length ? [...kept, ...added] : kept;
}

/** Pozycje powiązane danego dnia, w kolejności godzin swoich bloków. */
export function linkedItems(
  items: readonly Item[],
  blocks: readonly Block[],
  day: string,
): Item[] {
  return items
    .filter((i) => i.day === day && i.block)
    .map((i) => ({ i, b: blockOfItem(blocks, i) }))
    .filter((x): x is { i: Item; b: Block } => x.b !== undefined)
    .sort((x, y) => x.b.q - y.b.q)
    .map((x) => x.i);
}

/** Pozycje swobodne danego dnia, w kolejności tablicy. */
export const freeItems = (items: readonly Item[], day: string): Item[] =>
  items.filter((i) => i.day === day && !i.block);

/** Czy przedział `[q, q+len)` jest w danym dniu wolny. */
export function slotFree(
  blocks: readonly Block[],
  day: string,
  q: number,
  len: number,
  exceptId?: string,
): boolean {
  const map = occ(
    blocks.filter((b) => b.id !== exceptId),
    day,
  );
  for (let i = q; i < q + len; i++) if (map[i]) return false;
  return true;
}
