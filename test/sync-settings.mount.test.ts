// @vitest-environment jsdom
import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { FakeGitHub } from './fake-github';
import { TODAY, resetDom, seed, task } from './helpers';

/*
 * Ustawienia → Dane → Synchronizacja na udawanym API GitHuba: połączenie
 * (z błędami, ostrzeżeniem o publicznym repozytorium i pytaniem przy danych
 * po obu stronach), stan, konflikt, nowy token i rozłączenie.
 */

const DAY = `${TODAY}.md`;
let gh: FakeGitHub;
let unmountApp: (() => void) | null = null;

beforeEach(() => {
  resetDom();
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  // Sekundowy zegar aplikacji nie ma tu nic do roboty — wyłączony.
  const every = globalThis.setInterval;
  vi.stubGlobal('setInterval', ((fn: () => void, ms?: number) =>
    ms === 1000 ? 0 : every(fn, ms)) as typeof setInterval);
  gh = new FakeGitHub();
  vi.stubGlobal('fetch', gh.fetch);
  window.confirm = () => true;
});

afterEach(() => {
  unmountApp?.();
  unmountApp = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function start() {
  const { mount, unmount, flushSync } = await import('svelte');
  const App = (await import('../src/App.svelte')).default;
  const inst = mount(App, { target: document.body });
  unmountApp = () => void unmount(inst);
  flushSync();
  const state = await import('../src/state.svelte');
  const sync = await import('../src/sync.svelte');
  /** Aż ucichną żądania i obietnice. */
  const settle = async () => {
    for (let i = 0; i < 30; i++) await vi.advanceTimersByTimeAsync(0);
    await sync.syncIdle();
    flushSync();
  };
  await settle();
  state.ui.settings = 'data';
  flushSync();
  return { app: state.app, ui: state.ui, state, sync, settle, flush: flushSync };
}

const section = () => document.querySelector<HTMLElement>('section.sync')!;
const btn = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    b.textContent?.trim().startsWith(label),
  );
const field = (label: string) =>
  [...section().querySelectorAll('label')]
    .find((l) => l.textContent?.trim().startsWith(label))!
    .querySelector('input')!;
function type(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
const saved = () => JSON.parse(localStorage.getItem('diurnus.sync') ?? 'null');
const texts = (items: readonly { text: string }[]) => items.map((i) => i.text);
const cloud = () => document.querySelector('#top .sync-ind');

async function fillAndConnect(
  env: Awaited<ReturnType<typeof start>>,
  repo = 'ola/diurnus-data',
  token = gh.token,
) {
  const github = section().querySelector<HTMLInputElement>('input[value="github"]')!;
  github.click();
  env.flush();
  type(field('Repozytorium'), repo);
  type(field('Token'), token);
  env.flush();
  btn('Połącz')!.click();
  await env.settle();
}

test('domyślnie tylko ta przeglądarka: żadnych żądań, żadnej ikonki w pasku', async () => {
  seed([task('a')]);
  await start();
  expect(section().querySelector<HTMLInputElement>('input[value="local"]')!.checked).toBe(true);
  expect(field).toBeDefined();
  expect(section().querySelector('input[type="password"]')).toBeNull();
  expect(cloud()).toBeNull();
  expect(gh.log).toEqual([]);
});

test('połączenie z pustym repozytorium wysyła dziennik i zaczyna synchronizację', async () => {
  seed([task('a')]);
  gh.tokenExpires = '2026-12-01 00:00:00 UTC';
  const env = await start();
  await fillAndConnect(env, 'https://github.com/ola/diurnus-data');

  expect(gh.text(DAY)).toContain('* [ ] a');
  expect(saved().config).toEqual({
    kind: 'github',
    owner: 'ola',
    repo: 'diurnus-data',
    branch: 'main',
    dir: '',
    token: gh.token,
    expires: '2026-12-01',
  });
  expect(section().textContent).toContain('ola/diurnus-data');
  expect(section().textContent).toContain('Token ważny do 2026-12-01');
  expect(section().querySelector('.sync-status')!.textContent).toMatch(
    /Zsynchronizowano|Połączono/,
  );
  expect(cloud()).not.toBeNull();
  expect(env.app.toast?.msg).toBe('Połączono');

  // Dalej zwykła synchronizacja: edycja idzie do repozytorium.
  env.state.commit(() => {
    env.app.S.items = env.app.S.items.map((i) => ({ ...i, text: 'b' }));
  });
  await vi.advanceTimersByTimeAsync(2000);
  await env.settle();
  expect(gh.text(DAY)).toContain('* [ ] b');
});

test('katalog i gałąź z „Gałąź i katalog"', async () => {
  seed([task('a')]);
  const env = await start();
  section().querySelector<HTMLInputElement>('input[value="github"]')!.click();
  env.flush();
  type(field('Katalog'), '/dziennik/');
  await fillAndConnect(env);
  expect(saved().config.dir).toBe('dziennik');
  expect(gh.paths()).toContain(`dziennik/${DAY}`);
});

test.each([
  ['diurnus-data', () => {}, 'właściciel/nazwa'],
  ['ola/cudze', () => {}, 'nie istnieje albo token nie ma do niego dostępu'],
  ['ola/diurnus-data', () => (gh.readOnly = true), 'tylko czytać'],
  ['ola/diurnus-data', () => (gh.token = 'inny'), 'nie przyjął tokenu'],
  ['ola/diurnus-data', () => (gh.offline = true), 'Brak połączenia'],
])('błąd połączenia (%s) — komunikat, nic nie zapisane', async (repo, setup, msg) => {
  seed([task('a')]);
  const env = await start();
  setup();
  await fillAndConnect(env, repo, 'dobry-token');
  expect(section().querySelector('.import-errors')!.textContent).toContain(msg);
  expect(saved()?.config ?? null).toBeNull();
  expect(cloud()).toBeNull();
});

test('publiczne repozytorium: ostrzeżenie; „Połącz mimo to" łączy, „Anuluj" nie', async () => {
  seed([task('a')]);
  gh.isPrivate = false;
  const env = await start();
  await fillAndConnect(env);
  expect(section().textContent).toContain('publiczne');
  expect(saved()?.config ?? null).toBeNull();
  btn('Anuluj')!.click();
  env.flush();
  expect(section().textContent).not.toContain('publiczne');

  btn('Połącz')!.click();
  await env.settle();
  btn('Połącz mimo to')!.click();
  await env.settle();
  expect(saved().config.repo).toBe('diurnus-data');
});

test('tu pusto, w repozytorium dziennik — pobrany bez pytania', async () => {
  seed([]);
  gh.put(DAY, `# ${TODAY}\n\n* [ ] z telefonu\n`);
  gh.put('BACKLOG.md', '# Backlog\n\n* [ ] kiedyś\n');
  const env = await start();
  await fillAndConnect(env);
  expect(texts(env.app.S.items).sort()).toEqual(['kiedyś', 'z telefonu']);
  expect(env.app.toast?.msg).toContain('pobrany');
  expect(saved().config).not.toBeNull();
});

test('dane po obu stronach: pytanie z liczbą pozycji i dniami; „Pobierz z repozytorium"', async () => {
  seed([task('a'), task('b')]);
  gh.put('2026-09-01.md', '# 2026-09-01\n\n* [x] stare\n');
  gh.put(DAY, `# ${TODAY}\n\n* [ ] z telefonu\n`);
  const env = await start();
  await fillAndConnect(env);

  const ask = section().querySelector('.sync-ask')!;
  expect(ask.textContent).toContain(`W tej przeglądarce: 2 pozycje, dzień ${TODAY}`);
  expect(ask.textContent).toContain(`W repozytorium: 2 pozycje, 2026-09-01 – ${TODAY}`);
  expect(saved()?.config ?? null).toBeNull();

  btn('Pobierz z repozytorium')!.click();
  await env.settle();
  expect(texts(env.app.S.items).sort()).toEqual(['stare', 'z telefonu']);
  expect(saved().config).not.toBeNull();
  expect(gh.text(DAY)).toContain('z telefonu');
});

test('dane po obu stronach: „Wyślij moje" robi z repozytorium kopię tej przeglądarki', async () => {
  seed([task('a')]);
  gh.put('2026-09-01.md', '# 2026-09-01\n\n* [x] stare\n');
  gh.put('README.md', '# Mój dziennik\n');
  const env = await start();
  await fillAndConnect(env);
  btn('Wyślij moje')!.click();
  await env.settle();
  expect(texts(env.app.S.items)).toEqual(['a']);
  expect(gh.paths()).toEqual(['.diurnus.toml', DAY, 'BACKLOG.md', 'README.md'].sort());
});

test('„Anuluj" przy pytaniu nie łączy i nic nie zmienia', async () => {
  seed([task('a')]);
  gh.put(DAY, `# ${TODAY}\n\n* [ ] z telefonu\n`);
  const env = await start();
  await fillAndConnect(env);
  btn('Anuluj')!.click();
  await env.settle();
  expect(texts(env.app.S.items)).toEqual(['a']);
  expect(gh.text(DAY)).toContain('z telefonu');
  expect(saved()?.config ?? null).toBeNull();
});

test('konflikt: komunikat z „Pokaż", w ustawieniach „Nadpisz moją wersją"', async () => {
  seed([task('a')]);
  const env = await start();
  await fillAndConnect(env);
  env.ui.settings = null;
  env.flush();

  gh.put(DAY, `# ${TODAY}\n\n* [ ] od nich\n`);
  env.state.commit(() => {
    env.app.S.items = env.app.S.items.map((i) => ({ ...i, text: 'moje' }));
  });
  await vi.advanceTimersByTimeAsync(2000);
  await env.settle();
  expect(texts(env.app.S.items)).toEqual(['od nich']);
  expect(cloud()!.className).toContain('warn');

  expect(env.app.toast?.action?.label).toBe('Pokaż');
  document.querySelector<HTMLButtonElement>('#toast button')!.click();
  env.flush();
  expect(env.ui.settings).toBe('data');
  expect(section().querySelector('.sync-conflict')!.textContent).toContain(DAY);

  btn('Nadpisz moją wersją')!.click();
  await env.settle();
  expect(texts(env.app.S.items)).toEqual(['moje']);
  expect(gh.text(DAY)).toContain('* [ ] moje');
  expect(section().querySelector('.sync-conflict')).toBeNull();
});

test('„Zostaw" zamyka konflikt z wersją z repozytorium', async () => {
  seed([task('a')]);
  const env = await start();
  await fillAndConnect(env);
  gh.put(DAY, `# ${TODAY}\n\n* [ ] od nich\n`);
  env.state.commit(() => {
    env.app.S.items = env.app.S.items.map((i) => ({ ...i, text: 'moje' }));
  });
  await vi.advanceTimersByTimeAsync(2000);
  await env.settle();
  btn('Zostaw')!.click();
  env.flush();
  expect(section().querySelector('.sync-conflict')).toBeNull();
  expect(gh.text(DAY)).toContain('od nich');
});

test('popsuty dokument w repozytorium: błędy widać, „Nadpisz moją wersją" go naprawia', async () => {
  seed([task('a')]);
  const env = await start();
  await fillAndConnect(env);
  gh.put(DAY, `# ${TODAY}\n\n* [ ] 99:99 zła godzina\n`);
  btn('Synchronizuj teraz')!.click();
  await env.settle();
  const box = section().querySelector('.import-errors')!;
  expect(box.textContent).toContain(`${DAY}:3`);
  expect(texts(env.app.S.items)).toEqual(['a']);

  [...box.querySelectorAll('button')].find((b) => b.textContent?.includes('Nadpisz'))!.click();
  await env.settle();
  expect(gh.text(DAY)).toContain('* [ ] a');
  expect(section().querySelector('.import-errors')).toBeNull();
});

test('token bez dostępu: stan „auth", nowy token przywraca synchronizację', async () => {
  seed([task('a')]);
  const env = await start();
  await fillAndConnect(env);
  gh.token = 'nowy-token';
  btn('Synchronizuj teraz')!.click();
  await env.settle();
  expect(section().querySelector('.sync-status')!.textContent).toContain('Token wygasł');
  expect(cloud()!.className).toContain('error');

  type(field('Nowy token'), 'nowy-token');
  env.flush();
  btn('Zapisz token')!.click();
  await env.settle();
  expect(saved().config.token).toBe('nowy-token');
  expect(section().querySelector('.sync-status')!.textContent).not.toContain('Token wygasł');
  // Uzgodnienie zostało — nic nie było do wysłania ani pobrania od nowa.
  expect(gh.log.filter((l) => l.method === 'PUT')).toHaveLength(3);
});

test('„Rozłącz": token znika z przeglądarki, dane zostają po obu stronach', async () => {
  seed([task('a')]);
  const env = await start();
  await fillAndConnect(env);
  btn('Rozłącz')!.click();
  await env.settle();
  expect(saved()).toEqual({ config: null, state: { docs: {}, blocked: {} } });
  expect(JSON.stringify(saved())).not.toContain(gh.token);
  expect(texts(env.app.S.items)).toEqual(['a']);
  expect(gh.text(DAY)).toContain('* [ ] a');
  expect(cloud()).toBeNull();
  expect(section().querySelector<HTMLInputElement>('input[value="local"]')!.checked).toBe(true);

  const n = gh.log.length;
  env.state.commit(() => {
    env.app.S.items = env.app.S.items.map((i) => ({ ...i, text: 'b' }));
  });
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  expect(gh.log.length).toBe(n);
});

test('ikonka w pasku otwiera ustawienia danych', async () => {
  seed([task('a')]);
  const env = await start();
  await fillAndConnect(env);
  env.ui.settings = null;
  env.flush();
  (cloud() as HTMLButtonElement).click();
  env.flush();
  expect(env.ui.settings).toBe('data');
  expect(cloud()!.getAttribute('aria-label')).toMatch(/^Synchronizacja: /);
});
