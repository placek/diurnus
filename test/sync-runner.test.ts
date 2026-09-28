import { test, expect, describe, beforeEach, afterEach, vi } from 'vitest';
import { emptySync, push } from '../src/lib/sync/engine';
import type { Accept, SyncState } from '../src/lib/sync/engine';
import { MemoryStore } from '../src/lib/sync/memory';
import { PULL_EVERY, PUSH_DELAY, RETRY_FIRST, RETRY_MAX, SyncRunner } from '../src/lib/sync/runner';
import type { SyncStatus } from '../src/lib/sync/runner';
import type { Store } from '../src/lib/sync/store';
import type { Files } from '../src/lib/md/files';

/*
 * Zegar synchronizacji na magazynie w pamięci i udawanym czasie. „Aplikacja"
 * to tu zmienna z dokumentami: `apply` ją zastępuje i — jak zapis stanu
 * w prawdziwej aplikacji — zgłasza zmianę.
 */

const DAY = '2026-09-25.md';
const base: Files = {
  '.diurnus.toml': '[day]\nstart = 6\n',
  'BACKLOG.md': '# Backlog\n',
  [DAY]: '# 2026-09-25\n\n* [ ] A\n',
};

/** Przyjmuje wszystko poza dokumentem oznaczonym jako popsuty. */
const strict: Accept = (files) => {
  const bad = Object.entries(files).filter(([, b]) => b.includes('ZEPSUTE'));
  return bad.length ? bad.map(([n]) => `${n}:1: popsute`) : true;
};

/** Magazyn, którego operacje czekają, aż test je puści. */
class GatedStore implements Store {
  private gate: Promise<void> | null = null;
  private open: (() => void) | null = null;
  constructor(readonly inner: MemoryStore) {}
  hold(): void {
    this.gate = new Promise((res) => (this.open = res));
  }
  release(): void {
    this.open?.();
    this.gate = null;
  }
  private async wait() {
    if (this.gate) await this.gate;
  }
  async list(since?: string) {
    await this.wait();
    return this.inner.list(since);
  }
  async read(name: string) {
    await this.wait();
    return this.inner.read(name);
  }
  async write(name: string, body: string, b: string | null) {
    await this.wait();
    return this.inner.write(name, body, b);
  }
  async remove(name: string, b: string) {
    await this.wait();
    return this.inner.remove(name, b);
  }
}

interface Rig {
  store: MemoryStore;
  runner: SyncRunner;
  files: Files;
  st: SyncState;
  status: SyncStatus;
  notes: string[];
  applied: number;
  edit(name: string, body: string | null): void;
  settle(): Promise<void>;
}

async function rig(
  opts: { store?: MemoryStore; wrap?: (s: MemoryStore) => Store; fresh?: boolean } = {},
) {
  const store = opts.store ?? new MemoryStore();
  let st = emptySync();
  if (!opts.fresh) st = (await push(store, base, emptySync(), strict)).state;
  const r: Rig = {
    store,
    files: { ...base },
    st,
    status: null as unknown as SyncStatus,
    notes: [],
    applied: 0,
    runner: null as unknown as SyncRunner,
    edit(name, body) {
      r.files = { ...r.files };
      if (body === null) delete r.files[name];
      else r.files[name] = body;
      r.runner.changed();
    },
    async settle() {
      await vi.advanceTimersByTimeAsync(0);
      await r.runner.idle();
    },
  };
  r.runner = new SyncRunner({
    store: opts.wrap ? opts.wrap(store) : store,
    files: () => r.files,
    accept: strict,
    apply: (f) => {
      r.applied++;
      r.files = f;
      r.runner.changed();
    },
    load: () => r.st,
    save: (s) => (r.st = s),
    onStatus: (s) => (r.status = s),
    notify: (m) => r.notes.push(JSON.stringify(m)),
  });
  store.calls.list = store.calls.read = store.calls.write = store.calls.remove = 0;
  return r;
}

