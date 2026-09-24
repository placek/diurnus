import { rel } from './time';
import type { Block, Item } from './types';

/**
 * Jeden schemat barw dla obu list:
 *   incoming — biały: jeszcze przed nami
 *   active   — pomarańczowy: dzieje się teraz
 *   done     — szary: zrobione, schodzi w tło
 *   missed   — czerwony: czas minął, a rzecz nie
 *   note     — przygaszony: notatka nie ma stanu, bo nie jest zobowiązaniem
 */
export type Tone = 'incoming' | 'active' | 'done' | 'missed' | 'note';

export function itemTone(item: Item, block: Block | undefined, now: number): Tone {
  if (item.type === 'note') return 'note';

  // Pozycja bez bloku nie ma pory, więc nie może być ani w toku, ani przegapiona.
  if (!block) return item.type === 'done' ? 'done' : 'incoming';

  if (block.status === 'confirmed') return 'done';
  if (block.status === 'active') return 'active';
  return rel(block.day, block.q, block.q + block.len, now) === 'past' ? 'missed' : 'incoming';
}
