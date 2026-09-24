// @vitest-environment jsdom
import { test, expect, beforeEach, vi } from 'vitest';
import { shiftDay, today } from '../src/lib/time';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
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

function seed(items: unknown[]) {
  localStorage.setItem('gridday.prefs', JSON.stringify({ theme: 'auto', seenHelp: true }));
  localStorage.setItem('gridday.v1', JSON.stringify({
    v: 5,
    cats: [{ id: 'learn', name: 'Nauka', icon: 'book-open', color: 'blue', parent: null }],
    day: { start: 6, end: 22, bands: [] }, blocks: [], items,
  }));
}

async function mountApp() {
  const { mount, flushSync } = await import('svelte');
  const App = (await import('../src/App.svelte')).default;
  mount(App, { target: document.body });
  flushSync();
  return flushSync;
}

const backlogBullet = () =>
  document.querySelector<HTMLElement>('#backlog .backlog-item:not(.is-draft) .bullet')!;
const backlogRows = () =>
  document.querySelectorAll('#backlog .backlog-item:not(.is-draft)');
const noteTexts = () =>
  [...document.querySelectorAll<HTMLInputElement>('#list .item[data-id] .item-text')].map((i) => i.value);

test('odhaczona pozycja backlogu trafia do dzisiejszej listy jako wykonana', async () => {
  seed([{ id: 'a', day: shiftDay(today(), 2), text: 'Zadzwonić', type: 'task', created: 0 }]);
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');

  backlogBullet().click();
  flush();

  expect(backlogRows()).toHaveLength(0);
  expect(noteTexts()).toContain('Zadzwonić');
  const moved = app.S.items.find((i) => i.id === 'a')!;
  expect(moved.day).toBe(today());
  expect(moved.type).toBe('done');
});

test('odhaczenie gubi porę — dziś rzecz jest zrobiona, nie zaplanowana', async () => {
  seed([{ id: 'a', day: shiftDay(today(), 2), text: 'X', type: 'task', created: 0, at: 36 }]);
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  backlogBullet().click();
  flush();
  expect(app.S.items.find((i) => i.id === 'a')!.at).toBeUndefined();
});

test('odhaczenie pozycji powtarzalnej zostawia szablon w backlogu', async () => {
  seed([{
    id: 'r', day: null, text: 'Podlać kwiaty', type: 'task', created: 0,
    repeat: { kind: 'daily' }, nextOn: today(),
  }]);
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');

  backlogBullet().click();
  flush();

  expect(backlogRows()).toHaveLength(1);
  const template = app.S.items.find((i) => i.id === 'r')!;
  expect(template.type).toBe('task');
  expect(template.repeat).toEqual({ kind: 'daily' });
});

test('odhaczenie powtarzalnej rodzi wykonaną kopię w dziś', async () => {
  seed([{
    id: 'r', day: null, text: 'Podlać kwiaty', type: 'task', created: 0,
    repeat: { kind: 'daily' }, nextOn: today(),
  }]);
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');

  backlogBullet().click();
  flush();

  const copies = app.S.items.filter((i) => i.day === today() && i.type === 'done');
  expect(copies).toHaveLength(1);
  expect(copies[0]!.text).toBe('Podlać kwiaty');
  expect(copies[0]!.repeat).toBeUndefined();
  expect(noteTexts()).toContain('Podlać kwiaty');
});

test('odhaczenie powtarzalnej przesuwa termin na następne wystąpienie', async () => {
  seed([{
    id: 'r', day: null, text: 'X', type: 'task', created: 0,
    repeat: { kind: 'daily' }, nextOn: today(),
  }]);
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');

  backlogBullet().click();
  flush();
  expect(app.S.items.find((i) => i.id === 'r')!.nextOn).toBe(shiftDay(today(), 1));
});

test('powtarzalną da się odhaczyć wielokrotnie, za każdym razem przesuwając termin', async () => {
  seed([{
    id: 'r', day: null, text: 'X', type: 'task', created: 0,
    repeat: { kind: 'daily' }, nextOn: today(),
  }]);
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');

  backlogBullet().click();
  flush();
  backlogBullet().click();
  flush();

  expect(app.S.items.find((i) => i.id === 'r')!.nextOn).toBe(shiftDay(today(), 2));
  expect(app.S.items.filter((i) => i.type === 'done')).toHaveLength(2);
});

const openMenu = (flush: () => void) => {
  backlogBullet().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  flush();
  return [...document.querySelectorAll<HTMLElement>('.bullet-menu button')];
};

test('menu pozycji backlogu oferuje cztery wzorce i zdjęcie powtarzania', async () => {
  seed([{ id: 'a', day: null, text: 'X', type: 'task', created: 0 }]);
  const flush = await mountApp();
  const labels = openMenu(flush).map((b) => b.textContent?.trim());
  expect(labels).toContain('○codziennie');
  expect(labels).toContain('·bez powtarzania');
  expect(labels.filter((l) => l?.startsWith('○'))).toHaveLength(4);
});

test('wybór wzorca nadaje powtarzalność i wylicza termin', async () => {
  seed([{ id: 'a', day: null, text: 'X', type: 'task', created: 0 }]);
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');

  const daily = openMenu(flush).find((b) => b.textContent?.includes('codziennie'))!;
  daily.click();
  flush();

  const item = app.S.items.find((i) => i.id === 'a')!;
  expect(item.repeat).toEqual({ kind: 'daily' });
  expect(item.nextOn).toBe(shiftDay(today(), 1));
  expect(document.querySelector('#backlog .bullet')!.classList.contains('is-repeat')).toBe(true);
});

test('bez powtarzania zdejmuje wzorzec i termin', async () => {
  seed([{
    id: 'a', day: null, text: 'X', type: 'task', created: 0,
    repeat: { kind: 'daily' }, nextOn: today(),
  }]);
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');

  openMenu(flush).find((b) => b.textContent?.includes('bez powtarzania'))!.click();
  flush();

  const item = app.S.items.find((i) => i.id === 'a')!;
  expect(item.repeat).toBeUndefined();
  expect(item.nextOn).toBeUndefined();
  expect(document.querySelector('#backlog .bullet')!.classList.contains('is-repeat')).toBe(false);
});

test('pozycja dzisiejsza nie dostaje wzorców w menu', async () => {
  seed([{ id: 'a', day: today(), text: 'X', type: 'task', created: 0 }]);
  const flush = await mountApp();
  const bullet = document.querySelector<HTMLElement>('#list .item[data-id] .bullet')!;
  bullet.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  flush();
  const labels = [...document.querySelectorAll('.bullet-menu button')].map((b) => b.textContent?.trim());
  expect(labels.some((l) => l?.startsWith('○'))).toBe(false);
});
