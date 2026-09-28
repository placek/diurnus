import { test, expect } from 'vitest';
import { describeStatus } from '../src/lib/sync/describe';
import { initialStatus } from '../src/lib/sync/runner';
import type { SyncStatus } from '../src/lib/sync/runner';

const at = (h: number, m: number, day = 28) => new Date(2026, 8, day, h, m).getTime();
const NOW = at(12, 45);
const s = (patch: Partial<SyncStatus>): SyncStatus => ({ ...initialStatus(), ...patch });

test('stan po ludzku, z godziną i terminem następnej próby', () => {
  expect(describeStatus(s({}), NOW)).toEqual({ text: 'Połączono', tone: 'ok', attention: false });
  expect(describeStatus(s({ at: at(12, 40) }), NOW).text).toBe('Zsynchronizowano 12:40');
  expect(describeStatus(s({ at: at(9, 5, 27) }), NOW).text).toBe('Zsynchronizowano 27.09 09:05');
  expect(describeStatus(s({ at: at(12, 40), pending: true }), NOW).text).toBe(
    'Zsynchronizowano 12:40 · zmiany czekają',
  );
  expect(describeStatus(s({ phase: 'busy' }), NOW)).toMatchObject({
    text: 'Synchronizuję…',
    tone: 'busy',
  });
  expect(describeStatus(s({ phase: 'standby' }), NOW).text).toContain('inna karta');
  expect(describeStatus(s({ phase: 'offline', retryAt: at(12, 46) }), NOW)).toEqual({
    text: 'Brak połączenia — zmiany czekają — następna próba o 12:46',
    tone: 'warn',
    attention: false,
  });
  expect(describeStatus(s({ phase: 'rate-limit', retryAt: at(13, 0) }), NOW).text).toBe(
    'Limit zapytań GitHuba — następna próba o 13:00',
  );
  expect(describeStatus(s({ phase: 'auth' }), NOW)).toMatchObject({ tone: 'error' });
  expect(describeStatus(s({ phase: 'other', message: 'GitHub odpowiedział 500' }), NOW).text).toBe(
    'Błąd: GitHub odpowiedział 500',
  );
});

test('konflikt albo odrzucone zmiany wymagają uwagi, nawet gdy wszystko wysłane', () => {
  const c = { name: 'BACKLOG.md', remote: null, mine: '# Backlog\n' };
  expect(describeStatus(s({ conflicts: [c] }), NOW)).toMatchObject({
    tone: 'warn',
    attention: true,
  });
  expect(
    describeStatus(s({ rejected: { names: ['x.md'], errors: ['x.md:1: zła'] } }), NOW).attention,
  ).toBe(true);
});
