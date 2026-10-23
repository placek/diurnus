import { test, expect, describe, beforeEach, afterEach, vi } from 'vitest';
import { legacyOf, parseJournal, renderJournal, renderLegacy } from '../src/lib/journal';
import type { Files } from '../src/lib/md/files';
import {
  MIGRATION_MESSAGE,
  emptySync,
  isLegacy,
  planFirst,
  push,
  takeRemote,
} from '../src/lib/sync/engine';
import type { Accept, SyncState } from '../src/lib/sync/engine';
import { MemoryStore } from '../src/lib/sync/memory';
import { SyncRunner } from '../src/lib/sync/runner';
import type { SyncStatus } from '../src/lib/sync/runner';
import type { Change, Store } from '../src/lib/sync/store';
import { step } from '../src/lib/machine';
import type { Event } from '../src/lib/machine';
import { normalize } from '../src/lib/model';
import type { State } from '../src/lib/types';

/*
 * Przejście synchronizacji z plików Markdown na [x]it! — na prawdziwych
 * plikach dziennika, magazynie w pamięci i zegarze synchronizacji. Urządzenie
 * to stan aplikacji, uzgodnienie z magazynem i runner, połączone tak jak
 * w aplikacji (`sync.svelte.ts`).
 */

const TODAY = '2026-09-25';
const hours = { q0: 24, q1: 88 };
const DAY_MD = `${TODAY}.md`;
const DAY_XIT = `${TODAY}.xit`;

const accept: Accept = (files) => {
  const r = parseJournal(files);
  return r.ok ? true : r.errors.map((e) => `${e.file}:${e.line}: ${e.message}`);
};

const stateOf = (files: Files): State => {
  const r = parseJournal(files);
  if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('\n'));
  return r.state;
};

const run = (s: State, e: Event): State => {
  const r = step({ today: s.today, items: s.items }, e, hours);
  if (!r.ok) throw new Error(r.reason);
  return { ...s, items: [...r.machine.items] };
};
const create = (s: State, id: string, text: string, place: 'today' | 'backlog' = 'today') =>
  run(s, { type: 'create', id, text, place });
const texts = (s: State) => s.items.map((i) => i.text).sort();

interface Device {
  S: State;
  st: SyncState;
  status: SyncStatus;
  /** każdy stan pokazany przez runner, po kolei */
  seen: SyncStatus[];
  runner: SyncRunner;
  sync(): Promise<void>;
}

function device(store: Store, S: State, st: SyncState): Device {
  const d: Device = {
    S,
    st,
    status: null as unknown as SyncStatus,
    seen: [],
    runner: null as unknown as SyncRunner,
    async sync() {
      d.runner.pull();
      await d.runner.idle();
    },
  };
  d.runner = new SyncRunner({
    store,
    files: () => (isLegacy(d.st) ? renderLegacy(d.S) : renderJournal(d.S)),
    target: () => renderJournal(d.S),
    legacyOf,
    accept,
    apply: (f) => (d.S = stateOf(f)),
    load: () => d.st,
    save: (s) => (d.st = s),
    onStatus: (s) => {
      d.status = s;
      d.seen.push(s);
    },
  });
  return d;
}

/** Repozytorium w Markdownie, jak przed aktualizacją, i uzgodnienie z nim. */
async function seedMd(store: MemoryStore, S: State): Promise<SyncState> {
  for (const [n, body] of Object.entries(renderLegacy(S))) store.put(n, body);
  const plan = await planFirst(store, renderJournal(normalize(null, TODAY)));
  const took = takeRemote(plan.snapshot, accept);
  expect(took.rejected).toBeNull();
  return took.state;
}

/** Urządzenie zsynchronizowane jeszcze w Markdownie. */
async function mdDevice(store: MemoryStore, S: State): Promise<Device> {
  return device(store, S, await seedMd(store, S));
}

const journalNames = (store: MemoryStore) =>
  Object.keys(store.snapshot())
    .filter((n) => n !== 'README.md')
    .sort();

/** Stan z dziennika w magazynie — bez obcych plików. */
const remoteState = (store: MemoryStore) =>
  stateOf(Object.fromEntries(Object.entries(store.snapshot()).filter(([n]) => n !== 'README.md')));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 25, 12));
});
afterEach(() => vi.useRealTimers());

