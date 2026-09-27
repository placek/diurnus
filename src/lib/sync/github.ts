import { StoreError, isDocName } from './store';
import type { Listing, Store, Version, WriteResult } from './store';

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
      if (!name.includes('/') && isDocName(name)) docs.set(name, e.sha);
    }
    return { docs, mark: res.headers.get('etag') ?? '' };
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
      const out = (await res.json()) as { content: { sha: string } };
      return { ok: true, version: out.content.sha };
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
    if (res.ok) return { ok: true, version: null };
    if (res.status === 404) return { ok: false, conflict: null };
    if (res.status === 409 || res.status === 422) return this.conflict(name, base, res);
    throw await failure(res);
  }
}

/* ───────────── Sprawdzenie przy „Połącz" ───────────── */

export type RepoCheck =
  | {
      ok: true;
      private: boolean;
      canWrite: boolean;
      defaultBranch: string;
      /** właściciel to organizacja — może wymagać zatwierdzenia tokenu */
      organization: boolean;
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
  return {
    ok: true,
    private: r.private,
    canWrite: !!r.permissions?.push,
    defaultBranch: r.default_branch,
    organization: r.owner?.type === 'Organization',
  };
}
