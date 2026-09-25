// @vitest-environment jsdom
import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { today } from '../src/lib/time';

let sent: { title: string; body?: string }[] = [];

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  document.body.innerHTML = '';
  document.head.innerHTML = '<meta name="theme-color" content="#282828">';
  delete document.documentElement.dataset.theme;
  sent = [];
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({
      matches: q.includes('min-width'), media: q,
      addEventListener() {}, removeEventListener() {},
    }),
  });
  class FakeNotification {
    static permission = 'granted';
    static requestPermission = async () => 'granted';
    constructor(title: string, opts?: { body?: string }) {
      sent.push({ title, body: opts?.body });
    }
  }
  Object.defineProperty(globalThis, 'Notification', { configurable: true, value: FakeNotification });
});

afterEach(() => {
  vi.useRealTimers();
});

function seed(notify: boolean, blocks: unknown[]) {
  localStorage.setItem('diurnus.prefs', JSON.stringify({ theme: 'auto', seenHelp: true, notify }));
  localStorage.setItem('diurnus.v1', JSON.stringify({
    v: 5,
    cats: [{ id: 'learn', name: 'Nauka', icon: 'book-open', color: 'blue', parent: null }],
    day: { start: 6, end: 22, bands: [] }, blocks, items: [],
  }));
}

const planned = (q: number) =>
  ({ id: 'b1', day: today(), q, len: 2, cat: 'learn', title: 'Czytanie', status: 'planned', created: 0 });

async function mountAt(hour: number, minute: number) {
  // Zegar ustawiony PRZED montażem: aplikacja startuje z Date.now(), więc
  // montaż na prawdziwym zegarze o 08:45 wysyłał prawdziwe uprzedzenie o bloku
  // 09:00, zanim test przestawił czas — i test zależał od godziny uruchomienia.
  // Podmieniamy tylko Date; timery zostają prawdziwe, bo potrzebuje ich Svelte.
  const [y, m, d] = today().split('-').map(Number);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(y!, m! - 1, d!, hour, minute));
  const { mount, flushSync } = await import('svelte');
  const { app } = await import('../src/state.svelte');
  const App = (await import('../src/App.svelte')).default;
  mount(App, { target: document.body });
  flushSync();
  app.now = Date.now();
  flushSync();
  return { app, flushSync };
}

test('kwadrans przed blokiem pada uprzedzenie', async () => {
  seed(true, [planned(36)]); // 09:00
  await mountAt(8, 45);
  expect(sent).toHaveLength(1);
  expect(sent[0]!.title).toContain('Czytanie');
  expect(sent[0]!.title).toContain('15 minut');
});

test('na starcie bloku pada drugie powiadomienie', async () => {
  seed(true, [planned(36)]);
  await mountAt(9, 0);
  expect(sent).toHaveLength(1);
  expect(sent[0]!.body).toContain('09:00');
});

test('to samo powiadomienie nie pada dwa razy', async () => {
  seed(true, [planned(36)]);
  const { app, flushSync } = await mountAt(9, 0);
  expect(sent).toHaveLength(1);
  const [y, m, d] = today().split('-').map(Number);
  app.now = new Date(y!, m! - 1, d!, 9, 0, 30).getTime();
  flushSync();
  expect(sent).toHaveLength(1);
});

test('wyłączone powiadomienia milczą', async () => {
  seed(false, [planned(36)]);
  await mountAt(9, 0);
  expect(sent).toHaveLength(0);
});

test('brak zgody przeglądarki oznacza milczenie', async () => {
  seed(true, [planned(36)]);
  (globalThis as unknown as { Notification: { permission: string } }).Notification.permission = 'denied';
  await mountAt(9, 0);
  expect(sent).toHaveLength(0);
});

test('blok potwierdzony nie powiadamia', async () => {
  seed(true, [{ ...planned(36), status: 'confirmed' }]);
  await mountAt(9, 0);
  expect(sent).toHaveLength(0);
});
