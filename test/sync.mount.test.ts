// @vitest-environment jsdom
import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { FakeGitHub } from './fake-github';
import { TODAY, resetDom, seed, task } from './helpers';

/*
 * Synchronizacja w działającej aplikacji, na udawanym API GitHuba: start,
 * wysłanie po edycji, pobranie po powrocie do karty, brak sieci. Zegar jest
 * udawany, więc 2 s i 5 minut mijają od razu.
 */

const DAY = `${TODAY}.md`;

function connect(gh: FakeGitHub, state: unknown = { docs: {}, blocked: {} }) {
  localStorage.setItem(
    'diurnus.sync',
    JSON.stringify({
      config: {
        kind: 'github',
        owner: gh.owner,
        repo: gh.repo,
        branch: 'main',
        dir: '',
        token: gh.token,
      },
      state,
    }),
  );
}

let unmountApp: (() => void) | null = null;

async function start() {
  const { mount, unmount, flushSync } = await import('svelte');
  const App = (await import('../src/App.svelte')).default;
  // Aplikacja z poprzedniego testu musi zniknąć razem ze swoimi nasłuchami,
  // inaczej jej synchronizacja pisałaby do magazynu następnego testu.
  const inst = mount(App, { target: document.body });
  unmountApp = () => void unmount(inst);
  flushSync();
  const state = await import('../src/state.svelte');
  const m = { flush: flushSync, app: state.app, state };
  const sync = await import('../src/sync.svelte');
  const settle = async () => {
    await vi.advanceTimersByTimeAsync(0);
    await sync.syncIdle();
    m.flush();
  };
  await settle();
  return { ...m, sync, settle };
}

const texts = (items: readonly { text: string }[]) => items.map((i) => i.text);

/** Edycja w aplikacji: nowa treść pierwszej pozycji, zwykłą drogą zapisu stanu. */
function rename(state: typeof import('../src/state.svelte'), text: string): void {
  state.commit(() => {
    state.app.S.items = state.app.S.items.map((i, k) => (k === 0 ? { ...i, text } : i));
  });
}

let gh: FakeGitHub;

beforeEach(() => {
  resetDom();
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  // Sekundowy zegar aplikacji nie ma tu nic do roboty, a przy minutach udawanego
  // czasu przerysowuje nagłówek setki razy — wyłączony.
  const every = globalThis.setInterval;
  vi.stubGlobal('setInterval', ((fn: () => void, ms?: number) =>
    ms === 1000 ? 0 : every(fn, ms)) as typeof setInterval);
  gh = new FakeGitHub({ 'README.md': '# Mój dziennik\n' });
  vi.stubGlobal('fetch', gh.fetch);
});

