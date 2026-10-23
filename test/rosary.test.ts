import { test, expect } from 'vitest';
import { rosaryOf } from '../src/lib/rosary';

/* Tajemnice różańca na dzień tygodnia, po łacinie. */

test('dzień tygodnia wybiera część różańca', () => {
  // 2026-10-19 to poniedziałek.
  const week = ['19', '20', '21', '22', '23', '24', '25'].map((d) => rosaryOf(`2026-10-${d}`).name);
  expect(week).toEqual([
    'Mysteria gaudiosa', // poniedziałek
    'Mysteria dolorosa', // wtorek
    'Mysteria gloriosa', // środa
    'Mysteria luminosa', // czwartek
    'Mysteria dolorosa', // piątek
    'Mysteria gaudiosa', // sobota
    'Mysteria gloriosa', // niedziela
  ]);
});

test('każda część ma pięć tajemnic; jednym słowem, gdzie się da', () => {
  for (const d of ['19', '20', '21', '22']) {
    const p = rosaryOf(`2026-10-${d}`);
    expect(p.mysteries).toHaveLength(5);
  }
  expect(rosaryOf('2026-10-22').mysteries).toEqual([
    'Baptismus',
    'Cana',
    'Proclamatio',
    'Transfiguratio',
    'Eucharistia',
  ]);
  const words = ['19', '20', '21', '22'].flatMap((d) => rosaryOf(`2026-10-${d}`).mysteries);
  expect(words.filter((w) => w.includes(' '))).toEqual(['Coronatio spinis']);
});
