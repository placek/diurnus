// @vitest-environment jsdom
import { test, expect, beforeEach } from 'vitest';
import { TODAY, backlog, done, mountApp, note, resetDom, seed, stateOf, task } from './helpers';
import { shiftDay } from '../src/lib/time';

// Siatka i lista pokazują ten sam rekord: zadanie dziś ze slotem. Nie ma
// drugiej kopii do uzgadniania, więc te testy pilnują, że obie strony
// widzą i zmieniają to samo.

beforeEach(() => resetDom());

const row = (id: string) => document.querySelector<HTMLElement>(`#list .item[data-id="${id}"]`)!;
const bullet = (id: string) => row(id).querySelector<HTMLElement>('.bullet')!;
const input = (id: string) => row(id).querySelector<HTMLInputElement>('.item-text')!;
const block = (id: string) => document.querySelector<HTMLElement>(`#grid .blk[data-id="${id}"]`);
const press = (el: HTMLElement, key: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(e);
  return e;
};

test('blok utworzony na siatce jest pozycją listy z godziną i nazwą kategorii', async () => {
  seed([]);
  const { flush, app } = await mountApp();
  document.querySelector<HTMLElement>('#grid .cell[data-q="32"]')!.click();
  flush();
  document.querySelector<HTMLElement>('#radial .rb[aria-label="Nauka"]')!.click();
  flush();

  expect(app.S.items).toHaveLength(1);
  const r = document.querySelector<HTMLElement>('#list .item.is-linked')!;
  expect(r.querySelector('.item-hour')!.textContent).toBe('08:00');
  expect(r.querySelector<HTMLInputElement>('.item-text')!.placeholder).toBe('Nauka');
});

test('godzina stoi z prawej, za tekstem, w tym samym kroju co termin w backlogu', async () => {
  seed([task('a', 36), backlog('b', { type: 'dateSlot', date: shiftDay(TODAY, 2), slot: 40 })]);
  await mountApp();
  const hour = row('a').querySelector<HTMLElement>('.item-hour')!;
  expect(hour.textContent).toBe('09:00');
  expect(hour.classList.contains('item-meta')).toBe(true);
  expect(hour.previousElementSibling).toBe(input('a'));
  expect(row('a').lastElementChild).toBe(hour);
  const meta = document.querySelector<HTMLElement>('#backlog .item[data-id="b"] .backlog-meta')!;
  expect(meta.classList.contains('item-meta')).toBe(true);
});

test('zadania ze slotem stoją nad swobodnymi, posortowane po godzinie', async () => {
  seed([task('free'), task('late', 60), note('n'), task('early', 36)]);
  await mountApp();
  const ids = [...document.querySelectorAll<HTMLElement>('#list .item[data-id]')].map(
    (r) => r.dataset.id,
  );
  expect(ids).toEqual(['early', 'late', 'free', 'n']);
});

test('klik w znacznik pozycji ze slotem oznacza wykonanie także na siatce', async () => {
  seed([task('a', 36)]);
  const { flush, app } = await mountApp();
  bullet('a').click();
  flush();
  expect(stateOf(app.S.items, 'a')).toEqual({ tag: 'today-task', done: true, slot: 36 });
  expect(block('a')!.classList.contains('st-confirmed')).toBe(true);

  bullet('a').click();
  flush();
  expect(stateOf(app.S.items, 'a')).toEqual({ tag: 'today-task', done: false, slot: 36 });
});

test('klik w blok na siatce zmienia znacznik na liście', async () => {
  seed([task('a', 36)]);
  const { flush } = await mountApp();
  block('a')!.click();
  flush();
  expect(bullet('a').textContent).toBe('×');
});

test('Tab na pozycji ze slotem pomija notatkę: zadanie ↔ wykonane', async () => {
  seed([task('a', 36)]);
  const { flush, app } = await mountApp();
  press(input('a'), 'Tab');
  flush();
  expect(stateOf(app.S.items, 'a')).toMatchObject({ done: true, slot: 36 });
  press(input('a'), 'Tab');
  flush();
  expect(stateOf(app.S.items, 'a')).toMatchObject({ tag: 'today-task', done: false, slot: 36 });
});

