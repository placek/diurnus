import { StoreError } from './store';
import type {
  Change,
  CommitResult,
  Listing,
  Store,
  StoreErrorKind,
  Version,
  WriteResult,
} from './store';

/**
 * Magazyn w pamięci — ta sama umowa co prawdziwe adaptery, bez sieci.
 * Służy testom synchronizacji i udaje „drugie urządzenie": zapis przez
 * `put` od innego klienta zmienia wersję tak, jak zrobiłby to magazyn.
 */
export class MemoryStore implements Store {
  private docs = new Map<string, { body: string; version: Version }>();
  private seq = 0;
  private rev = 0;
  /** chwila ostatniej zmiany — jak data ostatniego commita */
  private at: number | null = null;
  private failures: StoreErrorKind[] = [];
  /** Liczba wywołań każdej operacji — do sprawdzania ruchu w testach. */
  readonly calls = { list: 0, read: 0, write: 0, remove: 0, commit: 0 };
  /** Opisy commitów zrobionych przez `commit`. */
  readonly messages: string[] = [];

  constructor(initial: Record<string, string> = {}) {
    for (const [name, body] of Object.entries(initial)) this.put(name, body);
  }

  /** Zmiana „z innego urządzenia" — bez sprawdzania wersji. `null` usuwa. */
  put(name: string, body: string | null): void {
    if (body === null) this.docs.delete(name);
    else this.docs.set(name, { body, version: `v${++this.seq}` });
    this.rev++;
    this.at = Date.now();
  }

  /** Bieżąca treść — do asercji w testach. */
  snapshot(): Record<string, string> {
    return Object.fromEntries([...this.docs].map(([n, d]) => [n, d.body]));
  }

  /** Następne wywołania skończą się tymi błędami, po kolei. */
  failNext(...kinds: StoreErrorKind[]): void {
    this.failures.push(...kinds);
  }

  private maybeFail(): void {
    const kind = this.failures.shift();
    if (kind)
      throw new StoreError(
        kind,
        `symulowany błąd: ${kind}`,
        kind === 'rate-limit' ? 1000 : undefined,
      );
  }

  async list(since?: string): Promise<Listing> {
    this.calls.list++;
    this.maybeFail();
    const mark = `r${this.rev}`;
    if (since === mark) return { unchanged: true };
    return {
      docs: new Map([...this.docs].map(([n, d]) => [n, d.version])),
      mark,
      ...(this.at !== null ? { at: this.at } : {}),
    };
  }

  async read(name: string) {
    this.calls.read++;
    this.maybeFail();
    const d = this.docs.get(name);
    return d ? { ...d } : null;
  }

  async write(name: string, body: string, base: Version | null): Promise<WriteResult> {
    this.calls.write++;
    this.maybeFail();
    const cur = this.docs.get(name);
    if ((cur?.version ?? null) !== base) return { ok: false, conflict: cur ? { ...cur } : null };
    this.put(name, body);
    return { ok: true, version: this.docs.get(name)!.version, at: this.at! };
  }

  async remove(name: string, base: Version): Promise<WriteResult> {
    this.calls.remove++;
    this.maybeFail();
    const cur = this.docs.get(name);
    if (!cur) return { ok: false, conflict: null };
    if (cur.version !== base) return { ok: false, conflict: { ...cur } };
    this.put(name, null);
    return { ok: true, version: null, at: this.at! };
  }

  async commit(changes: Change[], message: string): Promise<CommitResult> {
    this.calls.commit++;
    this.maybeFail();
    for (const c of changes)
      if ((this.docs.get(c.name)?.version ?? null) !== c.base) return { ok: false, moved: true };
    const versions: Record<string, Version> = {};
    for (const c of changes) {
      if (c.body === null) this.docs.delete(c.name);
      else {
        this.docs.set(c.name, { body: c.body, version: `v${++this.seq}` });
        versions[c.name] = this.docs.get(c.name)!.version;
      }
    }
    this.rev++;
    this.at = Date.now();
    this.messages.push(message);
    return { ok: true, versions, at: this.at };
  }
}
