import { app, onStateChange, replaceState, ui } from './state.svelte';
import { parseFiles, renderFiles } from './lib/md/files';
import type { FileError, Files } from './lib/md/files';
import { readJSON, writeJSON } from './lib/persist';
import { emptySync, planFirst, sendMine, takeRemote } from './lib/sync/engine';
import type { Accept, Conflict, FirstPlan, SyncState } from './lib/sync/engine';
import { GitHubStore, checkRepo, parseRepo } from './lib/sync/github';
import type { GitHubConfig, RepoCheck } from './lib/sync/github';
import { PULL_EVERY, SyncRunner, initialStatus } from './lib/sync/runner';
import type { SyncStatus } from './lib/sync/runner';
import type { Store } from './lib/sync/store';
import type { State } from './lib/types';

/*
 * Synchronizacja w aplikacji: runner z `lib/sync/runner` podpięty do stanu,
 * do zdarzeń przeglądarki i do pamięci `diurnus.sync` (konfiguracja magazynu
 * i uzgodnienie z nim). Bez konfiguracji nic tu nie działa — dane żyją tylko
 * w tej przeglądarce, jak dotąd.
 *
 * W jednej przeglądarce synchronizuje jedna karta naraz (zamek Web Locks);
 * pozostałe dostają jej zmiany przez `storage`, a swoje oddają tą samą drogą.
 * Gdy karta synchronizująca się zamknie, zamek przejmuje następna.
 */

export const SYNC_KEY = 'diurnus.sync';
/** Powrót do karty sprawdza magazyn najwyżej raz na tyle. */
export const CHECK_GAP = 10_000;

export type StoreConfig = {
  kind: 'github';
  /** data wygaśnięcia tokenu (RRRR-MM-DD), jeśli GitHub ją podał */
  expires?: string;
} & GitHubConfig;

export interface SyncSaved {
  config: StoreConfig | null;
  state: SyncState;
}

export function loadSaved(): SyncSaved {
  const s = readJSON<Partial<SyncSaved> | null>(localStorage, SYNC_KEY, null);
  return {
    config: s?.config ?? null,
    state: { ...emptySync(), ...(s?.state ?? {}) },
  };
}

/** Stan synchronizacji do pokazania; `null` — synchronizacja wyłączona. */
export const sync = $state({ status: null as SyncStatus | null });

export function makeStore(cfg: StoreConfig): Store {
  return new GitHubStore(cfg);
}

const where = (e: FileError) => (e.file ? `${e.file}${e.line !== null ? `:${e.line}` : ''}: ` : '');

const current = (): Files => renderFiles($state.snapshot(app.S) as State);

/** Dokumenty dają się przyjąć, gdy `parseFiles` je czyta; błędy jako `plik:linia: powód`. */
const accept: Accept = (files) => {
  const p = parseFiles(files);
  return p.ok ? true : p.errors.map((e) => `${where(e)}${e.message}`);
};

/** Stan z dokumentów, które `accept` przyjął. */
function apply(files: Files): void {
  const p = parseFiles(files);
  if (p.ok) replaceState(p.state);
}

let runner: SyncRunner | null = null;
/** Zatrzymanie bieżącego przebiegu; `null` — synchronizacja nie jest uruchomiona. */
let stopRun: (() => void) | null = null;

/** Uruchamia synchronizację według zapisanej konfiguracji. Zwraca zatrzymanie. */
export function startSync(): () => void {
  stopRun = run(loadSaved().config);
  // Inna karta połączyła albo rozłączyła magazyn.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== SYNC_KEY) return;
    if (JSON.stringify(loadSaved().config) === configKey) return;
    restartSync();
  };
  addEventListener('storage', onStorage);
  return () => {
    removeEventListener('storage', onStorage);
    stopRun?.();
    stopRun = null;
  };
}

/** Ponowne uruchomienie po zmianie konfiguracji (połączenie, rozłączenie, nowy token). */
function restartSync(): void {
  if (!stopRun) return; // aplikacja nie wystartowała synchronizacji (np. w testach bez App)
  stopRun();
  stopRun = run(loadSaved().config);
}

/** Konfiguracja, na której działa bieżący runner — do rozpoznania zmian. */
let configKey = 'null';

function run(cfg: StoreConfig | null): () => void {
  configKey = JSON.stringify(cfg);
  if (!cfg) {
    sync.status = null;
    return () => {};
  }
  sync.status = initialStatus('standby');
  return lead(() => drive(cfg));
}

