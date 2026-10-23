import { StoreError, isAnyDocName } from './store';
import type { Change, CommitResult, Listing, Store, Version, WriteResult } from './store';

/*
 * Magazyn dziennika w repozytorium GitHub (projekt synchronizacji, §5).
 * Rozmowa wprost z API GitHuba z przeglądarki, z tokenem fine-grained
 * ograniczonym do jednego repozytorium i uprawnienia Contents: read and write.
 *
 * - Spis przez drzewo gałęzi (Git Trees API): wszystkie pliki jednym żądaniem;
 *   lista katalogu w API treści urywa się na 1000 plikach. Z `If-None-Match`
 *   odpowiedź „bez zmian" (304) nie liczy się do limitu żądań.
 * - Odczyt, zapis i usunięcie przez API treści; wersją jest `sha` bloba.
 *   Zapis na starej wersji GitHub odrzuca — to jest nasz konflikt.
 * - Wiele zmian jednym commitem przez API danych gita: drzewo na drzewie
 *   bieżącego commita, commit, przesunięcie gałęzi bez wymuszania. Gałąź,
 *   która przesunęła się w międzyczasie, odrzuca przesunięcie — nic nie wchodzi.
 * - Chwila ostatniej zmiany to data ostatniego commita gałęzi (w katalogu
 *   dziennika). Pobierana tylko wtedy, gdy drzewo się zmieniło, a przy własnym
 *   zapisie — z odpowiedzi na zapis. Jej brak niczego nie psuje: służy tylko
 *   do pokazania.
 * - Każde żądanie z `cache: 'no-store'`: odpowiedzi GitHuba pozwalają
 *   przeglądarce trzymać je minutę, a stary spis ukryłby zmianę z innego
 *   urządzenia. Warunkowość spisu robimy sami, przez ETag.
 */

export interface GitHubConfig {
  owner: string;
  repo: string;
  /** gałąź z dziennikiem; zwykle domyślna gałąź repozytorium */
  branch: string;
  /** katalog w repozytorium; `''` — korzeń */
  dir: string;
  token: string;
}

type Fetch = typeof fetch;

const API = 'https://api.github.com';
const API_VERSION = '2022-11-28';

/* ───────────── Tekst ↔ base64 (UTF-8) ───────────── */

export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\s+/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new StoreError('other', 'dokument w repozytorium nie jest tekstem UTF-8');
  }
}

/** Data z API (ISO 8601) w milisekundach; `undefined`, gdy jej nie ma albo jest zła. */
function dateOf(s: string | undefined): number | undefined {
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t : undefined;
}

/* ───────────── Żądania ───────────── */

/** Odpowiedź GitHuba zamieniona na błąd synchronizacji, jeśli nim jest. */
async function failure(res: Response): Promise<StoreError> {
  let message = `GitHub odpowiedział ${res.status}`;
  try {
    const body = (await res.clone().json()) as { message?: string };
    if (body?.message) message += `: ${body.message}`;
  } catch {
    // treść nie była JSON-em — zostaje sam kod
  }
  if (res.status === 401) return new StoreError('auth', message);
  const remaining = res.headers.get('x-ratelimit-remaining');
  const retryAfter = res.headers.get('retry-after');
  if (res.status === 429 || (res.status === 403 && (remaining === '0' || retryAfter !== null))) {
    let wait = 60_000;
    if (retryAfter !== null) wait = Number(retryAfter) * 1000;
    else {
      const reset = Number(res.headers.get('x-ratelimit-reset'));
      if (reset) wait = Math.max(1000, reset * 1000 - Date.now());
    }
    return new StoreError('rate-limit', message, wait);
  }
  // 403 bez wyczerpanego limitu to token bez uprawnień (np. tylko do odczytu).
  if (res.status === 403) return new StoreError('auth', message);
  return new StoreError('other', message);
}

export class GitHubStore implements Store {
  private readonly fetch: Fetch;
  /** Repozytorium bez żadnego commita — nie ma jeszcze gałęzi. */
  private empty = false;

