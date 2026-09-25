import { test, expect } from 'vitest';
import type { Item, ItemState } from '../src/lib/machine';
import {
  activeNow,
  backlogList,
  canClaim,
  doneToday,
  categoryOf,
  freeToday,
  isBacklog,
  isToday,
  itemTone,
  kindOf,
  occ,
  openFree,
  openTimed,
  soonOf,
  timedToday,
  todayList,
} from '../src/lib/view';

const DAY = '2026-09-25';
const HOURS = { q0: 24, q1: 88 };
const at = (h: number, m = 0) => new Date(2026, 8, 25, h, m).getTime();
const it = (id: string, state: ItemState, cat?: string): Item => ({
  id,
  text: id,
  state,
  ...(cat ? { cat } : {}),
});
const tt = (id: string, slot: number | null = null, done = false) =>
  it(id, { tag: 'today-task', done, slot });

test('kindOf: znacznik wynika ze stanu', () => {
  expect(kindOf(tt('a'))).toBe('task');
  expect(kindOf(tt('a', 36, true))).toBe('done');
  expect(kindOf(it('n', { tag: 'today-note' }))).toBe('note');
  expect(kindOf(it('b', { tag: 'backlog-task', when: null }))).toBe('task');
  expect(kindOf(it('bn', { tag: 'backlog-note' }))).toBe('note');
  expect(kindOf(it('p', { tag: 'past-done', day: '2026-09-24', slot: null }))).toBe('done');
});

test('isToday i isBacklog dzielą pozycje na dwa pola; przeszłość nie należy do żadnego', () => {
  const past = it('p', { tag: 'past-note', day: '2026-09-24' });
  expect([isToday(tt('a')), isBacklog(tt('a'))]).toEqual([true, false]);
  expect([
    isToday(it('b', { tag: 'backlog-note' })),
    isBacklog(it('b', { tag: 'backlog-note' })),
  ]).toEqual([false, true]);
  expect([isToday(past), isBacklog(past)]).toEqual([false, false]);
});

test('lista dnia: najpierw zadania ze slotem według godzin, potem swobodne w kolejności tablicy', () => {
  const items = [
    tt('free1'),
    tt('late', 60),
    it('n', { tag: 'today-note' }),
    tt('early', 36, true),
    it('b', { tag: 'backlog-task', when: null }),
  ];
  expect(timedToday(items).map((i) => i.id)).toEqual(['early', 'late']);
  expect(freeToday(items).map((i) => i.id)).toEqual(['free1', 'n']);
  expect(todayList(items).map((i) => i.id)).toEqual(['early', 'late', 'free1', 'n']);
});

test('occ: slot zajmuje dwa kwanty; wykonane też', () => {
  const o = occ([tt('a', 36), tt('b', 40, true)]);
  expect([o[35], o[36], o[37], o[38]].map((x) => x?.id ?? null)).toEqual([null, 'a', 'a', null]);
  expect([o[40], o[41]].map((x) => x?.id)).toEqual(['b', 'b']);
});

test('canClaim: wolny i mieszczący się w dniu slot; własne miejsce nie przeszkadza', () => {
  const items = [tt('a', 36)];
  expect(canClaim(items, 40, HOURS)).toBe(true);
  expect(canClaim(items, 37, HOURS)).toBe(false);
  expect(canClaim(items, 37, HOURS, 'a')).toBe(true);
  expect(canClaim(items, 87, HOURS)).toBe(false);
});

test('itemTone: czas zmienia kolor, nie stan', () => {
  expect(itemTone(tt('a', 36), DAY, at(8))).toBe('incoming');
  expect(itemTone(tt('a', 36), DAY, at(9, 10))).toBe('active');
  expect(itemTone(tt('a', 36), DAY, at(10))).toBe('missed');
  expect(itemTone(tt('a', 36, true), DAY, at(10))).toBe('done');
  expect(itemTone(tt('a'), DAY, at(10))).toBe('incoming');
  expect(itemTone(it('n', { tag: 'today-note' }), DAY, at(10))).toBe('note');
});

test('activeNow: otwarte zadanie, którego slot trwa', () => {
  expect(activeNow([tt('a', 36), tt('b', 40)], DAY, at(9, 10))?.id).toBe('a');
  expect(activeNow([tt('a', 36, true)], DAY, at(9, 10))).toBeUndefined();
  expect(activeNow([tt('a', 36)], DAY, at(11))).toBeUndefined();
});

