import { test, expect } from 'vitest';
import { dueNotifications, LEAD_MS, notifyKey } from '../src/lib/notify';
import type { Block, Status } from '../src/lib/types';

const DAY = '2026-09-24';
const at = (h: number, m = 0) => new Date(2026, 8, 24, h, m).getTime();

const block = (id: string, q: number, status: Status = 'planned'): Block =>
  ({ id, day: DAY, q, len: 2, cat: 'work', title: 'Spotkanie', status, created: 0 });

const kinds = (bs: Block[], now: number, fired = new Set<string>()) =>
  dueNotifications(bs, now, fired).map((n) => `${n.blockId}:${n.kind}`);

test('uprzedzenie pada kwadrans przed początkiem bloku', () => {
  expect(LEAD_MS).toBe(15 * 60 * 1000);
  // blok o 09:00, więc uprzedzenie o 08:45
  expect(kinds([block('b', 36)], at(8, 45))).toEqual(['b:soon']);
});

test('drugie powiadomienie pada na początku bloku', () => {
  expect(kinds([block('b', 36)], at(9, 0))).toEqual(['b:start']);
});

test('poza chwilą wyzwolenia nic nie pada', () => {
  expect(kinds([block('b', 36)], at(8, 30))).toEqual([]);
  expect(kinds([block('b', 36)], at(8, 50))).toEqual([]);
  expect(kinds([block('b', 36)], at(9, 5))).toEqual([]);
});

test('okno wyzwolenia trwa minutę — tyknięcie sekundę później jeszcze łapie', () => {
  expect(kinds([block('b', 36)], at(9, 0) + 59_000)).toEqual(['b:start']);
  expect(kinds([block('b', 36)], at(9, 0) + 61_000)).toEqual([]);
});

test('to, co już padło, nie pada drugi raz', () => {
  const fired = new Set(['b:start']);
  expect(kinds([block('b', 36)], at(9, 0), fired)).toEqual([]);
});

test('powiadamiane są tylko bloki zaplanowane', () => {
  for (const status of ['confirmed', 'active', 'discarded'] as Status[]) {
    expect(kinds([block('b', 36, status)], at(9, 0)), status).toEqual([]);
  }
  expect(kinds([block('b', 36, 'suggested')], at(9, 0))).toEqual([]);
});

test('kilka bloków w tej samej chwili daje kilka powiadomień', () => {
  // q=36 to 09:00 (start), q=37 to 09:15 (kwadrans przed = teraz)
  const got = kinds([block('a', 36), block('b', 37)], at(9, 0));
  expect(got.sort()).toEqual(['a:start', 'b:soon']);
});

test('powiadomienie niesie tytuł bloku i jego godzinę', () => {
  const [n] = dueNotifications([block('b', 36)], at(9, 0), new Set());
  expect(n!.title).toContain('Spotkanie');
  expect(n!.body).toContain('09:00');
});

test('blok bez tytułu nie daje pustego powiadomienia', () => {
  const untitled = { ...block('b', 36), title: '' };
  const [n] = dueNotifications([untitled], at(9, 0), new Set());
  expect(n!.title.trim().length).toBeGreaterThan(0);
});

test('notifyKey łączy blok z rodzajem', () => {
  expect(notifyKey('b', 'soon')).toBe('b:soon');
  expect(notifyKey('b', 'start')).toBe('b:start');
});

test('bloki innych dni nie powiadamiają', () => {
  const tomorrow = { ...block('b', 36), day: '2026-09-25' };
  expect(kinds([tomorrow], at(9, 0))).toEqual([]);
});
