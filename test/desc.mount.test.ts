// @vitest-environment jsdom
import { test, expect, beforeEach } from 'vitest';
import { TODAY, backlog, mountApp, resetDom, seed, task } from './helpers';

/*
 * Opis pozycji na liście dnia i w backlogu: Shift+Enter w tytule go zakłada
 * (albo dokłada linię), Shift+Enter w opisie to kolejna linia, Enter — nowa
 * pozycja. Poza fokusem widać dwie linie; w fokusie całość.
 */

beforeEach(() => resetDom());

const row = (id: string) => document.querySelector<HTMLElement>(`.item[data-id="${id}"]`)!;
const title = (id: string) => row(id).querySelector<HTMLInputElement>('.item-text')!;
const area = (id: string) => row(id).querySelector<HTMLTextAreaElement>('textarea.item-desc');
const clamp = (id: string) => row(id).querySelector<HTMLElement>('.item-desc.clamp');

function key(el: HTMLElement, k: string, opts: KeyboardEventInit = {}): boolean {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts });
  el.dispatchEvent(e);
  return e.defaultPrevented;
}
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
function caret(el: HTMLInputElement | HTMLTextAreaElement, at: number) {
  el.focus();
  el.setSelectionRange(at, at);
}
const item = (app: { S: { items: { id: string }[] } }, id: string) =>
  app.S.items.find((i) => i.id === id) as { text: string; desc?: string } | undefined;

test('Shift+Enter na końcu tytułu zakłada opis i przenosi do niego karetkę', async () => {
  seed([task('a', null, { text: 'Czytanie' })]);
  const { app, flush } = await mountApp();
  caret(title('a'), 8);
  expect(key(title('a'), 'Enter', { shiftKey: true })).toBe(true);
  flush();
  expect(item(app, 'a')).toMatchObject({ text: 'Czytanie', desc: '' });
  expect(document.activeElement).toBe(area('a'));

  type(area('a')!, 'rozdział 3');
  flush();
  expect(item(app, 'a')!.desc).toBe('rozdział 3');
  expect(JSON.parse(localStorage.getItem('diurnus.v1')!).items[0].desc).toBe('rozdział 3');
  // Nowa pozycja nie powstała.
  expect(app.S.items).toHaveLength(1);
});

test('Shift+Enter w środku tytułu: reszta tytułu schodzi do pierwszej linii opisu', async () => {
  seed([task('a', null, { text: 'Czytanie rozdział 3', desc: 'notatki' })]);
  const { app, flush } = await mountApp();
  caret(title('a'), 8);
  key(title('a'), 'Enter', { shiftKey: true });
  flush();
  expect(item(app, 'a')).toMatchObject({ text: 'Czytanie', desc: ' rozdział 3\nnotatki' });
  expect(document.activeElement).toBe(area('a'));
  expect(area('a')!.selectionStart).toBe(0);
});

test('w opisie Shift+Enter to nowa linia (zostaje polu), Enter — nowa pozycja pod spodem', async () => {
  seed([task('a', null, { text: 'A', desc: 'x' }), task('b')]);
  const { app, flush } = await mountApp();
  title('a').focus();
  flush();
  const d = area('a')!;
  caret(d, 1);
  expect(key(d, 'Enter', { shiftKey: true })).toBe(false);
  expect(app.S.items).toHaveLength(2);

  expect(key(d, 'Enter')).toBe(true);
  flush();
  expect(app.S.items).toHaveLength(3);
  const order = [...document.querySelectorAll<HTMLElement>('#list .item[data-id]')].map(
    (r) => r.dataset.id,
  );
  expect(order[0]).toBe('a');
  expect(order[2]).toBe('b');
});

test('wyjście z opisu zdejmuje końcowe puste linie, a pusty opis znika', async () => {
  seed([task('a', null, { text: 'A' }), task('b', null, { text: 'B' })]);
  const { app, flush } = await mountApp();
  caret(title('a'), 1);
  key(title('a'), 'Enter', { shiftKey: true });
  flush();
  type(area('a')!, 'linia\n\n');
  area('a')!.blur();
  flush();
  expect(item(app, 'a')!.desc).toBe('linia');

  caret(title('b'), 1);
  key(title('b'), 'Enter', { shiftKey: true });
  flush();
  area('b')!.blur();
  flush();
  expect(item(app, 'b')).not.toHaveProperty('desc');
  expect(area('b')).toBeNull();
});

test('Backspace na początku opisu dołącza jego pierwszą linię do tytułu', async () => {
  seed([task('a', null, { text: 'Czyt', desc: 'anie\nreszta' })]);
  const { app, flush } = await mountApp();
  title('a').focus();
  flush();
  caret(area('a')!, 0);
  expect(key(area('a')!, 'Backspace')).toBe(true);
  flush();
  expect(item(app, 'a')).toMatchObject({ text: 'Czytanie', desc: 'reszta' });
  expect(document.activeElement).toBe(title('a'));
  expect(title('a').selectionStart).toBe(4);

  // Ostatnia linia opisu też dołącza — i opis znika.
  const d = area('a')!;
  caret(d, 0);
  key(d, 'Backspace');
  flush();
  expect(item(app, 'a')!.text).toBe('Czytaniereszta');
  expect(item(app, 'a')).not.toHaveProperty('desc');
});

