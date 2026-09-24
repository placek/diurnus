// @vitest-environment jsdom
import { test, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem('diurnus.prefs', JSON.stringify({ theme: 'auto', seenHelp: true }));
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

const blocks = () => document.querySelectorAll('#grid .blk:not(.ghost)');
const linkedInput = () =>
  document.querySelector<HTMLInputElement>('#list .item.is-linked .item-text')!;

async function createBlock(flush: () => void) {
  document.querySelector<HTMLElement>('#grid .cell[data-q="32"]')!.click();
  flush();
  document.querySelector<HTMLElement>('#radial .rb[aria-label="Nauka"]')!.click();
  flush();
}

const backspace = (input: HTMLInputElement) => {
  input.selectionStart = input.selectionEnd = 0;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
};

test('usunięcie bloku usuwa jego pozycję z listy', async () => {
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  const { removeBlock } = await import('../src/actions.svelte');
  await createBlock(flush);
  expect(document.querySelectorAll('#list .item.is-linked')).toHaveLength(1);

  removeBlock(app.S.blocks[0]!.id);
  flush();
  expect(document.querySelectorAll('#list .item.is-linked')).toHaveLength(0);
});

test('Backspace na pustej pozycji powiązanej usuwa blok z siatki', async () => {
  const flush = await mountApp();
  await createBlock(flush);
  expect(blocks().length).toBeGreaterThan(0);

  backspace(linkedInput());
  flush();
  expect(blocks()).toHaveLength(0);
});

test('usunięcie pozycji powiązanej cofa się jednym Ctrl+Z', async () => {
  const flush = await mountApp();
  const { undo } = await import('../src/state.svelte');
  await createBlock(flush);

  backspace(linkedInput());
  flush();
  expect(blocks()).toHaveLength(0);

  undo();
  flush();
  expect(blocks().length).toBeGreaterThan(0);
  expect(document.querySelectorAll('#list .item.is-linked')).toHaveLength(1);
});

test('tekst wpisany w pozycji powiązanej trafia do tytułu bloku', async () => {
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  await createBlock(flush);

  const input = linkedInput();
  input.value = 'Rozdział trzeci';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flush();
  expect(app.S.blocks[0]!.title).toBe('Rozdział trzeci');
});

test('usunięcie pozycji swobodnej nie rusza żadnego bloku', async () => {
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  await createBlock(flush);

  const d = document.querySelector<HTMLInputElement>('#list .is-draft .item-text')!;
  d.value = 'Notatka';
  d.dispatchEvent(new Event('input', { bubbles: true }));
  flush();

  const free = document.querySelector<HTMLInputElement>('#list .item:not(.is-linked):not(.is-draft) .item-text')!;
  free.value = '';
  free.dispatchEvent(new Event('input', { bubbles: true }));
  flush();
  backspace(free);
  flush();

  expect(app.S.blocks).toHaveLength(1);
});
