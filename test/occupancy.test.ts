import { test, expect } from 'vitest';
import { occ, fit, activeBlock } from '../src/lib/occupancy';
import { QDAY } from '../src/lib/types';
import type { Block, Status } from '../src/lib/types';

const blk = (
  id: string,
  q: number,
  len: number,
  status: Status = 'planned',
  day = '2026-09-24',
): Block => ({ id, day, q, len, cat: 'work', title: '', status, created: 0 });

test('occ: tablica ma 96 slotów, zajęte wskazują na blok', () => {
  const o = occ([blk('a', 32, 2)], '2026-09-24');
  expect(o).toHaveLength(QDAY);
  expect(o[31]).toBeNull();
  expect(o[32]?.id).toBe('a');
  expect(o[33]?.id).toBe('a');
  expect(o[34]).toBeNull();
});

test('occ: bloki z innego dnia są pomijane', () => {
  expect(occ([blk('a', 32, 2, 'planned', '2026-09-23')], '2026-09-24')[32]).toBeNull();
});

test('occ: bloki discarded nie zajmują miejsca', () => {
  expect(occ([blk('a', 32, 2, 'discarded')], '2026-09-24')[32]).toBeNull();
});

test('occ: blok wychodzący poza dobę jest przycinany bez błędu', () => {
  const o = occ([blk('a', 95, 4)], '2026-09-24');
  expect(o[95]?.id).toBe('a');
  expect(o).toHaveLength(QDAY);
});

test('fit: wolne miejsce daje pełne dwa kwanty', () => {
  expect(fit(occ([], '2026-09-24'), 32)).toEqual({ q: 32, len: 2 });
});

test('fit: sąsiad z prawej skraca dopasowanie do jednego kwantu', () => {
  expect(fit(occ([blk('a', 33, 2)], '2026-09-24'), 32)).toEqual({ q: 32, len: 1 });
});

test('fit: zajęty kwant daje null', () => {
  expect(fit(occ([blk('a', 32, 2)], '2026-09-24'), 32)).toBeNull();
});

test('fit: koniec doby skraca dopasowanie', () => {
  expect(fit(occ([], '2026-09-24'), 95)).toEqual({ q: 95, len: 1 });
});

test('fit: indeks poza zakresem daje null', () => {
  const o = occ([], '2026-09-24');
  expect(fit(o, -1)).toBeNull();
  expect(fit(o, QDAY)).toBeNull();
});

test('activeBlock: znajduje jedyny blok w toku', () => {
  expect(activeBlock([blk('a', 32, 2), blk('b', 40, 2, 'active')])?.id).toBe('b');
});

test('activeBlock: brak aktywnego daje undefined', () => {
  expect(activeBlock([blk('a', 32, 2)])).toBeUndefined();
});