/**
 * Jedna karta synchronizuje, reszta czeka w kolejce do zamka. Bez Web Locks
 * (stare przeglądarki, testy) synchronizuje każda karta — silnik znosi to, bo
 * zapis tego, co już jest w magazynie, to zgoda, nie konflikt.
 */
function lead(onLead: () => () => void): () => void {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return onLead();
  let stop: (() => void) | null = null;
  let release: (() => void) | null = null;
  let cancelled = false;
  const ac = new AbortController();
  locks
    .request('diurnus.sync', { signal: ac.signal }, () => {
      if (cancelled) return;
      stop = onLead();
      return new Promise<void>((res) => (release = res));
    })
    .catch(() => {
      // przerwane oczekiwanie na zamek — karta się zamyka albo rozłączono magazyn
    });
  return () => {
    cancelled = true;
    ac.abort();
    stop?.();
    release?.();
  };
}

function drive(cfg: StoreConfig): () => void {
  const key = JSON.stringify(cfg);
  const r = new SyncRunner({
    store: makeStore(cfg),
    files: current,
    accept,
    apply,
    load: () => loadSaved().state,
    save: (state) => {
      const saved = loadSaved();
      // Rozłączono w międzyczasie (albo połączono z czymś innym) — to uzgodnienie jest nieaktualne.
      if (JSON.stringify(saved.config) !== key) return;
      writeJSON(localStorage, SYNC_KEY, { ...saved, state });
    },
    onStatus: (s) => {
      sync.status = s;
    },
    notify: (e) => {
      const msg =
        e.kind === 'conflict'
          ? `Konflikt: ${e.names.join(', ')} — została wersja z repozytorium`
          : `Nie wczytano zmian z repozytorium: ${e.names.join(', ')}`;
      app.toast = { msg, undoable: false, action: { label: 'Pokaż', run: showSync } };
    },
  });
  runner = r;

  let lastCheck = -Infinity;
  const check = () => {
    if (Date.now() - lastCheck < CHECK_GAP) return;
    lastCheck = Date.now();
    r.pull();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'visible') check();
    else r.flush();
  };
  const onOnline = () => r.online();
  const every = setInterval(() => {
    if (document.visibilityState === 'visible') r.pull();
  }, PULL_EVERY);

  const offChange = onStateChange(() => r.changed());
  document.addEventListener('visibilitychange', onVisibility);
  addEventListener('focus', check);
  addEventListener('online', onOnline);
  check();

  return () => {
    offChange();
    document.removeEventListener('visibilitychange', onVisibility);
    removeEventListener('focus', check);
    removeEventListener('online', onOnline);
    clearInterval(every);
    r.stop();
    if (runner === r) runner = null;
  };
}

/** Ustawienia → Dane, gdzie jest sekcja synchronizacji. */
export function showSync(): void {
  ui.settings = 'data';
}

/** „Synchronizuj teraz": sprawdzenie od razu, bez czekania na ponowienie. */
export function syncNow(): void {
  runner?.retry();
}

/* ───────────── Połączenie ───────────── */

export interface ConnectForm {
  /** `właściciel/nazwa` albo adres repozytorium */
  repo: string;
  /** pusta — domyślna gałąź repozytorium */
  branch: string;
  /** katalog w repozytorium; pusty — korzeń */
  dir: string;
  token: string;
}

export type Prepared =
  | { ok: true; cfg: StoreConfig; check: Extract<RepoCheck, { ok: true }> }
  | { ok: false; message: string };

function checkMessage(c: Extract<RepoCheck, { ok: false }>): string {
  switch (c.reason) {
    case 'missing':
      return (
        'Repozytorium nie istnieje albo token nie ma do niego dostępu. Sprawdź, czy token ' +
        'obejmuje to repozytorium (a przy repozytorium organizacji — czy organizacja go zatwierdziła).'
      );
    case 'auth':
      return 'GitHub nie przyjął tokenu — jest błędny, wygasł albo nie ma uprawnień';
    case 'rate-limit':
      return 'Limit zapytań GitHuba — spróbuj za chwilę';
    case 'offline':
      return 'Brak połączenia z GitHubem';
    case 'other':
      return c.message;
  }
}

