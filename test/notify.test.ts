import { test, expect } from 'vitest';
import { dueNotifications, LEAD_MS, notifyKey } from '../src/lib/notify';
import type { Item } from '../src/lib/machine';

const DAY = '2026-09-24';
const at = (h: number, m = 0) => new Date(2026, 8, 24, h, m).getTime();

const task = (id: string, slot: number, done = false, text = 'Spotkanie'): Item => ({
  id,
  text,
  state: { tag: 'today-task', done, slot },
});

const kinds = (items: Item[], now: number, fired = new Set<string>()) =>
  dueNotifications(items, DAY, now, fired).map((n) => `${n.blockId}:${n.kind}`);

test('uprzedzenie pada kwadrans przed początkiem slotu', () => {
  expect(LEAD_MS).toBe(15 * 60 * 1000);
  expect(kinds([task('b', 36)], at(8, 45))).toEqual(['b:soon']);
});

test('drugie powiadomienie pada na początku slotu', () => {
  expect(kinds([task('b', 36)], at(9, 0))).toEqual(['b:start']);
});

test('poza chwilą wyzwolenia nic nie pada', () => {
  expect(kinds([task('b', 36)], at(8, 30))).toEqual([]);
  expect(kinds([task('b', 36)], at(8, 50))).toEqual([]);
  expect(kinds([task('b', 36)], at(9, 5))).toEqual([]);
});

test('okno wyzwolenia trwa minutę — tyknięcie sekundę później jeszcze łapie', () => {
  expect(kinds([task('b', 36)], at(9, 0) + 59_000)).toEqual(['b:start']);
  expect(kinds([task('b', 36)], at(9, 0) + 61_000)).toEqual([]);
});

test('to, co już padło, nie pada drugi raz', () => {
  expect(kinds([task('b', 36)], at(9, 0), new Set(['b:start']))).toEqual([]);
});

test('powiadamiane są tylko otwarte zadania ze slotem', () => {
  const others: Item[] = [
    task('done', 36, true),
    { id: 'free', text: 'X', state: { tag: 'today-task', done: false, slot: null } },
    { id: 'note', text: 'X', state: { tag: 'today-note' } },
    {
      id: 'bl',
      text: 'X',
      state: { tag: 'backlog-task', when: { type: 'dateSlot', date: DAY, slot: 36 } },
    },
  ];
  expect(kinds(others, at(9, 0))).toEqual([]);
});

test('kilka zadań w tej samej chwili daje kilka powiadomień', () => {
  // slot 36 to 09:00 (start), slot 37 to 09:15 (kwadrans przed = teraz)
  expect(kinds([task('a', 36), task('b', 37)], at(9, 0)).sort()).toEqual(['a:start', 'b:soon']);
});

test('powiadomienie niesie tekst zadania i jego godzinę', () => {
  const [n] = dueNotifications([task('b', 36)], DAY, at(9, 0), new Set());
  expect(n!.title).toContain('Spotkanie');
  expect(n!.body).toContain('09:00');
});

test('zadanie bez tekstu nie daje pustego powiadomienia', () => {
  const [n] = dueNotifications([task('b', 36, false, '')], DAY, at(9, 0), new Set());
  expect(n!.title.trim().length).toBeGreaterThan(0);
});

test('notifyKey łączy pozycję z rodzajem', () => {
  expect(notifyKey('b', 'soon')).toBe('b:soon');
  expect(notifyKey('b', 'start')).toBe('b:start');
});
