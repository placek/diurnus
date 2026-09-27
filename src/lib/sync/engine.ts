import type { Files } from '../md/files';
import { contentHash } from './hash';
import { StoreError, isDocName } from './store';
import type { Store, Version, WriteResult } from './store';

/*
 * Synchronizacja dziennika z magazynem (projekt synchronizacji, §4). Czysta
 * logika: dostaje dokumenty z `renderFiles(stan)` i to, co ostatnio uzgodniono
 * z magazynem, a oddaje nowe uzgodnienie, dokumenty po zmianach z magazynu
 * i konflikty. Stanu aplikacji nie dotyka — o tym, czy dokumenty z magazynu
 * dają się przyjąć, decyduje wołający przez `accept` (w aplikacji: `parseFiles`).
 *
 * Konflikt rozstrzyga się zawsze tak samo: wygrywa magazyn, a przegrana lokalna
 * treść wraca w konflikcie, żeby „Nadpisz moją wersją" mogło ją przywrócić.
 */

/** Wersja i odcisk treści, które lokalnie i w magazynie były ostatnio te same. */
export interface Agreed {
  version: Version;
  hash: string;
}

export interface SyncState {
  /** Co ostatnio uzgodniono z magazynem, dokument po dokumencie. */
  docs: Record<string, Agreed>;
  /** Znacznik ostatniego spisu — z nim spis bez zmian jest prawie darmowy. */
  mark?: string;
  /**
   * Dokumenty z magazynu, których nie dało się przyjąć (np. popsute ręcznie):
   * nazwa → odrzucona wersja, `''` — odrzucone usunięcie. Nie są pobierane
   * ponownie ani nadpisywane, dopóki w magazynie nie zmienią się znowu albo
   * ktoś nie wybierze „Nadpisz moją wersją".
   */
  blocked: Record<string, Version>;
}

export const emptySync = (): SyncState => ({ docs: {}, blocked: {} });

export interface Conflict {
  name: string;
  /** Wersja magazynu, która wygrała; `null` — w magazynie dokumentu już nie ma. */
  remote: { body: string; version: Version } | null;
  /** Lokalna treść, która przegrała; `null` — lokalnie dokument był usunięty. */
  mine: string | null;
}

/** Czy dokumenty po zmianach z magazynu dają się przyjąć; lista błędów, gdy nie. */
export type Accept = (merged: Files) => true | string[];

export interface Outcome {
  state: SyncState;
  /** Dokumenty po wprowadzeniu zmian z magazynu (albo wejściowe, gdy nic nie weszło). */
  files: Files;
  /** Czy `files` różnią się od wejścia — czy stan aplikacji trzeba zastąpić. */
  changed: boolean;
  conflicts: Conflict[];
  /** Zmiany z magazynu, których nie przyjęto. */
  rejected: { names: string[]; errors: string[] } | null;
  /** Błąd magazynu, który przerwał pracę; to, co zdążyło się udać, jest w `state`. */
  error: StoreError | null;
}

/* ───────────── Pomocnicze ───────────── */

const clone = (s: SyncState): SyncState => ({
  docs: { ...s.docs },
  blocked: { ...s.blocked },
  ...(s.mark !== undefined ? { mark: s.mark } : {}),
});

/** Tylko dokumenty dziennika — reszta nie jest sprawą synchronizacji. */
const docsOf = (files: Files): Files =>
  Object.fromEntries(Object.entries(files).filter(([n]) => isDocName(n)));

const asStoreError = (e: unknown): StoreError =>
  e instanceof StoreError ? e : new StoreError('other', e instanceof Error ? e.message : String(e));

/** Czy lokalna treść różni się od uzgodnionej (także: nowa albo usunięta lokalnie). */
function locallyChanged(files: Files, st: SyncState, name: string): boolean {
  const agreed = st.docs[name];
  const body = files[name];
  if (body === undefined) return agreed !== undefined;
  return !agreed || agreed.hash !== contentHash(body);
}

/** Lokalne zmiany do wysłania: zmienione albo nowe dokumenty i usunięte. */
export function localChanges(files: Files, st: SyncState): { dirty: string[]; gone: string[] } {
  const docs = docsOf(files);
  const dirty = Object.keys(docs)
    .filter((n) => !(n in st.blocked) && locallyChanged(docs, st, n))
    .sort();
  const gone = Object.keys(st.docs)
    .filter((n) => !(n in docs) && !(n in st.blocked))
    .sort();
  return { dirty, gone };
}

/** Czy są lokalne zmiany, które czekają na wysłanie. */
export const pending = (files: Files, st: SyncState): boolean => {
  const { dirty, gone } = localChanges(files, st);
  return dirty.length + gone.length > 0;
};

/**
 * Wprowadzenie dokumentów z magazynu: wszystkie naraz albo żaden. Przyjęte
 * zostają uzgodnione; odrzucone — zablokowane, a lokalne dokumenty bez zmian.
 */
