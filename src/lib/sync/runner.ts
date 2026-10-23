import type { Files } from '../md/files';
import { adopt, convert, isLegacy, overwrite, pending, pull, push } from './engine';
import type { Accept, Conflict, Outcome, SyncState } from './engine';
import { StoreError } from './store';
import type { Store, StoreErrorKind } from './store';

/*
 * Zegar synchronizacji (projekt synchronizacji, §4 „Wysyłanie", „Pobieranie",
 * „Bez sieci i błędy"). Decyduje, KIEDY wołać silnik; CO się dzieje, rozstrzyga
 * silnik. Nie zna Svelte ani przeglądarki: stan aplikacji, pamięć i zamek
 * dostaje od wołającego, więc da się go sprawdzić na magazynie w pamięci.
 *
 * - Źródłem prawdy jest magazyn: każda tura zaczyna się od sprawdzenia go
 *   (spis z ETagiem — „bez zmian" nic nie kosztuje) i pobrania tego, co się
 *   w nim zmieniło, a dopiero potem wysyła lokalne zmiany. Dokument zmieniony
 *   po obu stronach bierze wersję magazynu (konflikt).
 * - Zmiana stanu → tura po 2 s ciszy (seria edycji daje jeden zapis).
 * - Sprawdzenie na żądanie: start, powrót do karty, co 20 s przy widocznej karcie.
 * - Jedna operacja naraz; prośby, które przyjdą w trakcie, idą następną turą.
 * - Brak sieci i inne błędy → ponowienia co 5 s, 10 s, 20 s… do 5 minut;
 *   powrót sieci → od razu. Limit → czekanie tyle, ile każe magazyn.
 *   Token bez dostępu → koniec prób, aż ktoś poprawi ustawienia.
 * - Uzgodnienie z czasów plików Markdown najpierw przechodzi na [x]it!: gdy
 *   magazyn już przeszedł — przejmuje jego dokumenty (`adopt`); gdy nie — kończy
 *   synchronizację w Markdownie i przenosi magazyn jednym commitem (`convert`).
 */

export const PUSH_DELAY = 2000;
/**
 * Sprawdzenie magazynu, gdy karta jest widoczna: zmiana z innego urządzenia
 * pojawia się tu najwyżej po tylu sekundach. Sprawdzenie bez zmian to jedno
 * „304", które nie liczy się do limitu żądań GitHuba.
 */
export const PULL_EVERY = 20_000;
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
  /** ostatnia lokalna zmiana dziennika na tym urządzeniu */
  localAt: number | null;
  /** ostatnia zmiana w magazynie (ostatni commit) */
  remoteAt: number | null;
  /** zmiany z magazynu, których nie przyjęto */
  rejected: { names: string[]; errors: string[] } | null;
  /** trwa przejście magazynu z plików Markdown na [x]it! */
  migrating: boolean;
}

export const initialStatus = (phase: Phase = 'idle'): SyncStatus => ({
  phase,
  at: null,
  pending: false,
  message: null,
  retryAt: null,
  conflicts: [],
  rejected: null,
  localAt: null,
  remoteAt: null,
  migrating: false,
});

export type SyncNotice =
  { kind: 'conflict'; names: string[] } | { kind: 'rejected'; names: string[]; errors: string[] };

export interface RunnerDeps {
  store: Store;
  /**
   * dokumenty bieżącego stanu w formacie uzgodnienia: [x]it!, a dopóki
   * uzgodnienie jest z czasów Markdownu (`isLegacy`) — Markdown
   */
  files(): Files;
  /** dokumenty bieżącego stanu w [x]it! — cel przejścia z Markdownu */
  target(): Files;
  /** dokumenty [x]it! jako Markdown; `null`, gdy się nie czytają */
  legacyOf(files: Files): Files | null;
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

