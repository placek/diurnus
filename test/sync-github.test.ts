import { test, expect, describe } from 'vitest';
import { GitHubStore, checkRepo, fromBase64, toBase64 } from '../src/lib/sync/github';
import type { GitHubConfig } from '../src/lib/sync/github';
import { MemoryStore } from '../src/lib/sync/memory';
import { StoreError } from '../src/lib/sync/store';
import type { Store } from '../src/lib/sync/store';
import {
  emptySync,
  overwrite,
  pending,
  planFirst,
  pull,
  push,
  takeRemote,
} from '../src/lib/sync/engine';
import type { Accept } from '../src/lib/sync/engine';
import { parseFiles, renderFiles } from '../src/lib/md/files';
import type { Files } from '../src/lib/md/files';
import { normalize } from '../src/lib/model';
import { step } from '../src/lib/machine';
import type { State } from '../src/lib/types';
import { FakeGitHub } from './fake-github';

const DAY = '2026-09-25.md';

const cfg = (gh: FakeGitHub, over: Partial<GitHubConfig> = {}): GitHubConfig => ({
  owner: gh.owner,
  repo: gh.repo,
  branch: 'main',
  dir: '',
  token: gh.token,
  ...over,
});

/* ───────────── Umowa magazynu: ta sama dla każdego adaptera ───────────── */

type Harness = { store: Store; external: (name: string, body: string | null) => void };

const harnesses: [string, () => Harness][] = [
  [
    'MemoryStore',
    () => {
      const m = new MemoryStore();
      return { store: m, external: (n, b) => m.put(n, b) };
    },
  ],
  [
    'GitHubStore',
    () => {
      const gh = new FakeGitHub({ 'README.md': 'repozytorium dziennika' });
      return { store: new GitHubStore(cfg(gh), gh.fetch), external: (n, b) => gh.put(n, b) };
    },
  ],
];

describe.each(harnesses)('umowa magazynu: %s', (_name, make) => {
  test('tworzenie, odczyt, zmiana na właściwej wersji, usunięcie', async () => {
    const { store } = make();
    const created = await store.write(DAY, '# 2026-09-25\n', null);
    expect(created.ok).toBe(true);
    const v1 = (created as { version: string }).version;
    expect(await store.read(DAY)).toEqual({ body: '# 2026-09-25\n', version: v1 });

    const updated = await store.write(DAY, '# 2026-09-25\n\n* [ ] A\n', v1);
    expect(updated.ok).toBe(true);
    const v2 = (updated as { version: string }).version;
    expect(v2).not.toBe(v1);

    const listing = await store.list();
    expect('docs' in listing && listing.docs.get(DAY)).toBe(v2);

    expect(await store.remove(DAY, v2)).toEqual({ ok: true, version: null });
    expect(await store.read(DAY)).toBeNull();
  });

  test('stara wersja, istniejący przy tworzeniu, zniknięty przy zmianie — konflikty', async () => {
    const { store, external } = make();
    const v1 = ((await store.write(DAY, 'a', null)) as { version: string }).version;
    external(DAY, 'b');
    const stale = await store.write(DAY, 'c', v1);
    expect(stale).toEqual({ ok: false, conflict: { body: 'b', version: expect.any(String) } });
    expect(await store.write(DAY, 'd', null)).toMatchObject({ ok: false, conflict: { body: 'b' } });
    expect(await store.remove(DAY, v1)).toMatchObject({ ok: false, conflict: { body: 'b' } });

    const cur = (await store.read(DAY))!.version;
    external(DAY, null);
    expect(await store.write(DAY, 'e', cur)).toEqual({ ok: false, conflict: null });
    expect(await store.remove(DAY, cur)).toEqual({ ok: false, conflict: null });
  });

  test('spis: znacznik bez zmian daje „bez zmian", zmiana z zewnątrz — nowy spis', async () => {
    const { store, external } = make();
    await store.write('BACKLOG.md', '# Backlog\n', null);
    const first = await store.list();
    if (!('docs' in first)) throw new Error('pierwszy spis nie może być „bez zmian"');
    expect([...first.docs.keys()]).toEqual(['BACKLOG.md']);
    expect(await store.list(first.mark)).toEqual({ unchanged: true });
    external(DAY, '# 2026-09-25\n');
    const second = await store.list(first.mark);
    expect('docs' in second && [...second.docs.keys()].sort()).toEqual([
      '2026-09-25.md',
      'BACKLOG.md',
    ]);
  });
});

