import { BACKLOG as MD_BACKLOG, CONFIG } from '../md/files';
import { isRealDate } from '../md/line';
import { BACKLOG as XIT_BACKLOG } from '../xit/files';

/*
 * Umowa magazynu dokumentów (projekt synchronizacji, §3). Każdy magazyn —
 * repozytorium GitHub, Dropbox, własny serwer — to te same operacje.
 * Wersja jest dla synchronizacji nieprzezroczystym napisem: adapter sam wie,
 * czym jest (skrót bloba, `rev`, `ETag`).
 */

export type Version = string;

export type Listing =
  | { unchanged: true }
  | {
      docs: Map<string, Version>;
      mark: string;
      /** chwila ostatniej zmiany w magazynie (ms) — ostatni commit; brak, gdy magazyn jej nie zna */
      at?: number;
    };

export type WriteResult =
  | { ok: true; version: Version | null; at?: number } // version null po usunięciu; at — chwila zapisu w magazynie
  | { ok: false; conflict: { body: string; version: Version } | null }; // null — dokumentu już nie ma

export interface Store {
  /** Spis: nazwa → wersja. `since` to znacznik poprzedniego spisu; bez zmian → `unchanged`. */
  list(since?: string): Promise<Listing>;
  /** Dokument albo `null`, gdy go nie ma. */
  read(name: string): Promise<{ body: string; version: Version } | null>;
  /** Zapis na wersji `base` (`null` — tworzenie). Konflikt niesie bieżącą treść magazynu. */
  write(name: string, body: string, base: Version | null): Promise<WriteResult>;
  /** Usunięcie na wersji `base`. */
  remove(name: string, base: Version): Promise<WriteResult>;
  /**
   * Wiele zmian jednym commitem: wszystkie albo żadna. Każda na swojej wersji
   * `base` (`null` — dokumentu nie ma); gdy któraś się nie zgadza albo magazyn
   * zmienił się w trakcie — `moved` i nic się nie zmienia.
   */
  commit(changes: Change[], message: string): Promise<CommitResult>;
}

export interface Change {
  name: string;
  /** `null` — usunięcie */
  body: string | null;
  base: Version | null;
}

export type CommitResult =
  | { ok: true; versions: Record<string, Version>; at?: number } // wersje zapisanych dokumentów
  | { ok: false; moved: true };

export type StoreErrorKind = 'offline' | 'auth' | 'rate-limit' | 'other';

/** Błąd, na który synchronizacja reaguje tak samo dla każdego magazynu. */
export class StoreError extends Error {
  constructor(
    readonly kind: StoreErrorKind,
    message: string,
    /** przy `rate-limit`: ile milisekund czekać */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'StoreError';
  }
}

/** Format plików dziennika: [x]it! albo starszy Markdown. */
export type DocFormat = 'xit' | 'md';

const DAY: Record<DocFormat, RegExp> = {
  xit: /^(\d{4}-\d{2}-\d{2})\.xit$/,
  md: /^(\d{4}-\d{2}-\d{2})\.md$/,
};
const BACKLOG: Record<DocFormat, string> = { xit: XIT_BACKLOG, md: MD_BACKLOG };

/**
 * Czy to jeden z dokumentów dziennika w danym formacie. Wszystko inne
 * w magazynie jest pomijane i nigdy nie jest zapisywane ani usuwane —
 * repozytorium może mieć własne README, a po przejściu na [x]it! stary plik
 * `.md` (np. z karty starszej wersji aplikacji) jest dla synchronizacji obcy.
 */
export function isDocName(name: string, format: DocFormat = 'xit'): boolean {
  if (name === BACKLOG[format] || name === CONFIG) return true;
  const m = DAY[format].exec(name);
  return !!m && isRealDate(m[1]!);
}

/** Dokument dziennika w którymkolwiek formacie — tak spisuje magazyn. */
export const isAnyDocName = (name: string) => isDocName(name, 'xit') || isDocName(name, 'md');
