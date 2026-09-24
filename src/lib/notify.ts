import { fmtQ, qTime } from './time';
import type { Block } from './types';

export type NotifyKind = 'soon' | 'start';

export interface DueNotification {
  blockId: string;
  kind: NotifyKind;
  title: string;
  body: string;
}

/** Ile przed początkiem bloku pada uprzedzenie. */
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
  blocks: readonly Block[],
  now: number,
  fired: ReadonlySet<string>,
): DueNotification[] {
  const out: DueNotification[] = [];

  for (const b of blocks) {
    // Tylko zaplanowane: potwierdzony już był, aktywny właśnie trwa,
    // a sugestia nie jest jeszcze zobowiązaniem.
    if (b.status !== 'planned') continue;

    const start = qTime(b.day, b.q);
    const label = b.title.trim() || 'Blok czasu';
    const hhmm = fmtQ(b.day, b.q);

    for (const [kind, trigger] of [
      ['soon', start - LEAD_MS],
      ['start', start],
    ] as const) {
      if (now < trigger || now >= trigger + WINDOW_MS) continue;
      if (fired.has(notifyKey(b.id, kind))) continue;
      out.push({
        blockId: b.id,
        kind,
        title: kind === 'soon' ? `Za 15 minut: ${label}` : label,
        body: kind === 'soon' ? `Początek o ${hhmm}` : `Zaczyna się teraz — ${hhmm}`,
      });
    }
  }
  return out;
}