describe('przejście na [x]it!', () => {
  test('repozytorium w Markdownie i niewysłana edycja: wszystko w [x]it!, jednym commitem', async () => {
    const store = new MemoryStore({ 'README.md': 'moje' });
    const start = create(
      create(normalize(null, TODAY), 'a', 'Kupić chleb'),
      'b',
      'Kiedyś',
      'backlog',
    );
    const d = await mdDevice(store, start);
    expect(journalNames(store)).toEqual(['.diurnus.toml', DAY_MD, 'BACKLOG.md']);

    d.S = create(d.S, 'c', 'Niewysłane');
    await d.sync();
    // W trakcie przejścia widać „Przechodzę na [x]it!…" (stan „busy" z `migrating`).
    expect(d.seen.filter((s) => s.migrating).length).toBeGreaterThan(0);
    expect(new Set(d.seen.filter((s) => s.migrating).map((s) => s.phase))).toEqual(
      new Set(['busy']),
    );

    expect(journalNames(store)).toEqual(['.diurnus.toml', DAY_XIT, 'BACKLOG.xit']);
    expect(store.snapshot()['README.md']).toBe('moje');
    expect(store.snapshot()['.diurnus.toml']).toMatch(/^format = "xit"\n/);
    expect(store.messages).toEqual([MIGRATION_MESSAGE]);
    expect(store.snapshot()[DAY_XIT]).toBe('[ ] Kupić chleb\n[ ] Niewysłane\n');
    expect(isLegacy(d.st)).toBe(false);
    expect(d.status.pending).toBe(false);
    expect(d.status.migrating).toBe(false);
    expect(texts(remoteState(store))).toEqual(['Kiedyś', 'Kupić chleb', 'Niewysłane']);

    // Następna tura nie ma nic do zrobienia: jeden tani spis.
    const calls = { ...store.calls };
    await d.sync();
    expect(store.calls).toEqual({ ...calls, list: calls.list + 1 });
  });

  test('zmiana w repozytorium tuż przed przejściem wchodzi, a ten sam dokument zmieniony po obu stronach — wygrywa repozytorium', async () => {
    const store = new MemoryStore();
    const d = await mdDevice(store, create(normalize(null, TODAY), 'a', 'A'));
    // Inne urządzenie (jeszcze w Markdownie) dopisuje do backlogu i do dziś.
    store.put('BACKLOG.md', '# Backlog\n\n* [ ] Z telefonu\n');
    store.put(DAY_MD, `# ${TODAY}\n\n* [ ] A\n* [ ] Też z telefonu\n`);
    d.S = create(d.S, 'm', 'Moje'); // ten sam dokument dnia — konflikt
    await d.sync();

    expect(journalNames(store)).toEqual(['.diurnus.toml', DAY_XIT, 'BACKLOG.xit']);
    expect(texts(d.S)).toEqual(['A', 'Też z telefonu', 'Z telefonu']);
    expect(texts(remoteState(store))).toEqual(texts(d.S));
    // Konflikt dotyczył pliku Markdown, którego już nie ma — nie wisi w stanie.
    expect(d.status.conflicts).toEqual([]);
  });

  test('gałąź przesunięta w trakcie commita: nic nie wchodzi, a ponowienie kończy przejście', async () => {
    const inner = new MemoryStore();
    let moveOnce = true;
    const store: Store = {
      list: (s) => inner.list(s),
      read: (n) => inner.read(n),
      write: (n, b, v) => inner.write(n, b, v),
      remove: (n, v) => inner.remove(n, v),
      commit: (changes: Change[], message: string) => {
        if (moveOnce) {
          moveOnce = false;
          inner.put('BACKLOG.md', '# Backlog\n\n* [ ] W ostatniej chwili\n');
        }
        return inner.commit(changes, message);
      },
    };
    const start = create(normalize(null, TODAY), 'a', 'A');
    const d = device(store, start, await seedMd(inner, start));
    await d.sync();
    expect(isLegacy(d.st)).toBe(true);
    expect(d.status.phase).toBe('other');
    expect(journalNames(inner)).toEqual(['.diurnus.toml', DAY_MD, 'BACKLOG.md']);

    await vi.advanceTimersByTimeAsync(5000);
    await d.runner.idle();
    expect(isLegacy(d.st)).toBe(false);
    expect(journalNames(inner)).toEqual(['.diurnus.toml', DAY_XIT, 'BACKLOG.xit']);
    expect(texts(d.S)).toEqual(['A', 'W ostatniej chwili']);
    expect(inner.messages).toEqual([MIGRATION_MESSAGE]);
  });

  test('drugie urządzenie przejmuje repozytorium po pierwszym: zmiany z obu stron się spotykają', async () => {
    const store = new MemoryStore();
    const start = create(create(normalize(null, TODAY), 'a', 'A'), 'b', 'B', 'backlog');
    const one = await mdDevice(store, start);
    const two = device(store, start, { ...one.st, docs: { ...one.st.docs } });

    // Drugie urządzenie edytuje backlog, zanim się dowie o przejściu.
    two.S = create(two.S, 'x', 'Z drugiego', 'backlog');
    await one.sync();
    expect(isLegacy(one.st)).toBe(false);
    // Pierwsze — już w [x]it! — dopisuje do dziś.
    one.S = create(one.S, 'y', 'Z pierwszego');
    one.runner.flush();
    await one.runner.idle();

    await two.sync();
    expect(isLegacy(two.st)).toBe(false);
    expect(store.messages).toEqual([MIGRATION_MESSAGE]); // drugi commit przejścia nie powstał
    expect(texts(two.S)).toEqual(['A', 'B', 'Z drugiego', 'Z pierwszego']);
    expect(texts(remoteState(store))).toEqual(texts(two.S));
    expect(two.status.conflicts).toEqual([]);
    expect(journalNames(store)).toEqual(['.diurnus.toml', DAY_XIT, 'BACKLOG.xit']);

    await one.sync();
    expect(texts(one.S)).toEqual(texts(two.S));
  });

  test('ten sam dokument zmieniony na obu urządzeniach przy przejęciu: konflikt, wygrywa repozytorium', async () => {
    const store = new MemoryStore();
    const start = create(normalize(null, TODAY), 'a', 'A');
    const one = await mdDevice(store, start);
    const two = device(store, start, { ...one.st, docs: { ...one.st.docs } });
    two.S = create(two.S, 'x', 'Z drugiego');
    await one.sync();
    one.S = create(one.S, 'y', 'Z pierwszego');
    one.runner.flush();
    await one.runner.idle();

    await two.sync();
    expect(texts(two.S)).toEqual(['A', 'Z pierwszego']);
    expect(two.status.conflicts.map((c) => c.name)).toEqual([DAY_XIT]);
    expect(two.status.conflicts[0]!.mine).toContain('Z drugiego');
  });

  test('stary plik .md wysłany po przejściu (karta starszej wersji) jest dla synchronizacji obcy', async () => {
    const store = new MemoryStore();
    const d = await mdDevice(store, create(normalize(null, TODAY), 'a', 'A'));
    await d.sync();
    store.put(DAY_MD, `# ${TODAY}\n\n* [ ] A\n* [ ] Ze starej karty\n`);
    const before = d.S;
    await d.sync();
    expect(d.S).toBe(before);
    expect(d.status.rejected).toBeNull();
    expect(store.snapshot()[DAY_MD]).toContain('Ze starej karty'); // nie nasze — nie ruszamy
  });

  test('pierwsze połączenie z repozytorium w Markdownie: dziennik wchodzi, przejście w następnej turze', async () => {
    const store = new MemoryStore();
    for (const [n, body] of Object.entries(
      renderLegacy(create(normalize(null, TODAY), 'a', 'Zdalne')),
    ))
      store.put(n, body);

    const fresh = normalize(null, TODAY);
    const plan = await planFirst(store, renderJournal(fresh));
    expect(plan.kind).toBe('pull');
    const took = takeRemote(plan.snapshot, accept);
    expect(took.rejected).toBeNull();
    const d = device(store, stateOf(took.files), took.state);
    expect(isLegacy(d.st)).toBe(true);
    expect(texts(d.S)).toEqual(['Zdalne']);

    await d.sync();
    expect(journalNames(store)).toEqual(['.diurnus.toml', DAY_XIT, 'BACKLOG.xit']);
    expect(texts(d.S)).toEqual(['Zdalne']);
  });

  test('pierwsze połączenie z repozytorium już w [x]it!: stare pliki .md obok są pomijane', async () => {
    const store = new MemoryStore({
      [DAY_MD]: `# ${TODAY}\n\n* [ ] Stare\n`,
    });
    await push(
      store,
      renderJournal(create(normalize(null, TODAY), 'a', 'Nowe')),
      emptySync(),
      accept,
    );
    const plan = await planFirst(store, renderJournal(normalize(null, TODAY)));
    expect(Object.keys(plan.snapshot.files).sort()).toEqual([
      '.diurnus.toml',
      DAY_XIT,
      'BACKLOG.xit',
    ]);
    expect(texts(stateOf(takeRemote(plan.snapshot, accept).files))).toEqual(['Nowe']);
  });
});