test('Tab na pozycji swobodnej cykluje trzy znaczniki', async () => {
  seed([task('a')]);
  const { flush, app } = await mountApp();
  press(input('a'), 'Tab');
  flush();
  expect(stateOf(app.S.items, 'a')).toMatchObject({ done: true });
  press(input('a'), 'Tab');
  flush();
  expect(stateOf(app.S.items, 'a')).toEqual({ tag: 'today-note' });
  press(input('a'), 'Tab');
  flush();
  expect(stateOf(app.S.items, 'a')).toEqual({ tag: 'today-task', done: false, slot: null });
});

test('menu znacznika pozycji ze slotem nie proponuje notatki, swobodnej — tak', async () => {
  seed([task('a', 36), task('b')]);
  const { flush } = await mountApp();
  const labels = (id: string) => {
    bullet(id).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    flush();
    const out = [...document.querySelectorAll('.bullet-menu button')].map((b) =>
      b.textContent?.trim(),
    );
    document.body.click();
    flush();
    return out;
  };
  expect(labels('a')).not.toContain('–Notatka');
  expect(labels('a')).toContain('#Kategoria…');
  expect(labels('b')).toContain('–Notatka');
});

test('tekst wpisany na liście jest nazwą bloku na siatce', async () => {
  seed([task('a', 36, { text: '' })]);
  const { flush } = await mountApp();
  const el = input('a');
  el.value = 'Czytanie';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  flush();
  expect(block('a')!.querySelector('.t')!.textContent).toBe('Czytanie');
});

test('Backspace na pustej pozycji ze slotem usuwa blok, a Ctrl+Z go przywraca', async () => {
  seed([task('a', 36, { text: '' })]);
  const { flush, state } = await mountApp();
  input('a').focus();
  press(input('a'), 'Backspace');
  flush();
  expect(block('a')).toBeNull();

  state.undo();
  flush();
  expect(block('a')).not.toBeNull();
});

test('usunięcie bloku z siatki usuwa pozycję z listy', async () => {
  seed([task('a', 36)]);
  const { flush, state } = await mountApp();
  state.ui.cursor.q = 36;
  state.ui.cursor.visible = true;
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
  flush();
  expect(document.querySelector('#list .item[data-id="a"]')).toBeNull();
});

test('przeciąganie pozycji ze slotem w obrębie listy jej nie przestawia', async () => {
  seed([task('a', 36), task('b')]);
  const { flush } = await mountApp();
  const b = bullet('a');
  b.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      clientX: 5,
      clientY: 15,
      button: 0,
      pointerId: 1,
    }),
  );
  b.dispatchEvent(
    new PointerEvent('pointermove', { bubbles: true, clientX: 5, clientY: 200, pointerId: 1 }),
  );
  flush();
  expect(document.querySelector('.drop-line')).toBeNull();
});

test('strzałki nawigują przez obie grupy w kolejności wyświetlania', async () => {
  seed([task('free'), task('timed', 32)]);
  const { flush } = await mountApp();

  const f = input('free');
  f.selectionStart = f.selectionEnd = 0;
  expect(press(f, 'ArrowUp').defaultPrevented).toBe(true);
  flush();
  expect(document.activeElement).toBe(input('timed'));

  const t = input('timed');
  t.selectionStart = t.selectionEnd = t.value.length;
  expect(press(t, 'ArrowDown').defaultPrevented).toBe(true);
  flush();
  expect(document.activeElement).toBe(input('free'));
});

test('kategoria to jedno pole: pozycja z kategorią niesie jej kolor, bez niej zostaje tekstem', async () => {
  seed([task('a', 36, { cat: 'learn' }), task('b')]);
  await mountApp();
  expect(row('a').classList.contains('has-cat')).toBe(true);
  expect(row('a').getAttribute('style')!.replace(/\s+/g, '')).toContain('--c:var(--blue)');
  expect(row('b').classList.contains('has-cat')).toBe(false);
});

test('lista dnia: podbarwienie ma tylko pozycja z godziną, bez godziny — sam pasek', async () => {
  seed([task('a', 36, { cat: 'learn' }), task('b', null, { cat: 'learn' })]);
  await mountApp();
  expect(row('a').classList.contains('is-linked')).toBe(true);
  expect(row('b').classList.contains('is-linked')).toBe(false);
  expect(row('b').classList.contains('has-cat')).toBe(true);
});

