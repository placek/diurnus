// @vitest-environment jsdom
import { test, expect, beforeEach } from 'vitest';
import { shiftDay } from '../src/lib/time';
import { TODAY, backlog, done, mountApp, note, resetDom, seed, stateOf, task } from './helpers';

beforeEach(() => resetDom());

/** elementsFromPoint zwraca w jsdom pustkę — podstawiamy panel docelowy. */
function dropOn(paneId: string) {
  const pane = document.getElementById(paneId)!;
  document.elementsFromPoint = () => [pane];
}

function drag(bullet: HTMLElement, flush: () => void) {
  const ev = (type: string, x: number, y: number) =>
    bullet.dispatchEvent(
      new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 1 }),
    );
  ev('pointerdown', 5, 15);
  ev('pointermove', 400, 200);
  flush();
  ev('pointerup', 400, 200);
  flush();
}

const backlogBullet = () =>
  document.querySelector<HTMLElement>('#backlog .backlog-item:not(.is-draft) .bullet')!;
const listBullet = (id: string) =>
  document.querySelector<HTMLElement>(`#list .item[data-id="${id}"] .bullet`)!;
const NEXT = shiftDay(TODAY, 3);

/* ── Dziś → backlog ── */

test('notatka przeciągnięta na backlog idzie bez pytania i bez terminu', async () => {
  seed([note('a')]);
  const { flush, app } = await mountApp();
  dropOn('backlog');
  drag(listBullet('a'), flush);

  expect(document.querySelector('.date-prompt')).toBeNull();
  expect(stateOf(app.S.items, 'a')).toEqual({ tag: 'backlog-note' });
});

test('zadanie bez godziny idzie do backlogu bez terminu', async () => {
  seed([task('a')]);
  const { flush, app } = await mountApp();
  dropOn('backlog');
  drag(listBullet('a'), flush);
  expect(stateOf(app.S.items, 'a')).toEqual({ tag: 'backlog-task', when: null });
});

test('zadanie z godziną idzie z dzisiejszą datą i tą godziną, znika z siatki', async () => {
  seed([task('a', 36)]);
  const { flush, app } = await mountApp();
  dropOn('backlog');
  drag(listBullet('a'), flush);

  expect(stateOf(app.S.items, 'a')).toEqual({
    tag: 'backlog-task',
    when: { type: 'dateSlot', date: TODAY, slot: 36 },
  });
  expect(document.querySelector('#grid .blk[data-id="a"]')).toBeNull();
});

test('wykonane zostaje w swoim dniu i mówi dlaczego', async () => {
  seed([done('a')]);
  const { flush, app } = await mountApp();
  dropOn('backlog');
  drag(listBullet('a'), flush);

  expect(stateOf(app.S.items, 'a')).toEqual({ tag: 'today-task', done: true, slot: null });
  expect(app.toast?.msg).toMatch(/Wykonane/);
});

/* ── Backlog → dziś ── */

test('pozycja bez terminu przeciągnięta na notatki staje się dzisiejsza', async () => {
  seed([backlog('a')]);
  const { flush, app } = await mountApp();
  dropOn('list');
  drag(backlogBullet(), flush);
  expect(stateOf(app.S.items, 'a')).toEqual({ tag: 'today-task', done: false, slot: null });
});

test('pozycja z samą datą traci datę', async () => {
  seed([backlog('a', { type: 'date', date: NEXT })]);
  const { flush, app } = await mountApp();
  dropOn('list');
  drag(backlogBullet(), flush);
  expect(stateOf(app.S.items, 'a')).toEqual({ tag: 'today-task', done: false, slot: null });
});

test('pozycja z datą i godziną przychodzi z godziną, bez pytania o kategorię', async () => {
  seed([backlog('a', { type: 'dateSlot', date: NEXT, slot: 36 })]);
  const { flush, app } = await mountApp();
  dropOn('list');
  drag(backlogBullet(), flush);

  expect(document.querySelector('#radial')).toBeNull();
  expect(stateOf(app.S.items, 'a')).toEqual({ tag: 'today-task', done: false, slot: 36 });
  expect(document.querySelector('#grid .blk[data-id="a"]')).not.toBeNull();
});

test('zajęta godzina zostawia pozycję w backlogu i mówi dlaczego', async () => {
  seed([backlog('a', { type: 'dateSlot', date: NEXT, slot: 36 }), task('b', 37)]);
  const { flush, app } = await mountApp();
  dropOn('list');
  drag(backlogBullet(), flush);

  expect(stateOf(app.S.items, 'a')!.tag).toBe('backlog-task');
  expect(app.toast?.msg).toMatch(/zajęte/);
});

test('wzorca nie da się przeciągnąć — przychodzi sam', async () => {
  seed([
    backlog('a', {
      type: 'recurring',
      rule: { freq: 'DAILY', interval: 1 },
      slot: null,
      next: shiftDay(TODAY, 1),
    }),
  ]);
  const { flush, app } = await mountApp();
  dropOn('list');
  drag(backlogBullet(), flush);

  expect(stateOf(app.S.items, 'a')!.tag).toBe('backlog-task');
  expect(app.toast?.msg).toMatch(/Wzorzec/);
});

/* ── Menu terminów ── */

test('menu znacznika w backlogu nadaje termin przez okienko; domyślnie to jutro', async () => {
  seed([backlog('a')]);
  const { flush, app } = await mountApp();

  backlogBullet().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  flush();
  const labels = [...document.querySelectorAll('.bullet-menu button')].map((b) =>
    b.textContent?.trim(),
  );
  expect(labels).toEqual(expect.arrayContaining(['→Bez daty', '…Wybierz datę…']));
  expect(labels.some((l) => l?.includes('jutro') || l?.includes('za tydzień'))).toBe(false);

  [...document.querySelectorAll<HTMLElement>('.bullet-menu button')]
    .find((b) => b.textContent?.includes('Wybierz datę'))!
    .click();
  flush();
  [...document.querySelectorAll<HTMLElement>('.date-prompt button')]
    .find((b) => b.textContent?.includes('Zaplanuj'))!
    .click();
  flush();
  expect(stateOf(app.S.items, 'a')).toEqual({
    tag: 'backlog-task',
    when: { type: 'date', date: shiftDay(TODAY, 1) },
  });
});

test('„Wybierz datę…" otwiera okienko', async () => {
  seed([backlog('a')]);
  const { flush } = await mountApp();

  backlogBullet().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  flush();
  [...document.querySelectorAll<HTMLElement>('.bullet-menu button')]
    .find((b) => b.textContent?.includes('Wybierz datę'))!
    .click();
  flush();
  expect(document.querySelector('.date-prompt')).not.toBeNull();
});
