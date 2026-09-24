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

test('blok wykonany jest przygaszony i przekreślony, jak pozycja na liście', () => {
  expect(css).toContain('.st-confirmed .t{text-decoration:line-through}');
  expect(css).toMatch(/\.st-confirmed\{[^}]*color:var\(--fg-faint\)/);
});

test('blok zaplanowany jest mocniej podbarwiony niż wykonany', () => {
  // Zobowiązanie ma przyciągać wzrok, zapis — nie.
  const pct = (sel: string) => {
    const rule = new RegExp(`\\${sel}\\{[^}]*\\}`).exec(css)?.[0] ?? '';
    return Number(/var\(--c\)\s*(\d+)%/.exec(rule)?.[1] ?? '0');
  };
  expect(pct('.st-planned')).toBeGreaterThan(pct('.st-confirmed'));
});

test('blok zaplanowany ma pełny kontrast tekstu, wykonany przygaszony', () => {
  expect(css).toMatch(/\.st-planned\{[^}]*color:var\(--fg\)/);
});
