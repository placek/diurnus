// @vitest-environment jsdom
import { test, expect, beforeEach } from 'vitest';
import { shiftDay } from '../src/lib/time';
import { TODAY, backlog, done, mountApp, note, resetDom, seed, stateOf, task } from './helpers';

// Stan zapisany wczoraj (albo tydzień temu) doganiany jest do dziś zdarzeniem
// maszyny: północ i świt dla każdego dnia po kolei. To zastępuje dawne
// przenoszenie niedokończonych i uzgadnianie bloków z listą.

beforeEach(() => resetDom());

const YESTERDAY = shiftDay(TODAY, -1);
const listTexts = () =>
  [...document.querySelectorAll<HTMLInputElement>('#list .item[data-id] .item-text')].map(
    (i) => i.value,
  );

test('stan z wczoraj zostaje przesunięty na dziś przy starcie', async () => {
  seed([], { today: YESTERDAY });
  const { app } = await mountApp();
  expect(app.S.today).toBe(TODAY);
});

test('niedokończone zadanie z wczoraj pojawia się dziś, bez godziny', async () => {
  seed([task('a', 36, { text: 'Wczorajsze' })], { today: YESTERDAY });
  const { app } = await mountApp();
  expect(stateOf(app.S.items, 'a')).toEqual({ tag: 'today-task', done: false, slot: null });
  expect(listTexts()).toContain('Wczorajsze');
  expect(document.querySelector('#grid .blk[data-id="a"]')).toBeNull();
});

test('tydzień przerwy: wszystko niedokończone dochodzi do dziś', async () => {
  seed([task('a', null, { text: 'Stare' })], { today: shiftDay(TODAY, -7) });
  const { app } = await mountApp();
  expect(stateOf(app.S.items, 'a')!.tag).toBe('today-task');
});

test('wykonane i notatki zostają w swoim dniu i znikają z dzisiejszej listy', async () => {
  seed([done('d', 36, { text: 'Zrobione' }), note('n', { text: 'Notka' })], { today: YESTERDAY });
  const { app } = await mountApp();
  expect(stateOf(app.S.items, 'd')).toEqual({ tag: 'past-done', day: YESTERDAY, slot: 36 });
  expect(stateOf(app.S.items, 'n')).toEqual({ tag: 'past-note', day: YESTERDAY });
  expect(listTexts()).toEqual([]);
});

test('pozycja backlogu z dzisiejszą datą przychodzi o świcie, z godziną', async () => {
  seed(
    [
      backlog('a', { type: 'dateSlot', date: TODAY, slot: 40 }),
      backlog('b', { type: 'date', date: TODAY }),
    ],
    {
      today: YESTERDAY,
    },
  );
  const { app } = await mountApp();
  expect(stateOf(app.S.items, 'a')).toEqual({ tag: 'today-task', done: false, slot: 40 });
  expect(stateOf(app.S.items, 'b')).toEqual({ tag: 'today-task', done: false, slot: null });
  expect(document.querySelector('#grid .blk[data-id="a"]')).not.toBeNull();
});

test('pozycje backlogu z późniejszym terminem albo bez terminu nie są ruszane', async () => {
  seed([backlog('a'), backlog('b', { type: 'date', date: shiftDay(TODAY, 2) })], {
    today: YESTERDAY,
  });
  const { app } = await mountApp();
  expect(stateOf(app.S.items, 'a')).toEqual({ tag: 'backlog-task', when: null });
  expect(stateOf(app.S.items, 'b')).toMatchObject({ tag: 'backlog-task' });
});

test('wzorzec przysyła kopię o świcie, a sam zostaje w backlogu', async () => {
  // Zapis v6 z dawnym wzorcem: start przenosi go na RRULE i dopiero wtedy liczy świt.
  seed(
    [
      backlog(
        'r',
        { type: 'recurring', rule: { kind: 'daily' } as never, slot: null, next: TODAY },
        { text: 'Podlać' },
      ),
    ],
    {
      today: YESTERDAY,
    },
  );
  const { app } = await mountApp();
  const copy = app.S.items.find((i) => i.from === 'r')!;
  expect(copy.state).toEqual({ tag: 'today-task', done: false, slot: null });
  expect(listTexts()).toContain('Podlać');
  expect(stateOf(app.S.items, 'r')).toMatchObject({ when: { next: shiftDay(TODAY, 1) } });
});

test('zmiana doby w trakcie pracy robi to samo, co start', async () => {
  seed([task('a', 36), done('d')]);
  const { flush, app, state } = await mountApp();
  state.advanceTo(shiftDay(TODAY, 1));
  flush();
  expect(app.S.today).toBe(shiftDay(TODAY, 1));
  expect(stateOf(app.S.items, 'a')).toEqual({ tag: 'today-task', done: false, slot: null });
  expect(stateOf(app.S.items, 'd')).toEqual({ tag: 'past-done', day: TODAY, slot: null });
});

test('stary zapis v5 jest przenoszony do v7 przy starcie', async () => {
  localStorage.setItem('diurnus.prefs', JSON.stringify({ theme: 'auto', seenHelp: true }));
  localStorage.setItem(
    'diurnus.v1',
    JSON.stringify({
      v: 5,
      cats: [{ id: 'learn', name: 'Nauka', icon: 'book-open', color: 'blue', parent: null }],
      day: { start: 6, end: 22, bands: [] },
      blocks: [
        {
          id: 'b',
          day: TODAY,
          q: 36,
          len: 2,
          cat: 'learn',
          title: '',
          status: 'planned',
          created: 0,
        },
      ],
      items: [{ id: 'i', day: TODAY, text: 'Czytanie', type: 'task', created: 0, block: 'b' }],
    }),
  );
  const { flush, app, state } = await mountApp();
  expect(app.S.v).toBe(7);
  expect(app.S.items).toEqual([
    {
      id: 'i',
      text: 'Czytanie',
      created: 0,
      cat: 'learn',
      state: { tag: 'today-task', done: false, slot: 36 },
    },
  ]);
  // Zapis v6 powstaje przy pierwszej zmianie.
  state.save();
  flush();
  expect(JSON.parse(localStorage.getItem('diurnus.v1')!).v).toBe(7);
});
