// @vitest-environment jsdom
import { test, expect, beforeEach } from 'vitest';
import { done, mountApp, note, pointer, resetDom, seed, task } from './helpers';

// Lista dnia: najpierw wykonane w kolejności odhaczenia, potem otwarte zadania
// ze slotem według godzin, potem reszta. Kolejność odhaczenia to kolejność
// tablicy pozycji — żadnego czasu wykonania w stanie.

beforeEach(() => resetDom());

const rows = () => [...document.querySelectorAll<HTMLElement>('#list .item[data-id]')];
const order = () => rows().map((r) => r.dataset.id);
const row = (id: string) => document.querySelector<HTMLElement>(`#list .item[data-id="${id}"]`)!;
const bullet = (id: string) => row(id).querySelector<HTMLElement>('.bullet')!;
const input = (id: string) => row(id).querySelector<HTMLInputElement>('.item-text')!;

test('odhaczone idzie na koniec wykonanych, nad wszystkimi otwartymi', async () => {
  seed([task('a'), task('t', 36), task('b'), note('n'), task('c')]);
  const { flush, app } = await mountApp();
  expect(order()).toEqual(['t', 'a', 'b', 'n', 'c']);

  bullet('c').click();
  flush();
  expect(order()).toEqual(['c', 't', 'a', 'b', 'n']);

  bullet('a').click();
  flush();
  expect(order()).toEqual(['c', 'a', 't', 'b', 'n']);

  // Zadanie ze slotem też: wykonane stoją razem, w kolejności odhaczenia.
  bullet('t').click();
  flush();
  expect(order()).toEqual(['c', 'a', 't', 'b', 'n']);
  bullet('b').click();
  flush();
  expect(order()).toEqual(['c', 'a', 't', 'b', 'n']);

  // Żadnego czasu wykonania w stanie — tylko kolejność tablicy.
  expect(JSON.stringify(app.S.items)).not.toMatch(/doneAt|completed|finished/);
  expect(app.S.items.map((i) => i.id)).toEqual(['n', 'c', 'a', 't', 'b']);
});

test('cofnięcie odhaczenia wraca pozycję do otwartych, na jej miejsce w tablicy', async () => {
  seed([task('a'), task('b'), done('x'), done('y')]);
  const { flush } = await mountApp();
  expect(order()).toEqual(['x', 'y', 'a', 'b']);
  bullet('x').click();
  flush();
  expect(order()).toEqual(['y', 'a', 'b', 'x']);
});

test('odhaczenie klikiem w blok na siatce też ustawia kolejność', async () => {
  seed([task('p', 36), task('q', 40), task('free')]);
  const { flush } = await mountApp();
  document.querySelector<HTMLElement>('#grid .blk[data-id="q"]')!.click();
  flush();
  expect(order()).toEqual(['q', 'p', 'free']);
});

test('Tab zmieniający znacznik zostawia fokus na tej samej pozycji, choć wiersz zmienia grupę', async () => {
  seed([done('x'), task('a'), task('b')]);
  const { flush } = await mountApp();
  const b = input('b');
  b.focus();
  b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  flush();
  expect(order()).toEqual(['x', 'b', 'a']);
  expect(document.activeElement).toBe(input('b'));
});

test('przeciąganie liczy miejsce tylko wśród otwartych swobodnych, nie wśród wykonanych i ze slotem', async () => {
  seed([done('d'), task('t', 36), task('A'), task('B'), task('C')]);
  const { flush } = await mountApp();
  expect(order()).toEqual(['d', 't', 'A', 'B', 'C']);
  // Wiersze po 30 px w kolejności wyświetlania.
  rows().forEach((r, i) => {
    r.getBoundingClientRect = () =>
      ({
        top: i * 30,
        height: 30,
        bottom: (i + 1) * 30,
        left: 0,
        right: 200,
        width: 200,
      }) as DOMRect;
  });

  // Kursor tuż nad środkiem A: C ma stanąć przed A, choć nad nim są jeszcze dwa wiersze.
  const c = bullet('C');
  pointer(c, 'pointerdown', 5, 135);
  pointer(c, 'pointermove', 5, 70);
  flush();
  pointer(c, 'pointerup', 5, 70);
  flush();
  expect(order()).toEqual(['d', 't', 'C', 'A', 'B']);

  // Wykonanego nie da się przestawić.
  const d = bullet('d');
  pointer(d, 'pointerdown', 5, 15);
  pointer(d, 'pointermove', 5, 140);
  flush();
  pointer(d, 'pointerup', 5, 140);
  flush();
  expect(order()).toEqual(['d', 't', 'C', 'A', 'B']);
});
