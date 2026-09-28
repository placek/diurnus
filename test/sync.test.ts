import { test, expect, describe } from 'vitest';
import {
  emptySync,
  overwrite,
  pending,
  planFirst,
  pull,
  push,
  sendMine,
  summarize,
  takeRemote,
} from '../src/lib/sync/engine';
import type { Accept, SyncState } from '../src/lib/sync/engine';
import { contentHash } from '../src/lib/sync/hash';
import { MemoryStore } from '../src/lib/sync/memory';
import { StoreError, isDocName } from '../src/lib/sync/store';
import type { Store } from '../src/lib/sync/store';
import { parseFiles, renderFiles } from '../src/lib/md/files';
import type { Files } from '../src/lib/md/files';
import { normalize } from '../src/lib/model';
import { step } from '../src/lib/machine';
import type { State } from '../src/lib/types';

const ok: Accept = () => true;
/** Przyjmuje wszystko poza dokumentem oznaczonym jako popsuty. */
const strict: Accept = (files) => {
  const bad = Object.entries(files).filter(([, b]) => b.includes('ZEPSUTE'));
  return bad.length ? bad.map(([n]) => `${n}:1: popsute`) : true;
};

const DAY = '2026-09-25.md';
const base: Files = {
  '.diurnus.toml': '[day]\nstart = 6\n',
  'BACKLOG.md': '# Backlog\n',
  [DAY]: '# 2026-09-25\n\n* [ ] A\n',
};

/** Jedno urządzenie po pierwszym wysłaniu wszystkiego. */
async function synced(store = new MemoryStore()) {
  const r = await push(store, base, emptySync(), ok);
  expect(r.error).toBeNull();
  return { store, state: r.state };
}

describe('nazwy i odciski', () => {
  test('dokumenty dziennika to dni, backlog i ustawienia — nic więcej', () => {
    expect(['2026-09-25.md', 'BACKLOG.md', '.diurnus.toml'].every(isDocName)).toBe(true);
    for (const n of [
      'README.md',
      '2026-02-30.md',
      '2026-9-25.md',
      'days/2026-09-25.md',
      'backlog.md',
    ])
      expect(isDocName(n), n).toBe(false);
  });

  test('odcisk jest stały i czuły na każdy znak', () => {
    expect(contentHash('# 2026')).toBe(contentHash('# 2026'));
    expect(contentHash('* [ ] A')).not.toBe(contentHash('* [x] A'));
    expect(contentHash('zażółć')).toMatch(/^[0-9a-f]{14}$/);
  });
});

describe('wysyłanie', () => {
  test('pierwsze wysłanie tworzy wszystkie dokumenty; drugie nie robi nic', async () => {
    const { store, state } = await synced();
    expect(store.snapshot()).toEqual(base);
    expect(Object.keys(state.docs).sort()).toEqual(Object.keys(base).sort());
    expect(pending(base, state)).toBe(false);
    const again = await push(store, base, state, ok);
    expect(store.calls.write).toBe(3);
    expect(again.state).toEqual(state);
  });

  test('zmiana jednego dokumentu wysyła tylko jego, na uzgodnionej wersji', async () => {
    const { store, state } = await synced();
    const files = { ...base, [DAY]: '# 2026-09-25\n\n* [x] A\n' };
    expect(pending(files, state)).toBe(true);
    const r = await push(store, files, state, ok);
    expect(store.calls.write).toBe(4);
    expect(store.snapshot()[DAY]).toBe(files[DAY]);
    expect(r.conflicts).toEqual([]);
    expect(r.changed).toBe(false);
    expect(pending(files, r.state)).toBe(false);
  });

  test('dokument, którego stan już nie daje, jest usuwany z magazynu', async () => {
    const { store, state } = await synced();
    const files = { ...base };
    delete files[DAY];
    const r = await push(store, files, state, ok);
    expect(store.snapshot()).not.toHaveProperty(DAY);
    expect(r.state.docs).not.toHaveProperty(DAY);
  });

  test('inne pliki w magazynie nie są ani spisywane, ani ruszane', async () => {
    const store = new MemoryStore({ 'README.md': 'moje notatki' });
    const { state } = await synced(store);
    const files = { ...base, 'README.md': 'lokalnie nie ma sensu' };
    await push(store, files, state, ok);
    expect(store.snapshot()['README.md']).toBe('moje notatki');
    const r = await pull(store, base, state, ok);
    expect(r.files).not.toHaveProperty('README.md');
  });
});

