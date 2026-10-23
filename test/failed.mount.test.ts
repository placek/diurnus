// @vitest-environment jsdom
import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { TODAY, backlog, mountApp, resetDom, seed, stateOf, task } from './helpers';

/*
 * Nieudane: każde zadanie można tak zamknąć (menu znacznika, Tab, arkusz
 * edycji). Nieudanego nie odhacza się kliknięciem — najpierw wraca do zadań.
 * Minięty slot to co innego: dalej odhacza się jednym kliknięciem.
 */

beforeEach(() => resetDom());
afterEach(() => vi.useRealTimers());

const row = (id: string) => document.querySelector<HTMLElement>(`.item[data-id="${id}"]`)!;
const bullet = (id: string) => row(id).querySelector<HTMLElement>('.bullet')!;
const blk = (id: string) => document.querySelector<HTMLElement>(`#grid .blk[data-id="${id}"]`)!;

function menu(id: string, flush: () => void): HTMLButtonElement[] {
  bullet(id).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  flush();
  return [...document.querySelectorAll<HTMLButtonElement>('.bullet-menu button')];
}
const pick = (buttons: HTMLButtonElement[], label: string) =>
  buttons.find((b) => b.textContent!.includes(label))!;

const FAILED = { tag: 'today-task', done: false, slot: 36, failed: true };

test('„Nieudane" z menu; potem klik nie odhacza, menu nie proponuje „Wykonane", a „Zadanie" przywraca', async () => {
  seed([task('a', 36)]);
  const { app, flush } = await mountApp();
  pick(menu('a', flush), 'Nieudane').click();
  flush();
  expect(stateOf(app.S.items, 'a')).toEqual(FAILED);
  expect(row('a').classList).toContain('tone-failed');
  expect(bullet('a').textContent).toBe('⊘');
  expect(blk('a').classList).toContain('st-failed');
  expect(blk('a').title).toContain('(nieudane)');

  bullet('a').click();
  flush();
  expect(stateOf(app.S.items, 'a')).toEqual(FAILED);
  expect(app.toast?.msg).toBe('Nieudane — najpierw przywróć je jako zadanie');
  // Blok na siatce też się nie odhacza.
  blk('a').click();
  flush();
  expect(stateOf(app.S.items, 'a')).toEqual(FAILED);

  const open = menu('a', flush);
  expect(open.map((b) => b.textContent!.trim())).not.toContain('×Wykonane');
  pick(open, 'Zadanie').click();
  flush();
  expect(stateOf(app.S.items, 'a')).toEqual({ tag: 'today-task', done: false, slot: 36 });
  bullet('a').click();
  flush();
  expect(stateOf(app.S.items, 'a')).toEqual({ tag: 'today-task', done: true, slot: 36 });
});

test('minięty slot to nie nieudane: klik dalej odhacza', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
  seed([task('a', 28)]); // 07:00 — dawno minęło
  const { app, flush } = await mountApp();
  expect(row('a').classList).toContain('tone-missed');
  bullet('a').click();
  flush();
  expect(stateOf(app.S.items, 'a')).toEqual({ tag: 'today-task', done: true, slot: 28 });
});

test('arkusz edycji: „Nieudane" i „Wykonane" dla otwartego; nieudane ma tylko „Przywróć"', async () => {
  seed([task('a', 36)]);
  const { app, ui, flush } = await mountApp();
  const sheetButtons = () =>
    [...document.querySelectorAll<HTMLButtonElement>('#sheet .sh-actions button')].map((b) =>
      b.textContent!.trim(),
    );
  ui.edit = { id: 'a', cat: '' };
  flush();
  expect(sheetButtons()).toEqual(['Usuń', 'Nieudane', 'Wykonane', 'Zapisz']);
  [...document.querySelectorAll<HTMLButtonElement>('#sheet button')]
    .find((b) => b.textContent!.trim() === 'Nieudane')!
    .click();
  flush();
  expect(stateOf(app.S.items, 'a')).toEqual(FAILED);
  ui.edit = { id: 'a', cat: '' };
  flush();
  expect(sheetButtons()).toEqual(['Usuń', 'Przywróć', 'Zapisz']);
});

test('nieudane z backlogu trafia do dziś jako zamknięte', async () => {
  seed([backlog('b')]);
  const { app, flush } = await mountApp();
  pick(menu('b', flush), 'Nieudane').click();
  flush();
  expect(stateOf(app.S.items, 'b')).toEqual({
    tag: 'today-task',
    done: false,
    slot: null,
    failed: true,
  });
  expect(document.querySelector('#list .item[data-id="b"]')).not.toBeNull();
});
