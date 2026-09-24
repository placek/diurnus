// @vitest-environment jsdom
import { test, expect, beforeEach, vi } from 'vitest';
import { today } from '../src/lib/time';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem('gridday.prefs', JSON.stringify({ theme: 'auto', seenHelp: true }));
  document.body.innerHTML = '';
  document.head.innerHTML = '<meta name="theme-color" content="#282828">';
  delete document.documentElement.dataset.theme;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({
      matches: q.includes('min-width'),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
});

async function mountApp() {
  const { mount, flushSync } = await import('svelte');
  const App = (await import('../src/App.svelte')).default;
  mount(App, { target: document.body });
  flushSync();
  return flushSync;
}

// Zadanie 3 wprowadza uzgadnianie, nie wyświetlanie — asercje idą na stan,
// żeby zadanie było samodzielne. Widok sprawdza zadanie 4.
async function createBlock(flush: () => void) {
  document.querySelector<HTMLElement>('#grid .cell[data-q="32"]')!.click();
  flush();
  document.querySelector<HTMLElement>('#radial .rb[aria-label="Nauka"]')!.click();
  flush();
}

test('utworzenie bloku tworzy powiązaną pozycję', async () => {
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  await createBlock(flush);
  expect(app.S.items).toHaveLength(1);
  expect(app.S.items[0]!.block).toBe(app.S.blocks[0]!.id);
});

test('powiązana pozycja utrwala się razem ze stanem', async () => {
  const flush = await mountApp();
  await createBlock(flush);
  const saved = JSON.parse(localStorage.getItem('gridday.v1') ?? '{}');
  expect(saved.items).toHaveLength(1);
  expect(saved.items[0].block).toBe(saved.blocks[0].id);
});

test('zmiana dnia uzgadnia listę nowego dnia', async () => {
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  const { shiftDay } = await import('../src/lib/time');
  await createBlock(flush);

  app.viewDay = shiftDay(today(), 1);
  flush();
  expect(app.S.items.filter((i) => i.day === app.viewDay)).toHaveLength(0);

  app.viewDay = today();
  flush();
  expect(app.S.items.filter((i) => i.day === app.viewDay && i.block)).toHaveLength(1);
});

test('powtarzane mutacje nie mnożą pozycji', async () => {
  const flush = await mountApp();
  const { app, commit } = await import('../src/state.svelte');
  await createBlock(flush);
  for (let i = 0; i < 5; i++) commit(() => {});
  flush();
  expect(app.S.items).toHaveLength(1);
});
