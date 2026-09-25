// @vitest-environment jsdom
import { test, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mountApp, resetDom, seed, task } from './helpers';

// Szeroki ekran: sekcja dziś zachodzi na pasek u góry i niesie nagłówek dnia
// (data, zegar, pasek postępu). Wąski: jeden panel naraz, więc nagłówek dnia
// zostaje w pasku, widoczny przy każdym panelu.

// W jsdom import.meta.url nie jest adresem pliku, więc ścieżka idzie od katalogu projektu.
const css = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8');

beforeEach(() => resetDom());

test('szeroki ekran: nagłówek dnia stoi na górze sekcji dziś, nie w pasku', async () => {
  seed([task('a')]);
  await mountApp();
  const head = document.querySelector('#list > .today-head')!;
  expect(head).not.toBeNull();
  expect(head.querySelector('#date')).not.toBeNull();
  expect(head.querySelector('#clock')).not.toBeNull();
  expect(head.querySelector('#pips')).not.toBeNull();
  expect(document.querySelector('#top #date')).toBeNull();
  expect(document.querySelectorAll('#date')).toHaveLength(1);
  // Nagłówek nie przewija się z listą: pozycje są w osobnym, przewijalnym ciele.
  expect(document.querySelector('#list > .list-body .item[data-id="a"]')).not.toBeNull();
});

test('wąski ekran: nagłówek dnia zostaje w pasku, przy każdym panelu', async () => {
  resetDom(false);
  seed([task('a')]);
  const { flush, ui } = await mountApp();
  expect(document.querySelector('#top .hdr-center #date')).not.toBeNull();
  expect(document.querySelector('.today-head')).toBeNull();
  ui.pane = 'list';
  flush();
  expect(document.querySelector('#list')).not.toBeNull();
  expect(document.querySelector('.today-head')).toBeNull();
  expect(document.querySelectorAll('#date')).toHaveLength(1);
});

test('backlog nie ma już nagłówka „Backlog"; nazwa zostaje dla czytnika ekranu', async () => {
  seed([]);
  await mountApp();
  const backlog = document.querySelector('#backlog')!;
  expect(backlog.querySelector('h2, .pane-title')).toBeNull();
  expect(backlog.getAttribute('aria-label')).toBe('Backlog');
  expect(css).not.toContain('.pane-title');
});

test('sekcja dziś: 1em od góry strony, tło strony, gruba jaśniejsza rama, dół do końca strony', () => {
  const rule = /#panes:not\(\.narrow\) #list\{([^}]*)\}/.exec(css)?.[1] ?? '';
  expect(rule).toContain('margin-top:calc(1em - var(--hdr) - 1px)');
  expect(rule).toContain('background:var(--bg)');
  expect(rule).toMatch(/border:var\(--frame\) solid var\(--raise\)/);
  expect(rule).toContain('border-bottom:0');
  expect(rule).toMatch(/--frame:\s*\d+px/);
  expect(rule).toMatch(/z-index:\s*1/);
});

test('nagłówek dnia nie ma linii oddzielającej go od listy; linia paska zostaje', () => {
  const head = /\.today-head\{([^}]*)\}/.exec(css)?.[1] ?? '';
  expect(head).not.toMatch(/(^|;)\s*border(-(top|bottom|left|right))?:/);
  const top = /#top\{([^}]*)\}/.exec(css)?.[1] ?? '';
  expect(top).toMatch(/border-bottom:1px solid var\(--line-2\)/);
});