describe('pobieranie', () => {
  test('spis bez zmian nie czyta niczego', async () => {
    const { store, state } = await synced();
    const first = await pull(store, base, state, ok);
    const reads = store.calls.read;
    const second = await pull(store, base, first.state, ok);
    expect(store.calls.read).toBe(reads);
    expect(second.changed).toBe(false);
    expect(second.state).toEqual(first.state);
  });

  test('zmiana z innego urządzenia wchodzi — czytany jest tylko zmieniony dokument', async () => {
    const { store, state } = await synced();
    const reads = store.calls.read;
    store.put(DAY, '# 2026-09-25\n\n* [ ] A\n* [ ] B\n');
    const r = await pull(store, base, state, ok);
    expect(store.calls.read - reads).toBe(1);
    expect(r.changed).toBe(true);
    expect(r.files[DAY]).toContain('* [ ] B');
    expect(r.conflicts).toEqual([]);
    expect(pending(r.files, r.state)).toBe(false);
  });

  test('usunięcie na innym urządzeniu usuwa lokalnie, gdy lokalnie nic się nie zmieniło', async () => {
    const { store, state } = await synced();
    store.put(DAY, null);
    const r = await pull(store, base, state, ok);
    expect(r.files).not.toHaveProperty(DAY);
    expect(r.state.docs).not.toHaveProperty(DAY);
  });

  test('ta sama zmiana po obu stronach to zgoda, nie konflikt', async () => {
    const { store, state } = await synced();
    const same = '# 2026-09-25\n\n* [x] A\n';
    store.put(DAY, same);
    const r = await pull(store, { ...base, [DAY]: same }, state, ok);
    expect(r.conflicts).toEqual([]);
    expect(pending(r.files, r.state)).toBe(false);
  });
});

