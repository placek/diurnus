import { catOf, catOrder, colorOf, rootOf } from './categories';
import { SLOT_LEN } from './machine';
import type { Item } from './machine';
import type { Category } from './types';
import { isDone, slotOf, timedToday } from './view';

/** Kolor zadania bez kategorii — przygaszony, żeby nie udawał kategorii. */
export const NO_CAT_COLOR = 'fg-faint';

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
  items: readonly Item[],
  cats: readonly Category[],
  q0: number,
  q1: number,
): TokenStats {
  const order = catOrder(cats);
  const sorted = timedToday(items).sort(
    (a, b) =>
      (order.get(a.cat ?? '') ?? 999) - (order.get(b.cat ?? '') ?? 999) || slotOf(a)! - slotOf(b)!,
  );

  const done: string[] = [];
  const plan: string[] = [];
  const perCat = new Map<string, { quanta: number; kids: Map<string, number> }>();

  for (const i of sorted) {
    const c = i.cat ? catOf(cats, i.cat) : null;
    const col = c ? colorOf(cats, c) : NO_CAT_COLOR;
    // Tylko wykonanie liczy się jako wykonane: upływ czasu nie zmienia stanu.
    const finished = isDone(i);
    const slot = slotOf(i)!;

    let visible = 0;
    for (let q = slot; q < slot + SLOT_LEN; q++) {
      if (q < q0 || q >= q1) continue;
      (finished ? done : plan).push(col);
      visible++;
    }
    if (!finished || !visible || !c) continue;

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
