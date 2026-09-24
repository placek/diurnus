import type { Category } from './types';

const FALLBACK: Category = { id: '', name: '—', icon: 'circle', color: 'fg-faint', parent: null };

export const catOf = (cats: readonly Category[], id: string): Category =>
  cats.find((c) => c.id === id) ?? { ...FALLBACK, id };

export const topCats = (cats: readonly Category[]) =>
  cats.filter((c) => !c.parent && !c.archived);

export const kids = (cats: readonly Category[], id: string) =>
  cats.filter((c) => c.parent === id && !c.archived);

// Osierocona podkategoria (rodzic usunięty) traktuje siebie jako korzeń,
// zamiast zwracać undefined i wywracać render.
export const rootOf = (cats: readonly Category[], c: Category): Category =>
  (c.parent ? cats.find((x) => x.id === c.parent) : undefined) ?? c;

export const colorOf = (cats: readonly Category[], c: Category) =>
  rootOf(cats, c).color ?? 'fg-faint';

export const iconOf = (cats: readonly Category[], c: Category) =>
  c.icon ?? rootOf(cats, c).icon ?? 'circle';

export const pathOf = (cats: readonly Category[], c: Category) =>
  c.parent ? `${rootOf(cats, c).name} › ${c.name}` : c.name;

// Kolejność do paska tokenów: główne wg pozycji, dzieci tuż za rodzicem.
export function catOrder(cats: readonly Category[]): Map<string, number> {
  const m = new Map<string, number>();
  let i = 0;
  for (const t of topCats(cats)) {
    m.set(t.id, i++);
    for (const k of kids(cats, t.id)) m.set(k.id, i++);
  }
  return m;
}
