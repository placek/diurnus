// @vitest-environment jsdom
import { test, expect, beforeEach, vi } from 'vitest';

const ROW_H = 30;

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
  // jsdom nie implementuje przechwytywania wskaźnika.
  Element.prototype.setPointerCapture = function () {
    (this as unknown as { _cap: boolean })._cap = true;
  };
  Element.prototype.hasPointerCapture = function () {
    return (this as unknown as { _cap?: boolean })._cap === true;
  };
  Element.prototype.releasePointerCapture = function () {
    (this as unknown as { _cap: boolean })._cap = false;
  };
});

async function mountApp() {
  const { mount, flushSync } = await import('svelte');
  const App = (await import('../src/App.svelte')).default;
  mount(App, { target: document.body });
  flushSync();
  return flushSync;
}

const rows = () => [...document.querySelectorAll<HTMLElement>('#list .item[data-id]')];
const texts = () => rows().map((r) => r.querySelector<HTMLInputElement>('.item-text')!.value);
const bulletOf = (i: number) => rows()[i]!.querySelector<HTMLElement>('.bullet')!;

/** jsdom zwraca same zera; nadajemy wierszom realną geometrię. */
function layout() {
  rows().forEach((row, i) => {
    row.getBoundingClientRect = () =>
      ({ top: i * ROW_H, bottom: (i + 1) * ROW_H, height: ROW_H, left: 0, right: 200, width: 200, x: 0, y: i * ROW_H, toJSON: () => ({}) }) as DOMRect;
  });
}

function pointer(el: HTMLElement, type: string, x: number, y: number, button = 0) {
  el.dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button, pointerId: 1 }),
  );
}

async function seed(flush: () => void, ...labels: string[]) {
  const draft = () => document.querySelector<HTMLInputElement>('#list .is-draft .item-text')!;
  for (const label of labels) {
    const d = draft();
    d.value = label;
    d.dispatchEvent(new Event('input', { bubbles: true }));
    flush();
  }
}

test('przeciągnięcie pierwszej pozycji na dół zmienia kolejność', async () => {
  const flush = await mountApp();
  await seed(flush, 'A', 'B', 'C');
  expect(texts()).toEqual(['A', 'B', 'C']);
  layout();

  const b = bulletOf(0);
  pointer(b, 'pointerdown', 5, 15);
  pointer(b, 'pointermove', 5, 80); // poniżej środków B i C
  flush();
  pointer(b, 'pointerup', 5, 80);
  flush();

  expect(texts()).toEqual(['B', 'C', 'A']);
});

test('przeciągnięcie ostatniej pozycji na górę zmienia kolejność', async () => {
  const flush = await mountApp();
  await seed(flush, 'A', 'B', 'C');
  layout();

  const b = bulletOf(2);
  pointer(b, 'pointerdown', 5, 75);
  pointer(b, 'pointermove', 5, 2); // powyżej środka A
  flush();
  pointer(b, 'pointerup', 5, 2);
  flush();

  expect(texts()).toEqual(['C', 'A', 'B']);
});

test('nowa kolejność utrwala się w localStorage', async () => {
  const flush = await mountApp();
  await seed(flush, 'A', 'B');
  layout();

  const b = bulletOf(0);
  pointer(b, 'pointerdown', 5, 15);
  pointer(b, 'pointermove', 5, 50);
  flush();
  pointer(b, 'pointerup', 5, 50);
  flush();

  const saved = JSON.parse(localStorage.getItem('diurnus.v1') ?? '{}');
  expect(saved.items.map((i: { text: string }) => i.text)).toEqual(['B', 'A']);
});

test('ruch poniżej progu nie przeciąga, tylko przełącza znacznik', async () => {
  const flush = await mountApp();
  await seed(flush, 'A', 'B');
  layout();

  const b = bulletOf(0);
  pointer(b, 'pointerdown', 5, 15);
  pointer(b, 'pointermove', 6, 17); // 2 px — poniżej progu 4 px
  flush();
  pointer(b, 'pointerup', 6, 17);
  b.click();
  flush();

  // Wykonane stoją w osobnej grupie na górze, więc wiersz jest nowy — pytamy o znacznik od nowa.
  expect(texts()).toEqual(['A', 'B']);
  expect(bulletOf(0).textContent).toBe('×'); // klik zadziałał
});

test('po przeciągnięciu klik NIE przełącza znacznika', async () => {
  const flush = await mountApp();
  await seed(flush, 'A', 'B');
  layout();

  const b = bulletOf(0);
  pointer(b, 'pointerdown', 5, 15);
  pointer(b, 'pointermove', 5, 50);
  flush();
  pointer(b, 'pointerup', 5, 50);
  b.click(); // przeglądarka wysyła click po przeciągnięciu
  flush();

  expect(texts()).toEqual(['B', 'A']);
  // Znacznik PRZECIĄGNIĘTEJ pozycji, nie pierwszej w liście: po przestawieniu
  // "A" stoi drugie, więc sprawdzanie pierwszego wiersza nic by nie dowiodło.
  const dragged = rows().find((r) => r.querySelector<HTMLInputElement>('.item-text')!.value === 'A')!;
  expect(dragged.querySelector('.bullet')!.textContent).toBe('·');
});

test('w trakcie przeciągania widać kreskę wstawienia i przygaszony wiersz', async () => {
  const flush = await mountApp();
  await seed(flush, 'A', 'B', 'C');
  layout();

  const b = bulletOf(0);
  pointer(b, 'pointerdown', 5, 15);
  pointer(b, 'pointermove', 5, 50);
  flush();

  expect(document.querySelector('.drop-line')).not.toBeNull();
  expect(rows()[0]!.classList.contains('is-dragging')).toBe(true);

  pointer(b, 'pointerup', 5, 50);
  flush();
  expect(document.querySelector('.drop-line')).toBeNull();
});

test('cofnięcie przywraca poprzednią kolejność', async () => {
  const flush = await mountApp();
  const { undo } = await import('../src/state.svelte');
  await seed(flush, 'A', 'B');
  layout();

  const b = bulletOf(0);
  pointer(b, 'pointerdown', 5, 15);
  pointer(b, 'pointermove', 5, 50);
  flush();
  pointer(b, 'pointerup', 5, 50);
  flush();
  expect(texts()).toEqual(['B', 'A']);

  undo();
  flush();
  expect(texts()).toEqual(['A', 'B']);
});

test('prawy przycisk nie rozpoczyna przeciągania', async () => {
  const flush = await mountApp();
  await seed(flush, 'A', 'B');
  layout();

  const b = bulletOf(0);
  pointer(b, 'pointerdown', 5, 15, 2); // prawy przycisk
  pointer(b, 'pointermove', 5, 50);
  flush();

  expect(document.querySelector('.drop-line')).toBeNull();
  expect(texts()).toEqual(['A', 'B']);
});
