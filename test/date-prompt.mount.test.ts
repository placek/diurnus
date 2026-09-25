// @vitest-environment jsdom
import { test, expect, beforeEach, vi } from 'vitest';
import { shiftDay, today } from '../src/lib/time';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
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

/** Pozycja backlogu i dzień z aktywnymi godzinami `start`–`end`. */
function seed(start: number, end: number) {
  localStorage.setItem('diurnus.prefs', JSON.stringify({ theme: 'auto', seenHelp: true }));
  localStorage.setItem(
    'diurnus.v1',
    JSON.stringify({
      v: 5,
      cats: [{ id: 'learn', name: 'Nauka', icon: 'book-open', color: 'blue', parent: null }],
      day: { start, end, bands: [] },
      blocks: [],
      items: [{ id: 'a', day: null, text: 'X', type: 'task', created: 0 }],
    }),
  );
}

async function openPrompt() {
  const { mount, flushSync } = await import('svelte');
  const App = (await import('../src/App.svelte')).default;
  mount(App, { target: document.body });
  flushSync();
  document
    .querySelector<HTMLElement>('#backlog .backlog-item:not(.is-draft) .bullet')!
    .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  flushSync();
  [...document.querySelectorAll<HTMLElement>('.bullet-menu button')]
    .find((b) => b.textContent?.includes('Wybierz datę'))!
    .click();
  flushSync();
  const { app } = await import('../src/state.svelte');
  return { flush: flushSync, app };
}

const hourSel = () =>
  document.querySelector<HTMLSelectElement>('.date-prompt select[aria-label="Godzina"]')!;
const minSel = () =>
  document.querySelector<HTMLSelectElement>('.date-prompt select[aria-label="Minuty"]')!;
const labels = (s: HTMLSelectElement) => [...s.options].map((o) => o.textContent!.trim());

function choose(s: HTMLSelectElement, value: string, flush: () => void) {
  s.value = value;
  s.dispatchEvent(new Event('change', { bubbles: true }));
  flush();
}

const schedule = () =>
  [...document.querySelectorAll<HTMLElement>('.date-prompt button')]
    .find((b) => b.textContent?.includes('Zaplanuj'))!
    .click();

test('okienko nie ma już swobodnego pola czasu', async () => {
  seed(6, 22);
  await openPrompt();
  expect(document.querySelector('.date-prompt input[type="time"]')).toBeNull();
});

test('godziny to wyłącznie aktywna część dnia z ustawień', async () => {
  seed(8, 12);
  await openPrompt();
  expect(labels(hourSel())).toEqual(['bez pory', '08', '09', '10', '11']);
});

test('godziny idą za zakresem dnia, także domyślnym', async () => {
  seed(6, 22);
  await openPrompt();
  const hours = labels(hourSel()).slice(1);
  expect(hours[0]).toBe('06');
  expect(hours.at(-1)).toBe('21');
  expect(hours).toHaveLength(16);
});

test('minuty to tylko 00, 15, 30 i 45', async () => {
  seed(6, 22);
  await openPrompt();
  expect(labels(minSel())).toEqual(['00', '15', '30', '45']);
});

test('bez godziny minuty są nieaktywne, a pozycja dostaje sam dzień', async () => {
  seed(6, 22);
  const { flush, app } = await openPrompt();
  expect(minSel().disabled).toBe(true);

  schedule();
  flush();

  const item = app.S.items.find((i) => i.id === 'a')!;
  expect(item.state).toEqual({
    tag: 'backlog-task',
    when: { type: 'date', date: shiftDay(today(), 1) },
  });
});

test('wybrana godzina i kwadrans zapisują się jako pora pozycji', async () => {
  seed(8, 12);
  const { flush, app } = await openPrompt();

  choose(hourSel(), '9', flush);
  expect(minSel().disabled).toBe(false);
  choose(minSel(), '45', flush);
  schedule();
  flush();

  const item = app.S.items.find((i) => i.id === 'a')!;
  expect(item.state).toEqual({
    tag: 'backlog-task',
    when: { type: 'dateSlot', date: shiftDay(today(), 1), slot: 9 * 4 + 3 }, // 09:45
  });
  expect(document.querySelector('.date-prompt')).toBeNull();
});

