import { test, expect } from 'vitest';
import { normalize, bandAt, DEFAULT_DAY, ICONS, uid } from '../src/lib/model';
import type { Band } from '../src/lib/types';
import { formatRRule } from '../src/lib/rrule';

const T = '2026-09-24';
const X = [{ id: 'x', name: 'X', icon: 'circle', color: 'red', parent: null }];

test('normalize: brak stanu daje domyślne kategorie, pory dnia, dzień i wersję bieżącą', () => {
  const s = normalize(null, T);
  expect(s.v).toBe(7);
  expect(s.today).toBe(T);
  expect(s.items).toEqual([]);
  expect(s.cats.length).toBeGreaterThan(0);
  expect(s.day.start).toBe(6);
  expect(s.day.end).toBe(22);
  expect(s.day.bands.length).toBeGreaterThan(0);
});

test('normalize: śmieci dają czysty stan domyślny', () => {
  for (const junk of [undefined, 0, 'tekst', [], { v: 99 }, { v: 6 }, { v: 5 }]) {
    const s = normalize(junk, T);
    expect(s.v).toBe(7);
    expect(s.items).toEqual([]);
  }
});

test('normalize: migracja v1 przesuwa q z bazy 06:00 na bazę północy i idzie do v7', () => {
  const s = normalize(
    {
      v: 1,
      cats: X,
      blocks: [
        { id: 'a', day: T, q: 16, len: 2, cat: 'x', title: '', status: 'confirmed', created: 0 },
      ],
    },
    T,
  );
  expect(s.v).toBe(7);
  expect(s.items).toEqual([
    { id: 'a', text: '', created: 0, cat: 'x', state: { tag: 'today-task', done: true, slot: 40 } },
  ]);
});

test('normalize: v2 i v3 przechodzą przez wszystkie wersje do v7', () => {
  for (const v of [2, 3]) {
    const s = normalize(
      {
        v,
        cats: X,
        day: { start: 6, end: 22, bands: [] },
        blocks: [
          {
            id: 'b1',
            day: T,
            q: 32,
            len: 2,
            cat: 'x',
            title: 'Praca',
            status: 'planned',
            created: 0,
          },
        ],
      },
      T,
    );
    expect(s.v).toBe(7);
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({
      id: 'b1',
      text: 'Praca',
      state: { tag: 'today-task', slot: 32 },
    });
  }
});

test('normalize: znaczniki przeniesienia z v4 zamieniają się w zadania', () => {
  const s = normalize(
    {
      v: 4,
      cats: [],
      blocks: [],
      day: { start: 6, end: 22, bands: [] },
      items: [
        { id: 'a', day: T, text: 'X', type: 'migrated', created: 0, movedTo: '2026-09-25' },
        { id: 'c', day: T, text: 'Z', type: 'note', created: 0 },
      ],
    },
    T,
  );
  expect(s.items.map((i) => i.state.tag)).toEqual(['today-task', 'today-note']);
  expect(s.items.every((i) => !('movedTo' in i))).toBe(true);
});

test('normalize: uszkodzone ustawienia dnia i puste kategorie wracają do domyślnych', () => {
  const s = normalize(
    { v: 6, cats: [], day: { start: 22, end: 6, bands: [] }, today: T, items: [] },
    T,
  );
  expect(s.day.start).toBe(6);
  expect(s.cats.length).toBeGreaterThan(0);
});

test('normalize: v6 zachowuje swój dzień, a bez dnia dostaje podany', () => {
  expect(
    normalize({ v: 6, cats: X, day: DEFAULT_DAY, today: '2026-09-20', items: [] }, T).today,
  ).toBe('2026-09-20');
  expect(normalize({ v: 6, cats: X, day: DEFAULT_DAY, items: [] }, T).today).toBe(T);
});

test('normalize: v6 odrzuca pozycje bez stanu', () => {
  const s = normalize(
    {
      v: 6,
      cats: X,
      day: DEFAULT_DAY,
      today: T,
      items: [{ id: 'a', text: 'A', state: { tag: 'today-note' } }, { id: 'b', text: 'B' }, null],
    },
    T,
  );
  expect(s.items.map((i) => i.id)).toEqual(['a']);
});

test('normalize: DEFAULT_DAY i domyślne kategorie nie są współdzielone', () => {
  const a = normalize(null, T);
  const b = normalize(null, T);
  a.day.bands.push({ id: 'zzz', name: 'Test', from: 12, color: 'red' });
  a.cats[0]!.name = 'Zmienione';
  a.day.start = 3;
  expect(a.day.bands.length).not.toBe(b.day.bands.length);
  expect(b.cats[0]!.name).not.toBe('Zmienione');
  expect(DEFAULT_DAY.start).toBe(6);
});

test('uid: kolejne wywołania dają różne identyfikatory', () => {
  const seen = new Set(Array.from({ length: 500 }, () => uid()));
  expect(seen.size).toBe(500);
});

