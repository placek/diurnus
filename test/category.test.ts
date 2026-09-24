import { test, expect } from 'vitest';
import { itemCategory } from '../src/lib/category';
import type { Block, Category, Item } from '../src/lib/types';

const cats: Category[] = [
  { id: 'work', name: 'Praca', icon: 'laptop-code', color: 'yellow', parent: null },
  { id: 'rest', name: 'Odpoczynek', icon: 'mug-hot', color: 'aqua', parent: null },
  { id: 'work-a', name: 'Projekt A', icon: null, parent: 'work' },
];

const item = (over: Partial<Item> = {}): Item =>
  ({ id: 'i', day: '2026-09-24', text: '', type: 'task', created: 0, ...over });

const block = (cat: string): Block =>
  ({ id: 'b', day: '2026-09-24', q: 32, len: 2, cat, title: '', status: 'planned', created: 0 });

test('pozycja swobodna bierze własną kategorię', () => {
  expect(itemCategory(item({ cat: 'work' }), undefined, cats)?.id).toBe('work');
});

test('pozycja bez kategorii nie ma żadnej', () => {
  expect(itemCategory(item(), undefined, cats)).toBeNull();
});

test('pozycja powiązana bierze kategorię SWOJEGO BLOKU, nie własną', () => {
  // Jedno źródło prawdy: blok. Inaczej dwa pola mogłyby się rozejść.
  const linked = item({ block: 'b', cat: 'rest' });
  expect(itemCategory(linked, block('work'), cats)?.id).toBe('work');
});

test('pozycja powiązana bez własnej kategorii też bierze z bloku', () => {
  expect(itemCategory(item({ block: 'b' }), block('rest'), cats)?.id).toBe('rest');
});

test('nieznana kategoria daje null, a nie wyjątek', () => {
  expect(itemCategory(item({ cat: 'nie-ma' }), undefined, cats)).toBeNull();
  expect(itemCategory(item({ block: 'b' }), block('nie-ma'), cats)).toBeNull();
});

test('podkategoria jest zwracana wprost — kolor dziedziczy colorOf', () => {
  expect(itemCategory(item({ cat: 'work-a' }), undefined, cats)?.id).toBe('work-a');
});