test('powrót do „bez pory" po wyborze godziny kasuje porę', async () => {
  seed(8, 12);
  const { flush, app } = await openPrompt();

  choose(hourSel(), '10', flush);
  choose(minSel(), '30', flush);
  choose(hourSel(), '', flush);
  expect(minSel().disabled).toBe(true);
  schedule();
  flush();

  expect(app.S.items.find((i) => i.id === 'a')!.state).toMatchObject({ when: { type: 'date' } });
});

test('w ostatniej godzinie dnia nie ma :45 — slot trwa 30 minut i musi się zmieścić', async () => {
  seed(8, 12);
  const { flush } = await openPrompt();

  choose(hourSel(), '10', flush);
  expect(labels(minSel())).toEqual(['00', '15', '30', '45']);
  choose(minSel(), '45', flush);

  choose(hourSel(), '11', flush);
  expect(labels(minSel())).toEqual(['00', '15', '30']);
  // Wybór :45 przechodzi na najpóźniejszy możliwy, zamiast zostać niepoprawny.
  expect(minSel().value).toBe('30');
});

/* ───────────── Powtarzanie ───────────── */

/** Stan v7 z jedną pozycją backlogu o podanym terminie. */
function seedWhen(when: unknown) {
  localStorage.setItem('diurnus.prefs', JSON.stringify({ theme: 'auto', seenHelp: true }));
  localStorage.setItem(
    'diurnus.v1',
    JSON.stringify({
      v: 7,
      cats: [{ id: 'learn', name: 'Nauka', icon: 'book-open', color: 'blue', parent: null }],
      day: { start: 6, end: 22, bands: [] },
      today: today(),
      items: [{ id: 'a', text: 'X', state: { tag: 'backlog-task', when } }],
    }),
  );
}

const q = <T extends Element>(sel: string) => document.querySelector<T>(`.date-prompt ${sel}`)!;
const repeatSel = () => q<HTMLSelectElement>('select[aria-label="Powtarzaj"]');
const dayInput = () => q<HTMLInputElement>('input[type="date"]');
const whenOfA = (app: { S: { items: { id: string; state: unknown }[] } }) =>
  (app.S.items.find((i) => i.id === 'a')!.state as { when: unknown }).when;
function type(el: HTMLInputElement, value: string, flush: () => void) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  flush();
}

test('dzień zaczyna się najwcześniej jutro', async () => {
  seed(6, 22);
  await openPrompt();
  expect(dayInput().min).toBe(shiftDay(today(), 1));
  expect(dayInput().value).toBe(shiftDay(today(), 1));
});

test('gotowe wzorce liczą się od wybranego dnia', async () => {
  seed(6, 22);
  const { flush } = await openPrompt();
  // 2030-01-15 to wtorek.
  type(dayInput(), '2030-01-15', flush);
  expect(labels(repeatSel())).toEqual([
    'nie powtarzaj',
    'codziennie',
    'w dni powszednie (pn–pt)',
    'co wtorek',
    '15. każdego miesiąca',
    'co roku 15 sty',
    'własne…',
  ]);
});

test('„co tydzień" z godziną: wzorzec z pierwszym wystąpieniem w wybrany dzień', async () => {
  seed(6, 22);
  const { flush, app } = await openPrompt();
  type(dayInput(), '2030-01-15', flush);
  choose(hourSel(), '9', flush);
  choose(repeatSel(), 'weekly', flush);
  expect(q('.dp-desc').textContent).toBe('co wtorek');
  expect(q('.dp-next').textContent).toContain('wt 15 sty, wt 22 sty, wt 29 sty');
  expect(q('.dp-rrule').textContent).toBe('FREQ=WEEKLY;BYDAY=TU');
  schedule();
  flush();
  expect(whenOfA(app)).toEqual({
    type: 'recurring',
    rule: { freq: 'WEEKLY', interval: 1, byDay: [{ day: 'TU' }] },
    slot: 36,
    next: '2030-01-15',
  });
});