  constructor(private readonly deps: RunnerDeps) {
    // Chwile ostatnich zmian są w zapisanym uzgodnieniu — widać je od razu po
    // odświeżeniu strony, nie dopiero po pierwszej rozmowie z magazynem.
    const st = deps.load();
    this.status = { ...this.status, localAt: st.localAt ?? null, remoteAt: st.remoteAt ?? null };
  }

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
    // Zmiana, która różni się od uzgodnionego, to lokalna edycja — jej chwila
    // zostaje zapisana. Stan zastąpiony treścią z magazynu niczego nie czeka.
    const st = this.deps.load();
    if (pending(this.deps.files(), st)) this.deps.save({ ...st, localAt: this.now() });
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

  /**
   * Najpierw magazyn: pobranie, gdy ktoś o nie prosił albo gdy coś czeka na
   * wysłanie — wysyłamy dopiero na tym, co jest w magazynie teraz. Potem
   * wysłanie, jeśli po pobraniu coś jeszcze czeka.
   */
  private async cycle(): Promise<StoreError | null> {
    clearTimeout(this.pushTimer);
    if (isLegacy(this.deps.load())) {
      const e = await this.migrate();
      if (e || isLegacy(this.deps.load())) return e;
      this.wantPull = true; // przejęte uzgodnienie trzeba sprawdzić z magazynem
    }
    if (this.wantPull || pending(this.deps.files(), this.deps.load())) {
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

  /**
   * Przejście na [x]it!. Magazyn już przeszedł — przejęcie jego dokumentów.
   * Nie — pobranie i wysłanie w Markdownie, a gdy wszystko uzgodnione, jeden
   * commit z dokumentami [x]it!. Niedokończone przejście (konflikt, odrzucone
   * zmiany, błąd) czeka do następnej tury; do tego czasu Markdown działa jak dotąd.
   */
  private async migrate(): Promise<StoreError | null> {
    const { store, accept } = this.deps;
    this.set({ migrating: true, phase: 'busy' });
    try {
      let e = await this.op((files, st) =>
        adopt(store, files, this.deps.target(), st, this.deps.legacyOf),
      );
      if (e || !isLegacy(this.deps.load())) return e;
      e = await this.op((files, st) => pull(store, files, st, accept));
      if (e) {
        this.wantPull = true;
        return e;
      }
      if (pending(this.deps.files(), this.deps.load())) {
        e = await this.op((files, st) => push(store, files, st, accept));
        if (e) return e;
      }
      const st = this.deps.load();
      if (pending(this.deps.files(), st) || Object.keys(st.blocked).length) return null;
      e = await this.op((files, st) => convert(store, files, this.deps.target(), st));
      if (!e && !isLegacy(this.deps.load()))
        // Konflikty dotyczyły dokumentów Markdown, których już nie ma.
        this.set({ conflicts: this.status.conflicts.filter((c) => !c.name.endsWith('.md')) });
      return e;
    } finally {
      this.set({ migrating: false });
    }
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
    const st = this.deps.load();
    const p = pending(this.deps.files(), st);
    const localAt = st.localAt ?? null;
    const remoteAt = st.remoteAt ?? null;
    const s = this.status;
    if (p !== s.pending || localAt !== s.localAt || remoteAt !== s.remoteAt)
      this.set({ pending: p, localAt, remoteAt });
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
        state = {
          docs: { ...state.docs },
          blocked: { ...state.blocked },
          ...(state.remoteAt !== undefined ? { remoteAt: state.remoteAt } : {}),
          ...(state.localAt !== undefined ? { localAt: state.localAt } : {}),
        };
        for (const n of names) {
          const p = prev.docs[n];
          if (p) state.docs[n] = p;
          else delete state.docs[n];
        }
        conflicts.length = 0;
        this.wantPull = true;
      }
    }

    // Edycja w trakcie operacji zapisała swoją chwilę w uzgodnieniu, którego ta
    // operacja nie widziała — nie może jej zgubić.
    const localAt = Math.max(this.deps.load().localAt ?? 0, state.localAt ?? 0);
    if (localAt) state = { ...state, localAt };

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