/* ───────────── GitHub: szczegóły ───────────── */

describe('GitHubStore', () => {
  test('polskie znaki i emoji przechodzą przez base64 jako UTF-8', async () => {
    const gh = new FakeGitHub();
    const store = new GitHubStore(cfg(gh), gh.fetch);
    const text = '# 2026-09-25\n\n* [ ] Zażółć gęślą jaźń 🌱\n';
    await store.write(DAY, text, null);
    expect(gh.text(DAY)).toBe(text);
    expect(await store.read(DAY)).toMatchObject({ body: text });
    expect(fromBase64(toBase64(text))).toBe(text);
    // Duży dokument nie wysypuje się na limicie argumentów String.fromCharCode.
    const big = 'ą'.repeat(100_000);
    expect(fromBase64(toBase64(big))).toBe(big);
  });

  test('każde żądanie: token, wersja API i bez pamięci podręcznej przeglądarki', async () => {
    const gh = new FakeGitHub({ [DAY]: '# 2026-09-25\n' });
    const store = new GitHubStore(cfg(gh), gh.fetch);
    await store.list();
    await store.read(DAY);
    await store.write('BACKLOG.md', '# Backlog\n', null);
    for (const r of gh.log) {
      expect(r.headers['authorization']).toBe(`Bearer ${gh.token}`);
      expect(r.headers['x-github-api-version']).toBe('2022-11-28');
      expect(r.cache).toBe('no-store');
    }
    expect(gh.messages).toEqual(['diurnus: BACKLOG.md']);
  });

  test('spis idzie przez drzewo gałęzi, a sprawdzenie bez zmian to 304', async () => {
    const gh = new FakeGitHub({ [DAY]: 'x' });
    const store = new GitHubStore(cfg(gh), gh.fetch);
    const first = await store.list();
    const mark = (first as { mark: string }).mark;
    expect(await store.list(mark)).toEqual({ unchanged: true });
    expect(gh.log.map((r) => `${r.method} ${r.path} ${r.status}`)).toEqual([
      'GET /repos/ola/diurnus-data/git/trees/main?recursive=1 200',
      'GET /repos/ola/diurnus-data/git/trees/main?recursive=1 304',
    ]);
    expect(gh.log[1]!.headers['if-none-match']).toBe(mark);
  });

  test('katalog w repozytorium: tylko jego bezpośrednie dokumenty; inne pliki nie istnieją', async () => {
    const gh = new FakeGitHub({
      'README.md': 'o repozytorium',
      'diurnus/BACKLOG.md': '# Backlog\n',
      'diurnus/notatki.txt': 'obce',
      'diurnus/stare/2026-01-01.md': 'głębiej',
      '2026-09-24.md': 'poza katalogiem',
    });
    const store = new GitHubStore(cfg(gh, { dir: '/diurnus/' }), gh.fetch);
    const listing = await store.list();
    expect('docs' in listing && [...listing.docs.keys()]).toEqual(['BACKLOG.md']);
    await store.write(DAY, '# 2026-09-25\n', null);
    expect(gh.paths()).toContain('diurnus/2026-09-25.md');
    expect(await store.read('BACKLOG.md')).toMatchObject({ body: '# Backlog\n' });
  });

  test('puste repozytorium: pusty spis, a pierwszy zapis zakłada gałąź domyślną', async () => {
    const gh = new FakeGitHub();
    const store = new GitHubStore(cfg(gh), gh.fetch);
    expect(await store.list()).toEqual({ docs: new Map(), mark: '' });
    await store.write('BACKLOG.md', '# Backlog\n', null);
    await store.write(DAY, '# 2026-09-25\n', null);
    const puts = gh.log.filter((r) => r.method === 'PUT');
    expect(puts[0]!.body).not.toHaveProperty('branch');
    expect(puts[1]!.body).toMatchObject({ branch: 'main' });
    expect('docs' in (await store.list())).toBe(true);
  });

  test('błędy GitHuba zamieniają się w rodzaje błędów synchronizacji', async () => {
    const gh = new FakeGitHub({ [DAY]: 'x' });
    const store = new GitHubStore(cfg(gh), gh.fetch);
    const kind = async (p: Promise<unknown>) => {
      try {
        await p;
        return 'ok';
      } catch (e) {
        return e instanceof StoreError
          ? `${e.kind}${e.retryAfter ? `:${Math.round(e.retryAfter / 10_000)}` : ''}`
          : 'obcy';
      }
    };

    gh.offline = true;
    expect(await kind(store.list())).toBe('offline');
    gh.offline = false;

    expect(await kind(new GitHubStore({ ...cfg(gh), token: 'zły' }, gh.fetch).list())).toBe('auth');

    gh.readOnly = true;
    expect(await kind(store.write('BACKLOG.md', 'x', null))).toBe('auth');
    gh.readOnly = false;

    gh.rateLimited = true;
    expect(await kind(store.list())).toBe('rate-limit:3'); // ~30 s
    gh.rateLimited = false;

    gh.failWith = 500;
    expect(await kind(store.read(DAY))).toBe('other');

    gh.truncated = true;
    expect(await kind(store.list())).toBe('other');
    gh.truncated = false;

    gh.put('BACKLOG.md', 'x'.repeat(1_000_001));
    expect(await kind(store.read('BACKLOG.md'))).toBe('other');

    gh.putRaw('2026-09-24.md', new Uint8Array([0xff, 0xfe, 0x00]));
    expect(await kind(store.read('2026-09-24.md'))).toBe('other');
  });

  test('429 z Retry-After podaje czas oczekiwania', async () => {
    const store = new GitHubStore(
      { owner: 'o', repo: 'r', branch: 'main', dir: '', token: 't' },
      async () => new Response('{}', { status: 429, headers: { 'retry-after': '12' } }),
    );
    await expect(store.list()).rejects.toMatchObject({ kind: 'rate-limit', retryAfter: 12_000 });
  });

  test('zła gałąź wychodzi już przy spisie — zanim cokolwiek zostanie zapisane albo usunięte', async () => {
    const gh = new FakeGitHub({ [DAY]: 'x' });
    const wrong = new GitHubStore(cfg(gh, { branch: 'inna' }), gh.fetch);
    await expect(wrong.list()).rejects.toMatchObject({ kind: 'other' });
  });

  test('odmowa zapisu przy zgodnej wersji to błąd, nie konflikt', async () => {
    const gh = new FakeGitHub({ [DAY]: 'x' });
    // GitHub odrzuca zapis (np. walidacja), choć dokument i wersja są te same.
    const refusing: typeof fetch = (input, init) =>
      init?.method === 'PUT'
        ? Promise.resolve(new Response('{"message":"Invalid request."}', { status: 422 }))
        : gh.fetch(input, init);
    const store = new GitHubStore(cfg(gh), refusing);
    const v = (await store.read(DAY))!.version;
    await expect(store.write(DAY, 'y', v)).rejects.toMatchObject({ kind: 'other' });
  });
});

