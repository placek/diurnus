import { app, commit, currentDay, ui, uid, win } from './state.svelte';
import { acceptTarget, movedStatus, newBlock, statusFor } from './lib/actions';
import { kids, topCats } from './lib/categories';
import { fit, occ } from './lib/occupancy';
import { canPlace, reconcile, slotFree } from './lib/link';
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
import { fmtQ, pad, rel, shiftDay } from './lib/time';
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
  const pulling = ui.pullTo;
  const categorising = ui.catFor;
  ui.menu = null;
  ui.pullTo = null;
  ui.catFor = null;
  // Menu obsługuje trzy źródła: klik w pustą komórkę, pozycję ciągniętą
  // z backlogu i nadanie kategorii pozycji z menu znacznika.
  if (categorising) setItemCategory(categorising, id);
  else if (pulling) finishPull(pulling, id);
  else createAt(q, id);
}

/** Kliknięcie w komórkę: blok awansuje, puste miejsce otwiera menu. */
export function actAt(q: number, x: number, y: number): void {
  const b = occ(app.S.blocks, currentDay.value)[q];
  if (b) advance(b);
  else openMenu(q, x, y);
}

/** Czy blok da się przenieść tak, by zaczynał się w `q` — w oknie dnia i na wolne miejsce. */
export function canMoveTo(id: string, q: number): boolean {
  const b = app.S.blocks.find((x) => x.id === id);
  if (!b) return false;
  return canPlace(app.S.blocks, b.day, b.id, q, b.len, win.q0, win.q1);
}

/** Przeniesienie bloku w czasie: nowy kwant początkowy, ta sama długość i kategoria. */
export function moveBlock(id: string, q: number): void {
  const b = app.S.blocks.find((x) => x.id === id);
  if (!b || q === b.q) return;
  // Odmowa mówi dlaczego: duch pokazywał, że nie wolno, ale nie tłumaczył.
  if (q < win.q0 || q + b.len > win.q1) {
    app.toast = {
      msg: `Poza zakresem dnia ${pad(win.startH)}:00–${pad(win.endH)}:00`,
      undoable: false,
    };
    return;
  }
  if (!slotFree(app.S.blocks, b.day, q, b.len, b.id)) {
    app.toast = { msg: `O ${fmtQ(b.day, q)} jest już zajęte`, undoable: false };
    return;
  }
  const status = movedStatus(b, q, app.now);
  commit(
    () => {
      b.q = q;
      b.status = status;
    },
    `Przeniesiono na ${fmtQ(b.day, q)}`,
    true,
  );
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

/* Po przeciągnięciu przeglądarka i tak wysyła click. Komponent bloku nie
   może go połknąć sam: przeniesiony blok jest już nowym elementem w innym
   rzędzie, a click może trafić w komórkę pod nim. Znacznik gaśnie w
   następnym zadaniu — click przychodzi w tym samym — więc brak clicka nie
   połknie kolejnego, prawdziwego kliknięcia. */
let swallowClick = false;

export function swallowNextClick(): void {
  swallowClick = true;
  setTimeout(() => (swallowClick = false), 0);
}

/** Czy to kliknięcie jest echem przeciągnięcia i ma zostać zignorowane. */
export function consumeSwallowedClick(): boolean {
  const s = swallowClick;
  swallowClick = false;
  return s;
}

/** Kwant komórki siatki pod wskazanym punktem ekranu; null poza siatką
 *  albo gdy środowisko nie umie trafiać w elementy (jsdom). */
export function qAtPoint(x: number, y: number): number | null {
  if (typeof document.elementsFromPoint !== 'function') return null;
  for (const el of document.elementsFromPoint(x, y)) {
    const q = (el as HTMLElement).dataset?.q;
    if (q !== undefined && el.classList.contains('cell')) return Number(q);
  }
  return null;
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
  // Nowa pozycja dziedziczy dzień poprzedniej, nie „dziś": Enter w backlogu ma
  // tworzyć pozycję tam, gdzie się pisze, a nie przerzucać ją do notatek.
  const day = prev ? prev.day : currentDay.value;
  const item = newItem(day, type, Date.now(), uid);
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
export function createItemWithText(text: string, day: string | null = currentDay.value): void {
  const item = { ...newItem(day, 'task', Date.now(), uid), text };
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

/** Przeniesienie pozycji do backlogu: dzień, opcjonalna pora, koniec powiązania. */
export function scheduleItem(id: string, day: string | null, at?: number): void {
  const item = app.S.items.find((i) => i.id === id);
  if (!item) return;
  commit(() => {
    item.day = day;
    if (at === undefined) delete item.at;
    else item.at = at;
    // Pozycja opuszczająca dziś nie może dalej wskazywać na dzisiejszy blok.
    if (item.block) delete item.block;
  });
}

/**
 * Wzięcie rzeczy z backlogu na dziś. Godzina, którą pozycja już nosi, staje się
 * blokiem — jeśli slot jest wolny. Kategorię wybiera menu radialne; pozycja bez
 * godziny pomija je i ląduje jako zwykła notatka.
 */
export function pullToToday(id: string, x: number, y: number): void {
  const item = app.S.items.find((i) => i.id === id);
  if (!item) return;
  const today = currentDay.value;

  if (item.at === undefined) {
    commit(() => {
      item.day = today;
      delete item.repeat;
      delete item.nextOn;
    });
    return;
  }

  if (!slotFree(app.S.blocks, today, item.at, 2)) {
    const at = item.at;
    commit(() => {
      item.day = today;
      delete item.at;
      delete item.repeat;
      delete item.nextOn;
    });
    app.toast = {
      msg: `O ${fmtQ(today, at)} jest już zajęte — pozycja bez bloku`,
      undoable: false,
    };
    return;
  }

  // Godzina jest, miejsce jest — brakuje kategorii, więc pytamy o nią tak,
  // jak przy tworzeniu bloku na siatce.
  ui.pullTo = id;
  openMenu(item.at, x, y);
}

/** Domknięcie `pullToToday` po wyborze kategorii w menu radialnym. */
export function finishPull(id: string, catId: string): void {
  const item = app.S.items.find((i) => i.id === id);
  if (!item || item.at === undefined) return;
  const today = currentDay.value;
  const at = item.at;
  const block = newBlock(today, at, 2, catId, statusFor(today, at, 2, app.now), Date.now(), uid);
  commit(() => {
    app.S.blocks.push(block);
    item.day = today;
    delete item.at;
    delete item.repeat;
    delete item.nextOn;
    item.block = block.id;
  });
}

/** Kategoria pozycji swobodnej. Powiązana bierze ją z bloku i nie da się jej tu zmienić. */
export function setItemCategory(id: string, catId: string | null): void {
  const item = app.S.items.find((i) => i.id === id);
  if (!item || item.block) return;
  commit(() => {
    if (catId) item.cat = catId;
    else delete item.cat;
  });
}