test('backlog idzie za tym samym schematem barw: kategoria, ton, godzina', async () => {
  const next = shiftDay(TODAY, 2);
  seed([
    backlog('slot', { type: 'dateSlot', date: next, slot: 40 }, { cat: 'learn' }),
    backlog('date', { type: 'date', date: next }, { cat: 'learn' }),
    backlog(
      'rec',
      { type: 'recurring', rule: { freq: 'DAILY', interval: 1 }, slot: 44, next },
      { cat: 'learn' },
    ),
    backlog('none', null, { cat: 'learn' }),
    backlog('plain'),
    note('n', { state: { tag: 'backlog-note' } }),
  ]);
  await mountApp();
  const b = (id: string) => document.querySelector<HTMLElement>(`#backlog .item[data-id="${id}"]`)!;
  for (const id of ['slot', 'date', 'rec', 'none']) {
    expect(b(id).classList.contains('has-cat'), id).toBe(true);
    expect(b(id).getAttribute('style')!.replace(/\s+/g, ''), id).toContain('--c:var(--blue)');
    expect(b(id).classList.contains('tone-incoming'), id).toBe(true);
  }
  expect(b('slot').classList.contains('is-linked')).toBe(true);
  expect(b('rec').classList.contains('is-linked')).toBe(true);
  expect(b('date').classList.contains('is-linked')).toBe(false);
  expect(b('none').classList.contains('is-linked')).toBe(false);
  expect(b('plain').classList.contains('has-cat')).toBe(false);
  expect(b('n').classList.contains('tone-note')).toBe(true);
});

test('kategoria wybrana z menu znacznika przebarwia też blok na siatce', async () => {
  seed([task('a', 36)]);
  const { flush, app } = await mountApp();
  bullet('a').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  flush();
  [...document.querySelectorAll<HTMLElement>('.bullet-menu button')]
    .find((b) => b.textContent?.includes('Kategoria'))!
    .click();
  flush();
  document.querySelector<HTMLElement>('#radial .rb[aria-label="Nauka"]')!.click();
  flush();

  expect(app.S.items[0]!.cat).toBe('learn');
  expect(block('a')!.getAttribute('style')!.replace(/\s+/g, '')).toContain('--c:var(--blue)');
});

test('ton idzie za stanem i czasem: minione otwarte jest przegapione, wykonane szare', async () => {
  seed([task('past', 24), done('d', 30), note('n')]);
  const { flush, app } = await mountApp();
  const [y, m, d] = TODAY.split('-').map(Number);
  app.now = new Date(y!, m! - 1, d!, 12, 0).getTime();
  flush();
  expect(row('past').classList.contains('tone-missed')).toBe(true);
  expect(row('d').classList.contains('tone-done')).toBe(true);
  expect(row('n').classList.contains('tone-note')).toBe(true);
});

test('menu znacznika otwiera się w miejscu kliknięcia, nie w wierszu', async () => {
  seed([task('a')]);
  const { flush } = await mountApp();
  bullet('a').dispatchEvent(
    new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 240, clientY: 380 }),
  );
  flush();
  const menu = document.querySelector<HTMLElement>('.bullet-menu')!;
  expect(menu.style.left).toBe('240px');
  expect(menu.style.top).toBe('380px');
});

test('ikona kategorii stoi na samym końcu wiersza: za godziną na liście, za terminem w backlogu', async () => {
  seed([
    task('a', 36, { cat: 'learn' }),
    task('b', null, { cat: 'work' }),
    task('c'),
    backlog('d', { type: 'dateSlot', date: shiftDay(TODAY, 2), slot: 40 }, { cat: 'learn' }),
  ]);
  await mountApp();
  const a = row('a');
  expect(a.lastElementChild!.classList.contains('item-cat')).toBe(true);
  expect(a.lastElementChild!.previousElementSibling!.classList.contains('item-hour')).toBe(true);
  expect(row('b').lastElementChild!.classList.contains('item-cat')).toBe(true);
  expect(row('c').querySelector('.item-cat')).toBeNull();
  const d = document.querySelector<HTMLElement>('#backlog .item[data-id="d"]')!;
  expect(d.lastElementChild!.classList.contains('item-cat')).toBe(true);
  expect(d.lastElementChild!.previousElementSibling!.classList.contains('backlog-meta')).toBe(true);
});

test('blok na siatce ma ikonę kategorii po prawej, za tytułem', async () => {
  seed([task('a', 36, { cat: 'learn' })]);
  await mountApp();
  const blk = block('a')!;
  expect(blk.firstElementChild!.classList.contains('t')).toBe(true);
  expect(blk.lastElementChild!.classList.contains('ic')).toBe(true);
});
