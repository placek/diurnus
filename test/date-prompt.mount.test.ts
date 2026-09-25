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
    .find((b) => b.textContent?.includes('wybierz datę'))!
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

test('„Bez daty" nie zostawia samej godziny bez daty', async () => {
  seed(8, 12);
  const { flush, app } = await openPrompt();
  choose(hourSel(), '9', flush);
  [...document.querySelectorAll<HTMLElement>('.date-prompt button')]
    .find((b) => b.textContent?.includes('Bez daty'))!
    .click();
  flush();
  expect(app.S.items.find((i) => i.id === 'a')!.state).toEqual({ tag: 'backlog-task', when: null });
});
