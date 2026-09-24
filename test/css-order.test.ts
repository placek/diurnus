import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
const at = (selector: string) => css.indexOf(selector);

test('stan „wykonane" wygrywa z kolorem pozycji powiązanej', () => {
  // Obie reguły mają tę samą szczegółowość (dwie klasy + element), więc
  // o zwycięzcy decyduje wyłącznie kolejność. Odwrócenie jej sprawia, że
  // odhaczony blok z własnym tytułem świeci jaśniej niż odhaczony bez tytułu.
  const done = at('.item.t-done .item-text{');
  const linked = at('.item.is-linked .item-text{');
  expect(done, 'reguła .item.t-done').toBeGreaterThan(-1);
  expect(linked, 'reguła .item.is-linked').toBeGreaterThan(-1);
  expect(done).toBeGreaterThan(linked);
});

test('wykonana pozycja barwi tak samo tekst wpisany i podpowiedź', () => {
  // Blok bez własnego tytułu pokazuje nazwę kategorii jako placeholder;
  // musi wyglądać tak samo jak blok z tytułem.
  expect(css).toContain('.item.t-done .item-text::placeholder{color:var(--fg-faint)}');
  expect(css).toContain('.item.t-done .item-text{color:var(--fg-faint)');
});

test('arkusz nie odwołuje się do usuniętych znaczników', () => {
  for (const dead of ['.t-migrated', '.t-scheduled']) {
    expect(css, dead).not.toContain(dead);
  }
});