/* ───────────── Sprawdzenie repozytorium ───────────── */

describe('checkRepo', () => {
  test('prywatne z prawem zapisu — w porządku; publiczne, tylko do odczytu, organizacja — widać', async () => {
    const gh = new FakeGitHub();
    expect(await checkRepo(cfg(gh), gh.fetch)).toEqual({
      ok: true,
      private: true,
      canWrite: true,
      defaultBranch: 'main',
      organization: false,
    });
    gh.isPrivate = false;
    gh.readOnly = true;
    gh.organization = true;
    expect(await checkRepo(cfg(gh), gh.fetch)).toMatchObject({
      private: false,
      canWrite: false,
      organization: true,
    });
  });

  test('404 znaczy „nie istnieje albo brak dostępu"', async () => {
    const gh = new FakeGitHub();
    expect(await checkRepo({ ...cfg(gh), repo: 'cudze' }, gh.fetch)).toEqual({
      ok: false,
      reason: 'missing',
      message: 'Repozytorium nie istnieje albo token nie ma do niego dostępu',
    });
  });

  test('zły token, brak sieci', async () => {
    const gh = new FakeGitHub();
    expect(await checkRepo({ ...cfg(gh), token: 'zły' }, gh.fetch)).toMatchObject({
      ok: false,
      reason: 'auth',
    });
    gh.offline = true;
    expect(await checkRepo(cfg(gh), gh.fetch)).toMatchObject({ ok: false, reason: 'offline' });
  });
});

