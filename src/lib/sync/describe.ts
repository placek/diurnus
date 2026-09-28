import { pad } from '../time';
import type { SyncStatus } from './runner';

/*
 * Stan synchronizacji po ludzku — dla ustawień i ikonki w pasku. Czysta
 * funkcja stanu i chwili, więc widok nie liczy niczego sam.
 */

export type Tone = 'ok' | 'busy' | 'warn' | 'error';

export interface StatusText {
  text: string;
  tone: Tone;
  /** coś czeka na decyzję użytkownika: konflikt albo odrzucone zmiany */
  attention: boolean;
}

const clock = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Godzina, a gdy to nie dziś — także dzień. */
function when(t: number, now: number): string {
  const d = new Date(t);
  const n = new Date(now);
  const sameDay =
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate();
  return sameDay ? clock(t) : `${d.getDate()}.${pad(d.getMonth() + 1)} ${clock(t)}`;
}

const retry = (s: SyncStatus, now: number) =>
  s.retryAt !== null ? ` — następna próba o ${when(s.retryAt, now)}` : '';

export function describeStatus(s: SyncStatus, now: number): StatusText {
  const attention = s.conflicts.length > 0 || s.rejected !== null;
  const waiting = s.pending ? ' · zmiany czekają' : '';
  switch (s.phase) {
    case 'busy':
      return { text: 'Synchronizuję…', tone: 'busy', attention };
    case 'standby':
      return { text: 'Synchronizuje inna karta tej przeglądarki', tone: 'ok', attention };
    case 'idle':
      return {
        text: (s.at !== null ? `Zsynchronizowano ${when(s.at, now)}` : 'Połączono') + waiting,
        tone: attention ? 'warn' : 'ok',
        attention,
      };
    case 'offline':
      return { text: `Brak połączenia — zmiany czekają${retry(s, now)}`, tone: 'warn', attention };
    case 'rate-limit':
      return { text: `Limit zapytań GitHuba${retry(s, now)}`, tone: 'warn', attention };
    case 'auth':
      return { text: 'Token wygasł albo nie ma dostępu', tone: 'error', attention };
    case 'other':
      return { text: `Błąd: ${s.message ?? 'nieznany'}${retry(s, now)}`, tone: 'error', attention };
  }
}
