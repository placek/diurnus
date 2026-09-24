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
      matches: q.includes('min-width'), // szeroki ekran: oba panele
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

const inputs = () => [...document.querySelectorAll<HTMLInputElement>('#list .item-text')];
const marks = () => [...document.querySelectorAll('#list .bullet')].map((b) => b.textContent);

function typeInto(el: HTMLInputElement, text: string, flush: () => void) {
  el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  flush();
}

function press(el: HTMLElement, key: string, init: KeyboardEventInit = {}) {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(ev);
  return ev;
}

test('oba panele są na szerokim ekranie', async () => {
  await mountApp();
  expect(document.querySelector('#grid')).not.toBeNull();
  expect(document.querySelector('#list')).not.toBeNull();
});

test('pusty dzień dostaje jedno puste pole do pisania', async () => {
  await mountApp();
  expect(inputs()).toHaveLength(1);
  expect(inputs()[0]!.value).toBe('');
  expect(marks()).toEqual(['·']);
});

test('wpisanie tekstu utrwala pozycję w localStorage', async () => {
  const flush = await mountApp();
  typeInto(inputs()[0]!, 'Kupić chleb', flush);
  const saved = JSON.parse(localStorage.getItem('gridday.v1') ?? '{}');
  expect(saved.items).toHaveLength(1);
  expect(saved.items[0].text).toBe('Kupić chleb');
  expect(saved.items[0].day).toBe(today());
});

test('Enter tworzy kolejną pozycję i przenosi do niej fokus', async () => {
  const flush = await mountApp();
  typeInto(inputs()[0]!, 'Pierwsza', flush);
  press(inputs()[0]!, 'Enter');
  flush();
  expect(inputs()).toHaveLength(2);
  expect(inputs()[1]!.value).toBe('');
  expect(document.activeElement).toBe(inputs()[1]);
});

test('Enter po notatce tworzy notatkę, po wykonanym zadaniu zwykłe zadanie', async () => {
  const flush = await mountApp();
  press(inputs()[0]!, 'Tab');
  press(inputs()[0]!, 'Tab');
  flush();
  expect(marks()[0]).toBe('–'); // note
  press(inputs()[0]!, 'Enter');
  flush();
  expect(marks()[1]).toBe('–');
});

test('Tab zmienia znacznik i nie przenosi fokusu', async () => {
  const flush = await mountApp();
  typeInto(inputs()[0]!, 'Zadanie', flush);
  const ev = press(inputs()[0]!, 'Tab');
  flush();
  expect(ev.defaultPrevented).toBe(true);
  expect(marks()[0]).toBe('×');
});

test('Shift+Tab cykluje znacznik w drugą stronę', async () => {
  const flush = await mountApp();
  press(inputs()[0]!, 'Tab', { shiftKey: true });
  flush();
  expect(marks()[0]).toBe('–');
});

test('Backspace na pustej pozycji usuwa ją', async () => {
  const flush = await mountApp();
  typeInto(inputs()[0]!, 'Pierwsza', flush);
  press(inputs()[0]!, 'Enter');
  flush();
  const second = inputs()[1]!;
  second.selectionStart = second.selectionEnd = 0;
  press(second, 'Backspace');
  flush();
  expect(inputs()).toHaveLength(1);
});

test('Backspace na pozycji 0 NIEpustej pozycji jej nie usuwa', async () => {
  const flush = await mountApp();
  typeInto(inputs()[0]!, 'Pierwsza', flush);
  press(inputs()[0]!, 'Enter');
  flush();
  typeInto(inputs()[1]!, 'Druga', flush);
  const second = inputs()[1]!;
  second.selectionStart = second.selectionEnd = 0;
  press(second, 'Backspace');
  flush();
  expect(inputs()).toHaveLength(2);
});

test('strzałka w górę na początku tekstu przechodzi do poprzedniej pozycji', async () => {
  const flush = await mountApp();
  typeInto(inputs()[0]!, 'Pierwsza', flush);
  press(inputs()[0]!, 'Enter');
  flush();
  typeInto(inputs()[1]!, 'Druga', flush);
  const second = inputs()[1]!;
  second.selectionStart = second.selectionEnd = 0;
  const ev = press(second, 'ArrowUp');
  flush();
  expect(ev.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(inputs()[0]);
});

test('strzałka w środku tekstu NIE przechodzi między pozycjami', async () => {
  const flush = await mountApp();
  typeInto(inputs()[0]!, 'Pierwsza', flush);
  press(inputs()[0]!, 'Enter');
  flush();
  typeInto(inputs()[1]!, 'Druga', flush);
  const second = inputs()[1]!;
  second.selectionStart = second.selectionEnd = 2;
  const ev = press(second, 'ArrowUp');
  flush();
  expect(ev.defaultPrevented).toBe(false);
});

test('klik w znacznik przełącza zadanie i wykonane', async () => {
  const flush = await mountApp();
  typeInto(inputs()[0]!, 'Zadanie', flush);
  document.querySelector<HTMLElement>('#list .bullet')!.click();
  flush();
  expect(marks()[0]).toBe('×');
  document.querySelector<HTMLElement>('#list .bullet')!.click();
  flush();
  expect(marks()[0]).toBe('·');
});

test('lista pokazuje pozycje tego dnia, na który patrzymy', async () => {
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  typeInto(inputs()[0]!, 'Dzisiejsza', flush);

  const { shiftDay } = await import('../src/lib/time');
  app.viewDay = shiftDay(today(), 1);
  flush();
  expect(inputs()[0]!.value).toBe('');

  app.viewDay = today();
  flush();
  expect(inputs().some((i) => i.value === 'Dzisiejsza')).toBe(true);
});

test('cofnięcie przywraca tekst sprzed edycji, a nie ten dopiero wpisany', async () => {
  // Migawka musi powstać przy PIERWSZYM znaku. Gdyby powstawała przy wyjściu
  // z pozycji, zapisałaby stan już zmieniony i cofnięcie nic by nie dało.
  const flush = await mountApp();
  const { undo } = await import('../src/state.svelte');

  typeInto(inputs()[0]!, 'Pierwsza wersja', flush);
  inputs()[0]!.dispatchEvent(new Event('blur', { bubbles: true }));
  flush();

  typeInto(inputs()[0]!, 'Druga wersja', flush);
  flush();
  expect(inputs()[0]!.value).toBe('Druga wersja');

  undo();
  flush();
  expect(inputs()[0]!.value).toBe('Pierwsza wersja');
});

test('cały ciąg znaków w jednej pozycji to jeden krok cofania', async () => {
  const flush = await mountApp();
  const { undo } = await import('../src/state.svelte');

  // Trzy zdarzenia input bez opuszczania pozycji.
  typeInto(inputs()[0]!, 'a', flush);
  typeInto(inputs()[0]!, 'ab', flush);
  typeInto(inputs()[0]!, 'abc', flush);

  undo();
  flush();
  expect(inputs()[0]!.value).toBe('');
});

test('cofnięcie przywraca usuniętą pozycję', async () => {
  const flush = await mountApp();
  const { undo } = await import('../src/state.svelte');

  typeInto(inputs()[0]!, 'Pierwsza', flush);
  press(inputs()[0]!, 'Enter');
  flush();
  const second = inputs()[1]!;
  second.selectionStart = second.selectionEnd = 0;
  press(second, 'Backspace');
  flush();
  expect(inputs()).toHaveLength(1);

  undo();
  flush();
  expect(inputs()).toHaveLength(2);
});
