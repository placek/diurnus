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
      matches: false, // wąski ekran: min-width nie pasuje
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

const toggle = () => document.querySelector<HTMLElement>('[aria-label="Przełącz panel"]');

test('na wąskim ekranie widać tylko siatkę', async () => {
  await mountApp();
  expect(document.querySelector('#grid')).not.toBeNull();
  expect(document.querySelector('#list')).toBeNull();
});

test('przełącznik panelu pojawia się tylko na wąskim ekranie', async () => {
  await mountApp();
  expect(toggle()).not.toBeNull();
});

test('przełącznik przechodzi cyklicznie przez trzy panele', async () => {
  const flush = await mountApp();
  const visible = () =>
    ['grid', 'list', 'backlog'].filter((id) => document.querySelector(`#${id}`) !== null);

  expect(visible()).toEqual(['grid']);

  toggle()!.click();
  flush();
  expect(visible()).toEqual(['list']);

  toggle()!.click();
  flush();
  expect(visible()).toEqual(['backlog']);

  toggle()!.click();
  flush();
  expect(visible()).toEqual(['grid']);
});

test('na szerokim ekranie widać wszystkie trzy panele', async () => {
  vi.resetModules();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({
      matches: q.includes('min-width'),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  document.body.innerHTML = '';
  const flush = await mountApp();
  flush();
  for (const id of ['grid', 'list', 'backlog']) {
    expect(document.querySelector(`#${id}`), id).not.toBeNull();
  }
  expect(toggle()).toBeNull();
});

test('kontener paneli dostaje klasę narrow', async () => {
  await mountApp();
  expect(document.querySelector('#panes')!.classList.contains('narrow')).toBe(true);
});
