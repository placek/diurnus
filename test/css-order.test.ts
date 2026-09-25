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

test('siatka nie rysuje linii — strukturę niosą bloki i kolumna godzin', () => {
  const rule = (sel: string) => new RegExp(`\\${sel}\\{[^}]*\\}`).exec(css)?.[0] ?? '';
  for (const sel of ['.row', '.cell', '.hour']) {
    expect(rule(sel), sel).not.toMatch(/border(-top|-left|-right|-bottom)?:\s*[^0]/);
  }
});

test('nie zostały martwe reguły po usuniętych funkcjach', () => {
  // Każdy z tych selektorów przeżył swoją funkcję i został usunięty razem
  // z nią; obecność któregokolwiek znaczy, że coś wróciło bez markupu.
  const dead = [
    '.cell.q0', '.cell.q2', '.row.band-start',   // linie siatki
    '.nav', '.ce-title', '.item-moved',          // nagłówek i znacznik przeniesienia
    '.list-empty', 'nudge',                      // puste panele i animacja szturchnięcia
  ];
  for (const sel of dead) expect(css, sel).not.toContain(sel);
});

test('wykonana pozycja z kategorią przygasza akcent, ale zachowuje tło', () => {
  // Kategoria zostaje widoczna; pasek przestaje być jasny.
  expect(css).toMatch(/\.item\.has-cat\.tone-done\{box-shadow:inset[^}]*color-mix/);
  expect(css).not.toContain('.item.has-cat.tone-done{box-shadow:none}');
  // Tło pochodzi z reguły pozycji z godziną; reguła wykonanego go nie rusza.
  expect(css).toMatch(/\.item\.has-cat\.is-linked\{[^}]*background:color-mix/);
  expect(css).not.toMatch(/\.item\.has-cat\.tone-done\{[^}]*background/);
});

test('pozycja z kategorią, ale bez godziny, ma sam pasek, bez podbarwienia', () => {
  expect(css).toMatch(/\.item\.has-cat\{[^}]*box-shadow:inset/);
  expect(css).not.toMatch(/\.item\.has-cat\{[^}]*background/);
});

test('termin na obu listach ma jeden krój: .item-meta, bez osobnej reguły godziny', () => {
  expect(css).toMatch(/\.item-meta\{[^}]*font:500 12px[^}]*color:var\(--fg-faint\)/);
  expect(css).not.toContain('.item-hour');
  expect(css).not.toContain('.backlog-meta');
});
