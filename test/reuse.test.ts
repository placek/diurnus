import { test, expect } from 'vitest';
import { keepIdentity } from '../src/lib/reuse';
import type { Item, State } from '../src/lib/types';

/*
 * Stan z dokumentów dostaje z powrotem identyfikatory i chwile utworzenia
 * pozycji, które się nie zmieniły — wiersze list się wtedy nie przerysowują.
 */

const T = (id: string, text: string, extra: Partial<Item> = {}): Item => ({
  id,
  text,
  state: { tag: 'today-task', done: false, slot: null },
  ...extra,
});
const st = (items: Item[]): State => ({
  v: 7,
  cats: [],
  day: { start: 6, end: 22, bands: [] },
  today: '2026-10-21',
  items,
});

test('niezmienione pozycje zachowują identyfikator i chwilę utworzenia; nowe i zmienione — z pliku', () => {
  const prev = st([T('u1', 'a', { created: 5 }), T('u2', 'b', { created: 6 }), T('u3', 'c')]);
  // Na początku dopisana pozycja przesunęła numery linii wszystkich pozostałych.
  const next = st([
    T('d.md:3', 'nowa'),
    T('d.md:4', 'a'),
    T('d.md:5', 'b zmienione'),
    T('d.md:6', 'c'),
  ]);
  const out = keepIdentity(next, prev).items;
  expect(out.map((i) => [i.id, i.text, i.created])).toEqual([
    ['d.md:3', 'nowa', undefined],
    ['u1', 'a', 5],
    ['d.md:5', 'b zmienione', undefined],
    ['u3', 'c', undefined],
  ]);
});

test('takie same pozycje dobierają się po kolei; wzorce zostają przy swoich identyfikatorach', () => {
  const rec = {
    tag: 'backlog-task' as const,
    when: {
      type: 'recurring' as const,
      rule: { freq: 'DAILY' as const, interval: 1 },
      slot: null,
      next: '2026-10-22',
    },
  };
  const prev = st([T('x1', 'to samo'), T('x2', 'to samo'), { id: 'p', text: 'wzór', state: rec }]);
  const next = st([
    T('f:3', 'to samo'),
    T('f:4', 'to samo'),
    T('f:5', 'to samo'),
    { id: 'p', text: 'wzór', state: rec },
  ]);
  expect(keepIdentity(next, prev).items.map((i) => i.id)).toEqual(['x1', 'x2', 'f:5', 'p']);
});

test('identyfikator z pliku zajęty przez zachowany — dostaje przyrostek', () => {
  // Poprzedni stan też pochodził z pliku: jego `f:3` trafia teraz w inną linię.
  const prev = st([T('f:3', 'a')]);
  const next = st([T('f:3', 'nowa'), T('f:4', 'a')]);
  const ids = keepIdentity(next, prev).items.map((i) => i.id);
  expect(ids).toEqual(['f:3~2', 'f:3']);
  expect(new Set(ids).size).toBe(ids.length);
});

test('pozycja w trakcie pisania (spacja na końcu kroku, pusta linia opisu) to ta sama pozycja', () => {
  const typing = T('u1', 'Wyjazd', {
    desc: 'pociąg\n',
    steps: [{ text: 'spakować ', done: false }],
  });
  const prev = st([typing]);
  const next = st([
    T('d.md:3', 'Wyjazd', { desc: 'pociąg', steps: [{ text: 'spakować', done: false }] }),
  ]);
  // Zostaje dokładnie lokalna wersja — pole, w którym ktoś pisze, nie zmienia treści pod palcami.
  expect(keepIdentity(next, prev).items[0]).toBe(typing);
});
