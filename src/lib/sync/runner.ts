import type { Files } from '../md/files';
import { overwrite, pending, pull, push } from './engine';
import type { Accept, Conflict, Outcome, SyncState } from './engine';
import { StoreError } from './store';
import type { Store, StoreErrorKind } from './store';

/*
 * Zegar synchronizacji (projekt synchronizacji, §4 „Wysyłanie", „Pobieranie",
 * „Bez sieci i błędy"). Decyduje, KIEDY wołać silnik; CO się dzieje, rozstrzyga
 * silnik. Nie zna Svelte ani przeglądarki: stan aplikacji, pamięć i zamek
 * dostaje od wołającego, więc da się go sprawdzić na magazynie w pamięci.
 *
 * - Zmiana stanu → wysłanie po 2 s ciszy (seria edycji daje jeden zapis).
 * - Pobranie na żądanie (start, powrót do karty, co 5 minut); po nim od razu
 *   wysłanie tego, co czeka.
 * - Jedna operacja naraz; prośby, które przyjdą w trakcie, idą następną turą.
 * - Brak sieci i inne błędy → ponowienia co 5 s, 10 s, 20 s… do 5 minut;
 *   powrót sieci → od razu. Limit → czekanie tyle, ile każe magazyn.
 *   Token bez dostępu → koniec prób, aż ktoś poprawi ustawienia.
 */

export const PUSH_DELAY = 2000;
export const PULL_EVERY = 5 * 60_000;
export const RETRY_FIRST = 5000;
export const RETRY_MAX = 5 * 60_000;
/** Limit bez podanego czasu: minuta. */
const RATE_WAIT = 60_000;

export type Phase =
  /** wszystko uzgodnione albo czeka na swoją kolej */
  | 'idle'
  /** trwa rozmowa z magazynem */
  | 'busy'
  /** synchronizuje inna karta tej przeglądarki */
  | 'standby'
  | StoreErrorKind;

export interface SyncStatus {
  phase: Phase;
  /** kiedy ostatnio udało się wszystko, o co proszono */
  at: number | null;
  /** czy lokalne zmiany czekają na wysłanie */
  pending: boolean;
  /** opis ostatniego błędu */
  message: string | null;
  /** kiedy następna próba po błędzie */
  retryAt: number | null;
  /** przegrane lokalne wersje — do „Nadpisz moją wersją" */
  conflicts: Conflict[];
  /** zmiany z magazynu, których nie przyjęto */
  rejected: { names: string[]; errors: string[] } | null;
}

export const initialStatus = (phase: Phase = 'idle'): SyncStatus => ({
  phase,
  at: null,
  pending: false,
  message: null,
  retryAt: null,
  conflicts: [],
  rejected: null,
});

export type SyncNotice =
  { kind: 'conflict'; names: string[] } | { kind: 'rejected'; names: string[]; errors: string[] };

export interface RunnerDeps {
  store: Store;
  /** dokumenty bieżącego stanu (`renderFiles`) */
  files(): Files;
  /** czy dokumenty dają się przyjąć (`parseFiles`) */
  accept: Accept;
  /** zastępuje stan dokumentami, które `accept` przyjął */
  apply(files: Files): void;
  /** uzgodnienie z magazynem — czytane świeżo przed każdą operacją */
  load(): SyncState;
  save(st: SyncState): void;
  onStatus(s: SyncStatus): void;
  /** coś, o czym użytkownik powinien wiedzieć (konflikt, odrzucone zmiany) */
  notify?(e: SyncNotice): void;
  now?(): number;
}

export class SyncRunner {
  private status: SyncStatus = initialStatus();
  /** kolejka operacji — jedna naraz */
  private chain: Promise<void> = Promise.resolve();
  /** tura czeka w kolejce i jeszcze nie ruszyła — kolejna prośba nic nie dokłada */
  private queued = false;
  private wantPull = false;
  private pushTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  /** kolejne nieudane tury — wyznaczają odstęp ponowienia */
  private failures = 0;
  /** przed tą chwilą nic nie rusza samo (odstęp po błędzie, limit) */
  private holdUntil = 0;
  /** token bez dostępu — próby wstrzymane */
  private halted = false;
  private stopped = false;

