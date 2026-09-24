import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
const at = (selector: string) => css.indexOf(selector);

test('schemat tonów wygrywa z kolorem pozycji powiązanej', () => {
  // Obie reguły mają tę samą szczegółowość (dwie klasy + element), więc
  // o zwycięzcy decyduje wyłącznie kolejność.
  const linked = at('.item.is-linked .item-text{');
  expect(linked, 'reguła .item.is-linked').toBeGreaterThan(-1);
  for (const tone of ['incoming', 'active', 'missed', 'done', 'note']) {
    const rule = at(`.item.tone-${tone} .item-text`);
    expect(rule, `reguła tone-${tone}`).toBeGreaterThan(-1);
    expect(rule, `tone-${tone} po is-linked`).toBeGreaterThan(linked);
  }
});

test('każdy ton barwi tak samo tekst wpisany i podpowiedź', () => {
  // Blok bez własnego tytułu pokazuje nazwę kategorii jako placeholder;
  // musi wyglądać tak samo jak blok z tytułem.
  for (const tone of ['incoming', 'active', 'missed', 'done', 'note']) {
    expect(css, tone).toContain(`.item.tone-${tone} .item-text::placeholder`);
  }
});

test('tony używają zadeklarowanych barw schematu', () => {
  expect(css).toMatch(/\.item\.tone-incoming[^}]*color:var\(--fg\)/);
  expect(css).toMatch(/\.item\.tone-active[^}]*color:var\(--orange\)/);
  expect(css).toMatch(/\.item\.tone-missed[^}]*color:var\(--red\)/);
  expect(css).toMatch(/\.item\.tone-done[^}]*color:var\(--fg-faint\)/);
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

test('menu znacznika nie może być obcinane przez przewijane panele', () => {
  // `absolute` wewnątrz .item było obcinane przez overflow paneli, a pozycja
  // statyczna w wierszu flex align-items:center wypychała połowę menu nad
  // wiersz — przy górnych pozycjach listy znikała.
  const rule = /\.bullet-menu\{[^}]*\}/.exec(css)?.[0] ?? '';
  expect(rule).toContain('position:fixed');
  expect(rule).toContain('max-height');
  expect(rule).not.toContain('position:absolute');
});
