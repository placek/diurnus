import { test, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { collect, filesToZip } from '../src/lib/md/archive';

const FILES = {
  '.diurnus.toml': '[day]\nstart = 6\nend = 22\n',
  '2026-09-25.md': '# 2026-09-25\n\n* [ ] Zażółć gęślą jaźń\n',
  'BACKLOG.md': '# Backlog\n',
};
const entry = (name: string, text: string) => ({ name, bytes: strToU8(text) });

test('ZIP z eksportu wraca jako te same pliki, z polskimi znakami', () => {
  const r = collect([{ name: 'diurnus.zip', bytes: filesToZip(FILES) }]);
  expect(r).toEqual({ ok: true, files: FILES });
});

test('to samo archiwum ze stanu ma zawsze te same bajty', () => {
  expect(filesToZip(FILES)).toEqual(filesToZip({ ...FILES }));
});

test('pliki luzem: nazwa bez katalogu, ustawienia bez kropki też są ustawieniami', () => {
  const r = collect([
    entry('x/2026-09-25.md', FILES['2026-09-25.md']),
    entry('diurnus.toml', FILES['.diurnus.toml']),
  ]);
  expect(r).toEqual({
    ok: true,
    files: { '2026-09-25.md': FILES['2026-09-25.md'], '.diurnus.toml': FILES['.diurnus.toml'] },
  });
});

test('archiwum z katalogiem i śmieciami systemowymi', () => {
  const zip = zipSync({
    'diurnus/': new Uint8Array(),
    'diurnus/BACKLOG.md': strToU8('# Backlog\n'),
    '__MACOSX/diurnus/._BACKLOG.md': strToU8('śmieci'),
    'diurnus/.DS_Store': strToU8('śmieci'),
  });
  expect(collect([{ name: 'a.zip', bytes: zip }])).toEqual({
    ok: true,
    files: { 'BACKLOG.md': '# Backlog\n' },
  });
});

test('znacznik BOM z edytora nie trafia do treści', () => {
  const r = collect([entry('BACKLOG.md', '﻿# Backlog\n')]);
  expect(r.ok && r.files['BACKLOG.md']).toBe('# Backlog\n');
});

test('ta sama nazwa dwa razy to błąd, a nie zgadywanie', () => {
  const r = collect([entry('a/BACKLOG.md', '# Backlog\n'), entry('b/BACKLOG.md', '# Backlog\n')]);
  expect(r).toEqual({ ok: false, errors: ['plik BACKLOG.md występuje dwa razy'] });
});

test('uszkodzony ZIP daje czytelny błąd', () => {
  const r = collect([entry('zly.zip', 'to nie zip')]);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.errors[0]).toMatch(/nie jest poprawne archiwum/);
});