afterEach(() => {
  unmountApp?.();
  unmountApp = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test('bez połączonego magazynu nie ma ani jednego żądania', async () => {
  seed([task('a')]);
  const { sync, state } = await start();
  rename(state, 'b');
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  expect(gh.log).toEqual([]);
  expect(sync.sync.status).toBeNull();
});

test('start: pusty magazyn dostaje dziennik; README zostaje nietknięte', async () => {
  seed([task('a')]);
  connect(gh);
  const { sync } = await start();
  expect(gh.paths(), JSON.stringify(gh.log.map((l) => l.path))).toEqual(
    ['.diurnus.toml', 'BACKLOG.md', DAY, 'README.md'].sort(),
  );
  expect(gh.text(DAY)).toContain('* [ ] a');
  expect(gh.text('README.md')).toBe('# Mój dziennik\n');
  expect(sync.sync.status).toMatchObject({ phase: 'idle', pending: false });
  const saved = JSON.parse(localStorage.getItem('diurnus.sync')!);
  expect(Object.keys(saved.state.docs).sort()).toEqual(['.diurnus.toml', 'BACKLOG.md', DAY].sort());
  expect(saved.config.token).toBe(gh.token);
});

test('edycja idzie do magazynu 2 s po ostatniej zmianie, jednym zapisem', async () => {
  seed([task('a')]);
  connect(gh);
  const { state, settle, sync } = await start();
  const writes = () => gh.log.filter((l) => l.method === 'PUT').length;
  const before = writes();

  rename(state, 'ab');
  expect(sync.sync.status?.pending).toBe(true);
  await vi.advanceTimersByTimeAsync(1000);
  rename(state, 'abc');
  await vi.advanceTimersByTimeAsync(1999);
  expect(writes()).toBe(before);
  await vi.advanceTimersByTimeAsync(1);
  await settle();
  expect(writes()).toBe(before + 1);
  expect(gh.text(DAY)).toContain('* [ ] abc');
  expect(sync.sync.status?.pending).toBe(false);
});

test('zmiana z innego urządzenia wchodzi po powrocie do karty', async () => {
  seed([task('a')]);
  connect(gh);
  const { app, settle } = await start();
  gh.put(DAY, `# ${TODAY}\n\n* [ ] a\n* [ ] z telefonu\n`);

  await vi.advanceTimersByTimeAsync(15_000); // powrót sprawdza najwyżej co 10 s
  dispatchEvent(new Event('focus'));
  await settle();
  expect(texts(app.S.items)).toEqual(['a', 'z telefonu']);
  // Wejście zmiany nie odbija się zapisem z powrotem.
  await vi.advanceTimersByTimeAsync(5000);
  await settle();
  expect(gh.log.filter((l) => l.method === 'PUT' && l.path.endsWith(DAY))).toHaveLength(1);
});

test('co 5 minut sprawdzenie; bez zmian to jedno żądanie „bez zmian"', async () => {
  seed([task('a')]);
  connect(gh);
  const { settle } = await start();
  const since = (n: number) => gh.log.slice(n).map((l) => [l.method, l.status]);
  // Własne zapisy zmieniły drzewo, więc pierwsze sprawdzenie po nich pobiera
  // spis w całości — ale żadnego dokumentu, bo wersje się zgadzają.
  let n = gh.log.length;
  await vi.advanceTimersByTimeAsync(5 * 60_000);
  await settle();
  expect(since(n)).toEqual([['GET', 200]]);
  n = gh.log.length;
  await vi.advanceTimersByTimeAsync(5 * 60_000);
  await settle();
  expect(since(n)).toEqual([['GET', 304]]);
});

test('brak sieci: aplikacja działa, zmiana czeka i idzie po powrocie sieci', async () => {
  seed([task('a')]);
  connect(gh);
  const { state, settle, sync } = await start();
  gh.offline = true;
  rename(state, 'offline');
  await vi.advanceTimersByTimeAsync(2000);
  await settle();
  expect(sync.sync.status).toMatchObject({ phase: 'offline', pending: true });
  expect(state.app.S.items[0]!.text).toBe('offline');

  gh.offline = false;
  dispatchEvent(new Event('online'));
  await settle();
  expect(gh.text(DAY)).toContain('* [ ] offline');
  expect(sync.sync.status).toMatchObject({ phase: 'idle', pending: false });
});

test('konflikt: wygrywa magazyn, „Nadpisz moją wersją" przywraca swoją', async () => {
  seed([task('a')]);
  connect(gh);
  const { state, settle, sync } = await start();
  gh.put(DAY, `# ${TODAY}\n\n* [ ] od nich\n`);
  rename(state, 'moje');
  await vi.advanceTimersByTimeAsync(2000);
  await settle();
  expect(texts(state.app.S.items)).toEqual(['od nich']);
  expect(state.app.toast?.msg).toContain(DAY);
  const [c] = sync.sync.status!.conflicts;
  expect(c?.mine).toContain('* [ ] moje');

  await sync.overwriteMine(c!);
  await settle();
  expect(texts(state.app.S.items)).toEqual(['moje']);
  expect(gh.text(DAY)).toContain('* [ ] moje');
  expect(sync.sync.status!.conflicts).toEqual([]);
});

test('token bez dostępu: stan „auth", żadnych dalszych prób', async () => {
  seed([task('a')]);
  gh.token = 'inny';
  connect(gh);
  gh.token = 'dobry-token';
  const { state, sync } = await start();
  expect(sync.sync.status?.phase).toBe('auth');
  const n = gh.log.length;
  rename(state, 'b');
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  dispatchEvent(new Event('online'));
  await vi.advanceTimersByTimeAsync(0);
  expect(gh.log.length).toBe(n);
});

test('rozłączenie w innej karcie zatrzymuje synchronizację', async () => {
  seed([task('a')]);
  connect(gh);
  const { state, sync } = await start();
  const saved = localStorage.getItem('diurnus.sync')!;
  const off = JSON.stringify({ ...JSON.parse(saved), config: null });
  localStorage.setItem('diurnus.sync', off);
  dispatchEvent(
    new StorageEvent('storage', { key: 'diurnus.sync', oldValue: saved, newValue: off }),
  );
  expect(sync.sync.status).toBeNull();
  const n = gh.log.length;
  rename(state, 'b');
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  expect(gh.log.length).toBe(n);
});
