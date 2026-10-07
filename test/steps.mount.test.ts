// @vitest-environment jsdom
import { test, expect, beforeEach } from 'vitest';
import { backlog, mountApp, note, resetDom, seed, task } from './helpers';

/*
 * Kroki zadania: Ctrl+Enter albo „Dodaj krok" z menu znacznika je zakłada,
 * Enter w kroku dodaje następny, Enter w pustym kończy listę nową pozycją,
 * Tab odhacza. Notatka kroków nie ma.
 */

beforeEach(() => resetDom());

type S = { text: string; done: boolean }[];
const row = (id: string) => document.querySelector<HTMLElement>(`.item[data-id="${id}"]`)!;
const title = (id: string) => row(id).querySelector<HTMLInputElement>('.item-text')!;
const stepInputs = (id: string) => [...row(id).querySelectorAll<HTMLInputElement>('.step-text')];
const marks = (id: string) => [...row(id).querySelectorAll<HTMLButtonElement>('.step-mark')];

function key(el: HTMLElement, k: string, opts: KeyboardEventInit = {}): boolean {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts });
  el.dispatchEvent(e);
  return e.defaultPrevented;
}
function type(el: HTMLInputElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
const stepsOf = (app: { S: { items: { id: string }[] } }, id: string) =>
  (app.S.items.find((i) => i.id === id) as { steps?: S }).steps;

test('Ctrl+Enter w tytule zakłada krok; Enter dodaje następny, Enter w pustym — nową pozycję', async () => {
  seed([task('a', null, { text: 'Wyjazd' }), task('b')]);
  const { app, flush } = await mountApp();
  title('a').focus();
  expect(key(title('a'), 'Enter', { ctrlKey: true })).toBe(true);
  flush();
  expect(stepsOf(app, 'a')).toEqual([{ text: '', done: false }]);
  expect(document.activeElement).toBe(stepInputs('a')[0]);

  type(stepInputs('a')[0]!, 'spakować się');
  key(stepInputs('a')[0]!, 'Enter');
  flush();
  expect(document.activeElement).toBe(stepInputs('a')[1]);
  type(stepInputs('a')[1]!, 'zatankować');
  key(stepInputs('a')[1]!, 'Enter');
  flush();
  expect(stepsOf(app, 'a')).toHaveLength(3);

  // Enter w pustym kroku: krok znika, pod pozycją rodzi się nowa.
  key(stepInputs('a')[2]!, 'Enter');
  flush();
  expect(stepsOf(app, 'a')).toEqual([
    { text: 'spakować się', done: false },
    { text: 'zatankować', done: false },
  ]);
  expect(app.S.items).toHaveLength(3);
  const order = [...document.querySelectorAll<HTMLElement>('#list .item[data-id]')].map(
    (r) => r.dataset.id,
  );
  expect(order[0]).toBe('a');
  expect(order[2]).toBe('b');
  expect(document.activeElement).toBe(title(order[1]!));
  // Zapis trwały.
  expect(JSON.parse(localStorage.getItem('diurnus.v1')!).items[0].steps).toHaveLength(2);
});

test('Tab i klik w znacznik odhaczają krok niezależnie od zadania; licznik pokazuje postęp', async () => {
  const steps = [
    { text: 'a', done: false },
    { text: 'b', done: false },
  ];
  seed([task('a', 36, { text: 'Rutyna', steps })]);
  const { app, flush } = await mountApp();
  expect(row('a').querySelector('.item-steps-n')!.textContent).toBe('0/2');
  expect(key(stepInputs('a')[0]!, 'Tab')).toBe(true);
  flush();
  marks('a')[1]!.click();
  flush();
  expect(stepsOf(app, 'a')).toEqual([
    { text: 'a', done: true },
    { text: 'b', done: true },
  ]);
  // Zadanie samo się nie odhaczyło.
  expect(app.S.items[0]!.state).toMatchObject({ tag: 'today-task', done: false });
  expect(row('a').querySelector('.item-steps-n')!.textContent).toBe('2/2');
  const blk = document.querySelector<HTMLElement>('#grid .blk[data-id="a"]')!;
  expect(blk.querySelector('.sn')!.textContent).toBe('2/2');
  expect(blk.title).toContain('\n\n× a\n× b');

  // Cofnięcie zdejmuje ostatnie odhaczenie.
  const { undo } = await import('../src/state.svelte');
  undo();
  flush();
  expect(stepsOf(app, 'a')![1]!.done).toBe(false);
});

test('strzałki przechodzą tytuł → kroki → następna pozycja i z powrotem', async () => {
  seed([
    task('a', null, { text: 'A', steps: [{ text: 'x', done: false }] }),
    task('b', null, { text: 'B' }),
  ]);
  const { flush } = await mountApp();
  title('a').focus();
  title('a').setSelectionRange(1, 1);
  key(title('a'), 'ArrowDown');
  flush();
  expect(document.activeElement).toBe(stepInputs('a')[0]);
  stepInputs('a')[0]!.setSelectionRange(1, 1);
  key(stepInputs('a')[0]!, 'ArrowDown');
  flush();
  expect(document.activeElement).toBe(title('b'));
  title('b').setSelectionRange(0, 0);
  key(title('b'), 'ArrowUp');
  flush();
  expect(document.activeElement).toBe(stepInputs('a')[0]);
  stepInputs('a')[0]!.setSelectionRange(0, 0);
  key(stepInputs('a')[0]!, 'ArrowUp');
  flush();
  expect(document.activeElement).toBe(title('a'));
});

test('Backspace w pustym kroku go usuwa; wyjście z pozycji sprząta puste kroki', async () => {
  seed([task('a', null, { text: 'A', steps: [{ text: 'x', done: false }] }), task('b')]);
  const { app, flush } = await mountApp();
  title('a').focus();
  key(title('a'), 'Enter', { ctrlKey: true });
  flush();
  expect(stepsOf(app, 'a')).toHaveLength(2);
  expect(key(stepInputs('a')[0]!, 'Backspace')).toBe(true);
  flush();
  expect(stepsOf(app, 'a')).toEqual([{ text: 'x', done: false }]);
  expect(document.activeElement).toBe(title('a'));

  // Pusty krok i spacje wokół tekstu znikają, gdy fokus opuści pozycję.
  // Ctrl+Enter stawia krok pierwszy, tuż pod tytułem.
  key(title('a'), 'Enter', { ctrlKey: true });
  flush();
  type(stepInputs('a')[0]!, '  y  ');
  flush();
  key(title('a'), 'Enter', { ctrlKey: true });
  flush();
  title('b').focus();
  flush();
  expect(stepsOf(app, 'a')).toEqual([
    { text: 'y', done: false },
    { text: 'x', done: false },
  ]);
});

test('menu znacznika: „Dodaj krok" w backlogu; notatka go nie ma, a zadanie z krokami nie zostaje notatką', async () => {
  seed([
    backlog('k', null, { text: 'Remont' }),
    note('n'),
    task('t', null, { steps: [{ text: 'x', done: false }] }),
  ]);
  const { app, flush } = await mountApp();
  const open = (id: string) => {
    row(id)
      .querySelector('.bullet')!
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    flush();
    return [...document.querySelectorAll<HTMLButtonElement>('.bullet-menu button')].map((b) =>
      b.textContent!.trim(),
    );
  };
  const add = [...document.querySelectorAll<HTMLButtonElement>('.bullet-menu button')];
  expect(add).toHaveLength(0);
  open('k');
  [...document.querySelectorAll<HTMLButtonElement>('.bullet-menu button')]
    .find((b) => b.textContent!.includes('Dodaj krok'))!
    .click();
  flush();
  expect(stepsOf(app, 'k')).toEqual([{ text: '', done: false }]);
  expect(document.activeElement).toBe(stepInputs('k')[0]);

  document.body.click();
  flush();
  expect(open('n')).not.toContain('☐Dodaj krok');
  document.body.click();
  flush();
  expect(open('t')).not.toContain('–Notatka');
  document.body.click();
  flush();

  // Tab w tytule pomija notatkę: zadanie → wykonane → zadanie.
  title('t').focus();
  key(title('t'), 'Tab');
  flush();
  key(title('t'), 'Tab');
  flush();
  expect(app.S.items.find((i) => i.id === 't')!.state).toMatchObject({
    tag: 'today-task',
    done: false,
  });
});

test('arkusz edycji: kroki odhacza, dopisuje i usuwa; zapisuje razem z resztą', async () => {
  seed([task('a', 36, { text: 'Wyjazd', steps: [{ text: 'spakować', done: false }] })]);
  const { app, ui, flush } = await mountApp();
  ui.edit = { id: 'a', cat: '' };
  flush();
  const sheet = () => document.querySelector<HTMLElement>('#sheet')!;
  const btn = (label: string) =>
    [...sheet().querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.includes(label) || b.getAttribute('aria-label') === label,
    )!;
  btn('Odhacz krok').click();
  flush();
  btn('+ Dodaj krok').click();
  flush();
  const inputs = [...sheet().querySelectorAll<HTMLInputElement>('.step-text')];
  expect(inputs).toHaveLength(2);
  type(inputs[1]!, ' zatankować ');
  key(inputs[1]!, 'Enter');
  flush();
  expect(sheet().querySelectorAll('.step-text')).toHaveLength(3);
  // Nic nie zapisane przed „Zapisz".
  expect(stepsOf(app, 'a')).toEqual([{ text: 'spakować', done: false }]);
  btn('Zapisz').click();
  flush();
  expect(stepsOf(app, 'a')).toEqual([
    { text: 'spakować', done: true },
    { text: 'zatankować', done: false },
  ]);

  ui.edit = { id: 'a', cat: '' };
  flush();
  while (sheet().querySelector('.sh-step-x')) {
    sheet().querySelector<HTMLButtonElement>('.sh-step-x')!.click();
    flush();
  }
  btn('Zapisz').click();
  flush();
  expect(app.S.items[0]).not.toHaveProperty('steps');
});