describe('konflikty: wygrywa magazyn, „Nadpisz moją wersją" przywraca swoją', () => {
  const theirs = '# 2026-09-25\n\n* [ ] A\n* [ ] od nich\n';
  const mine = '# 2026-09-25\n\n* [ ] A\n* [ ] moje\n';

  test('przy pobieraniu', async () => {
    const { store, state } = await synced();
    store.put(DAY, theirs);
    const r = await pull(store, { ...base, [DAY]: mine }, state, ok);
    expect(r.files[DAY]).toBe(theirs);
    expect(r.conflicts).toEqual([
      { name: DAY, remote: { body: theirs, version: expect.any(String) }, mine },
    ]);
    expect(pending(r.files, r.state)).toBe(false);

    const o = await overwrite(store, r.files, r.state, r.conflicts[0]!, ok);
    expect(o.files[DAY]).toBe(mine);
    expect(store.snapshot()[DAY]).toBe(mine);
    expect(pending(o.files, o.state)).toBe(false);
  });

  test('przy wysyłaniu', async () => {
    const { store, state } = await synced();
    store.put(DAY, theirs);
    const r = await push(store, { ...base, [DAY]: mine }, state, ok);
    expect(store.snapshot()[DAY]).toBe(theirs);
    expect(r.files[DAY]).toBe(theirs);
    expect(r.changed).toBe(true);
    expect(r.conflicts.map((c) => [c.name, c.mine])).toEqual([[DAY, mine]]);
  });

  test('dokument usunięty w magazynie, a zmieniony lokalnie: znika, ale da się go przywrócić', async () => {
    const { store, state } = await synced();
    store.put(DAY, null);
    const r = await push(store, { ...base, [DAY]: mine }, state, ok);
    expect(r.files).not.toHaveProperty(DAY);
    expect(r.conflicts).toEqual([{ name: DAY, remote: null, mine }]);
    const o = await overwrite(store, r.files, r.state, r.conflicts[0]!, ok);
    expect(store.snapshot()[DAY]).toBe(mine);
    expect(o.files[DAY]).toBe(mine);
  });

  test('usunięcie czegoś, czego już nie ma, to zgoda', async () => {
    const { store, state } = await synced();
    store.put(DAY, null);
    const files = { ...base };
    delete files[DAY];
    const r = await push(store, files, state, ok);
    expect(r.conflicts).toEqual([]);
    expect(r.state.docs).not.toHaveProperty(DAY);
  });

  test('zapis tego samego, co już jest w magazynie, to zgoda, nie konflikt', async () => {
    const { store, state } = await synced();
    store.put(DAY, mine);
    const r = await push(store, { ...base, [DAY]: mine }, state, ok);
    expect(r.conflicts).toEqual([]);
    expect(r.changed).toBe(false);
    expect(r.state.docs[DAY]!.version).toBe((await store.read(DAY))!.version);
    expect(pending(r.files, r.state)).toBe(false);
  });

  test('nadpisanie, które znów przegrywa, daje nowy konflikt', async () => {
    const { store, state } = await synced();
    store.put(DAY, theirs);
    const r = await pull(store, { ...base, [DAY]: mine }, state, ok);
    store.put(DAY, '# 2026-09-25\n\n* [ ] trzecia wersja\n');
    const o = await overwrite(store, r.files, r.state, r.conflicts[0]!, ok);
    expect(o.conflicts).toHaveLength(1);
    expect(o.files[DAY]).toContain('trzecia wersja');
  });
});

describe('dokumenty, których nie da się przyjąć', () => {
  test('nie wchodzą, nie są pobierane ponownie ani nadpisywane — do naprawy albo „Nadpisz"', async () => {
    const { store, state } = await synced();
    store.put(DAY, '# 2026-09-25\n\nZEPSUTE\n');
    const r = await pull(store, base, state, strict);
    expect(r.files).toEqual(base);
    expect(r.rejected).toEqual({ names: [DAY], errors: [`${DAY}:1: popsute`] });
    expect(r.state.blocked).toHaveProperty(DAY);

    // Ta sama wersja nie jest czytana znowu, a lokalna zmiana jej nie nadpisze.
    store.put('BACKLOG.md', '# Backlog\n\n* [ ] X\n');
    const reads = store.calls.read;
    const again = await pull(store, base, r.state, strict);
    expect(store.calls.read - reads).toBe(1); // tylko BACKLOG.md
    await push(
      store,
      { ...again.files, [DAY]: '# 2026-09-25\n\n* [ ] lokalnie\n' },
      again.state,
      strict,
    );
    expect(store.snapshot()[DAY]).toContain('ZEPSUTE');

    // Ktoś poprawia plik w magazynie — wchodzi i blokada znika.
    store.put(DAY, '# 2026-09-25\n\n* [ ] naprawione\n');
    const fixed = await pull(store, again.files, again.state, strict);
    expect(fixed.files[DAY]).toContain('naprawione');
    expect(fixed.state.blocked).toEqual({});
  });

  test('„Nadpisz moją wersją" zdejmuje blokadę', async () => {
    const { store, state } = await synced();
    store.put(DAY, 'ZEPSUTE');
    const r = await pull(store, base, state, strict);
    const o = await overwrite(
      store,
      r.files,
      r.state,
      { name: DAY, remote: await store.read(DAY), mine: base[DAY]! },
      strict,
    );
    expect(store.snapshot()[DAY]).toBe(base[DAY]);
    expect(o.state.blocked).toEqual({});
  });
});

