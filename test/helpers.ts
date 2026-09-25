// Wspólne przygotowanie testów montowania. Plik nie jest testem (nie kończy
// się na .test.ts), więc Vitest go nie uruchamia — tylko importuje.
import { vi } from 'vitest';
import type { Item, ItemState } from '../src/lib/machine';
import { today } from '../src/lib/time';

export const TODAY = today();

export const CATS = [
  { id: 'learn', name: 'Nauka', icon: 'book-open', color: 'blue', parent: null },
  { id: 'work', name: 'Praca', icon: 'laptop-code', color: 'yellow', parent: null },
];

/** Czyste DOM i pamięć oraz podpórki dla tego, czego jsdom nie ma. */
export function resetDom(wide = true): void {
  vi.resetModules();
  localStorage.clear();
  document.body.innerHTML = '';
  document.head.innerHTML = '<meta name="theme-color" content="#282828">';
  delete document.documentElement.dataset.theme;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({
      matches: wide && q.includes('min-width'),
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
}

export const item = (id: string, state: ItemState, extra: Partial<Item> = {}): Item => ({
  id,
  text: id,
  created: 0,
  state,
  ...extra,
});
export const task = (id: string, slot: number | null = null, extra: Partial<Item> = {}) =>
  item(id, { tag: 'today-task', done: false, slot }, extra);
export const done = (id: string, slot: number | null = null, extra: Partial<Item> = {}) =>
  item(id, { tag: 'today-task', done: true, slot }, extra);
export const note = (id: string, extra: Partial<Item> = {}) =>
  item(id, { tag: 'today-note' }, extra);
export const backlog = (
  id: string,
  when: Extract<ItemState, { tag: 'backlog-task' }>['when'] = null,
  extra: Partial<Item> = {},
) => item(id, { tag: 'backlog-task', when }, extra);

/** Stan v6 w pamięci przeglądarki, na dziś. */
export function seed(
  items: Item[],
  opts: { start?: number; end?: number; notify?: boolean; seenHelp?: boolean; today?: string } = {},
): void {
  localStorage.setItem(
    'diurnus.prefs',
    JSON.stringify({
      theme: 'auto',
      seenHelp: opts.seenHelp ?? true,
      notify: opts.notify ?? false,
    }),
  );
  localStorage.setItem(
    'diurnus.v1',
    JSON.stringify({
      v: 6,
      cats: CATS,
      day: { start: opts.start ?? 6, end: opts.end ?? 22, bands: [] },
      today: opts.today ?? TODAY,
      items,
    }),
  );
}

export async function mountApp() {
  const { mount, flushSync } = await import('svelte');
  const App = (await import('../src/App.svelte')).default;
  mount(App, { target: document.body });
  flushSync();
  const state = await import('../src/state.svelte');
  return { flush: flushSync, app: state.app, ui: state.ui, state };
}

export function pointer(el: Element, type: string, x: number, y = 10, button = 0): void {
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button,
      pointerId: 1,
    }),
  );
}

export const stateOf = (items: readonly Item[], id: string) =>
  items.find((i) => i.id === id)?.state;
