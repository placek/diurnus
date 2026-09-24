import { app, commit, ui, uid } from './state.svelte';
import { acceptTarget, newBlock, statusFor } from './lib/actions';
import { kids, topCats } from './lib/categories';
import { fit, occ } from './lib/occupancy';
import { cycleType, migrateTo } from './lib/items';
import { fmtQ, rel, shiftDay } from './lib/time';
import type { Block, ItemType } from './lib/types';

function stopOtherActive(exceptId: string): void {
  for (const b of app.S.blocks) {
    if (b.status === 'active' && b.id !== exceptId) b.status = 'confirmed';
  }
}

export function createAt(q: number, catId: string): void {
  const f = fit(occ(app.S.blocks, app.viewDay), q);
  if (!f) return;
  const status = statusFor(app.viewDay, f.q, f.len, app.now);
  const b = newBlock(app.viewDay, f.q, f.len, catId, status, Date.now(), uid);
  commit(
    () => {
      if (status === 'active') stopOtherActive(b.id);
      app.S.blocks.push(b);
    },
    status === 'active' ? `Start: do ${fmtQ(app.viewDay, f.q + f.len)}` : undefined,
  );
}

/** Kliknięcie w istniejący blok: sugestia/plan awansuje, reszta nie robi nic. */
export function advance(b: Block): void {
  if (b.status !== 'suggested' && b.status !== 'planned') return;
  const next = acceptTarget(b, app.now);
  if (next === b.status) return;
  commit(() => {
    if (next === 'active') stopOtherActive(b.id);
    b.status = next;
  });
}

export function removeBlock(id: string): void {
  const b = app.S.blocks.find((x) => x.id === id);
  if (!b) return;
  // Odrzucona sugestia zostaje jako `discarded`: pamięta, że użytkownik
  // powiedział nie, więc kolejna runda sugestii jej nie wskrzesi.
  commit(
    () => {
      if (b.status === 'suggested') b.status = 'discarded';
      else app.S.blocks = app.S.blocks.filter((x) => x.id !== id);
    },
    b.status === 'suggested' ? 'Sugestia odrzucona' : 'Blok usunięty',
    true,
  );
}

export function openMenu(q: number, x: number, y: number): void {
  if (!topCats(app.S.cats).length) return;
  const f = fit(occ(app.S.blocks, app.viewDay), q);
  if (!f) return;
  ui.menu = { q, fit: f, rel: rel(app.viewDay, q, q + 1, app.now), level: null, x, y };
}

export const closeMenu = (): void => void (ui.menu = null);

/** Kategoria z dziećmi otwiera drugi pierścień; bez dzieci zapisuje od razu. */
export function chooseCat(id: string): void {
  const menu = ui.menu;
  if (!menu) return;
  if (!menu.level && kids(app.S.cats, id).length) {
    menu.level = id;
    return;
  }
  const q = menu.q;
  ui.menu = null;
  createAt(q, id);
}

/** Kliknięcie w komórkę: blok awansuje, puste miejsce otwiera menu. */
export function actAt(q: number, x: number, y: number): void {
  const b = occ(app.S.blocks, app.viewDay)[q];
  if (b) advance(b);
  else openMenu(q, x, y);
}

export function openEdit(id: string): void {
  const b = app.S.blocks.find((x) => x.id === id);
  if (!b) return;
  ui.menu = null;
  ui.edit = { id, cat: b.cat };
}

/** Środek komórki kwantu — potrzebny, żeby menu otworzyło się tam, gdzie pole. */
export function cellCenter(q: number): [number, number] | null {
  const el = document.querySelector<HTMLElement>(`#grid .cell[data-q="${q}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

// Cyfra przypisuje kategorię: istniejącemu blokowi zmienia kategorię, puste pole
// wypełnia, a kategoria z dziećmi otwiera drugi pierścień zamiast zgadywać.
export function assignDigit(n: number, cursorQ: number | null): void {
  const cat = topCats(app.S.cats)[n - 1];
  if (!cat) return;
  if (cursorQ === null) {
    app.toast = { msg: 'Użyj strzałek, aby wskazać pole', undoable: false };
    return;
  }

  const b = occ(app.S.blocks, app.viewDay)[cursorQ];
  if (b) {
    if (b.cat !== cat.id) commit(() => void (b.cat = cat.id));
    return;
  }

  if (kids(app.S.cats, cat.id).length) {
    const c = cellCenter(cursorQ);
    if (!c) return;
    openMenu(cursorQ, c[0], c[1]);
    if (ui.menu) ui.menu.level = cat.id;
    return;
  }
  createAt(cursorQ, cat.id);
}

/* ───────────── Lista notatek ───────────── */

export function setItemType(id: string, type: ItemType): void {
  const item = app.S.items.find((i) => i.id === id);
  if (!item || item.type === type) return;
  commit(() => {
    item.type = type;
    // Wyjście ze stanu przeniesionego czyści ślad, ale NIE kasuje kopii
    // w dniu docelowym — to osobna pozycja, którą użytkownik usuwa sam.
    if (type !== 'migrated' && type !== 'scheduled') delete item.movedTo;
  });
}

export const cycleItemType = (id: string, dir: 1 | -1 = 1): void => {
  const item = app.S.items.find((i) => i.id === id);
  if (item) setItemType(id, cycleType(item.type, dir));
};

export function migrateItem(
  id: string,
  targetDay: string,
  type: 'migrated' | 'scheduled',
): void {
  const before = app.S.items;
  const after = migrateTo(before, id, targetDay, Date.now(), uid, type);
  if (after.length === before.length) {
    app.toast = { msg: 'Ta pozycja została już przeniesiona', undoable: false };
    return;
  }
  commit(() => (app.S.items = after), `Przeniesiono na ${targetDay}`, true);
}

export const migrateToTomorrow = (id: string): void =>
  migrateItem(id, shiftDay(app.viewDay, 1), 'migrated');
