import { QDAY } from './types';
import type { Block } from './types';

// Mapa kwant → blok dla jednego dnia. Klienckie zastąpienie ograniczenia
// wykluczającego nakładanie się, które w fazie z bazą przejmie GiST.
export function occ(blocks: readonly Block[], day: string): (Block | null)[] {
  const o: (Block | null)[] = new Array(QDAY).fill(null);
  for (const b of blocks) {
    if (b.day !== day || b.status === 'discarded') continue;
    for (let i = Math.max(0, b.q); i < Math.min(b.q + b.len, QDAY); i++) o[i] = b;
  }
  return o;
}

// Największy wolny wycinek zaczynający się w q, nie dłuższy niż `max`.
export function fit(
  o: readonly (Block | null)[],
  q: number,
  max = 2,
): { q: number; len: number } | null {
  if (q < 0 || q >= QDAY || o[q]) return null;
  let len = 0;
  while (len < max && q + len < QDAY && !o[q + len]) len++;
  return len ? { q, len } : null;
}

export const activeBlock = (blocks: readonly Block[]) =>
  blocks.find((b) => b.status === 'active');
