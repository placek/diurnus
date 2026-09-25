// @vitest-environment jsdom
import { test, expect, beforeEach } from 'vitest';
import { shiftDay } from '../src/lib/time';
import { TODAY, backlog, mountApp, note, resetDom, seed, stateOf, task } from './helpers';

beforeEach(() => resetDom());

const DAILY = { kind: 'daily' } as const;
const rec = (id: string, next = TODAY, slot: number | null = null) =>
  backlog(id, { type: 'recurring', rule: DAILY, slot, next }, { text: 'Podlać kwiaty' });

const backlogBullet = () =>
  document.querySelector<HTMLElement>('#backlog .backlog-item:not(.is-draft) .bullet')!;
const backlogRows = () => document.querySelectorAll('#backlog .backlog-item:not(.is-draft)');
const noteTexts = () =>
  [...document.querySelectorAll<HTMLInputElement>('#list .item[data-id] .item-text')].map(
    (i) => i.value,
  );

test('odhaczona pozycja backlogu trafia do dzisiejszej listy jako wykonana', async () => {
  seed([backlog('a', { type: 'date', date: shiftDay(TODAY, 2) }, { text: 'Zadzwonić' })]);
  const { flush, app } = await mountApp();

  backlogBullet().click();
  flush();

  expect(backlogRows()).toHaveLength(0);
  expect(noteTexts()).toContain('Zadzwonić');
  expect(stateOf(app.S.items, 'a')).toEqual({ tag: 'today-task', done: true, slot: null });
});

test('odhaczenie z godziną zachowuje godzinę — wykonane staje na siatce', async () => {
  seed([backlog('a', { type: 'dateSlot', date: shiftDay(TODAY, 2), slot: 36 })]);
  const { flush, app } = await mountApp();
  backlogBullet().click();
  flush();
  expect(stateOf(app.S.items, 'a')).toEqual({ tag: 'today-task', done: true, slot: 36 });
  expect(document.querySelector('#grid .blk[data-id="a"]')).not.toBeNull();
});

test('odhaczenie z godziną na zajęty slot jest odmową i mówi dlaczego', async () => {
  seed([backlog('a', { type: 'dateSlot', date: shiftDay(TODAY, 2), slot: 36 }), task('b', 36)]);
  const { flush, app } = await mountApp();
  backlogBullet().click();
  flush();
  expect(stateOf(app.S.items, 'a')!.tag).toBe('backlog-task');
  expect(app.toast?.msg).toMatch(/zajęte/);
});

test('odhaczenie pozycji powtarzalnej zostawia wzorzec w backlogu', async () => {
  seed([rec('r')]);
  const { flush, app } = await mountApp();

  backlogBullet().click();
  flush();

  expect(backlogRows()).toHaveLength(1);
  expect(stateOf(app.S.items, 'r')).toMatchObject({
    tag: 'backlog-task',
    when: { type: 'recurring', rule: DAILY },
  });
});

test('odhaczenie powtarzalnej rodzi wykonaną kopię w dziś, bez wzorca', async () => {
  seed([rec('r')]);
  const { flush, app } = await mountApp();

  backlogBullet().click();
  flush();

  const copies = app.S.items.filter((i) => i.from === 'r');
  expect(copies).toHaveLength(1);
  expect(copies[0]!.text).toBe('Podlać kwiaty');
  expect(copies[0]!.state).toEqual({ tag: 'today-task', done: true, slot: null });
  expect(noteTexts()).toContain('Podlać kwiaty');
});

test('odhaczenie powtarzalnej przesuwa termin na następne wystąpienie', async () => {
  seed([rec('r')]);
  const { flush, app } = await mountApp();
  backlogBullet().click();
  flush();
  expect(stateOf(app.S.items, 'r')).toMatchObject({ when: { next: shiftDay(TODAY, 1) } });
});

test('powtarzalną da się odhaczyć wielokrotnie, za każdym razem przesuwając termin', async () => {
  seed([rec('r')]);
  const { flush, app } = await mountApp();

  backlogBullet().click();
  flush();
  backlogBullet().click();
  flush();

  expect(stateOf(app.S.items, 'r')).toMatchObject({ when: { next: shiftDay(TODAY, 2) } });
  expect(app.S.items.filter((i) => i.from === 'r')).toHaveLength(2);
});

const openMenu = (flush: () => void) => {
  backlogBullet().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  flush();
  return [...document.querySelectorAll<HTMLElement>('.bullet-menu button')];
};

test('menu pozycji backlogu oferuje cztery wzorce i zdjęcie powtarzania', async () => {
  seed([backlog('a')]);
  const { flush } = await mountApp();
  const labels = openMenu(flush).map((b) => b.textContent?.trim());
  expect(labels).toContain('○codziennie');
  expect(labels).toContain('·bez powtarzania');
  expect(labels.filter((l) => l?.startsWith('○'))).toHaveLength(4);
});

test('wybór wzorca nadaje powtarzalność i wylicza termin od jutra', async () => {
  seed([backlog('a')]);
  const { flush, app } = await mountApp();

  openMenu(flush)
    .find((b) => b.textContent?.includes('codziennie'))!
    .click();
  flush();

  expect(stateOf(app.S.items, 'a')).toEqual({
    tag: 'backlog-task',
    when: { type: 'recurring', rule: DAILY, slot: null, next: shiftDay(TODAY, 1) },
  });
  expect(document.querySelector('#backlog .bullet')!.classList.contains('is-repeat')).toBe(true);
});

test('bez powtarzania zdejmuje wzorzec', async () => {
  seed([rec('a')]);
  const { flush, app } = await mountApp();

  openMenu(flush)
    .find((b) => b.textContent?.includes('bez powtarzania'))!
    .click();
  flush();

  expect(stateOf(app.S.items, 'a')).toEqual({ tag: 'backlog-task', when: null });
  expect(document.querySelector('#backlog .bullet')!.classList.contains('is-repeat')).toBe(false);
});

test('bez powtarzania na pozycji z samą datą zostawia datę', async () => {
  seed([backlog('a', { type: 'date', date: shiftDay(TODAY, 3) })]);
  const { flush, app } = await mountApp();
  openMenu(flush)
    .find((b) => b.textContent?.includes('bez powtarzania'))!
    .click();
  flush();
  expect(stateOf(app.S.items, 'a')).toMatchObject({ when: { type: 'date' } });
});

test('pozycja dzisiejsza nie dostaje wzorców w menu', async () => {
  seed([task('a')]);
  const { flush } = await mountApp();
  const bullet = document.querySelector<HTMLElement>('#list .item[data-id] .bullet')!;
  bullet.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  flush();
  const labels = [...document.querySelectorAll('.bullet-menu button')].map((b) =>
    b.textContent?.trim(),
  );
  expect(labels.some((l) => l?.startsWith('○'))).toBe(false);
});

test('notatka w backlogu nie dostaje terminów ani wzorców', async () => {
  seed([note('n'), { ...backlog('b'), state: { tag: 'backlog-note' } }]);
  const { flush } = await mountApp();
  const labels = openMenu(flush).map((b) => b.textContent?.trim());
  expect(labels.some((l) => l?.includes('jutro') || l?.startsWith('○'))).toBe(false);
});