test('strzałki: z końca tytułu do opisu, z pierwszej linii opisu do tytułu, z następnej pozycji w koniec opisu', async () => {
  seed([task('a', null, { text: 'A', desc: 'jeden\ndwa' }), task('b', null, { text: 'B' })]);
  const { flush } = await mountApp();
  caret(title('a'), 1);
  key(title('a'), 'ArrowDown');
  flush();
  expect(document.activeElement).toBe(area('a'));
  expect(area('a')!.selectionStart).toBe(0);

  key(area('a')!, 'ArrowUp');
  flush();
  expect(document.activeElement).toBe(title('a'));

  // Druga linia opisu: strzałka w dół przechodzi do następnej pozycji.
  title('a').focus();
  flush();
  caret(area('a')!, 7);
  key(area('a')!, 'ArrowDown');
  flush();
  expect(document.activeElement).toBe(title('b'));

  caret(title('b'), 0);
  key(title('b'), 'ArrowUp');
  flush();
  expect(document.activeElement).toBe(area('a'));
  expect(area('a')!.selectionStart).toBe('jeden\ndwa'.length);
});

test('poza fokusem opis to skrót (dwie linie), w fokusie pole z całością', async () => {
  seed([task('a', null, { text: 'A', desc: '1\n2\n3\n4' }), task('b', null, { text: 'B' })]);
  const { flush } = await mountApp();
  expect(clamp('a')!.textContent).toBe('1\n2\n3\n4');
  expect(area('a')).toBeNull();

  title('a').focus();
  flush();
  expect(clamp('a')).toBeNull();
  expect(area('a')!.value).toBe('1\n2\n3\n4');

  // Fokus przechodzi do innej pozycji — opis znów się zwija.
  title('b').focus();
  flush();
  expect(area('a')).toBeNull();
  expect(clamp('a')).not.toBeNull();

  // Klik w skrót otwiera opis z karetką na końcu.
  clamp('a')!.click();
  flush();
  expect(document.activeElement).toBe(area('a'));
  expect(area('a')!.selectionStart).toBe(7);
});

test('skrót ma dwie linie w CSS', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const css = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8');
  expect(/\.item-desc\.clamp\{([^}]*)\}/.exec(css)?.[1]).toContain('-webkit-line-clamp:2');
});

test('pierwsza edycja opisu daje punkt cofnięcia', async () => {
  seed([task('a', null, { text: 'A', desc: 'stary' })]);
  const { app, flush, state } = await mountApp();
  title('a').focus();
  flush();
  area('a')!.focus();
  type(area('a')!, 'stary!');
  type(area('a')!, 'stary!!');
  flush();
  state.undo();
  flush();
  expect(item(app, 'a')!.desc).toBe('stary');
});

test('w opisie klawisze nie uruchamiają skrótów siatki', async () => {
  seed([task('a', 36, { text: 'A', desc: 'x' })]);
  const { app, ui, flush } = await mountApp();
  title('a').focus();
  flush();
  for (const k of ['1', 'e', 'Delete', ' ']) key(area('a')!, k);
  flush();
  expect(ui.menu).toBeNull();
  expect(ui.edit).toBeNull();
  expect(app.S.items).toHaveLength(1);
});

test('backlog: ten sam opis — Shift+Enter, skrót, Enter dodaje pozycję w backlogu', async () => {
  seed([backlog('k', { type: 'date', date: '2099-01-01' }, { text: 'Dentysta' })]);
  const { app, flush } = await mountApp();
  caret(title('k'), 8);
  key(title('k'), 'Enter', { shiftKey: true });
  flush();
  type(area('k')!, 'zabrać kartę');
  key(area('k')!, 'Enter');
  flush();
  expect(item(app, 'k')!.desc).toBe('zabrać kartę');
  expect(app.S.items.filter((i) => i.state.tag === 'backlog-task')).toHaveLength(2);
});

test('blok na siatce: opis w podpowiedzi; arkusz edycji go zmienia', async () => {
  seed([task('a', 36, { text: 'Czytanie', desc: 'rozdział 3' })]);
  const { app, ui, flush } = await mountApp();
  const blk = document.querySelector<HTMLElement>('#grid .blk[data-id="a"]')!;
  expect(blk.title).toContain('\n\nrozdział 3');

  ui.edit = { id: 'a', cat: '' };
  flush();
  const d = document.querySelector<HTMLTextAreaElement>('#sheet-desc')!;
  expect(d.value).toBe('rozdział 3');
  type(d, 'rozdział 4\n\n');
  flush();
  [...document.querySelectorAll<HTMLButtonElement>('#sheet button')]
    .find((b) => b.textContent?.includes('Zapisz'))!
    .click();
  flush();
  expect(item(app, 'a')!.desc).toBe('rozdział 4');

  // Wyczyszczony opis znika z pozycji.
  ui.edit = { id: 'a', cat: '' };
  flush();
  type(document.querySelector<HTMLTextAreaElement>('#sheet-desc')!, '');
  flush();
  [...document.querySelectorAll<HTMLButtonElement>('#sheet button')]
    .find((b) => b.textContent?.includes('Zapisz'))!
    .click();
  flush();
  expect(item(app, 'a')).not.toHaveProperty('desc');
});

test('opis trafia do pliku dnia pod pozycją', async () => {
  seed([task('a', 36, { text: 'Czytanie', desc: 'rozdział 3\n\ncytat' })]);
  const { app } = await mountApp();
  const { renderFiles } = await import('../src/lib/md/files');
  const files = renderFiles(JSON.parse(JSON.stringify(app.S)));
  expect(files[`${TODAY}.md`]).toContain('* [ ] 09:00 Czytanie\n      rozdział 3\n\n      cytat\n');
});
