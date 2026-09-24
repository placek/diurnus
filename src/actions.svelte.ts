import { app, commit, currentDay, ui, uid } from './state.svelte';
import { acceptTarget, newBlock, statusFor } from './lib/actions';
import { kids, topCats } from './lib/categories';
import { fit, occ } from './lib/occupancy';
import { reconcile, slotFree } from './lib/link';
import { isBacklog } from './lib/backlog';
import { nextOccurrence } from './lib/repeat';
import {
  cycleType,
  insertAfter,
  moveItem,
  newItem,
  removeById,
  typeAfterEnter,
} from './lib/items';
import { fmtQ, rel, shiftDay } from './lib/time';
import type { Block, Item, ItemType, Repeat } from './lib/types';

function stopOtherActive(exceptId: string): void {
  for (const b of app.S.blocks) {
    if (b.status === 'active' && b.id !== exceptId) b.status = 'confirmed';
  }
}

export function createAt(q: number, catId: string): void {
  const f = fit(occ(app.S.blocks, currentDay.value), q);
  if (!f) return;
  const status = statusFor(currentDay.value, f.q, f.len, app.now);
  const b = newBlock(currentDay.value, f.q, f.len, catId, status, Date.now(), uid);
  commit(
    () => {
      if (status === 'active') stopOtherActive(b.id);
      app.S.blocks.push(b);
    },
    status === 'active' ? `Start: do ${fmtQ(currentDay.value, f.q + f.len)}` : undefined,
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
  const f = fit(occ(app.S.blocks, currentDay.value), q);
  if (!f) return;
  ui.menu = { q, fit: f, rel: rel(currentDay.value, q, q + 1, app.now), level: null, x, y };
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
  const b = occ(app.S.blocks, currentDay.value)[q];
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

  const b = occ(app.S.blocks, currentDay.value)[cursorQ];
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
  });
}

/** Pozycja powiązana: znacznik JEST statusem bloku, więc przełączamy status. */
export function toggleBlockDone(id: string): void {
  const item = app.S.items.find((i) => i.id === id);
  const block = item?.block ? app.S.blocks.find((b) => b.id === item.block) : undefined;
  if (!block) return;
  commit(() => {
    block.status = block.status === 'confirmed' ? 'planned' : 'confirmed';
  });
}

export const cycleItemType = (id: string, dir: 1 | -1 = 1): void => {
  const item = app.S.items.find((i) => i.id === id);
  if (!item) return;
  // Znacznik pozycji powiązanej nie ma własnego cyklu — odbija status bloku.
  if (item.block) return toggleBlockDone(id);
  setItemType(id, cycleType(item.type, dir));
};

/** Nowa pozycja pod wskazaną (albo na końcu listy dnia, gdy `afterId` jest null). */
export function addItemAfter(afterId: string | null): void {
  const prev = afterId ? app.S.items.find((i) => i.id === afterId) : undefined;
  const type = prev ? typeAfterEnter(prev.type) : 'task';
  const item = newItem(currentDay.value, type, Date.now(), uid);
  commit(() => (app.S.items = insertAfter(app.S.items, afterId, item)));
  ui.focusItem = item.id;
}

export function deleteItem(id: string, focusAfter: string | null): void {
  const item = app.S.items.find((i) => i.id === id);
  // Lustro: pozycja JEST blokiem, więc usunięcie jednej strony usuwa drugą.
  // Blok znika w tej samej migawce, więc jedno Ctrl+Z przywraca oba.
  const blockId = item?.block;
  commit(() => {
    app.S.items = removeById(app.S.items, id);
    if (blockId) app.S.blocks = app.S.blocks.filter((b) => b.id !== blockId);
  });
  ui.focusItem = focusAfter;
}

/** Tekst zmienia się bez migawki — tę robi `pushHistory()` przy pierwszym
 *  znaku w danej pozycji, a `save()` utrwala każdą zmianę. */
export function setItemText(id: string, text: string): void {
  const item = app.S.items.find((i) => i.id === id);
  if (!item) return;
  item.text = text;
  // Tekst piszą obie ścieżki edycji, nie reconcile — inaczej trzeba by zgadywać,
  // która strona zmieniła się jako ostatnia.
  if (item.block) {
    const block = app.S.blocks.find((b) => b.id === item.block);
    if (block) block.title = text;
  }
}

/** Tworzy pozycję z podanym tekstem na końcu listy dnia i ustawia na nią fokus.
 *  Używane przez pole początkowe, które samo NIE jest pozycją w stanie. */
export function createItemWithText(text: string): void {
  const item = { ...newItem(currentDay.value, 'task', Date.now(), uid), text };
  commit(() => (app.S.items = insertAfter(app.S.items, null, item)));
  ui.focusItem = item.id;
}

/** Przestawienie pozycji na liście dnia; `toIndex` to miejsce w liście BEZ niej. */
export function moveItemTo(id: string, toIndex: number): void {
  const before = app.S.items;
  const after = moveItem(before, id, toIndex, currentDay.value);
  if (after.every((x, i) => x === before[i])) return; // nic się nie przesunęło
  commit(() => (app.S.items = after), undefined, true);
}

/**
 * Odhaczenie w backlogu: rzecz zrobiona należy do dzisiejszego dziennika,
 * nie do dnia, na który była zaplanowana.
 */
export function completeBacklogItem(id: string): void {
  const item = app.S.items.find((i) => i.id === id);
  if (!item) return;
  const today = currentDay.value;

  if (!item.repeat) {
    commit(() => {
      item.day = today;
      item.type = 'done';
      // Pora opisywała plan; dziś rzecz jest po prostu zrobiona.
      delete item.at;
    });
    return;
  }

  // Powtarzalna: szablon zostaje w backlogu, kopia idzie do dziś,
  // a termin przesuwa się na następne wystąpienie.
  const copy: Item = {
    id: uid(),
    day: today,
    text: item.text,
    type: 'done',
    created: Date.now(),
  };
  commit(() => {
    app.S.items = [...app.S.items, copy];
    item.nextOn = nextOccurrence(item.repeat!, item.nextOn ?? today);
  });
}

/** Ustawienie albo zdjęcie wzorca powtarzania pozycji backlogu. */
export function setRepeat(id: string, repeat: Repeat | undefined): void {
  const item = app.S.items.find((i) => i.id === id);
  if (!item) return;
  commit(() => {
    if (repeat) {
      item.repeat = repeat;
      // Termin liczony od dziś, żeby nowy wzorzec nie zaczynał w przeszłości.
      item.nextOn = nextOccurrence(repeat, currentDay.value);
    } else {
      delete item.repeat;
      delete item.nextOn;
    }
  });
}
