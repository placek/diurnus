import { test, expect } from 'vitest';
import { ICON_PATHS } from '../src/lib/icons';
import { ICONS } from '../src/lib/model';

// Ikony interfejsu — nie ma ich w ICONS, bo użytkownik nie wybiera ich dla kategorii.
const UI_ICONS = [
  'question', 'circle-half-stroke', 'sliders', 'keyboard', 'chevron-left',
  'chevron-right', 'xmark', 'trash-can', 'plus', 'arrow-up', 'check', 'rotate-left',
  'download', 'upload', 'table-cells', 'list-check',
];

test('każda ikona z listy kategorii ma ścieżkę SVG', () => {
  const missing = ICONS.filter((n) => !ICON_PATHS[n]);
  expect(missing).toEqual([]);
});

test('każda ikona interfejsu ma ścieżkę SVG', () => {
  const missing = UI_ICONS.filter((n) => !ICON_PATHS[n]);
  expect(missing).toEqual([]);
});

test('ścieżki mają dodatnie wymiary i niepustą geometrię', () => {
  for (const [name, [w, h, d]] of Object.entries(ICON_PATHS)) {
    expect(w, `${name}: szerokość`).toBeGreaterThan(0);
    expect(h, `${name}: wysokość`).toBeGreaterThan(0);
    expect(d.length, `${name}: ścieżka`).toBeGreaterThan(0);
  }
});

test('nieznana nazwa daje undefined, a nie wyjątek', () => {
  expect(ICON_PATHS['nie-ma-takiej']).toBeUndefined();
});
