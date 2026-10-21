import type { Item } from './machine';
import { descLines } from './md/line';
import type { State } from './types';

/*
 * Stan z dokumentów (z magazynu albo z pliku) nie zna identyfikatorów pozycji
 * ani chwil ich utworzenia: `parseFiles` nadaje identyfikatory z miejsca w pliku
 * (`2026-10-21.md:3`), a dopisanie jednej linii przesuwa wszystkie pod nią.
 * Wiersze list są kluczowane identyfikatorem, więc taki stan przerysowałby
 * każdy wiersz — i zabrał fokus z pozycji, w której ktoś właśnie pisze.
 *
 * Tu pozycja, która się nie zmieniła, zostaje tą samą pozycją: z tym samym
 * identyfikatorem, chwilą utworzenia i treścią co do znaku. Wzorce mają identyfikator zapisany w pliku (`^id`),
 * na nim wiszą kopie, więc ich nie ruszamy.
 */

const isPattern = (i: Item) => i.state.tag === 'backlog-task' && i.state.when?.type === 'recurring';

/**
 * Wszystko, co pozycja niesie poza identyfikatorem i chwilą utworzenia — tak,
 * jak zapisuje to plik: opis bez końcowych pustych linii, kroki bez spacji
 * wokół tekstu. Pozycja, w której ktoś właśnie pisze, bywa „brudniejsza" niż
 * jej zapis, a to wciąż ta sama pozycja.
 */
function signature(i: Item): string {
  return JSON.stringify([
    i.state,
    i.text,
    i.cat ?? null,
    descLines(i.desc).join('\n') || null,
    i.steps?.length ? i.steps.map((s) => [s.text.trim(), s.done]) : null,
    i.from ?? null,
  ]);
}

/**
 * `next` z identyfikatorami i chwilami utworzenia z `prev` tam, gdzie pozycja
 * jest ta sama. Pozycje takie same w treści dobierają się po kolei.
 */
export function keepIdentity(next: State, prev: Pick<State, 'items'>): State {
  const pool = new Map<string, Item[]>();
  for (const p of prev.items) {
    if (isPattern(p)) continue;
    const k = signature(p);
    pool.set(k, [...(pool.get(k) ?? []), p]);
  }
  // Identyfikatory wzorców są stałe — żadna inna pozycja nie może ich zająć.
  const taken = new Set(next.items.filter(isPattern).map((i) => i.id));

  const out: (Item | null)[] = next.items.map((i) => {
    if (isPattern(i)) return i;
    const same = pool.get(signature(i));
    while (same?.length) {
      const p = same.shift()!;
      if (taken.has(p.id)) continue;
      taken.add(p.id);
      // Ta sama pozycja — zostaje dokładnie taka, jaka jest tutaj, łącznie
      // z niedokończonym pisaniem.
      return p;
    }
    return null; // nowa albo zmieniona — identyfikator z pliku, o ile wolny
  });

  return {
    ...next,
    items: out.map((i, n) => {
      if (i) return i;
      const fresh = next.items[n]!;
      let id = fresh.id;
      for (let k = 2; taken.has(id); k++) id = `${fresh.id}~${k}`;
      taken.add(id);
      return id === fresh.id ? fresh : { ...fresh, id };
    }),
  };
}