test('backlogList: z terminem według daty i godziny, bez terminu na końcu w kolejności tablicy', () => {
  const b = (id: string, when: Extract<ItemState, { tag: 'backlog-task' }>['when']) =>
    it(id, { tag: 'backlog-task', when });
  const items = [
    b('none1', null),
    b('late', { type: 'date', date: '2026-10-05' }),
    b('slot10', { type: 'dateSlot', date: '2026-10-01', slot: 40 }),
    it('note', { tag: 'backlog-note' }),
    b('rec', { type: 'recurring', rule: { freq: 'DAILY', interval: 1 }, slot: null, next: '2026-09-26' }),
    b('day', { type: 'date', date: '2026-10-01' }),
    tt('today'),
  ];
  expect(backlogList(items).map((i) => i.id)).toEqual([
    'rec',
    'day',
    'slot10',
    'late',
    'none1',
    'note',
  ]);
});

test('categoryOf: kategoria pozycji albo null', () => {
  const cats = [{ id: 'w', name: 'Praca', icon: null, parent: null }];
  expect(categoryOf(tt('a'), cats)).toBeNull();
  expect(categoryOf(it('a', { tag: 'today-note' }, 'w'), cats)?.name).toBe('Praca');
  expect(categoryOf(it('a', { tag: 'today-note' }, 'gone'), cats)).toBeNull();
});

test('soonOf: termin w ciągu 5 dni dostaje słowo, dalszy i brak terminu — nic', () => {
  const on = (date: string) => it('b', { tag: 'backlog-task', when: { type: 'date', date } });
  expect(soonOf(on('2026-09-26'), DAY)).toEqual({ days: 1, label: 'jutro' });
  expect(soonOf(on('2026-09-27'), DAY)).toEqual({ days: 2, label: 'za 2 dni' });
  expect(soonOf(on('2026-09-30'), DAY)).toEqual({ days: 5, label: 'za 5 dni' });
  expect(soonOf(on('2026-10-01'), DAY)).toBeNull();
  expect(soonOf(on(DAY), DAY)).toEqual({ days: 0, label: 'dziś' });
  expect(soonOf(on('2026-09-23'), DAY)).toEqual({ days: -2, label: 'po terminie' });
  expect(soonOf(it('n', { tag: 'backlog-task', when: null }), DAY)).toBeNull();
  expect(soonOf(it('bn', { tag: 'backlog-note' }), DAY)).toBeNull();
});

test('soonOf: data ze slotem i wzorzec liczą się od swojej daty', () => {
  const slot = it('s', {
    tag: 'backlog-task',
    when: { type: 'dateSlot', date: '2026-09-28', slot: 36 },
  });
  const rec = it('r', {
    tag: 'backlog-task',
    when: { type: 'recurring', rule: { freq: 'DAILY', interval: 1 }, slot: null, next: '2026-09-26' },
  });
  expect(soonOf(slot, DAY)?.label).toBe('za 3 dni');
  expect(soonOf(rec, DAY)?.label).toBe('jutro');
});

test('soonOf: przejście na czas zimowy nie zmienia liczby dni', () => {
  const on = it('b', { tag: 'backlog-task', when: { type: 'date', date: '2026-10-27' } });
  expect(soonOf(on, '2026-10-24')?.days).toBe(3);
});

test('todayList: wykonane w kolejności tablicy, potem otwarte ze slotem według godzin, potem reszta', () => {
  const items = [
    tt('free1'),
    tt('late', 60),
    tt('d-free', null, true),
    it('n', { tag: 'today-note' }),
    tt('early', 36),
    tt('d-slot', 40, true),
    it('b', { tag: 'backlog-task', when: null }),
    tt('free2'),
  ];
  expect(doneToday(items).map((i) => i.id)).toEqual(['d-free', 'd-slot']);
  expect(openTimed(items).map((i) => i.id)).toEqual(['early', 'late']);
  expect(openFree(items).map((i) => i.id)).toEqual(['free1', 'n', 'free2']);
  expect(todayList(items).map((i) => i.id)).toEqual([
    'd-free',
    'd-slot',
    'early',
    'late',
    'free1',
    'n',
    'free2',
  ]);
});
