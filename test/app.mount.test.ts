// @vitest-environment jsdom
import { test, expect, beforeEach, vi } from 'vitest';

// Jedyny test, który uruchamia aplikację tak, jak robi to przeglądarka:
// montuje App, więc wykrywa całkowitą awarię startu (runy, efekty, kolejność
// dostępu do localStorage), której render po stronie serwera nie dotyka.
beforeEach(() => {
  // Stan modułu (app, ui) przeżywa pojedynczy test — Vitest izoluje pliki,
  // nie testy. Bez resetu pierwszy zamontowany App zatruwa kolejne.
  vi.resetModules();
  localStorage.clear();
  document.body.innerHTML = '';
  document.head.innerHTML = '<meta name="theme-color" content="#282828">';
  delete document.documentElement.dataset.theme;
  // jsdom nie implementuje matchMedia; aplikacja pyta o preferowany motyw.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
});

async function mountApp() {
  const { mount, flushSync } = await import('svelte');
  const App = (await import('../src/App.svelte')).default;
  const instance = mount(App, { target: document.body });
  flushSync();
  return instance;
}

test('aplikacja montuje się i rysuje siatkę z domyślnego stanu', async () => {
  await mountApp();
  expect(document.querySelector('#top')).not.toBeNull();
  expect(document.querySelector('#grid')).not.toBeNull();
  expect(document.querySelectorAll('#grid .row')).toHaveLength(16);
  expect(document.querySelectorAll('#grid .cell')).toHaveLength(64);
});

test('pierwsze uruchomienie pokazuje ekran pomocy i zapamiętuje to', async () => {
  await mountApp();
  expect(document.querySelector('#helpbox')).not.toBeNull();
  expect(JSON.parse(localStorage.getItem('diurnus.prefs') ?? '{}').seenHelp).toBe(true);
});

test('kliknięcie w pustą komórkę otwiera menu radialne z kategoriami', async () => {
  localStorage.setItem('diurnus.prefs', JSON.stringify({ theme: 'auto', seenHelp: true }));
  const { flushSync } = await import('svelte');
  await mountApp();

  const cell = document.querySelector<HTMLElement>('#grid .cell[data-q="32"]');
  expect(cell).not.toBeNull();
  cell!.click();
  flushSync();

  const radial = document.querySelector('#radial');
  expect(radial).not.toBeNull();
  // Domyślny zestaw ma 6 kategorii głównych.
  expect(radial!.querySelectorAll('.rb').length).toBeGreaterThan(0);
});

test('wybór kategorii bez podkategorii tworzy blok i utrwala go', async () => {
  localStorage.setItem('diurnus.prefs', JSON.stringify({ theme: 'auto', seenHelp: true }));
  const { flushSync } = await import('svelte');
  await mountApp();

  document.querySelector<HTMLElement>('#grid .cell[data-q="32"]')!.click();
  flushSync();

  // "Nauka" nie ma podkategorii, więc jedno kliknięcie zapisuje blok.
  // "Praca" ma — tamta otwiera drugi pierścień (osobny test niżej).
  const nauka = document.querySelector<HTMLElement>('#radial .rb[aria-label="Nauka"]');
  expect(nauka).not.toBeNull();
  nauka!.click();
  flushSync();

  // Celowo bez .ghost: podgląd miejsca też nosi klasę .blk i przepuściłby
  // ten test, gdyby żaden blok nie powstał.
  expect(document.querySelectorAll('#grid .blk:not(.ghost)')).toHaveLength(1);
  expect(document.querySelector('#radial')).toBeNull();

  // Blok to zadanie dziś ze slotem: jeden rekord, z kategorią jako daną.
  const saved = JSON.parse(localStorage.getItem('diurnus.v1') ?? '{}');
  expect(saved.v).toBe(6);
  expect(saved.items).toHaveLength(1);
  expect(saved.items[0].state).toEqual({ tag: 'today-task', done: false, slot: 32 });
  expect(saved.items[0].cat).toBe('learn');
});

test('kategoria z podkategoriami otwiera drugi pierścień zamiast zapisywać', async () => {
  localStorage.setItem('diurnus.prefs', JSON.stringify({ theme: 'auto', seenHelp: true }));
  const { flushSync } = await import('svelte');
  await mountApp();

  document.querySelector<HTMLElement>('#grid .cell[data-q="32"]')!.click();
  flushSync();
  document.querySelector<HTMLElement>('#radial .rb[aria-label="Praca"]')!.click();
  flushSync();

  expect(document.querySelectorAll('#grid .blk:not(.ghost)')).toHaveLength(0);
  // Środek drugiego pierścienia wybiera kategorię nadrzędną "ogólnie".
  expect(document.querySelector('#radial .rc.pick')).not.toBeNull();
  expect(document.querySelector('#radial .rb[aria-label="Projekt A"]')).not.toBeNull();
  // Podkategorie mają podpisy z nazwami — ich ikony bywają takie same jak rodzica.
  const names = [...document.querySelectorAll('#radial .rb .rn')].map((n) => n.textContent);
  expect(names).toContain('Projekt A');
  expect(names).toHaveLength(document.querySelectorAll('#radial .rb').length);
});

test('pierwszy pierścień (kategorie główne) zostaje bez podpisów', async () => {
  localStorage.setItem('diurnus.prefs', JSON.stringify({ theme: 'auto', seenHelp: true }));
  const { flushSync } = await import('svelte');
  await mountApp();
  document.querySelector<HTMLElement>('#grid .cell[data-q="32"]')!.click();
  flushSync();
  expect(document.querySelectorAll('#radial .rb').length).toBeGreaterThan(0);
  expect(document.querySelector('#radial .rn')).toBeNull();
});

test('motyw ustawiony na ciemny trafia na element html', async () => {
  localStorage.setItem('diurnus.prefs', JSON.stringify({ theme: 'dark', seenHelp: true }));
  await mountApp();
  expect(document.documentElement.dataset.theme).toBe('dark');
});
