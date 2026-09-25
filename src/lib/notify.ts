import type { Item } from './machine';
import { fmtQ, qTime } from './time';
import { isDone, slotOf, timedToday } from './view';

export type NotifyKind = 'soon' | 'start';

export interface DueNotification {
  blockId: string;
  kind: NotifyKind;
  title: string;
  body: string;
}

/** Ile przed początkiem slotu pada uprzedzenie. */
export const LEAD_MS = 15 * 60 * 1000;

/**
 * Szerokość okna, w którym wyzwalacz uznaje się za „teraz". Zegar tyka co
 * sekundę, więc wystarczyłoby znacznie mniej — minuta daje zapas na zajęty
 * wątek i na to, że karta w tle dostaje tyknięcia rzadziej.
 */
const WINDOW_MS = 60 * 1000;

export const notifyKey = (blockId: string, kind: NotifyKind) => `${blockId}:${kind}`;

/**
 * Co powinno paść w tym tyknięciu. Bez trwałego stanu: wyzwalacz jest „teraz"
 * tylko przez minutę, więc przeładowanie strony nie odtwarza porannych
 * powiadomień, a zbiór `fired` wystarczy trzymać w pamięci.
 */
export function dueNotifications(
  items: readonly Item[],
  day: string,
  now: number,
  fired: ReadonlySet<string>,
): DueNotification[] {
  const out: DueNotification[] = [];

  for (const i of timedToday(items)) {
    // Tylko otwarte: wykonane nie potrzebuje przypomnienia.
    if (isDone(i)) continue;
    const slot = slotOf(i)!;
    const start = qTime(day, slot);
    const label = i.text.trim() || 'Blok czasu';
    const hhmm = fmtQ(day, slot);

    for (const [kind, trigger] of [
      ['soon', start - LEAD_MS],
      ['start', start],
    ] as const) {
      if (now < trigger || now >= trigger + WINDOW_MS) continue;
      if (fired.has(notifyKey(i.id, kind))) continue;
      out.push({
        blockId: i.id,
        kind,
        title: kind === 'soon' ? `Za 15 minut: ${label}` : label,
        body: kind === 'soon' ? `Początek o ${hhmm}` : `Zaczyna się teraz — ${hhmm}`,
      });
    }
  }
  return out;
}
