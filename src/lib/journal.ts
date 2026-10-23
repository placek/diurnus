import { CONFIG, parseFiles as parseMd, renderFiles as renderMd } from './md/files';
import type { Files, ParseResult } from './md/files';
import { isDocName } from './sync/store';
import { parseXit, renderXit } from './xit/files';
import type { State } from './types';

/*
 * Pliki dziennika niezależnie od formatu. Dziennik pisze się w [x]it!; starszy
 * Markdown tylko się czyta (stare archiwa, repozytorium przed przejściem) —
 * i pisze, dopóki synchronizacja nie przeniesie repozytorium na [x]it!.
 */

/** Pliki dziennika w [x]it!, z ustawieniami ze znacznikiem `format = "xit"`. */
export const renderJournal = (s: State): Files => renderXit(s);

/** Pliki dziennika w starszym Markdownie — tylko na czas przejścia. */
export const renderLegacy = (s: State): Files => renderMd(s);

const journal = (name: string, format: 'xit' | 'md') => name !== CONFIG && isDocName(name, format);

/**
 * Stan z plików: [x]it! albo Markdown, po nazwach plików. Oba formaty naraz to
 * błąd — nie zgadujemy, który dziennik jest właściwy.
 */
export function parseJournal(files: Files): ParseResult {
  const names = Object.keys(files);
  const xit = names.some((n) => journal(n, 'xit'));
  const md = names.some((n) => journal(n, 'md'));
  if (xit && md)
    return {
      ok: false,
      errors: [{ file: null, line: null, message: 'pomieszane formaty: pliki .xit i .md naraz' }],
    };
  return md ? parseMd(files) : parseXit(files);
}

/** Pliki [x]it! z magazynu przepisane na Markdown; `null`, gdy się nie czytają. */
export function legacyOf(files: Files): Files | null {
  const p = parseXit(files);
  return p.ok ? renderMd(p.state) : null;
}
