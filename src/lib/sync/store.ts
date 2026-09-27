import { BACKLOG, CONFIG } from '../md/files';
import { isRealDate } from '../md/line';

/*
 * Umowa magazynu dokumentów (projekt synchronizacji, §3). Każdy magazyn —
 * repozytorium GitHub, Dropbox, własny serwer — to te same cztery operacje.
 * Wersja jest dla synchronizacji nieprzezroczystym napisem: adapter sam wie,
 * czym jest (skrót bloba, `rev`, `ETag`).
 */

export type Version = string;

export type Listing = { unchanged: true } | { docs: Map<string, Version>; mark: string };

export type WriteResult =
  | { ok: true; version: Version | null } // null po usunięciu
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
}

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

const DAY = /^(\d{4}-\d{2}-\d{2})\.md$/;

/**
 * Czy to jeden z dokumentów dziennika. Wszystko inne w magazynie jest pomijane
 * w spisie i nigdy nie jest zapisywane ani usuwane — repozytorium może mieć
 * własne README.
 */
export function isDocName(name: string): boolean {
  if (name === BACKLOG || name === CONFIG) return true;
  const m = DAY.exec(name);
  return !!m && isRealDate(m[1]!);
}