describe('błędy magazynu', () => {
  test('przerwane wysyłanie zachowuje to, co zdążyło się udać', async () => {
    const { store, state } = await synced();
    const files = {
      ...base,
      'BACKLOG.md': '# Backlog\n\n* [ ] X\n',
      [DAY]: '# 2026-09-25\n\n* [x] A\n',
    };
    // Pierwszy zapis przechodzi, drugi trafia na brak sieci.
    let writes = 0;
    const failing: Store = {
      list: (since) => store.list(since),
      read: (n) => store.read(n),
      remove: (n, v) => store.remove(n, v),
      write: async (n, b, v) => {
        if (++writes === 2) throw new StoreError('offline', 'brak sieci');
        return store.write(n, b, v);
      },
    };
    const r = await push(failing, files, state, ok);
    expect(r.error?.kind).toBe('offline');
    expect(pending(files, r.state)).toBe(true);
    expect(Object.values(r.state.docs).length).toBe(3);
    // Po powrocie sieci zostaje do wysłania tylko to, co nie przeszło.
    const done = await push(store, files, r.state, ok);
    expect(done.error).toBeNull();
    expect(store.snapshot()).toEqual(files);
  });

  test('przerwane pobieranie zapomina znacznik spisu', async () => {
    const { store, state } = await synced();
    const first = await pull(store, base, state, ok);
    expect(first.state.mark).toBeDefined();
    store.failNext('auth');
    const r = await pull(store, base, first.state, ok);
    expect(r.error?.kind).toBe('auth');
    expect(r.state.mark).toBeUndefined();
  });

  test('limit przekazuje czas oczekiwania', async () => {
    const store = new MemoryStore();
    store.failNext('rate-limit');
    const r = await pull(store, base, emptySync(), ok);
    expect(r.error?.kind).toBe('rate-limit');
    expect(r.error?.retryAfter).toBe(1000);
  });
});

describe('pierwsze połączenie', () => {
  const remote: Files = {
    '.diurnus.toml': '[day]\nstart = 7\n',
    'BACKLOG.md': '# Backlog\n\n* [ ] zdalne\n',
    '2026-09-20.md': '# 2026-09-20\n\n* [x] X\n* Y\n',
    '2026-09-24.md': '# 2026-09-24\n\n* [x] Z\n',
    'README.md': 'nie dziennik',
  };

  test('pusty magazyn: dziennik z tego urządzenia idzie do magazynu', async () => {
    const store = new MemoryStore();
    const plan = await planFirst(store, base);
    expect(plan.kind).toBe('push');
    const r = await sendMine(store, base, plan.snapshot, ok);
    expect(store.snapshot()).toEqual(base);
    expect(pending(base, r.state)).toBe(false);
  });

  test('lokalnie pusto: dziennik z magazynu zastępuje lokalny', async () => {
    const store = new MemoryStore(remote);
    const empty = { '.diurnus.toml': 'x', 'BACKLOG.md': '# Backlog\n', [DAY]: '# 2026-09-25\n' };
    const plan = await planFirst(store, empty);
    expect(plan.kind).toBe('pull');
    const r = takeRemote(plan.snapshot, ok);
    expect(r.files).not.toHaveProperty('README.md');
    expect(r.files).not.toHaveProperty(DAY);
    expect(r.files['BACKLOG.md']).toContain('zdalne');
    expect(pending(r.files, r.state)).toBe(false);
    // Następne pobranie nie ma już nic do zrobienia.
    const reads = store.calls.read;
    await pull(store, r.files, r.state, ok);
    expect(store.calls.read).toBe(reads);
  });

  test('dane po obu stronach: pytanie z opisem obu dzienników', async () => {
    const store = new MemoryStore(remote);
    const plan = await planFirst(store, base);
    expect(plan.kind).toBe('ask');
    if (plan.kind !== 'ask') return;
    expect(plan.local).toEqual({ items: 1, first: '2026-09-25', last: '2026-09-25' });
    expect(plan.remote).toEqual({ items: 4, first: '2026-09-20', last: '2026-09-24' });
  });

  test('„Wyślij moje": magazyn staje się kopią tego urządzenia, obce pliki zostają', async () => {
    const store = new MemoryStore(remote);
    const plan = await planFirst(store, base);
    const r = await sendMine(store, base, plan.snapshot, ok);
    expect(r.conflicts).toEqual([]);
    expect(store.snapshot()).toEqual({ ...base, 'README.md': 'nie dziennik' });
  });

  test('magazyn z samymi ustawieniami, bez pozycji, nie jest „danymi" do pytania', async () => {
    const store = new MemoryStore({ '.diurnus.toml': '[day]\nstart = 7\n' });
    expect((await planFirst(store, base)).kind).toBe('push');
  });

  test('opis dziennika liczy pozycje i zakres dni', () => {
    expect(summarize(remote)).toEqual({ items: 4, first: '2026-09-20', last: '2026-09-24' });
    expect(summarize({})).toEqual({ items: 0, first: null, last: null });
  });
});