  constructor(
    private readonly cfg: GitHubConfig,
    fetchImpl?: Fetch,
  ) {
    this.fetch = fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  }

  private get base(): string {
    return `${API}/repos/${encodeURIComponent(this.cfg.owner)}/${encodeURIComponent(this.cfg.repo)}`;
  }

  private get prefix(): string {
    const d = this.cfg.dir.replace(/^\/+|\/+$/g, '');
    return d ? `${d}/` : '';
  }

  private contentsUrl(name: string): string {
    const path = (this.prefix + name).split('/').map(encodeURIComponent).join('/');
    return `${this.base}/contents/${path}`;
  }

  private async request(url: string, init: RequestInit = {}, extra: Record<string, string> = {}) {
    try {
      return await this.fetch(url, {
        ...init,
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.cfg.token}`,
          'X-GitHub-Api-Version': API_VERSION,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...extra,
        },
      });
    } catch (e) {
      // fetch odrzuca obietnicę tylko przy braku połączenia (albo CORS).
      throw new StoreError('offline', e instanceof Error ? e.message : 'brak połączenia');
    }
  }

  async list(since?: string): Promise<Listing> {
    const url = `${this.base}/git/trees/${encodeURIComponent(this.cfg.branch)}?recursive=1`;
    const res = await this.request(url, {}, since ? { 'If-None-Match': since } : {});
    if (res.status === 304) return { unchanged: true };
    // Puste repozytorium nie ma drzewa — dziennik jest pusty, a pierwszy zapis je założy.
    if (res.status === 409) {
      this.empty = true;
      return { docs: new Map(), mark: '' };
    }
    if (!res.ok) throw await failure(res);
    this.empty = false;
    const body = (await res.json()) as {
      tree: { path: string; type: string; sha: string }[];
      truncated?: boolean;
    };
    if (body.truncated)
      throw new StoreError('other', 'repozytorium ma za dużo plików, by je spisać');
    const docs = new Map<string, Version>();
    for (const e of body.tree) {
      if (e.type !== 'blob' || !e.path.startsWith(this.prefix)) continue;
      const name = e.path.slice(this.prefix.length);
      if (!name.includes('/') && isAnyDocName(name)) docs.set(name, e.sha);
    }
    const at = await this.lastCommitAt();
    return { docs, mark: res.headers.get('etag') ?? '', ...(at !== undefined ? { at } : {}) };
  }

  /** Data ostatniego commita gałęzi, który dotknął katalogu dziennika; `undefined`, gdy się nie da. */
  private async lastCommitAt(): Promise<number | undefined> {
    const dir = this.prefix.replace(/\/$/, '');
    const q = `sha=${encodeURIComponent(this.cfg.branch)}&per_page=1${dir ? `&path=${encodeURIComponent(dir)}` : ''}`;
    try {
      const res = await this.request(`${this.base}/commits?${q}`);
      if (!res.ok) return undefined;
      const list = (await res.json()) as { commit?: { committer?: { date?: string } } }[];
      return dateOf(list[0]?.commit?.committer?.date);
    } catch {
      return undefined;
    }
  }

  async read(name: string): Promise<{ body: string; version: Version } | null> {
    const url = `${this.contentsUrl(name)}?ref=${encodeURIComponent(this.cfg.branch)}`;
    const res = await this.request(url);
    if (res.status === 404) return null;
    if (!res.ok) throw await failure(res);
    const f = (await res.json()) as {
      type: string;
      encoding?: string;
      content?: string;
      sha: string;
    };
    if (f.type !== 'file') return null;
    // Powyżej 1 MB API treści nie oddaje zawartości — dziennik tak duży nie bywa.
    if (f.encoding !== 'base64' || f.content === undefined)
      throw new StoreError('other', `${name}: dokument za duży do odczytu`);
    return { body: fromBase64(f.content), version: f.sha };
  }

  /** Odmowa zapisu albo usunięcia: bieżący dokument jako konflikt — albo prawdziwy błąd. */
  private async conflict(name: string, base: Version | null, res: Response): Promise<WriteResult> {
    const cur = await this.read(name);
    if (cur && cur.version !== base) return { ok: false, conflict: cur };
    if (!cur && base !== null) return { ok: false, conflict: null };
    // Wersja się zgadza, a GitHub i tak odmówił — to nie spór o wersję.
    throw await failure(res);
  }

  async write(name: string, body: string, base: Version | null): Promise<WriteResult> {
    const res = await this.request(this.contentsUrl(name), {
      method: 'PUT',
      body: JSON.stringify({
        message: `diurnus: ${name}`,
        content: toBase64(body),
        // Pierwszy commit pustego repozytorium idzie na jego domyślną gałąź.
        ...(this.empty ? {} : { branch: this.cfg.branch }),
        ...(base !== null ? { sha: base } : {}),
      }),
    });
    if (res.ok) {
      this.empty = false;
      const out = (await res.json()) as {
        content: { sha: string };
        commit?: { committer?: { date?: string } };
      };
      const at = dateOf(out.commit?.committer?.date);
      return { ok: true, version: out.content.sha, ...(at !== undefined ? { at } : {}) };
    }
    if (res.status === 409 || res.status === 422 || res.status === 404)
      return this.conflict(name, base, res);
    throw await failure(res);
  }

  async remove(name: string, base: Version): Promise<WriteResult> {
    const res = await this.request(this.contentsUrl(name), {
      method: 'DELETE',
      body: JSON.stringify({
        message: `diurnus: usuń ${name}`,
        sha: base,
        branch: this.cfg.branch,
      }),
    });
    if (res.ok) {
      let at: number | undefined;
      try {
        const out = (await res.json()) as { commit?: { committer?: { date?: string } } };
        at = dateOf(out.commit?.committer?.date);
      } catch {
        // odpowiedź bez treści — chwila zapisu nieznana
      }
      return { ok: true, version: null, ...(at !== undefined ? { at } : {}) };
    }
    if (res.status === 404) return { ok: false, conflict: null };
    if (res.status === 409 || res.status === 422) return this.conflict(name, base, res);
    throw await failure(res);
  }

  private async getJson<T>(url: string): Promise<T> {
    const res = await this.request(url);
    if (!res.ok) throw await failure(res);
    return (await res.json()) as T;
  }

  private async postJson<T>(url: string, body: unknown, method = 'POST'): Promise<Response> {
    return this.request(url, { method, body: JSON.stringify(body) });
  }

  /** Bloby drzewa (rekurencyjnie): ścieżka → `sha`. */
  private async blobs(tree: string): Promise<Map<string, Version>> {
    const t = await this.getJson<{ tree: { path: string; type: string; sha: string }[] }>(
      `${this.base}/git/trees/${encodeURIComponent(tree)}?recursive=1`,
    );
    return new Map(t.tree.filter((e) => e.type === 'blob').map((e) => [e.path, e.sha]));
  }

  async commit(changes: Change[], message: string): Promise<CommitResult> {
    const ref = `${this.base}/git/ref/heads/${this.cfg.branch.split('/').map(encodeURIComponent).join('/')}`;
    const head = await this.request(ref);
    // Bez gałęzi (puste repozytorium) nie ma na czym budować — tak jakby się zmieniło.
    if (head.status === 404 || head.status === 409) return { ok: false, moved: true };
    if (!head.ok) throw await failure(head);
    const parent = ((await head.json()) as { object: { sha: string } }).object.sha;
    const cur = await this.getJson<{ tree: { sha: string } }>(
      `${this.base}/git/commits/${encodeURIComponent(parent)}`,
    );

    // Wersje, na których stoją zmiany, muszą być tymi w bieżącym commicie.
    const before = await this.blobs(cur.tree.sha);
    for (const c of changes)
      if ((before.get(this.prefix + c.name) ?? null) !== c.base) return { ok: false, moved: true };

    const tree = await this.postJson(`${this.base}/git/trees`, {
      base_tree: cur.tree.sha,
      tree: changes.map((c) => ({
        path: this.prefix + c.name,
        mode: '100644',
        type: 'blob',
        ...(c.body === null ? { sha: null } : { content: c.body }),
      })),
    });
    if (!tree.ok) throw await failure(tree);
    const treeSha = ((await tree.json()) as { sha: string }).sha;

    const made = await this.postJson(`${this.base}/git/commits`, {
      message,
      tree: treeSha,
      parents: [parent],
    });
    if (!made.ok) throw await failure(made);
    const commit = (await made.json()) as { sha: string; committer?: { date?: string } };

    const moved = await this.postJson(
      ref.replace('/git/ref/', '/git/refs/'),
      { sha: commit.sha, force: false },
      'PATCH',
    );
    // 422 — to nie jest przewinięcie do przodu: ktoś zdążył przed nami.
    if (moved.status === 422 || moved.status === 409) return { ok: false, moved: true };
    if (!moved.ok) throw await failure(moved);

    // Wersje nowych dokumentów z nowego drzewa — tego samego, które weszło.
    const after = await this.blobs(treeSha);
    const versions: Record<string, Version> = {};
    for (const c of changes)
      if (c.body !== null) versions[c.name] = after.get(this.prefix + c.name)!;
    const at = dateOf(commit.committer?.date);
    return { ok: true, versions, ...(at !== undefined ? { at } : {}) };
  }
}

/* ───────────── Sprawdzenie przy „Połącz" ───────────── */

/**
 * Repozytorium z tego, co wpisał użytkownik: `właściciel/nazwa` albo adres
 * repozytorium na github.com (także skopiowany z paska adresu czy do klonowania).
 */
export function parseRepo(input: string): { owner: string; repo: string } | null {
  const s = input
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
  const m = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})(?:\/.*)?$/.exec(s);
  if (!m || m[2] === '.' || m[2] === '..') return null;
  return { owner: m[1]!, repo: m[2]! };
}

export type RepoCheck =
  | {
      ok: true;
      private: boolean;
      canWrite: boolean;
      defaultBranch: string;
      /** właściciel to organizacja — może wymagać zatwierdzenia tokenu */
      organization: boolean;
      /** data wygaśnięcia tokenu (RRRR-MM-DD), jeśli GitHub ją podał */
      expires: string | null;
    }
  | {
      ok: false;
      /** `missing` — repozytorium nie istnieje albo token nie ma do niego dostępu */
      reason: 'missing' | 'auth' | 'rate-limit' | 'offline' | 'other';
      message: string;
    };

/** Czy token widzi repozytorium, czy może w nim pisać i czy repozytorium jest prywatne. */
export async function checkRepo(
  cfg: Pick<GitHubConfig, 'owner' | 'repo' | 'token'>,
  fetchImpl: Fetch = (input, init) => globalThis.fetch(input, init),
): Promise<RepoCheck> {
  let res: Response;
  try {
    res = await fetchImpl(
      `${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`,
      {
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${cfg.token}`,
          'X-GitHub-Api-Version': API_VERSION,
        },
      },
    );
  } catch (e) {
    return {
      ok: false,
      reason: 'offline',
      message: e instanceof Error ? e.message : 'brak połączenia',
    };
  }
  // GitHub ukrywa prywatne repozytorium przed tokenem bez dostępu odpowiedzią 404.
  if (res.status === 404)
    return {
      ok: false,
      reason: 'missing',
      message: 'Repozytorium nie istnieje albo token nie ma do niego dostępu',
    };
  if (!res.ok) {
    const e = await failure(res);
    return { ok: false, reason: e.kind, message: e.message };
  }
  const r = (await res.json()) as {
    private: boolean;
    default_branch: string;
    permissions?: { push?: boolean };
    owner?: { type?: string };
  };
  // Nagłówek z datą wygaśnięcia tokenu fine-grained: „2026-12-01 00:00:00 UTC".
  const exp = /^\d{4}-\d{2}-\d{2}/.exec(
    res.headers.get('github-authentication-token-expiration') ?? '',
  );
  return {
    ok: true,
    private: r.private,
    canWrite: !!r.permissions?.push,
    defaultBranch: r.default_branch,
    organization: r.owner?.type === 'Organization',
    expires: exp ? exp[0] : null,
  };
}