/** Sprawdzenie formularza i repozytorium: czy token je widzi i może w nim pisać. */
export async function prepare(form: ConnectForm): Promise<Prepared> {
  const r = parseRepo(form.repo);
  if (!r) return { ok: false, message: 'Podaj repozytorium jako właściciel/nazwa' };
  const token = form.token.trim();
  if (!token) return { ok: false, message: 'Podaj token' };
  const check = await checkRepo({ ...r, token });
  if (!check.ok) return { ok: false, message: checkMessage(check) };
  if (!check.canWrite)
    return {
      ok: false,
      message: 'Token może tylko czytać — nadaj mu uprawnienie Contents: Read and write',
    };
  const cfg: StoreConfig = {
    kind: 'github',
    ...r,
    branch: form.branch.trim() || check.defaultBranch,
    dir: form.dir.trim().replace(/^\/+|\/+$/g, ''),
    token,
    ...(check.expires ? { expires: check.expires } : {}),
  };
  return { ok: true, cfg, check };
}

/** Co jest w magazynie i co z tym zrobić przy pierwszym połączeniu. */
export function planConnect(cfg: StoreConfig): Promise<FirstPlan> {
  return planFirst(makeStore(cfg), current());
}

/**
 * Pierwsze połączenie: „pull" — dziennik z magazynu zastępuje lokalny,
 * „push" — magazyn staje się kopią tej przeglądarki. Po sukcesie konfiguracja
 * i uzgodnienie trafiają do pamięci, a synchronizacja rusza. Zwraca błędy albo `null`.
 */
export async function finishConnect(
  cfg: StoreConfig,
  plan: FirstPlan,
  choice: 'pull' | 'push',
): Promise<string[] | null> {
  const out =
    choice === 'pull'
      ? takeRemote(plan.snapshot, accept)
      : await sendMine(makeStore(cfg), current(), plan.snapshot, accept);
  if (out.error) return [out.error.message];
  if (out.rejected) return out.rejected.errors;
  // Uzgodnienie przed stanem — jak w runnerze.
  writeJSON(localStorage, SYNC_KEY, { config: cfg, state: out.state });
  if (out.changed) apply(out.files);
  restartSync();
  return null;
}

/** Rozłączenie: token i uzgodnienie znikają z przeglądarki; dane zostają po obu stronach. */
export function disconnect(): void {
  writeJSON(localStorage, SYNC_KEY, { config: null, state: emptySync() });
  restartSync();
}

/** Nowy token dla tego samego repozytorium — uzgodnienie zostaje. Zwraca błąd albo `null`. */
export async function changeToken(token: string): Promise<string | null> {
  const saved = loadSaved();
  if (!saved.config) return 'Synchronizacja nie jest połączona';
  const t = token.trim();
  if (!t) return 'Podaj token';
  const check = await checkRepo({ owner: saved.config.owner, repo: saved.config.repo, token: t });
  if (!check.ok) return checkMessage(check);
  if (!check.canWrite)
    return 'Token może tylko czytać — nadaj mu uprawnienie Contents: Read and write';
  const { expires: _old, ...rest } = saved.config;
  const config: StoreConfig = {
    ...rest,
    token: t,
    ...(check.expires ? { expires: check.expires } : {}),
  };
  writeJSON(localStorage, SYNC_KEY, { ...saved, config });
  restartSync();
  return null;
}

/** „Nadpisz moją wersją" dla konfliktu z listy stanu. */
export function overwriteMine(c: Conflict): Promise<void> {
  return runner ? runner.overwrite($state.snapshot(c) as Conflict) : Promise.resolve();
}

/**
 * „Nadpisz moją wersją" dla odrzuconych zmian z magazynu: lokalna treść tych
 * dokumentów idzie do magazynu na odrzuconej wersji i blokada znika.
 */
export async function overwriteRejected(): Promise<void> {
  const r = runner;
  if (!r) return;
  const files = current();
  for (const [name, version] of Object.entries(loadSaved().state.blocked))
    await r.overwrite({
      name,
      // Treść magazynu nie jest tu potrzebna — liczy się wersja, na której piszemy.
      remote: version === '' ? null : { body: '', version },
      mine: files[name] ?? null,
    });
}

/** Konflikt przyjęty do wiadomości — zostaje wersja z magazynu. */
export function dismissConflict(name: string): void {
  runner?.dismiss(name);
}

/** Dla testów: poczekaj, aż runner skończy, co ma w kolejce. */
export function syncIdle(): Promise<void> {
  return runner ? runner.idle() : Promise.resolve();
}
