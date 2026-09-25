import { bandAt } from './model';
import type { Band, Category, DaySettings } from './types';

export interface DraftCategory extends Category {
  /** oznaczona do usunięcia w trwającej edycji */
  _del?: boolean;
}

const alive = (c: DraftCategory) => !c._del && !c.archived;

// Kategoria wciąż obecna w historii nie jest kasowana, tylko archiwizowana:
// znika z menu, ale stare pozycje zachowują nazwę i kolor. Skasowanie jej
// odbarwiłoby zapisy sprzed miesięcy. `used` to kategorie dowolnych pozycji.
export function buildCats(
  draft: readonly DraftCategory[],
  original: ReadonlySet<string>,
  used: ReadonlySet<string>,
  originalCats: readonly Category[],
): Category[] | null {
  const origMap = new Map(originalCats.map((c) => [c.id, c]));

  const del = new Set<string>();
  for (const c of draft) {
    if (c._del || (!c.name.trim() && !original.has(c.id))) del.add(c.id);
  }
  for (const c of draft) {
    if (c.parent && del.has(c.parent)) del.add(c.id);
  }

  const out: Category[] = [];
  for (const c of draft) {
    const clean: Category = {
      id: c.id,
      name: c.name.trim() || origMap.get(c.id)?.name || '—',
      icon: c.icon || null,
      parent: c.parent || null,
    };
    if (!clean.parent) clean.color = c.color || 'yellow';
    if (c.archived) clean.archived = true;

    if (del.has(c.id)) {
      const inUse =
        used.has(c.id) || (!c.parent && draft.some((k) => k.parent === c.id && used.has(k.id)));
      if (!inUse) continue;
      clean.archived = true;
    }
    out.push(clean);
  }

  if (!out.some((c) => !c.parent && !c.archived)) return null;
  return out;
}

/** Kategoria główna przesuwa się razem ze swoimi dziećmi. */
export function moveUp(draft: readonly DraftCategory[], id: string): DraftCategory[] {
  const c = draft.find((x) => x.id === id);
  if (!c) return [...draft];

  const siblings = draft.filter((x) => (x.parent ?? null) === (c.parent ?? null) && alive(x));
  const i = siblings.indexOf(c);
  if (i <= 0) return [...draft];

  const prev = siblings[i - 1]!;
  const group = draft.filter((x) => x === c || x.parent === c.id);
  const rest = draft.filter((x) => !group.includes(x));
  rest.splice(rest.indexOf(prev), 0, ...group);
  return rest;
}

export interface PreviewSegment {
  from: number;
  to: number;
  band: Band | null;
}

/** Widoczne okno doby pocięte na odcinki jednej pory dnia. */
export function dayPreview(day: DaySettings): PreviewSegment[] {
  const sorted = day.bands.slice().sort((a, b) => a.from - b.from);
  const out: PreviewSegment[] = [];
  let h = day.start;
  while (h < day.end) {
    const band = bandAt(sorted, h);
    let e = h + 1;
    while (e < day.end && bandAt(sorted, e) === band) e++;
    out.push({ from: h, to: e, band });
    h = e;
  }
  return out;
}

export const duplicateBandStart = (bands: readonly Band[]) =>
  new Set(bands.map((b) => b.from)).size !== bands.length;

// Zakres doby musi zostać rosnący. Bez tego przesunięcie początku za koniec
// daje dzień "od 23 do 22": podgląd pustoszeje, a normalize() przy następnym
// wczytaniu odrzuca taki dzień i po cichu przywraca domyślne 06–22 —
// użytkownik traci własne ustawienia, nie wiedząc dlaczego.
export function clampDayRange(start: number, end: number): { start: number; end: number } {
  const s = Math.min(23, Math.max(0, start));
  return { start: s, end: Math.min(24, Math.max(s + 1, end)) };
}
