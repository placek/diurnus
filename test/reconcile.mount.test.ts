// @vitest-environment jsdom
import { test, expect, beforeEach, vi } from 'vitest';
import { today } from '../src/lib/time';

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


/** Aplikacja pokazuje dzień wyliczony z zegara — podróż w czasie idzie przez `now`. */
const atDay = (day: string, hour = 12) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d!, hour).getTime();
};

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
  const { app, currentDay } = await import('../src/state.svelte');
  await createBlock(flush);
  expect(app.S.items).toHaveLength(1);
  expect(app.S.items[0]!.block).toBe(app.S.blocks[0]!.id);
});

test('powiązana pozycja utrwala się razem ze stanem', async () => {
  const flush = await mountApp();
  await createBlock(flush);
  const saved = JSON.parse(localStorage.getItem('diurnus.v1') ?? '{}');
  expect(saved.items).toHaveLength(1);
  expect(saved.items[0].block).toBe(saved.blocks[0].id);
});

test('zmiana dnia uzgadnia listę nowego dnia', async () => {
  const flush = await mountApp();
  const { app, currentDay } = await import('../src/state.svelte');
  const { shiftDay } = await import('../src/lib/time');
  await createBlock(flush);

  app.now = atDay(shiftDay(today(), 1));
  flush();
  expect(app.S.items.filter((i) => i.day === currentDay.value)).toHaveLength(0);

  app.now = atDay(today());
  flush();
  expect(app.S.items.filter((i) => i.day === currentDay.value && i.block)).toHaveLength(1);
});

test('powtarzane mutacje nie mnożą pozycji', async () => {
  const flush = await mountApp();
  const { app, commit, currentDay } = await import('../src/state.svelte');
  await createBlock(flush);
  for (let i = 0; i < 5; i++) commit(() => {});
  flush();
  expect(app.S.items).toHaveLength(1);
});

const linkedRows = () => [...document.querySelectorAll('#list .item.is-linked')];

test('pozycja powiązana pokazuje godzinę swojego bloku', async () => {
  const flush = await mountApp();
  await createBlock(flush);
  expect(linkedRows()).toHaveLength(1);
  expect(linkedRows()[0]!.querySelector('.item-hour')!.textContent).toBe('08:00');
});

test('pozycja powiązana pokazuje nazwę kategorii, dopóki nie ma tytułu', async () => {
  const flush = await mountApp();
  await createBlock(flush);
  const input = linkedRows()[0]!.querySelector<HTMLInputElement>('.item-text')!;
  expect(input.placeholder).toBe('Nauka');
});

test('pozycje powiązane stoją nad swobodnymi, posortowane po godzinie', async () => {
  const flush = await mountApp();
  const d = document.querySelector<HTMLInputElement>('#list .is-draft .item-text')!;
  d.value = 'Notatka';
  d.dispatchEvent(new Event('input', { bubbles: true }));
  flush();

  await createBlock(flush); // 08:00
  document.querySelector<HTMLElement>('#grid .cell[data-q="24"]')!.click();
  flush();
  document.querySelector<HTMLElement>('#radial .rb[aria-label="Ruch"]')!.click();
  flush();

  const rows = [...document.querySelectorAll('#list .item[data-id]')];
  expect(rows[0]!.querySelector('.item-hour')!.textContent).toBe('06:00');
  expect(rows[1]!.querySelector('.item-hour')!.textContent).toBe('08:00');
  expect(rows[2]!.classList.contains('is-linked')).toBe(false);
});

test('przeciąganie pozycji powiązanej w obrębie listy nie przestawia jej', async () => {
  const flush = await mountApp();
  const { app, currentDay } = await import('../src/state.svelte');
  await createBlock(flush);

  const bullet = document.querySelector<HTMLElement>('#list .item.is-linked .bullet')!;
  bullet.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 15, button: 0, pointerId: 1 }),
  );
  bullet.dispatchEvent(
    new PointerEvent('pointermove', { bubbles: true, clientX: 5, clientY: 200, pointerId: 1 }),
  );
  flush();
  expect(document.querySelector('.drop-line')).toBeNull();
  expect(app.S.items).toHaveLength(1);
});

test('strzałki nawigują przez obie grupy w kolejności wyświetlania', async () => {
  // Znalezione w przeglądzie: `siblings` liczyło tylko pozycje swobodne, więc
  // dla pozycji powiązanej index wychodził -1 i strzałki przestawały działać.
  const flush = await mountApp();
  await createBlock(flush); // pozycja powiązana, 08:00

  const d = document.querySelector<HTMLInputElement>('#list .is-draft .item-text')!;
  d.value = 'Notatka';
  d.dispatchEvent(new Event('input', { bubbles: true }));
  flush();

  const all = [...document.querySelectorAll<HTMLInputElement>('#list .item[data-id] .item-text')];
  expect(all).toHaveLength(2);

  // Z notatki w górę do pozycji powiązanej.
  const free = all[1]!;
  free.selectionStart = free.selectionEnd = 0;
  const up = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
  free.dispatchEvent(up);
  flush();
  expect(up.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(all[0]);

  // I z powrotem w dół.
  const linked = all[0]!;
  linked.selectionStart = linked.selectionEnd = linked.value.length;
  const down = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
  linked.dispatchEvent(down);
  flush();
  expect(down.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(all[1]);
});

test('pozycja powiązana niesie kategorię i wspólny kształt, swobodna zostaje tekstem', async () => {
  const flush = await mountApp();
  await createBlock(flush);

  const d = document.querySelector<HTMLInputElement>('#list .is-draft .item-text')!;
  d.value = 'Zwykła notatka';
  d.dispatchEvent(new Event('input', { bubbles: true }));
  flush();

  const linked = document.querySelector('#list .item.is-linked')!;
  expect(linked.classList.contains('has-cat')).toBe(true);
  // jsdom normalizuje styl inline, więc porównujemy bez białych znaków.
  expect(linked.getAttribute('style')!.replace(/\s+/g, '')).toContain('--c:var(--blue)');

  const free = document.querySelector('#list .item:not(.is-linked):not(.is-draft)')!;
  expect(free.classList.contains('has-cat')).toBe(false);
});