/* ───────────── Dwa urządzenia na prawdziwym formacie ───────────── */

describe('dwa urządzenia na plikach dziennika', () => {
  const TODAY = '2026-09-25';
  const hours = { q0: 24, q1: 88 };
  const acceptFiles: Accept = (files) => {
    const r = parseFiles(files);
    return r.ok ? true : r.errors.map((e) => `${e.file}:${e.line}: ${e.message}`);
  };
  const stateFrom = (files: Files): State => {
    const r = parseFiles(files);
    if (!r.ok) throw new Error('nieczytelne');
    return r.state;
  };
  const create = (s: State, id: string, text: string): State => {
    const r = step(
      { today: s.today, items: s.items },
      { type: 'create', id, text, place: 'today' },
      hours,
    );
    if (!r.ok) throw new Error(r.reason);
    return { ...s, items: [...r.machine.items] };
  };

  test('zmiana z jednego urządzenia pojawia się na drugim i odwrotnie', async () => {
    const store = new MemoryStore();
    // Urządzenie A zaczyna i wysyła.
    let a = create(normalize(null, TODAY), 'a1', 'Kupić chleb');
    let aSync: SyncState = (await push(store, renderFiles(a), emptySync(), acceptFiles)).state;

    // Urządzenie B łączy się pierwszy raz z pustym stanem.
    const b0 = normalize(null, TODAY);
    const plan = await planFirst(store, renderFiles(b0));
    expect(plan.kind).toBe('pull');
    const took = takeRemote(plan.snapshot, acceptFiles);
    let b = stateFrom(took.files);
    let bSync = took.state;
    expect(b.items.map((i) => i.text)).toEqual(['Kupić chleb']);

    // B dopisuje i wysyła; A pobiera.
    b = create(b, 'b1', 'Zadzwonić');
    bSync = (await push(store, renderFiles(b), bSync, acceptFiles)).state;
    const pulled = await pull(store, renderFiles(a), aSync, acceptFiles);
    expect(pulled.changed).toBe(true);
    a = stateFrom(pulled.files);
    aSync = pulled.state;
    expect(a.items.map((i) => i.text).sort()).toEqual(['Kupić chleb', 'Zadzwonić']);
    expect(pending(renderFiles(a), aSync)).toBe(false);

    // Popsuty ręcznie plik w magazynie nie psuje stanu.
    store.put(`${TODAY}.md`, `# ${TODAY}\n\nto nie jest pozycja\n`);
    const broken = await pull(store, renderFiles(a), aSync, acceptFiles);
    expect(broken.changed).toBe(false);
    expect(broken.rejected?.errors[0]).toMatch(new RegExp(`^${TODAY}\\.md:3:`));
    expect(stateFrom(broken.files).items).toHaveLength(2);
  });
});
