import { test, expect } from 'vitest';
import { MARK } from '../src/lib/items';
import type { ItemType } from '../src/lib/types';

test('każdy typ ma dokładnie jeden znak', () => {
  const types: ItemType[] = ['task', 'done', 'note', 'scheduled', 'migrated'];
  for (const t of types) {
    expect(MARK[t], t).toBeTruthy();
    expect([...MARK[t]], t).toHaveLength(1);
  }
});

test('znaki są zgodne z notacją bullet journal', () => {
  expect(MARK.task).toBe('·');
  expect(MARK.done).toBe('×');
  expect(MARK.note).toBe('–');
  expect(MARK.scheduled).toBe('<');
  expect(MARK.migrated).toBe('>');
});

test('żadne dwa typy nie dzielą znaku', () => {
  const marks = Object.values(MARK);
  expect(new Set(marks).size).toBe(marks.length);
});
