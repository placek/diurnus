import { test, expect } from 'vitest';
import { readJSON, writeJSON } from '../src/lib/persist';

const fake = (init: Record<string, string> = {}, failOnSet = false): Storage => {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (failOnSet) throw new Error('QuotaExceededError');
      m.set(k, v);
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as Storage;
};

test('readJSON zwraca zapisaną wartość', () => {
  expect(readJSON(fake({ k: '{"a":1}' }), 'k', null)).toEqual({ a: 1 });
});

test('readJSON zwraca wartość zastępczą dla braku klucza', () => {
  expect(readJSON(fake(), 'k', { d: true })).toEqual({ d: true });
});

test('readJSON zwraca wartość zastępczą dla uszkodzonego JSON-a', () => {
  expect(readJSON(fake({ k: '{nie-json' }), 'k', 'fb')).toBe('fb');
});

test('writeJSON zwraca true przy sukcesie', () => {
  const s = fake();
  expect(writeJSON(s, 'k', { a: 1 })).toBe(true);
  expect(s.getItem('k')).toBe('{"a":1}');
});

test('writeJSON zwraca false przy przepełnionym magazynie zamiast rzucać', () => {
  expect(writeJSON(fake({}, true), 'k', { a: 1 })).toBe(false);
});

test('readJSON zwraca wartość zastępczą, gdy magazyn w ogóle nie działa', () => {
  const broken = {
    getItem() {
      throw new Error('SecurityError');
    },
  } as unknown as Storage;
  expect(readJSON(broken, 'k', 'fb')).toBe('fb');
});

test('readJSON traktuje pusty łańcuch jak brak wartości', () => {
  expect(readJSON(fake({ k: '' }), 'k', 'fb')).toBe('fb');
});
