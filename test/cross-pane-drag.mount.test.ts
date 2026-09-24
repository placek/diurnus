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
      matches: q.includes('min-width'), media: q,
      addEventListener() {}, removeEventListener() {},
    }),
  });
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

function seed(items: unknown[], blocks: unknown[] = []) {
  localStorage.setItem('gridday.prefs', JSON.stringify({ theme: 'auto', seenHelp: true }));
  localStorage.setItem('gridday.v1', JSON.stringify({
    v: 5,
    cats: [{ id: 'learn', name: 'Nauka', icon: 'book-open', color: 'blue', parent: null }],
    day: { start: 6, end: 22, bands: [] }, blocks, items,
  }));
}

async function mountApp() {
  const { mount, flushSync } = await import('svelte');
  const App = (await import('../src/App.svelte')).default;
  mount(App, { target: document.body });
  flushSync();
  return flushSync;
}

/** elementsFromPoint zwraca w jsdom pustkę — podstawiamy panel docelowy. */
function dropOn(paneId: string) {
  const pane = document.getElementById(paneId)!;
  document.elementsFromPoint = () => [pane];
}

function drag(bullet: HTMLElement, flush: () => void) {
  bullet.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 15, button: 0, pointerId: 1 }));
  bullet.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 400, clientY: 200, pointerId: 1 }));
  flush();
  bullet.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 400, clientY: 200, pointerId: 1 }));
  flush();
}

const backlogBullet = () =>
  document.querySelector<HTMLElement>('#backlog .backlog-item:not(.is-draft) .bullet')!;
const noteBullet = () => document.querySelector<HTMLElement>('#list .item[data-id] .bullet')!;

test('przeciągnięcie notatki na backlog nie pyta o nic — pozycja jest bez daty', async () => {
  seed([{ id: 'a', day: today(), text: 'Odłożyć', type: 'task', created: 0 }]);
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  dropOn('backlog');
  drag(noteBullet(), flush);

  expect(document.querySelector('.date-prompt')).toBeNull();
  expect(app.S.items.find((i) => i.id === 'a')!.day).toBeNull();
  expect(document.querySelectorAll('#backlog .backlog-item:not(.is-draft)')).toHaveLength(1);
});

test('przeciągnięcie pozycji powiązanej do backlogu zrywa powiązanie z blokiem', async () => {
  seed(
    [{ id: 'a', day: today(), text: 'Nauka', type: 'task', created: 0, block: 'b1' }],
    [{ id: 'b1', day: today(), q: 36, len: 2, cat: 'learn', title: 'Nauka', status: 'planned', created: 0 }],
  );
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  dropOn('backlog');
  drag(noteBullet(), flush);

  expect(app.S.items.find((i) => i.id === 'a')!.block).toBeUndefined();
});

test('menu znacznika w backlogu pozwala nadać termin', async () => {
  seed([{ id: 'a', day: null, text: 'X', type: 'task', created: 0 }]);
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');

  backlogBullet().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  flush();
  const labels = [...document.querySelectorAll('.bullet-menu button')].map((b) => b.textContent?.trim());
  expect(labels).toContain('→jutro');
  expect(labels).toContain('→za tydzień');
  expect(labels).toContain('…wybierz datę…');
  expect(labels).toContain('→bez daty');

  [...document.querySelectorAll<HTMLElement>('.bullet-menu button')]
    .find((b) => b.textContent?.includes('jutro'))!.click();
  flush();
  expect(app.S.items.find((i) => i.id === 'a')!.day).toBe(shiftDay(today(), 1));
});

test('„wybierz datę…" otwiera okienko', async () => {
  seed([{ id: 'a', day: null, text: 'X', type: 'task', created: 0 }]);
  const flush = await mountApp();

  backlogBullet().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  flush();
  [...document.querySelectorAll<HTMLElement>('.bullet-menu button')]
    .find((b) => b.textContent?.includes('wybierz datę'))!.click();
  flush();
  expect(document.querySelector('.date-prompt')).not.toBeNull();
});

test('przeciągnięcie pozycji bez godziny z backlogu na dziś czyni ją dzisiejszą', async () => {
  seed([{ id: 'a', day: shiftDay(today(), 3), text: 'Wziąć', type: 'task', created: 0 }]);
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  dropOn('list');
  drag(backlogBullet(), flush);

  expect(app.S.items.find((i) => i.id === 'a')!.day).toBe(today());
  expect(document.querySelector('#radial')).toBeNull();
});

test('pozycja z godziną pyta o kategorię i staje się blokiem', async () => {
  seed([{ id: 'a', day: shiftDay(today(), 3), text: 'Nauka', type: 'task', created: 0, at: 36 }]);
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  dropOn('list');
  drag(backlogBullet(), flush);

  expect(document.querySelector('#radial')).not.toBeNull();
  document.querySelector<HTMLElement>('#radial .rb[aria-label="Nauka"]')!.click();
  flush();

  expect(app.S.blocks).toHaveLength(1);
  expect(app.S.blocks[0]!.q).toBe(36);
  expect(app.S.blocks[0]!.day).toBe(today());
  const item = app.S.items.find((i) => i.id === 'a')!;
  expect(item.block).toBe(app.S.blocks[0]!.id);
  expect(item.at).toBeUndefined();
});

test('zajęty slot nie tworzy bloku i mówi dlaczego', async () => {
  seed(
    [{ id: 'a', day: shiftDay(today(), 3), text: 'Nauka', type: 'task', created: 0, at: 36 }],
    [{ id: 'b1', day: today(), q: 36, len: 2, cat: 'learn', title: 'Zajęte', status: 'planned', created: 0 }],
  );
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  dropOn('list');
  drag(backlogBullet(), flush);

  expect(document.querySelector('#radial')).toBeNull();
  expect(app.S.blocks).toHaveLength(1); // tylko ten, który już był
  const item = app.S.items.find((i) => i.id === 'a')!;
  expect(item.day).toBe(today());
  expect(item.block).toBeUndefined();
  expect(app.toast?.msg).toMatch(/zajęte/);
});

test('wzięcie powtarzalnej na dziś gubi wzorzec — kopia nie ma się powtarzać', async () => {
  seed([{
    id: 'a', day: null, text: 'Podlać', type: 'task', created: 0,
    repeat: { kind: 'daily' }, nextOn: today(),
  }]);
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  dropOn('list');
  drag(backlogBullet(), flush);

  const item = app.S.items.find((i) => i.id === 'a')!;
  expect(item.day).toBe(today());
  expect(item.repeat).toBeUndefined();
  expect(item.nextOn).toBeUndefined();
});
