import type { Block, Category, Item } from './types';

/**
 * Kategoria pozycji. Pozycja powiązana bierze ją ZAWSZE z bloku, nawet jeśli
 * niesie własną: blok jest źródłem prawdy, a dwa pola mogłyby się rozejść.
 * Pozycja swobodna bierze własną.
 */
export function itemCategory(
  item: Item,
  block: Block | undefined,
  cats: readonly Category[],
): Category | null {
  const id = block ? block.cat : item.cat;
  if (!id) return null;
  return cats.find((c) => c.id === id) ?? null;
}
