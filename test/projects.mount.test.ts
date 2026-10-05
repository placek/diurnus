// @vitest-environment jsdom
import { test, expect, beforeEach } from 'vitest';
import { backlog, mountApp, resetDom, seed, task } from './helpers';

/*
 * Projekty w backlogu: kategoria (albo podkategoria) oznaczona jako projekt
 * zbiera swoje pozycje backlogu we własnej sekcji pod pozycjami spoza projektów.
 */

beforeEach(() => resetDom());

/** Seed z kategorią „Praca" jako projektem i podkategorią „Spotkania" w niej. */
function seedProjects(items: Parameters<typeof seed>[0]) {
  seed(items);
  const s = JSON.parse(localStorage.getItem('diurnus.v1')!);
  s.cats = [
    { id: 'learn', name: 'Nauka', icon: 'book-open', color: 'blue', parent: null },
    {
      id: 'work',
      name: 'Praca',
      icon: 'laptop-code',
      color: 'yellow',
      parent: null,
      project: true,
    },
    { id: 'meet', name: 'Spotkania', icon: null, parent: 'work' },
  ];
  localStorage.setItem('diurnus.v1', JSON.stringify(s));
}

const sectionIds = () =>
  [...document.querySelectorAll<HTMLElement>('#backlog .bl-project')].map((s) => s.dataset.project);
const rowsIn = (root: ParentNode) =>
  [...root.querySelectorAll<HTMLElement>('.item[data-id]')].map((r) => r.dataset.id);
const section = (id: string) =>
  document.querySelector<HTMLElement>(`#backlog .bl-project[data-project="${id}"]`)!;
function type(el: HTMLInputElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

test('pozycje projektu (także z podkategorii) stoją w sekcji projektu, pod pozycjami spoza projektów', async () => {
  seedProjects([
    backlog('a'),
    backlog('p1', null, { cat: 'work' }),
    backlog('n', null, { cat: 'learn' }),
    backlog('p2', null, { cat: 'meet' }),
    task('today', null, { cat: 'work' }),
  ]);
  await mountApp();
  expect(sectionIds()).toEqual(['work']);
  const backlogRows = rowsIn(document.querySelector('#backlog')!);
  expect(backlogRows).toEqual(['a', 'n', 'p1', 'p2']);
  expect(rowsIn(section('work'))).toEqual(['p1', 'p2']);
  const head = section('work').querySelector('.bl-project-h')!;
  expect(head.querySelector('.bl-project-name')!.textContent).toBe('Praca');
  expect(head.querySelector('.bl-project-n')!.textContent).toBe('2');
  // Lista dnia bez sekcji.
  expect(document.querySelector('#list .bl-project')).toBeNull();
});

test('pusty projekt też ma sekcję — żeby dało się w nim coś zaplanować', async () => {
  seedProjects([backlog('a')]);
  const { app, flush } = await mountApp();
  const draft = section('work').querySelector<HTMLInputElement>('.is-draft input')!;
  expect(draft.placeholder).toBe('Dodaj do projektu…');
  type(draft, 'Raport');
  flush();
  const made = app.S.items.find((i) => i.text === 'Raport')!;
  expect(made).toMatchObject({ cat: 'work', state: { tag: 'backlog-task', when: null } });
  expect(rowsIn(section('work'))).toEqual([made.id]);
  expect(document.activeElement).toBe(section('work').querySelector('.item[data-id] .item-text'));
});

test('Enter w pozycji projektu dodaje następną w tym samym projekcie (i podkategorii)', async () => {
  seedProjects([backlog('p2', null, { cat: 'meet' }), backlog('a')]);
  const { app, flush } = await mountApp();
  const input = section('work').querySelector<HTMLInputElement>('.item[data-id="p2"] .item-text')!;
  input.focus();
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
  );
  flush();
  const fresh = app.S.items.find((i) => !['p2', 'a'].includes(i.id))!;
  expect(fresh.cat).toBe('meet');
  // Enter poza projektem nie nadaje kategorii.
  const plain = document.querySelector<HTMLInputElement>('#backlog .item[data-id="a"] .item-text')!;
  plain.focus();
  plain.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
  );
  flush();
  expect(
    app.S.items.filter((i) => i.cat === undefined && i.state.tag === 'backlog-task'),
  ).toHaveLength(2);
});

test('strzałki idą w kolejności sekcji', async () => {
  seedProjects([backlog('p1', null, { cat: 'work' }), backlog('a')]);
  const { flush } = await mountApp();
  const a = document.querySelector<HTMLInputElement>('#backlog .item[data-id="a"] .item-text')!;
  a.focus();
  a.setSelectionRange(1, 1);
  a.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
  );
  flush();
  expect(document.activeElement).toBe(
    section('work').querySelector('.item[data-id="p1"] .item-text'),
  );
});

test('Ustawienia → Kategorie: „projekt" zakłada sekcję; dwa projekty o tej samej nazwie są odmową', async () => {
  seed([backlog('n', null, { cat: 'learn' })]);
  const { app, ui, flush } = await mountApp();
  expect(sectionIds()).toEqual([]);

  ui.settings = 'cats';
  flush();
  const row = (id: string) => document.querySelector<HTMLElement>(`.ce-row[data-id="${id}"]`)!;
  row('learn').querySelector<HTMLInputElement>('.ce-proj input')!.click();
  flush();
  const save = () =>
    [...document.querySelectorAll<HTMLButtonElement>('.sh-actions button')]
      .find((b) => b.textContent?.includes('Zapisz'))!
      .click();
  save();
  flush();
  expect(app.S.cats.find((c) => c.id === 'learn')!.project).toBe(true);
  expect(sectionIds()).toEqual(['learn']);
  expect(rowsIn(section('learn'))).toEqual(['n']);

  // Druga kategoria jako projekt o tej samej nazwie (inna wielkość liter).
  ui.settings = 'cats';
  flush();
  const name = row('work').querySelector<HTMLInputElement>('.ce-name')!;
  type(name, 'nauka');
  row('work').querySelector<HTMLInputElement>('.ce-proj input')!.click();
  flush();
  save();
  flush();
  expect(app.toast?.msg).toBe('Dwa projekty nazywają się „nauka"');
  expect(ui.settings).toBe('cats');
  expect(app.S.cats.find((c) => c.id === 'work')!.project).toBeUndefined();
});