const bands: Band[] = [
  { id: 'b1', name: 'Rano', from: 6, color: 'aqua' },
  { id: 'b2', name: 'Praca', from: 8, color: 'yellow' },
  { id: 'b3', name: 'Dom', from: 16, color: 'orange' },
];

test('bandAt: godzina wewnątrz pory zwraca tę porę', () => {
  expect(bandAt(bands, 10)?.id).toBe('b2');
  expect(bandAt(bands, 6)?.id).toBe('b1');
  expect(bandAt(bands, 16)?.id).toBe('b3');
});

test('bandAt: godzina przed pierwszą porą daje null', () => {
  expect(bandAt(bands, 5)).toBeNull();
});

test('bandAt: ostatnia pora trwa do końca doby', () => {
  expect(bandAt(bands, 23)?.id).toBe('b3');
});

test('bandAt: kolejność w tablicy nie ma znaczenia', () => {
  const shuffled = [bands[2]!, bands[0]!, bands[1]!];
  expect(bandAt(shuffled, 10)?.id).toBe('b2');
  expect(bandAt(shuffled, 23)?.id).toBe('b3');
});

test('bandAt: pusta lista pór daje null', () => {
  expect(bandAt([], 10)).toBeNull();
});

test('domyślne kategorie: Zadania, Modlitwa, Ruch, Dom i Telefon z podkategoriami', () => {
  const cats = normalize(null, '2026-09-25').cats;
  const top = cats.filter((c) => c.parent === null);
  expect(top.map((c) => [c.name, c.icon, c.color])).toEqual([
    ['Zadania', 'list-check', 'red'],
    ['Modlitwa', 'cross', 'green'],
    ['Ruch', 'person-running', 'aqua'],
    ['Dom', 'house', 'blue'],
    ['Telefon', 'phone', 'purple'],
  ]);
  const kidsOf = (name: string) => {
    const id = top.find((c) => c.name === name)!.id;
    return cats.filter((c) => c.parent === id).map((c) => [c.name, c.icon]);
  };
  expect(kidsOf('Zadania')).toEqual([
    ['Daily', 'circle'],
    ['Spotkanie', 'users'],
    ['Programowanie', 'code'],
    ['Research', 'graduation-cap'],
  ]);
  expect(kidsOf('Modlitwa')).toEqual([]);
  expect(kidsOf('Ruch')).toEqual([]);
  expect(kidsOf('Dom')).toEqual([
    ['Ogród', 'seedling'],
    ['Samochód', 'car'],
    ['Zakupy', 'cart-shopping'],
    ['Dzieci', 'child'],
    ['Naprawy', 'hammer'],
  ]);
  expect(kidsOf('Telefon')).toEqual([]);
  // Każda ikona istnieje w zestawie aplikacji; identyfikatory są unikalne.
  for (const c of cats) if (c.icon) expect(ICONS as readonly string[], c.name).toContain(c.icon);
  expect(new Set(cats.map((c) => c.id)).size).toBe(cats.length);
});

test('normalize: v6 zamienia dawne wzorce na RRULE, zachowując daty', () => {
  const rec = (id: string, rule: unknown) => ({
    id,
    text: id,
    state: { tag: 'backlog-task', when: { type: 'recurring', rule, slot: 36, next: '2026-09-30' } },
  });
  const s = normalize(
    {
      v: 6,
      cats: [{ id: 'x', name: 'X', icon: null, color: 'red', parent: null }],
      day: DEFAULT_DAY,
      today: T,
      items: [
        rec('d', { kind: 'daily' }),
        rec('w', { kind: 'weekly', weekday: 3 }),
        rec('m', { kind: 'monthly', dayOfMonth: 30 }),
        rec('y', { kind: 'yearly', month: 2, dayOfMonth: 29 }),
        { id: 't', text: 't', state: { tag: 'today-task', done: false, slot: null } },
      ],
    },
    T,
  );
  expect(s.v).toBe(7);
  const rule = (id: string) => {
    const st = s.items.find((i) => i.id === id)!.state;
    return st.tag === 'backlog-task' && st.when?.type === 'recurring'
      ? formatRRule(st.when.rule)
      : null;
  };
  expect(rule('d')).toBe('FREQ=DAILY');
  expect(rule('w')).toBe('FREQ=WEEKLY;BYDAY=WE');
  expect(rule('m')).toBe('FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1');
  expect(rule('y')).toBe('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1');
  // Termin i pora zostają bez zmian.
  expect(s.items.find((i) => i.id === 'd')!.state).toMatchObject({
    when: { slot: 36, next: '2026-09-30' },
  });
  expect(s.items.find((i) => i.id === 't')!.state).toEqual({
    tag: 'today-task',
    done: false,
    slot: null,
  });
});
