import { app, onStateChange, replaceState } from './state.svelte';
import { parseFiles, renderFiles } from './lib/md/files';
import type { FileError, Files } from './lib/md/files';
import { readJSON, writeJSON } from './lib/persist';
import { emptySync } from './lib/sync/engine';
import type { Conflict, SyncState } from './lib/sync/engine';
import { GitHubStore } from './lib/sync/github';
import type { GitHubConfig } from './lib/sync/github';
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

export type StoreConfig = { kind: 'github' } & GitHubConfig;

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

let runner: SyncRunner | null = null;

/** Uruchamia synchronizację według zapisanej konfiguracji. Zwraca zatrzymanie. */
export function startSync(): () => void {
  let stopRun = run(loadSaved().config);
  // Inna karta połączyła albo rozłączyła magazyn.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== SYNC_KEY) return;
    const cfg = loadSaved().config;
    if (JSON.stringify(cfg) === configKey) return;
    stopRun();
    stopRun = run(cfg);
  };
  addEventListener('storage', onStorage);
  return () => {
    removeEventListener('storage', onStorage);
    stopRun();
  };
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
    accept: (files) => {
      const p = parseFiles(files);
      return p.ok ? true : p.errors.map((e) => `${where(e)}${e.message}`);
    },
    apply: (files) => {
      const p = parseFiles(files);
      if (p.ok) replaceState(p.state);
    },
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
    notify: (msg) => {
      app.toast = { msg, undoable: false };
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

/** „Nadpisz moją wersją" dla konfliktu z listy stanu. */
export function overwriteMine(c: Conflict): Promise<void> {
  return runner ? runner.overwrite($state.snapshot(c) as Conflict) : Promise.resolve();
}

/** Konflikt przyjęty do wiadomości — zostaje wersja z magazynu. */
export function dismissConflict(name: string): void {
  runner?.dismiss(name);
}

/** Dla testów: poczekaj, aż runner skończy, co ma w kolejce. */
export function syncIdle(): Promise<void> {
  return runner ? runner.idle() : Promise.resolve();
}