function integrate(
  st: SyncState,
  files: Files,
  remote: Record<string, { body: string; version: Version } | null>,
  accept: Accept,
): Pick<Outcome, 'files' | 'changed' | 'rejected'> {
  const names = Object.keys(remote).sort();
  if (!names.length) return { files, changed: false, rejected: null };

  const merged: Files = { ...files };
  for (const n of names) {
    const r = remote[n];
    if (r) merged[n] = r.body;
    else delete merged[n];
  }
  const verdict = accept(merged);
  if (verdict !== true) {
    for (const n of names) st.blocked[n] = remote[n]?.version ?? '';
    return { files, changed: false, rejected: { names, errors: verdict } };
  }
  for (const n of names) {
    const r = remote[n];
    if (r) st.docs[n] = { version: r.version, hash: contentHash(r.body) };
    else delete st.docs[n];
    delete st.blocked[n];
  }
  const changed = names.some((n) => merged[n] !== files[n]);
  return { files: merged, changed, rejected: null };
}

function outcome(
  st: SyncState,
  files: Files,
  remote: Record<string, { body: string; version: Version } | null>,
  conflicts: Conflict[],
  accept: Accept,
  error: StoreError | null,
): Outcome {
  return { state: st, ...integrate(st, files, remote, accept), conflicts, error };
}

/* ───────────── Wysyłanie ───────────── */

/**
 * Wysyła lokalne zmiany: zapis zmienionych i nowych dokumentów na uzgodnionej
 * wersji, usunięcie tych, których stan już nie daje. Konflikt — wygrywa magazyn.
 */
export async function push(
  store: Store,
  files: Files,
  state: SyncState,
  accept: Accept,
): Promise<Outcome> {
  const st = clone(state);
  const { dirty, gone } = localChanges(files, st);
  const remote: Record<string, { body: string; version: Version } | null> = {};
  const conflicts: Conflict[] = [];
  let error: StoreError | null = null;

  const lost = (name: string, r: Extract<WriteResult, { ok: false }>, mine: string | null) => {
    // Usunięcie, którego nie ma już czego usuwać, to zgoda, nie konflikt.
    if (mine === null && r.conflict === null) {
      delete st.docs[name];
      return;
    }
    remote[name] = r.conflict;
    conflicts.push({ name, remote: r.conflict, mine });
  };

  try {
    for (const name of dirty) {
      const body = files[name]!;
      const r = await store.write(name, body, st.docs[name]?.version ?? null);
      if (r.ok) st.docs[name] = { version: r.version!, hash: contentHash(body) };
      else lost(name, r, body);
    }
    for (const name of gone) {
      const r = await store.remove(name, st.docs[name]!.version);
      if (r.ok) delete st.docs[name];
      else lost(name, r, null);
    }
  } catch (e) {
    error = asStoreError(e);
  }
  return outcome(st, files, remote, conflicts, accept, error);
}

/* ───────────── Pobieranie ───────────── */

/**
 * Pobiera zmiany z magazynu: spis (zwykle „bez zmian"), a potem tylko dokumenty
 * o innej wersji niż uzgodniona. Dokument zmieniony też lokalnie to konflikt.
 */
export async function pull(
  store: Store,
  files: Files,
  state: SyncState,
  accept: Accept,
): Promise<Outcome> {
  const st = clone(state);
  const remote: Record<string, { body: string; version: Version } | null> = {};
  const conflicts: Conflict[] = [];
  let error: StoreError | null = null;

  try {
    const listing = await store.list(st.mark);
    if (!('unchanged' in listing)) {
      const there = new Map([...listing.docs].filter(([n]) => isDocName(n)));
      for (const [name, version] of [...there].sort(([a], [b]) => a.localeCompare(b))) {
        if (st.docs[name]?.version === version || st.blocked[name] === version) continue;
        remote[name] = await store.read(name);
      }
      for (const name of Object.keys(st.docs).sort())
        if (!there.has(name) && st.blocked[name] !== '') remote[name] = null;

      for (const name of Object.keys(remote)) {
        const r = remote[name]!;
        const mine = files[name] ?? null;
        // Obie strony doszły do tego samego — nie ma o co się spierać.
        if ((r?.body ?? null) === mine) continue;
        if (locallyChanged(docsOf(files), st, name)) conflicts.push({ name, remote: r, mine });
      }
      st.mark = listing.mark;
    }
  } catch (e) {
    error = asStoreError(e);
    // Przerwany spis nie może zostawić znacznika: następny raz trzeba spisać od nowa.
    delete st.mark;
  }
  return outcome(st, files, remote, conflicts, accept, error);
}

/* ───────────── „Nadpisz moją wersją" ───────────── */

