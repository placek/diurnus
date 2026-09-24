import { catOf, catOrder, colorOf, rootOf } from './categories';
import type { Block, Category } from './types';

export interface CatSummary {
  name: string;
  quanta: number;
  kids: { name: string; quanta: number }[];
}

export interface TokenStats {
  /** kolory kwantów wykonanych, uporządkowane wg kolejności kategorii */
  done: string[];
  /** kolory kwantów zaplanowanych */
  plan: string[];
  usedQ: number;
  totalQ: number;
  perCat: CatSummary[];
}

// Pasek tokenów liczy wyłącznie kwanty w widocznym oknie doby: zwężenie dnia
// zwęża też mianownik, więc proporcja pozostaje uczciwa.
export function tokenStats(
  blocks: readonly Block[],
  day: string,
  cats: readonly Category[],
  q0: number,
  q1: number,
): TokenStats {
  const order = catOrder(cats);
  const sorted = blocks
    .filter((b) => b.day === day && b.status !== 'discarded')
    .slice()
    .sort((a, b) => (order.get(a.cat) ?? 999) - (order.get(b.cat) ?? 999) || a.q - b.q);

  const done: string[] = [];
  const plan: string[] = [];
  const perCat = new Map<string, { quanta: number; kids: Map<string, number> }>();

  for (const b of sorted) {
    const c = catOf(cats, b.cat);
    const col = colorOf(cats, c);
    // Blok w toku liczy się jako wykonany: ten czas już jest wydawany, a pokazanie
    // go jako planu cofałoby pasek w momencie zakończenia bloku.
    const isDone = b.status === 'confirmed' || b.status === 'active';

    let visible = 0;
    for (let i = b.q; i < b.q + b.len; i++) {
      if (i < q0 || i >= q1) continue;
      (isDone ? done : plan).push(col);
      visible++;
    }
    if (!isDone || !visible) continue;

    const root = rootOf(cats, c);
    const entry = perCat.get(root.name) ?? { quanta: 0, kids: new Map<string, number>() };
    entry.quanta += visible;
    if (c.parent) entry.kids.set(c.name, (entry.kids.get(c.name) ?? 0) + visible);
    perCat.set(root.name, entry);
  }

  return {
    done,
    plan,
    usedQ: done.length + plan.length,
    totalQ: q1 - q0,
    perCat: [...perCat].map(([name, e]) => ({
      name,
      quanta: e.quanta,
      kids: [...e.kids].map(([n, q]) => ({ name: n, quanta: q })),
    })),
  };
}