/* ───────────── Synchronizacja przez GitHuba ───────────── */

describe('synchronizacja przez GitHuba', () => {
  const TODAY = '2026-09-25';
  const hours = { q0: 24, q1: 88 };
  const accept: Accept = (files) => {
    const r = parseFiles(files);
    return r.ok ? true : r.errors.map((e) => `${e.file}:${e.line}: ${e.message}`);
  };
  const stateOf = (files: Files): State => {
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

  test('dwa urządzenia na jednym repozytorium; konflikt kończy się wersją GitHuba i „Nadpisz"', async () => {
    const gh = new FakeGitHub({ 'README.md': 'mój dziennik' });
    const storeA = new GitHubStore(cfg(gh), gh.fetch);
    const storeB = new GitHubStore(cfg(gh), gh.fetch);

    // A zaczyna; repozytorium ma tylko README, więc dziennik idzie do niego.
    let a = create(normalize(null, TODAY), 'a1', 'Kupić chleb');
    const planA = await planFirst(storeA, renderFiles(a));
    expect(planA.kind).toBe('push');
    let aSync = (await push(storeA, renderFiles(a), emptySync(), accept)).state;
    expect(gh.paths()).toEqual(['.diurnus.toml', `${TODAY}.md`, 'BACKLOG.md', 'README.md']);

    // B łączy się z pustym stanem i dostaje dziennik A.
    const planB = await planFirst(storeB, renderFiles(normalize(null, TODAY)));
    expect(planB.kind).toBe('pull');
    const took = takeRemote(planB.snapshot, accept);
    let b = stateOf(took.files);
    let bSync = took.state;
    expect(b.items.map((i) => i.text)).toEqual(['Kupić chleb']);

    // Sprawdzenie bez zmian to jedno żądanie z odpowiedzią 304.
    const before = gh.log.length;
    const idle = await pull(storeB, renderFiles(b), bSync, accept);
    expect(gh.log.slice(before).map((r) => r.status)).toEqual([304]);
    bSync = idle.state;

    // Oba zmieniają ten sam dzień; B wysyła pierwszy, A przegrywa.
    b = create(b, 'b1', 'Zadzwonić');
    bSync = (await push(storeB, renderFiles(b), bSync, accept)).state;
    a = create(a, 'a2', 'Podlać kwiaty');
    const lost = await push(storeA, renderFiles(a), aSync, accept);
    expect(lost.conflicts.map((c) => c.name)).toEqual([`${TODAY}.md`]);
    a = stateOf(lost.files);
    aSync = lost.state;
    expect(a.items.map((i) => i.text).sort()).toEqual(['Kupić chleb', 'Zadzwonić']);

    // „Nadpisz moją wersją" przywraca wersję A w GitHubie i w stanie.
    const o = await overwrite(storeA, lost.files, aSync, lost.conflicts[0]!, accept);
    a = stateOf(o.files);
    aSync = o.state;
    expect(a.items.map((i) => i.text).sort()).toEqual(['Kupić chleb', 'Podlać kwiaty']);
    expect(gh.text(`${TODAY}.md`)).toContain('Podlać kwiaty');
    expect(pending(renderFiles(a), aSync)).toBe(false);

    // B pobiera wynik; README zostaje nietknięte przez cały czas.
    const bPull = await pull(storeB, renderFiles(b), bSync, accept);
    expect(
      stateOf(bPull.files)
        .items.map((i) => i.text)
        .sort(),
    ).toEqual(['Kupić chleb', 'Podlać kwiaty']);
    expect(gh.text('README.md')).toBe('mój dziennik');
    expect(gh.messages.every((m) => m.startsWith('diurnus: '))).toBe(true);
  });
});
