import { test, expect } from 'vitest';
import { catOf, topCats, kids, rootOf, colorOf, iconOf, pathOf, catOrder } from '../src/lib/categories';
import type { Category } from '../src/lib/types';

const cats: Category[] = [
  { id: 'work', name: 'Praca', icon: 'laptop-code', color: 'yellow', parent: null },
  { id: 'work-a', name: 'Projekt A', icon: null, parent: 'work' },
  { id: 'work-b', name: 'Projekt B', icon: 'code', parent: 'work' },
  { id: 'old', name: 'Archiwalna', icon: 'circle', color: 'red', parent: null, archived: true },
];

test('topCats pomija podkategorie i archiwalne', () => {
  expect(topCats(cats).map((c) => c.id)).toEqual(['work']);
});

test('kids zwraca podkategorie w kolejności', () => {
  expect(kids(cats, 'work').map((c) => c.id)).toEqual(['work-a', 'work-b']);
});

test('rootOf podkategorii wskazuje rodzica, rootOf głównej wskazuje ją samą', () => {
  expect(rootOf(cats, cats[1]!).id).toBe('work');
  expect(rootOf(cats, cats[0]!).id).toBe('work');
});

test('colorOf: podkategoria dziedziczy kolor rodzica', () => {
  expect(colorOf(cats, cats[1]!)).toBe('yellow');
});

test('iconOf: null oznacza dziedziczenie, własna ikona wygrywa', () => {
  expect(iconOf(cats, cats[1]!)).toBe('laptop-code');
  expect(iconOf(cats, cats[2]!)).toBe('code');
});

test('pathOf: podkategoria pokazuje ścieżkę, główna samą nazwę', () => {
  expect(pathOf(cats, cats[1]!)).toBe('Praca › Projekt A');
  expect(pathOf(cats, cats[0]!)).toBe('Praca');
});

test('catOf: nieznane id daje zastępczą kategorię zamiast wyjątku', () => {
  const c = catOf(cats, 'nie-ma');
  expect(c.name).toBe('—');
  expect(c.icon).toBe('circle');
});

test('rootOf: osierocona podkategoria nie zapętla się', () => {
  const orphan: Category[] = [{ id: 'k', name: 'K', icon: null, parent: 'znikniety' }];
  expect(rootOf(orphan, orphan[0]!).id).toBe('k');
});

test('catOrder: dzieci stoją tuż za rodzicem, archiwalne pomijane', () => {
  const o = catOrder(cats);
  expect(o.get('work')).toBe(0);
  expect(o.get('work-a')).toBe(1);
  expect(o.get('work-b')).toBe(2);
  expect(o.has('old')).toBe(false);
});
