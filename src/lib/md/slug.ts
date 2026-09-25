import type { Category } from '../types';

/** Tag to slug: małe litery ASCII, cyfry i pojedyncze łączniki. */
export const TAG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const PL: Record<string, string> = {
  ą: 'a',
  ć: 'c',
  ę: 'e',
  ł: 'l',
  ń: 'n',
  ó: 'o',
  ś: 's',
  ź: 'z',
  ż: 'z',
};

/** Slug z nazwy: bez polskich znaków, z łącznikami zamiast wszystkiego innego. */
export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => PL[c]!)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'kategoria';
}

/**
 * Tag każdej kategorii, w kolejności listy. Własny `tag` wygrywa, jeśli jest
 * poprawny i wolny; inaczej slug z nazwy, z przyrostkiem przy powtórzeniu.
 * Deterministyczne: ta sama lista daje zawsze te same tagi.
 */
export function tagsFor(cats: readonly Category[]): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();
  const take = (base: string) => {
    let t = base;
    for (let n = 2; used.has(t); n++) t = `${base}-${n}`;
    used.add(t);
    return t;
  };
  // Najpierw własne tagi, żeby slug z nazwy innej kategorii ich nie zajął.
  for (const c of cats) {
    if (c.tag && TAG.test(c.tag) && !used.has(c.tag)) {
      used.add(c.tag);
      out.set(c.id, c.tag);
    }
  }
  for (const c of cats) if (!out.has(c.id)) out.set(c.id, take(slugify(c.name)));
  return out;
}
