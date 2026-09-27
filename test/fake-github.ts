import { contentHash } from '../src/lib/sync/hash';

/**
 * Udawane API GitHuba — tyle, ile używa adapter: repozytorium, drzewo gałęzi
 * z ETagiem, API treści z `sha` jako wersją. Zachowuje się jak GitHub tam, gdzie
 * to ważne dla synchronizacji: `sha` wynika z treści, zapis na starym `sha` to
 * 409, utworzenie istniejącego pliku bez `sha` to 422, puste repozytorium nie ma
 * drzewa (409), wyczerpany limit to 403 z nagłówkami limitu.
 */
export class FakeGitHub {
  readonly owner = 'ola';
  readonly repo = 'diurnus-data';
  token = 'dobry-token';
  readOnly = false;
  isPrivate = true;
  organization = false;
  defaultBranch = 'main';
  offline = false;
  rateLimited = false;
  /** Następna odpowiedź na żądanie o tym kodzie (np. 500) — raz. */
  failWith: number | null = null;
  /** Drzewo „obcięte" przez GitHuba (ponad 100 000 wpisów). */
  truncated = false;

  private files = new Map<string, { body: string; sha: string; raw?: Uint8Array }>();
  private rev = 0;
  private commits = 0;
  readonly log: {
    method: string;
    path: string;
    status: number;
    headers: Record<string, string>;
    cache?: string;
    body?: Record<string, unknown>;
  }[] = [];
  readonly messages: string[] = [];

  constructor(initial: Record<string, string> = {}) {
    for (const [p, b] of Object.entries(initial)) this.put(p, b);
  }

  get empty(): boolean {
    return this.commits === 0;
  }

  /** Zmiana spoza aplikacji: edycja na github.com albo inne urządzenie. `null` usuwa. */
  put(path: string, body: string | null): void {
    if (body === null) this.files.delete(path);
    else this.files.set(path, { body, sha: this.sha(body) });
    this.rev++;
    this.commits++;
  }

  /** Plik z bajtami, które nie są UTF-8. */
  putRaw(path: string, raw: Uint8Array): void {
    this.files.set(path, { body: '', sha: `raw${this.rev}`.padEnd(40, '0'), raw });
    this.rev++;
    this.commits++;
  }

  text(path: string): string | undefined {
    return this.files.get(path)?.body;
  }

  paths(): string[] {
    return [...this.files.keys()].sort();
  }

  /** `sha` jak w gicie: z samej treści. */
  private sha(body: string): string {
    return (contentHash(body) + contentHash(`blob:${body}`)).padEnd(40, '0').slice(0, 40);
  }

  private json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(status === 304 ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }

  readonly fetch: typeof fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : (input as Request).url);
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = Object.fromEntries(
      Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [
        k.toLowerCase(),
        v,
      ]),
    );
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    const res = this.route(method, url, headers, body);
    this.log.push({
      method,
      path: url.pathname + url.search,
      status: res.status,
      headers,
      cache: init.cache,
      ...(body ? { body } : {}),
    });
    return res;
  };

  private route(
    method: string,
    url: URL,
    headers: Record<string, string>,
    body?: Record<string, unknown>,
  ): Response {
    if (this.offline) throw new TypeError('Failed to fetch');
    if (headers['authorization'] !== `Bearer ${this.token}`)
      return this.json(401, { message: 'Bad credentials' });
    if (this.rateLimited)
      return this.json(
        403,
        { message: 'API rate limit exceeded' },
        {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 30),
        },
      );
    if (this.failWith !== null) {
      const code = this.failWith;
      this.failWith = null;
      return this.json(code, { message: 'Server Error' });
    }

    const root = `/repos/${this.owner}/${this.repo}`;
    const p = decodeURIComponent(url.pathname);
    if (!p.startsWith(root)) return this.json(404, { message: 'Not Found' });
    const rest = p.slice(root.length);

    if (rest === '' && method === 'GET')
      return this.json(200, {
        private: this.isPrivate,
        default_branch: this.defaultBranch,
        permissions: { pull: true, push: !this.readOnly },
        owner: { login: this.owner, type: this.organization ? 'Organization' : 'User' },
      });

    const tree = /^\/git\/trees\/(.+)$/.exec(rest);
    if (tree && method === 'GET') {
      if (this.empty) return this.json(409, { message: 'Git Repository is empty.' });
      if (tree[1] !== this.defaultBranch) return this.json(404, { message: 'Not Found' });
      const etag = `W/"t${this.rev}"`;
      if (headers['if-none-match'] === etag) return this.json(304, null, { etag });
      const dirs = new Set<string>();
      for (const path of this.files.keys()) {
        const parts = path.split('/');
        for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
      }
      return this.json(
        200,
        {
          sha: `tree${this.rev}`,
          truncated: this.truncated,
          tree: [
            ...[...dirs].map((d) => ({ path: d, type: 'tree', sha: `dir-${d}` })),
            ...[...this.files].map(([path, f]) => ({ path, type: 'blob', sha: f.sha })),
          ],
        },
        { etag },
      );
    }

    const contents = /^\/contents\/(.+)$/.exec(rest);
    if (contents) {
      const path = contents[1]!;
      const cur = this.files.get(path);
      if (method === 'GET') {
        if (url.searchParams.get('ref') !== this.defaultBranch)
          return this.json(404, { message: 'No commit found' });
        if (!cur) return this.json(404, { message: 'Not Found' });
        if (cur.body.length > 1_000_000)
          return this.json(200, { type: 'file', encoding: 'none', content: '', sha: cur.sha });
        const bytes = cur.raw ?? Buffer.from(cur.body, 'utf8');
        // GitHub łamie base64 co 60 znaków.
        const b64 =
          Buffer.from(bytes)
            .toString('base64')
            .replace(/(.{60})/g, '$1\n') + '\n';
        return this.json(200, {
          type: 'file',
          encoding: 'base64',
          content: b64,
          sha: cur.sha,
          path,
        });
      }
      if (this.readOnly)
        return this.json(403, { message: 'Resource not accessible by personal access token' });
      if (!this.empty && body?.['branch'] !== this.defaultBranch)
        return this.json(404, { message: `Branch ${String(body?.['branch'])} not found` });
      if (method === 'PUT') {
        const sha = body?.['sha'] as string | undefined;
        if (cur && sha === undefined)
          return this.json(422, { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' });
        if (cur && sha !== cur.sha)
          return this.json(409, { message: `${path} does not match ${sha}` });
        if (!cur && sha !== undefined) return this.json(404, { message: 'Not Found' });
        const text = Buffer.from(String(body?.['content']), 'base64').toString('utf8');
        this.put(path, text);
        this.messages.push(String(body?.['message']));
        return this.json(cur ? 200 : 201, {
          content: { path, sha: this.files.get(path)!.sha },
          commit: { sha: `c${this.rev}` },
        });
      }
      if (method === 'DELETE') {
        if (!cur) return this.json(404, { message: 'Not Found' });
        if (body?.['sha'] !== cur.sha) return this.json(409, { message: `${path} does not match` });
        this.put(path, null);
        this.messages.push(String(body?.['message']));
        return this.json(200, { content: null, commit: { sha: `c${this.rev}` } });
      }
    }
    return this.json(404, { message: 'Not Found' });
  }
}
