// @vitest-environment jsdom
import { test, expect, beforeEach, vi } from 'vitest';
import { shiftDay, today } from '../src/lib/time';

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

async function createBlockAt(q: number, flush: () => void) {
  document.querySelector<HTMLElement>(`#grid .cell[data-q="${q}"]`)!.click();
  flush();
  document.querySelector<HTMLElement>('#radial .rb[aria-label="Nauka"]')!.click();
  flush();
}

test('przeniesienie pozycji powiązanej przenosi blok na jutro', async () => {
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  const { migrateToTomorrow } = await import('../src/actions.svelte');
  await createBlockAt(32, flush);

  const linked = app.S.items.find((i) => i.block)!;
  migrateToTomorrow(linked.id);
  flush();

  expect(app.S.blocks[0]!.day).toBe(shiftDay(today(), 1));
  const src = app.S.items.find((i) => i.id === linked.id)!;
  expect(src.type).toBe('migrated');
  expect(src.block).toBeUndefined();
  expect(src.movedTo).toBe(shiftDay(today(), 1));
});

test('w dniu docelowym powstaje nowa pozycja powiązana', async () => {
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  const { migrateToTomorrow } = await import('../src/actions.svelte');
  await createBlockAt(32, flush);

  const linked = app.S.items.find((i) => i.block)!;
  migrateToTomorrow(linked.id);
  flush();

  const tomorrow = shiftDay(today(), 1);
  const target = app.S.items.filter((i) => i.day === tomorrow && i.block);
  expect(target).toHaveLength(1);
  expect(target[0]!.block).toBe(app.S.blocks[0]!.id);
});

test('zajęty slot w dniu docelowym blokuje przeniesienie', async () => {
  const flush = await mountApp();
  const { app, uid } = await import('../src/state.svelte');
  const { migrateToTomorrow } = await import('../src/actions.svelte');
  await createBlockAt(32, flush);

  const tomorrow = shiftDay(today(), 1);
  app.S.blocks.push({
    id: uid(), day: tomorrow, q: 32, len: 2, cat: 'learn', title: 'Zajęte', status: 'planned', created: 0,
  });
  flush();

  const linked = app.S.items.find((i) => i.block && i.day === today())!;
  migrateToTomorrow(linked.id);
  flush();

  expect(app.S.blocks.find((b) => b.id === linked.block)!.day).toBe(today());
  expect(app.S.items.find((i) => i.id === linked.id)!.type).toBe('task');
  expect(app.toast?.msg).toMatch(/zajęte/);
});

test('nałożenie częściowe też blokuje przeniesienie', async () => {
  const flush = await mountApp();
  const { app, uid } = await import('../src/state.svelte');
  const { migrateToTomorrow } = await import('../src/actions.svelte');
  await createBlockAt(32, flush);

  const tomorrow = shiftDay(today(), 1);
  app.S.blocks.push({
    id: uid(), day: tomorrow, q: 33, len: 2, cat: 'learn', title: '', status: 'planned', created: 0,
  });
  flush();

  const linked = app.S.items.find((i) => i.block && i.day === today())!;
  migrateToTomorrow(linked.id);
  flush();
  expect(app.S.blocks.find((b) => b.id === linked.block)!.day).toBe(today());
});

test('przeniesienie pozycji NIEpowiązanej działa jak dotąd', async () => {
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  const { migrateToTomorrow } = await import('../src/actions.svelte');

  const d = document.querySelector<HTMLInputElement>('#list .is-draft .item-text')!;
  d.value = 'Zwykła notatka';
  d.dispatchEvent(new Event('input', { bubbles: true }));
  flush();

  const free = app.S.items.find((i) => !i.block)!;
  migrateToTomorrow(free.id);
  flush();

  const tomorrow = shiftDay(today(), 1);
  expect(app.S.items.filter((i) => i.day === tomorrow)).toHaveLength(1);
  expect(app.S.items.find((i) => i.id === free.id)!.type).toBe('migrated');
});