test('własne: co 2 tygodnie w pn i śr, 3 razy', async () => {
  seed(6, 22);
  const { flush, app } = await openPrompt();
  type(dayInput(), '2030-01-15', flush);
  choose(repeatSel(), 'custom', flush);
  type(q<HTMLInputElement>('input[aria-label="Co ile"]'), '2', flush);
  const dayBtn = (d: string) =>
    [...document.querySelectorAll<HTMLElement>('.dp-day')].find((b) => b.textContent === d)!;
  dayBtn('wt').click(); // zaznaczony z wybranego dnia — odznaczamy
  dayBtn('pn').click();
  dayBtn('śr').click();
  flush();
  q<HTMLInputElement>('input[type="radio"][value="count"]').click();
  flush();
  type(q<HTMLInputElement>('input[aria-label="Ile razy"]'), '3', flush);
  expect(q('.dp-desc').textContent).toBe('co 2 tygodnie w pn, śr, 3 razy');
  // Tydzień 15.01 (wt) ma jeszcze środę; następne pn/śr — dwa tygodnie później.
  expect(q('.dp-next').textContent).toContain('śr 16 sty, pn 28 sty, śr 30 sty');
  expect(q('.dp-rrule').textContent).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=3');
  schedule();
  flush();
  expect(whenOfA(app)).toMatchObject({ type: 'recurring', next: '2030-01-16', rule: { count: 3 } });
});

test('własne co miesiąc: w N. dzień tygodnia albo w ostatni', async () => {
  seed(6, 22);
  const { flush } = await openPrompt();
  // 29 stycznia 2030 to wtorek, ostatni w miesiącu.
  type(dayInput(), '2030-01-29', flush);
  choose(repeatSel(), 'custom', flush);
  choose(q<HTMLSelectElement>('select[aria-label="Jednostka"]'), 'MONTHLY', flush);
  const monthSel = q<HTMLSelectElement>('select[aria-label="Dzień miesiąca"]');
  expect(labels(monthSel)).toEqual(['dnia 29.', 'w ostatni wtorek']);
  choose(monthSel, 'lastWeekday', flush);
  expect(q('.dp-rrule').textContent).toBe('FREQ=MONTHLY;BYDAY=-1TU');
  expect(q('.dp-desc').textContent).toBe('w ostatni wtorek miesiąca');
});

test('reguła bez wystąpień blokuje „Zaplanuj" i mówi dlaczego', async () => {
  seed(6, 22);
  const { flush } = await openPrompt();
  type(dayInput(), '2030-01-15', flush);
  choose(repeatSel(), 'custom', flush);
  q<HTMLInputElement>('input[type="radio"][value="until"]').click();
  flush();
  type(q<HTMLInputElement>('input[aria-label="Do dnia"]'), '2030-01-10', flush);
  expect(q('.dp-err').textContent).toMatch(/nie ma żadnego wystąpienia/);
  const btn = [...document.querySelectorAll<HTMLButtonElement>('.date-prompt button')].find((b) =>
    b.textContent?.includes('Zaplanuj'),
  )!;
  expect(btn.disabled).toBe(true);
});

test('okienko wzorca zaczyna od jego reguły, najbliższego wystąpienia i pory', async () => {
  seedWhen({
    type: 'recurring',
    rule: { freq: 'WEEKLY', interval: 2, byDay: [{ day: 'MO' }, { day: 'WE' }], count: 4 },
    slot: 40,
    next: '2030-01-16',
  });
  const { flush } = await openPrompt();
  expect(dayInput().value).toBe('2030-01-16');
  expect(hourSel().value).toBe('10');
  expect(repeatSel().value).toBe('custom');
  expect(q<HTMLInputElement>('input[aria-label="Co ile"]').value).toBe('2');
  expect(q('.dp-rrule').textContent).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=4');
  flush();
});

test('reguła spoza formularza zostaje „bez zmian" i przeżywa zapis', async () => {
  const rule = {
    freq: 'MONTHLY',
    interval: 1,
    byDay: [{ day: 'MO' }, { day: 'TU' }, { day: 'WE' }, { day: 'TH' }, { day: 'FR' }],
    bySetPos: [-1],
  };
  seedWhen({ type: 'recurring', rule, slot: null, next: '2030-01-31' });
  const { flush, app } = await openPrompt();
  expect(repeatSel().value).toBe('keep');
  expect(repeatSel().selectedOptions[0]!.textContent).toContain('ostatni dzień powszedni miesiąca');
  schedule();
  flush();
  expect(whenOfA(app)).toEqual({ type: 'recurring', rule, slot: null, next: '2030-01-31' });
});

test('„nie powtarzaj" na wzorcu zamienia go w zwykłą datę', async () => {
  seedWhen({
    type: 'recurring',
    rule: { freq: 'DAILY', interval: 1 },
    slot: null,
    next: '2030-01-16',
  });
  const { flush, app } = await openPrompt();
  expect(repeatSel().value).toBe('daily');
  choose(repeatSel(), 'none', flush);
  schedule();
  flush();
  expect(whenOfA(app)).toEqual({ type: 'date', date: '2030-01-16' });
});
