import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { CONFIG } from './files';
import type { Files } from './files';

/*
 * Pliki dziennika w jednym archiwum. Eksport to ZIP, bo przeglądarka nie
 * pobierze wygodnie kilku plików naraz, a `.diurnus.toml` jako osobne pobranie
 * straciłby kropkę. Import przyjmuje ZIP albo te same pliki wskazane luzem.
 */

/** Stała data wpisów: to samo archiwum ze stanu daje te same bajty. */
const MTIME = new Date(2000, 0, 1);

export function filesToZip(files: Files): Uint8Array {
  const entries: Record<string, [Uint8Array, { mtime: Date }]> = {};
  for (const name of Object.keys(files).sort())
    entries[name] = [strToU8(files[name]!), { mtime: MTIME }];
  return zipSync(entries, { level: 6 });
}

export type Collected = { ok: true; files: Files } | { ok: false; errors: string[] };

/** Śmieci, które systemy dokładają do archiwów i katalogów. */
const junk = (path: string) =>
  path.endsWith('/') ||
  path.startsWith('__MACOSX/') ||
  basename(path).startsWith('._') ||
  basename(path) === '.DS_Store';

const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** Pobrany plik ustawień bywa zapisany bez kropki — to wciąż on. */
const canonicalName = (name: string) => (name === 'diurnus.toml' ? CONFIG : name);

const text = (bytes: Uint8Array) => strFromU8(bytes).replace(/^﻿/, '');

/**
 * Pliki do odczytu, po nazwie bez katalogów. Ta sama nazwa dwa razy to błąd:
 * nie zgadujemy, który z dwóch dni jest właściwy.
 */
export function collect(entries: readonly { name: string; bytes: Uint8Array }[]): Collected {
  const files: Files = {};
  const errors: string[] = [];
  for (const e of entries) {
    if (junk(e.name)) continue;
    if (/\.zip$/i.test(e.name)) {
      let inner: Record<string, Uint8Array>;
      try {
        inner = unzipSync(e.bytes);
      } catch {
        errors.push(`${e.name}: to nie jest poprawne archiwum ZIP`);
        continue;
      }
      const nested = collect(Object.entries(inner).map(([name, bytes]) => ({ name, bytes })));
      if (!nested.ok) errors.push(...nested.errors);
      else
        for (const [n, t] of Object.entries(nested.files)) {
          if (n in files) errors.push(`plik ${n} występuje dwa razy`);
          files[n] = t;
        }
      continue;
    }
    const name = canonicalName(basename(e.name));
    if (name in files) errors.push(`plik ${name} występuje dwa razy`);
    files[name] = text(e.bytes);
  }
  return errors.length ? { ok: false, errors } : { ok: true, files };
}