  constructor(private readonly deps: RunnerDeps) {}

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  private set(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch };
    this.deps.onStatus(this.status);
  }

  get current(): SyncStatus {
    return this.status;
  }

  /* ───────────── Prośby ───────────── */

  /** Stan się zmienił — wysłanie po chwili ciszy. */
  changed(): void {
    if (this.stopped) return;
    this.refreshPending();
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => this.kick(), PUSH_DELAY);
  }

  /** Sprawdzenie magazynu (i wysłanie tego, co czeka). */
  pull(): void {
    if (this.stopped) return;
    this.wantPull = true;
    this.kick();
  }

  /** Wysłanie bez czekania — np. gdy karta chowa się w tle. */
  flush(): void {
    if (this.stopped) return;
    clearTimeout(this.pushTimer);
    this.kick();
  }

  /** Sieć wróciła: odstęp po błędzie przestaje obowiązywać. Limit — nie. */
  online(): void {
    if (this.status.phase === 'rate-limit') return;
    this.retry();
  }

  /** „Synchronizuj teraz": sprawdzenie od razu, bez czekania na odstęp po błędzie. */
  retry(): void {
    if (this.stopped || this.halted) return;
    clearTimeout(this.retryTimer);
    this.holdUntil = 0;
    this.wantPull = true;
    this.kick();
  }

  /** „Nadpisz moją wersją" — przegrana lokalna treść wraca do magazynu. */
  overwrite(c: Conflict): Promise<void> {
    this.chain = this.chain.then(() =>
      this.turn(true, async () => {
        const was = this.status.conflicts.find((x) => x.name === c.name);
        const e = await this.op((files, st) =>
          overwrite(this.deps.store, files, st, c, this.deps.accept),
        );
        // Ten sam wpis po operacji — nie powstał nowy konflikt, więc sprawa zamknięta.
        if (!e && this.status.conflicts.find((x) => x.name === c.name) === was)
          this.dismiss(c.name);
        return e;
      }),
    );
    return this.chain;
  }

  /** Konflikt przyjęty do wiadomości — wersja magazynu zostaje. */
  dismiss(name: string): void {
    this.set({ conflicts: this.status.conflicts.filter((c) => c.name !== name) });
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.pushTimer);
    clearTimeout(this.retryTimer);
  }

  /** Obietnica, która spełnia się, gdy kolejka jest pusta (dla testów i zamknięcia). */
  async idle(): Promise<void> {
    let c: Promise<void>;
    do {
      c = this.chain;
      await c;
    } while (c !== this.chain);
  }

  /* ───────────── Tura ───────────── */

  private kick(): void {
    if (this.stopped || this.halted || this.queued) return;
    if (this.now() < this.holdUntil) return; // ponowienie ruszy samo
    this.queued = true;
    this.chain = this.chain.then(() => {
      this.queued = false;
      return this.turn(false, () => this.cycle());
    });
  }

  /** Pobranie, jeśli ktoś o nie prosił, a potem wysłanie, jeśli coś czeka. */
  private async cycle(): Promise<StoreError | null> {
    clearTimeout(this.pushTimer);
    if (this.wantPull) {
      this.wantPull = false;
      const e = await this.op((files, st) => pull(this.deps.store, files, st, this.deps.accept));
      if (e) {
        this.wantPull = true; // ponowienie ma sprawdzić magazyn od nowa
        return e;
      }
    }
    if (!pending(this.deps.files(), this.deps.load())) return null;
    return this.op((files, st) => push(this.deps.store, files, st, this.deps.accept));
  }

  /** `asked` — wprost na życzenie użytkownika: zawsze rozmowa z magazynem. */
  private async turn(asked: boolean, work: () => Promise<StoreError | null>): Promise<void> {
    if (this.stopped) return;
    const busy = asked || this.wantPull || pending(this.deps.files(), this.deps.load());
    if (busy) this.set({ phase: 'busy' });
    let error: StoreError | null;
    try {
      error = await work();
    } catch (e) {
      // Błąd spoza magazynu (np. przy zastępowaniu stanu) nie może zatrzymać kolejki.
      error = new StoreError('other', e instanceof Error ? e.message : String(e));
    }
    if (this.stopped) return;
    if (error) this.fail(error);
    else if (busy || this.status.phase !== 'idle') this.succeed();
    this.refreshPending();
    // Wynik, który nie wszedł, trzeba ocenić od nowa (patrz `settle`).
    if (!error && this.wantPull) this.kick();
  }

  private succeed(): void {
    this.failures = 0;
    this.holdUntil = 0;
    this.set({ phase: 'idle', at: this.now(), message: null, retryAt: null });
  }

  private fail(e: StoreError): void {
    if (e.kind === 'auth') {
      this.halted = true;
      this.set({ phase: 'auth', message: e.message, retryAt: null });
      return;
    }
    let wait: number;
    if (e.kind === 'rate-limit') wait = Math.max(1000, e.retryAfter ?? RATE_WAIT);
    else {
      this.failures++;
      wait = Math.min(RETRY_MAX, RETRY_FIRST * 2 ** (this.failures - 1));
    }
    this.holdUntil = this.now() + wait;
    this.set({ phase: e.kind, message: e.message, retryAt: this.holdUntil });
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.holdUntil = 0;
      this.kick();
    }, wait);
  }

  private refreshPending(): void {
    const p = pending(this.deps.files(), this.deps.load());
    if (p !== this.status.pending) this.set({ pending: p });
  }

  /* ───────────── Operacja ───────────── */

  /** Jedna operacja silnika na świeżym uzgodnieniu i bieżących dokumentach. */
  private async op(
    run: (files: Files, st: SyncState) => Promise<Outcome>,
  ): Promise<StoreError | null> {
    const before = this.deps.files();
    const prev = this.deps.load();
    const out = await run(before, prev);
    if (this.stopped) return null;
    this.settle(before, prev, out);
    return out.error;
  }

  /**
   * Wynik operacji wchodzi do stanu. W czasie rozmowy z magazynem stan mógł się
   * zmienić — wtedy dokumenty z magazynu trafiają na stan BIEŻĄCY, a nie na ten
   * sprzed operacji; lokalna edycja tego samego dokumentu przegrywa jak każdy
   * konflikt.
   */
  private settle(before: Files, prev: SyncState, out: Outcome): void {
    let state = out.state;
    const conflicts = [...out.conflicts];
    let files: Files | null = null;

    if (out.changed) {
      const now = this.deps.files();
      const names = [...new Set([...Object.keys(before), ...Object.keys(out.files)])].filter(
        (n) => out.files[n] !== before[n],
      );
      const next: Files = { ...now };
      for (const n of names) {
        const body = out.files[n];
        if (body === undefined) delete next[n];
        else next[n] = body;
      }
      const moved = !sameFiles(now, before);
      if (!moved || this.deps.accept(next) === true) {
        files = next;
        if (moved)
          for (const n of names) {
            if (now[n] === before[n]) continue;
            const body = out.files[n];
            const version = state.docs[n]?.version;
            if (body !== undefined && version === undefined) continue;
            conflicts.push({
              name: n,
              remote: body !== undefined ? { body, version: version! } : null,
              mine: now[n] ?? null,
            });
          }
      } else {
        // Dokumenty z magazynu nie pasują do tego, co zmieniło się w międzyczasie:
        // uzgodnienie tych dokumentów się cofa, a następne pobranie oceni je
        // na nowo, już na bieżącym stanie.
        state = { docs: { ...state.docs }, blocked: { ...state.blocked } };
        for (const n of names) {
          const p = prev.docs[n];
          if (p) state.docs[n] = p;
          else delete state.docs[n];
        }
        conflicts.length = 0;
        this.wantPull = true;
      }
    }

    // Uzgodnienie przed stanem: zastąpienie stanu od razu pyta, co czeka na wysłanie.
    this.deps.save(state);
    if (files) this.deps.apply(files);

    const blocked = Object.keys(state.blocked).length > 0;
    const rejected = out.rejected ?? (blocked ? this.status.rejected : null);
    const names = new Set(conflicts.map((c) => c.name));
    this.set({
      conflicts: [...this.status.conflicts.filter((c) => !names.has(c.name)), ...conflicts],
      rejected,
    });

    if (conflicts.length) this.deps.notify?.({ kind: 'conflict', names: [...names] });
    if (out.rejected) this.deps.notify?.({ kind: 'rejected', ...out.rejected });
  }
}

function sameFiles(a: Files, b: Files): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}