/** Zapisuje przegraną lokalną treść na bieżącej wersji magazynu i przywraca ją w stanie. */
export async function overwrite(
  store: Store,
  files: Files,
  state: SyncState,
  c: Conflict,
  accept: Accept,
): Promise<Outcome> {
  const st = clone(state);
  const conflicts: Conflict[] = [];
  const remote: Record<string, { body: string; version: Version } | null> = {};
  let error: StoreError | null = null;

  try {
    const base = c.remote?.version ?? null;
    let r: WriteResult;
    if (c.mine !== null) r = await store.write(c.name, c.mine, base);
    else if (base !== null) r = await store.remove(c.name, base);
    else r = { ok: true, version: null }; // obie strony bez dokumentu
    if (r.ok) {
      delete st.blocked[c.name];
      if (c.mine !== null) {
        // Własna treść wchodzi z powrotem do stanu jako uzgodniona.
        remote[c.name] = { body: c.mine, version: r.version! };
      } else {
        delete st.docs[c.name];
        remote[c.name] = null;
      }
    } else {
      // Ktoś zdążył znowu — nowy konflikt, magazyn znów wygrywa.
      remote[c.name] = r.conflict;
      conflicts.push({ name: c.name, remote: r.conflict, mine: c.mine });
    }
  } catch (e) {
    error = asStoreError(e);
  }
  return outcome(st, files, remote, conflicts, accept, error);
}

/* ───────────── Pierwsze połączenie ───────────── */

export interface Summary {
  /** pozycje we wszystkich dokumentach */
  items: number;
  /** najwcześniejszy i najpóźniejszy dzień z plikiem */
  first: string | null;
  last: string | null;
}

/** Krótki opis dziennika do pytania przy pierwszym połączeniu. */
export function summarize(files: Files): Summary {
  const docs = docsOf(files);
  let items = 0;
  for (const [name, body] of Object.entries(docs))
    if (name.endsWith('.md')) items += body.split('\n').filter((l) => /^\*( |$)/.test(l)).length;
  const days = Object.keys(docs)
    .filter((n) => /^\d{4}-/.test(n))
    .map((n) => n.slice(0, 10))
    .sort();
  return { items, first: days[0] ?? null, last: days.at(-1) ?? null };
}

/** Wszystko, co jest w magazynie — pobrane raz przy pierwszym połączeniu. */
export interface Snapshot {
  files: Files;
  versions: Record<string, Version>;
  mark: string;
}

export type FirstPlan =
  /** magazyn pusty (albo bez żadnej pozycji) — dziennik z tego urządzenia idzie do magazynu */
  | { kind: 'push'; snapshot: Snapshot }
  /** lokalnie pusto — dziennik z magazynu zastępuje lokalny */
  | { kind: 'pull'; snapshot: Snapshot }
  /** dane po obu stronach — jedno pytanie */
  | { kind: 'ask'; snapshot: Snapshot; local: Summary; remote: Summary };

/** Co zrobić przy pierwszym połączeniu (projekt, §4 „Pierwsze połączenie"). */
export async function planFirst(store: Store, files: Files): Promise<FirstPlan> {
  const listing = await store.list();
  if ('unchanged' in listing)
    throw new StoreError('other', 'spis bez znacznika nie może być „bez zmian"');
  const snap: Snapshot = { files: {}, versions: {}, mark: listing.mark };
  for (const name of [...listing.docs.keys()].sort()) {
    if (!isDocName(name)) continue;
    const doc = await store.read(name);
    if (!doc) continue;
    // Wersja z odczytu, nie ze spisu: między jednym a drugim ktoś mógł zapisać.
    snap.files[name] = doc.body;
    snap.versions[name] = doc.version;
  }
  const local = summarize(files);
  const remote = summarize(snap.files);
  if (Object.keys(snap.files).length === 0 || (remote.items === 0 && local.items > 0))
    return { kind: 'push', snapshot: snap };
  if (local.items === 0) return { kind: 'pull', snapshot: snap };
  return { kind: 'ask', snapshot: snap, local, remote };
}

/** „Pobierz z magazynu": dziennik z magazynu zastępuje lokalny w całości. */
export function takeRemote(snap: Snapshot, accept: Accept): Outcome {
  // Zastąpienie w całości: lokalne dokumenty, których magazyn nie ma, odpadają.
  const verdict = accept(snap.files);
  if (verdict !== true)
    return {
      state: emptySync(),
      files: {},
      changed: false,
      conflicts: [],
      rejected: { names: Object.keys(snap.files).sort(), errors: verdict },
      error: null,
    };
  const st: SyncState = { docs: {}, blocked: {}, mark: snap.mark };
  for (const [n, body] of Object.entries(snap.files))
    st.docs[n] = { version: snap.versions[n]!, hash: contentHash(body) };
  return {
    state: st,
    files: { ...snap.files },
    changed: true,
    conflicts: [],
    rejected: null,
    error: null,
  };
}

/**
 * „Wyślij moje": dokumenty z tego urządzenia na wersjach z magazynu, a to,
 * czego lokalnie nie ma, usunięte — magazyn staje się kopią tego urządzenia.
 */
export async function sendMine(
  store: Store,
  files: Files,
  snap: Snapshot,
  accept: Accept,
): Promise<Outcome> {
  // Udajemy, że uzgodniona była wersja z magazynu z pustą treścią: wtedy każdy
  // lokalny dokument jest „zmieniony", a każdy tylko-zdalny — „usunięty lokalnie".
  const st: SyncState = {
    docs: Object.fromEntries(
      Object.entries(snap.versions).map(([n, version]) => [n, { version, hash: '' }]),
    ),
    blocked: {},
  };
  return push(store, files, st, accept);
}