const v2 = '# 2026-09-25\n\n* [ ] A\n* [ ] B\n';
const v3 = '# 2026-09-25\n\n* [ ] A\n* [ ] B\n* [ ] C\n';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('wysyłanie po chwili ciszy', () => {
  test('seria edycji daje jeden zapis, 2 s po ostatniej', async () => {
    const r = await rig();
    r.edit(DAY, v2);
    expect(r.status.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(PUSH_DELAY - 500);
    r.edit(DAY, v3);
    await vi.advanceTimersByTimeAsync(PUSH_DELAY - 500);
    expect(r.store.calls.write).toBe(0);
    await vi.advanceTimersByTimeAsync(500);
    await r.settle();
    expect(r.store.calls.write).toBe(1);
    expect(r.store.snapshot()[DAY]).toBe(v3);
    expect(r.status).toMatchObject({ phase: 'idle', pending: false, message: null });
    expect(r.status.at).toBe(Date.now());
  });

  test('bez zmian nie ma rozmowy z magazynem', async () => {
    const r = await rig();
    r.runner.changed();
    await vi.advanceTimersByTimeAsync(PUSH_DELAY);
    await r.settle();
    expect(r.store.calls).toEqual({ list: 0, read: 0, write: 0, remove: 0 });
    expect(r.status?.phase ?? 'idle').toBe('idle');
  });

  test('„flush" wysyła od razu (karta chowa się w tle)', async () => {
    const r = await rig();
    r.edit(DAY, v2);
    r.runner.flush();
    await r.settle();
    expect(r.store.snapshot()[DAY]).toBe(v2);
    // Zaplanowane wysłanie nie powtarza zapisu.
    await vi.advanceTimersByTimeAsync(PUSH_DELAY);
    await r.settle();
    expect(r.store.calls.write).toBe(1);
  });

  test('usunięty dokument znika z magazynu', async () => {
    const r = await rig();
    r.edit('BACKLOG.md', null);
    await vi.advanceTimersByTimeAsync(PUSH_DELAY);
    await r.settle();
    expect(r.store.snapshot()).not.toHaveProperty('BACKLOG.md');
  });
});

describe('pobieranie', () => {
  test('zmiana z magazynu wchodzi do stanu; bez zmian — jedno tanie żądanie spisu', async () => {
    const r = await rig();
    r.runner.pull();
    await r.settle();
    expect(r.store.calls).toEqual({ list: 1, read: 0, write: 0, remove: 0 });
    expect(r.applied).toBe(0);

    r.store.put(DAY, v2);
    r.runner.pull();
    await r.settle();
    expect(r.files[DAY]).toBe(v2);
    expect(r.applied).toBe(1);
    // Wejście do stanu to zmiana stanu, ale nie ma czego wysyłać.
    await vi.advanceTimersByTimeAsync(PUSH_DELAY);
    await r.settle();
    expect(r.store.calls.write).toBe(0);
    expect(r.status.pending).toBe(false);
  });

  test('po pobraniu od razu idzie to, co czekało lokalnie', async () => {
    const r = await rig();
    r.store.put('BACKLOG.md', '# Backlog\n\n* [ ] z telefonu\n');
    r.edit(DAY, v2);
    r.runner.pull();
    await r.settle();
    expect(r.files['BACKLOG.md']).toContain('z telefonu');
    expect(r.store.snapshot()[DAY]).toBe(v2);
    expect(r.status.pending).toBe(false);
  });

  test('jedna operacja naraz; prośba w trakcie idzie następną turą', async () => {
    let gated!: GatedStore;
    const r = await rig({ wrap: (s) => (gated = new GatedStore(s)) });
    gated.hold();
    r.edit(DAY, v2);
    r.runner.flush();
    await vi.advanceTimersByTimeAsync(0);
    r.store.put('BACKLOG.md', '# Backlog\n\n* [ ] nowe\n');
    r.runner.pull();
    r.runner.pull();
    await vi.advanceTimersByTimeAsync(0);
    expect(r.store.calls.list).toBe(0);
    expect(r.status.phase).toBe('busy');
    gated.release();
    await r.settle();
    expect(r.store.calls.write).toBe(1);
    expect(r.store.calls.list).toBe(1);
    expect(r.files['BACKLOG.md']).toContain('nowe');
  });

  test('edycja w trakcie pobrania zostaje; dokument z magazynu wchodzi na bieżący stan', async () => {
    let gated!: GatedStore;
    const r = await rig({ wrap: (s) => (gated = new GatedStore(s)) });
    r.store.put('BACKLOG.md', '# Backlog\n\n* [ ] z telefonu\n');
    gated.hold();
    r.runner.pull();
    await vi.advanceTimersByTimeAsync(0);
    r.edit(DAY, v2); // w czasie rozmowy z magazynem
    gated.release();
    await r.settle();
    expect(r.files['BACKLOG.md']).toContain('z telefonu');
    expect(r.files[DAY]).toBe(v2);
    await vi.advanceTimersByTimeAsync(PUSH_DELAY);
    await r.settle();
    expect(r.store.snapshot()[DAY]).toBe(v2);
    expect(r.status.conflicts).toEqual([]);
  });

  test('edycja tego samego dokumentu w trakcie pobrania przegrywa jak konflikt', async () => {
    let gated!: GatedStore;
    const r = await rig({ wrap: (s) => (gated = new GatedStore(s)) });
    r.store.put(DAY, v2);
    gated.hold();
    r.runner.pull();
    await vi.advanceTimersByTimeAsync(0);
    r.edit(DAY, v3);
    gated.release();
    await r.settle();
    expect(r.files[DAY]).toBe(v2);
    expect(r.status.conflicts).toEqual([
      { name: DAY, remote: { body: v2, version: expect.any(String) }, mine: v3 },
    ]);
    await vi.advanceTimersByTimeAsync(PUSH_DELAY);
    await r.settle();
    // Magazyn wygrał i nic nie nadpisało jego wersji.
    expect(r.store.snapshot()[DAY]).toBe(v2);
  });
  test('gdy dokument z magazynu nie pasuje do stanu zmienionego w trakcie, nic nie wchodzi, a pobranie ocenia go od nowa', async () => {
    let gated!: GatedStore;
    const r = await rig({ wrap: (s) => (gated = new GatedStore(s)) });
    r.store.put('BACKLOG.md', '# Backlog\n\n* [ ] z telefonu\n');
    gated.hold();
    r.runner.pull();
    await vi.advanceTimersByTimeAsync(0);
    // „Stan", z którym dokument z magazynu się nie składa (tu: znacznik dla `strict`).
    r.edit(DAY, '# 2026-09-25\n\nZEPSUTE\n');
    gated.release();
    await r.settle();
    expect(r.applied).toBe(0);
    expect(r.files['BACKLOG.md']).toBe(base['BACKLOG.md']);
    // Drugie pobranie ocenia backlog na bieżącym stanie i blokuje go jak każdy nieprzyjęty dokument.
    expect(r.st.blocked).toHaveProperty('BACKLOG.md');
    expect(r.status.rejected?.names).toEqual(['BACKLOG.md']);
  });
});

describe('konflikty', () => {
  test('wygrywa magazyn; komunikat; „Nadpisz moją wersją" przywraca swoją', async () => {
    const r = await rig();
    r.store.put(DAY, v2);
    r.edit(DAY, v3);
    await vi.advanceTimersByTimeAsync(PUSH_DELAY);
    await r.settle();
    expect(r.files[DAY]).toBe(v2);
    expect(r.status.conflicts.map((c) => [c.name, c.mine])).toEqual([[DAY, v3]]);
    expect(r.notes.at(-1)).toContain(DAY);

    await r.runner.overwrite(r.status.conflicts[0]!);
    await r.settle();
    expect(r.store.snapshot()[DAY]).toBe(v3);
    expect(r.files[DAY]).toBe(v3);
    expect(r.status.conflicts).toEqual([]);
    expect(r.status.pending).toBe(false);
  });

  test('„zostaw ich wersję" zamyka konflikt bez zapisu', async () => {
    const r = await rig();
    r.store.put(DAY, v2);
    r.edit(DAY, v3);
    await vi.advanceTimersByTimeAsync(PUSH_DELAY);
    await r.settle();
    const writes = r.store.calls.write;
    r.runner.dismiss(DAY);
    expect(r.status.conflicts).toEqual([]);
    await vi.advanceTimersByTimeAsync(PUSH_DELAY);
    await r.settle();
    expect(r.store.calls.write).toBe(writes);
  });

  test('popsuty dokument w magazynie nie wchodzi i nie jest pobierany od nowa', async () => {
    const r = await rig();
    r.store.put(DAY, '# 2026-09-25\n\nZEPSUTE\n');
    r.runner.pull();
    await r.settle();
    expect(r.files[DAY]).toBe(base[DAY]);
    expect(r.status.rejected).toEqual({ names: [DAY], errors: [`${DAY}:1: popsute`] });
    expect(r.notes.at(-1)).toContain('popsute');

    r.store.put('BACKLOG.md', '# Backlog\n\n* [ ] X\n');
    const reads = r.store.calls.read;
    r.runner.pull();
    await r.settle();
    expect(r.store.calls.read).toBe(reads + 1); // tylko backlog
    expect(r.status.rejected).not.toBeNull();

    // Ktoś poprawił dokument — wchodzi, a odrzucenie znika.
    r.store.put(DAY, v2);
    r.runner.pull();
    await r.settle();
    expect(r.files[DAY]).toBe(v2);
    expect(r.status.rejected).toBeNull();
  });
});

describe('bez sieci i błędy', () => {
  test('brak sieci: zmiany czekają, ponowienia co 5 s, 10 s, 20 s…', async () => {
    const r = await rig();
    r.store.failNext('offline', 'offline', 'offline');
    r.edit(DAY, v2);
    await vi.advanceTimersByTimeAsync(PUSH_DELAY);
    await r.settle();
    expect(r.status).toMatchObject({ phase: 'offline', pending: true });
    expect(r.status.retryAt).toBe(Date.now() + RETRY_FIRST);

    // Edycja w czasie przerwy nie przyspiesza prób.
    r.edit(DAY, v3);
    await vi.advanceTimersByTimeAsync(PUSH_DELAY);
    expect(r.store.calls.write).toBe(1);

    await vi.advanceTimersByTimeAsync(RETRY_FIRST - PUSH_DELAY);
    await r.settle();
    expect(r.store.calls.write).toBe(2);
    expect(r.status.retryAt).toBe(Date.now() + 2 * RETRY_FIRST);
    await vi.advanceTimersByTimeAsync(2 * RETRY_FIRST);
    await r.settle();
    expect(r.status.retryAt).toBe(Date.now() + 4 * RETRY_FIRST);
    await vi.advanceTimersByTimeAsync(4 * RETRY_FIRST);
    await r.settle();
    expect(r.status).toMatchObject({ phase: 'idle', pending: false, retryAt: null });
    expect(r.store.snapshot()[DAY]).toBe(v3);
  });

  test('odstęp rośnie najwyżej do 5 minut', async () => {
    const r = await rig();
    r.store.failNext(...Array<'offline'>(12).fill('offline'));
    r.runner.pull();
    await r.settle();
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(r.status.retryAt! - Date.now());
      await r.settle();
    }
    expect(r.status.retryAt! - Date.now()).toBe(RETRY_MAX);
  });

  test('powrót sieci: próba od razu, a nieudane pobranie jest powtarzane', async () => {
    const r = await rig();
    r.store.failNext('offline');
    r.store.put(DAY, v2);
    r.runner.pull();
    await r.settle();
    expect(r.status.phase).toBe('offline');
    r.runner.online();
    await r.settle();
    expect(r.files[DAY]).toBe(v2);
    expect(r.status.phase).toBe('idle');
  });

  test('token bez dostępu: synchronizacja staje, dane lokalne zostają', async () => {
    const r = await rig();
    r.store.failNext('auth');
    r.edit(DAY, v2);
    await vi.advanceTimersByTimeAsync(PUSH_DELAY);
    await r.settle();
    expect(r.status).toMatchObject({ phase: 'auth', pending: true, retryAt: null });
    const calls = { ...r.store.calls };
    r.edit(DAY, v3);
    r.runner.pull();
    r.runner.online();
    await vi.advanceTimersByTimeAsync(RETRY_MAX);
    await r.settle();
    expect(r.store.calls).toEqual(calls);
    expect(r.files[DAY]).toBe(v3);
  });

  test('limit: czekanie tyle, ile każe magazyn — powrót sieci go nie skraca', async () => {
    const r = await rig();
    r.store.failNext('rate-limit'); // MemoryStore: 1 s
    r.edit(DAY, v2);
    await vi.advanceTimersByTimeAsync(PUSH_DELAY);
    await r.settle();
    expect(r.status.phase).toBe('rate-limit');
    r.runner.online();
    await r.settle();
    expect(r.store.calls.write).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    await r.settle();
    expect(r.store.snapshot()[DAY]).toBe(v2);
    expect(r.status.phase).toBe('idle');
  });

  test('zatrzymany runner nic już nie robi', async () => {
    const r = await rig();
    r.edit(DAY, v2);
    r.runner.stop();
    await vi.advanceTimersByTimeAsync(PULL_EVERY);
    await r.settle();
    expect(r.store.calls.write).toBe(0);
  });
});
