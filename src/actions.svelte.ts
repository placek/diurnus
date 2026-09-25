import { app, commit, currentDay, dispatch, ui, uid, win } from './state.svelte';
import { kids, topCats } from './lib/categories';
import { cycleType, moveFree, placeAfter, retype, typeAfterEnter } from './lib/items';
import type { Event, Item, Refusal, WhenInput } from './lib/machine';
import type { RRule } from './lib/rrule';
import { fmtQ, pad, rel } from './lib/time';
import type { ItemType } from './lib/types';
import { canClaim, isBacklog, isDone, kindOf, occ, slotOf, whenOf } from './lib/view';

/*
 * Każda zmiana stanu pozycji to zdarzenie maszyny wysłane przez `dispatch`.
 * Bezpośrednio zmieniane są tylko dane, które stanem nie są: tekst, kategoria
 * i kolejność pozycji swobodnych.
 */

const find = (id: string): Item | undefined => app.S.items.find((i) => i.id === id);

/** Pola danych, które aplikacja zmienia wprost. Maszyna trzyma je jako
 *  tylko do odczytu, bo sama ich nie zmienia; stan nadal idzie przez zdarzenia. */
type ItemData = { text: string; cat?: string };
const data = (i: Item) => i as unknown as ItemData;

/** Komunikat odmowy przy zajmowaniu slotu, z godziną i zakresem dnia. */
const slotRefusal =
  (q: number) =>
  (r: Refusal): string | null => {
    if (r === 'slot-taken') return `O ${fmtQ(currentDay.value, q)} jest już zajęte`;
    if (r === 'slot-outside-day')
      return `Poza zakresem dnia ${pad(win.startH)}:00–${pad(win.endH)}:00`;
    return null;
  };

/* ───────────── Siatka ───────────── */

/** Nowe zadanie dziś, od razu ze slotem i kategorią — jedna migawka. */
export function createAt(q: number, catId: string): void {
  const id = uid();
  dispatch(
    [
      { type: 'create', id, text: '', place: 'today', cat: catId, created: Date.now() },
      { type: 'setSlot', id, slot: q },
    ],
    { refusal: slotRefusal(q) },
  );
}

/** Wykonane ↔ otwarte. Tylko użytkownik oznacza wykonanie. */
export function toggleDone(id: string): void {
  const item = find(id);
  if (!item || kindOf(item) === 'note') return;
  dispatch([isDone(item) ? { type: 'markOpen', id } : { type: 'markDone', id, copyId: uid() }]);
}

export function removeItem(id: string, msg = 'Usunięto'): void {
  if (!find(id)) return;
  dispatch([{ type: 'remove', id }], { msg, undoable: true });
}

/** Menu kategorii na pustym polu siatki; nowe zadanie zawsze ma 30 minut. */
export function openMenu(q: number, x: number, y: number): void {
  if (!topCats(app.S.cats).length) return;
  if (!canClaim(app.S.items, q, win.dayHours)) {
    if (!occ(app.S.items)[q]) app.toast = { msg: 'Tu nie zmieści się 30 minut', undoable: false };
    return;
  }
  ui.menu = {
    q,
    fit: { q, len: 2 },
    rel: rel(currentDay.value, q, q + 1, app.now),
    level: null,
    x,
    y,
  };
}

/** Samo menu kategorii — bez miejsca na siatce, dla pozycji z listy. */
export function openCategoryMenu(itemId: string, x: number, y: number): void {
  if (!topCats(app.S.cats).length) return;
  ui.catFor = itemId;
  ui.menu = { q: 0, fit: null, rel: 'future', level: null, x, y };
}

export const closeMenu = (): void => {
  ui.menu = null;
  ui.catFor = null;
};

/** Kategoria z dziećmi otwiera drugi pierścień; bez dzieci zapisuje od razu. */
export function chooseCat(id: string): void {
  const menu = ui.menu;
  if (!menu) return;
  if (!menu.level && kids(app.S.cats, id).length) {
    menu.level = id;
    return;
  }
  const q = menu.q;
  const categorising = ui.catFor;
  ui.menu = null;
  ui.catFor = null;
  if (categorising) setItemCategory(categorising, id);
  else createAt(q, id);
}

/** Kliknięcie w komórkę: zadanie przełącza wykonanie, puste miejsce otwiera menu. */
export function actAt(q: number, x: number, y: number): void {
  const item = occ(app.S.items)[q];
  if (item) toggleDone(item.id);
  else openMenu(q, x, y);
}

export function openEdit(id: string): void {
  const item = find(id);
  if (!item) return;
  ui.menu = null;
  ui.edit = { id, cat: item.cat ?? '' };
}

/** Czy zadanie da się przenieść tak, by jego slot zaczynał się w `q`. */
export const canMoveTo = (id: string, q: number): boolean =>
  canClaim(app.S.items, q, win.dayHours, id);

/** Nowa godzina zadania. Zwraca, czy się przeniosło — klawiatura przesuwa wtedy kursor. */
export function moveBlock(id: string, q: number): boolean {
  const item = find(id);
  if (!item || slotOf(item) === q) return false;
  return (
    dispatch([{ type: 'setSlot', id, slot: q }], {
      msg: `Przeniesiono na ${fmtQ(currentDay.value, q)}`,
      undoable: true,
      refusal: (r) =>
        r === 'not-allowed' ? 'Wykonane zadanie zostaje o swojej godzinie' : slotRefusal(q)(r),
    }) === null
  );
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

// Cyfra przypisuje kategorię: zadaniu pod kursorem ją zmienia, puste pole
// wypełnia, a kategoria z dziećmi otwiera drugi pierścień zamiast zgadywać.
export function assignDigit(n: number, cursorQ: number | null): void {
  const cat = topCats(app.S.cats)[n - 1];
  if (!cat) return;
  if (cursorQ === null) {
    app.toast = { msg: 'Użyj strzałek, aby wskazać pole', undoable: false };
    return;
  }

  const item = occ(app.S.items)[cursorQ];
  if (item) {
    if (item.cat !== cat.id) setItemCategory(item.id, cat.id);
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

/* ───────────── Dane pozycji: tekst, kategoria, kolejność ───────────── */

/** Kategoria to dana, nie stan — zmienia się poza maszyną, ale z migawką. */
export function setItemCategory(id: string, catId: string | null): void {
  const item = find(id);
  if (!item || (item.cat ?? null) === catId) return;
  commit(() => {
    if (catId) data(item).cat = catId;
    else delete data(item).cat;
  });
}

/** Tekst zmienia się bez migawki — tę robi `pushHistory()` przy pierwszym
 *  znaku w danej pozycji, a `save()` utrwala każdą zmianę. */
export function setItemText(id: string, text: string): void {
  const item = find(id);
  if (item) data(item).text = text;
}

/** Przestawienie pozycji swobodnej dziś; `toIndex` to miejsce w liście BEZ niej. */
export function moveItemTo(id: string, toIndex: number): void {
  const before = app.S.items;
  const after = moveFree($state.snapshot(before) as Item[], id, toIndex);
  if (after.every((x, i) => x.id === before[i]?.id)) return; // nic się nie przesunęło
  commit(() => (app.S.items = after), undefined, true);
}

/* ───────────── Listy ───────────── */

/** Zmiana znacznika: ciąg przejść maszyny, bez skrótów poza grafem. */
export function setItemType(id: string, type: ItemType): void {
  const item = find(id);
  if (!item) return;
  const events = retype(item, type, uid());
  if (events.length) dispatch(events);
}

/**
 * Tab przechodzi przez znaczniki po kolei. Zadanie z czasem nie może być
 * notatką, więc dla niego cykl pomija notatkę zamiast stawać.
 */
export function cycleItemType(id: string, dir: 1 | -1 = 1): void {
  const item = find(id);
  if (!item) return;
  let target = cycleType(kindOf(item), dir);
  for (let n = 0; n < 2; n++) {
    const events = retype(item, target, uid());
    if (dispatch(events, { refusal: () => null }) === null) return;
    target = cycleType(target, dir);
  }
}

/** Nowa pozycja pod wskazaną (albo na końcu listy dziś, gdy `afterId` jest null). */
export function addItemAfter(afterId: string | null): void {
  const prev = afterId ? find(afterId) : undefined;
  // Enter w backlogu tworzy pozycję w backlogu, na liście dnia — w dziś.
  const place = prev && isBacklog(prev) ? 'backlog' : 'today';
  const id = uid();
  const events: Event[] = [{ type: 'create', id, text: '', place, created: Date.now() }];
  if (prev && typeAfterEnter(kindOf(prev)) === 'note') events.push({ type: 'toNote', id });
  if (dispatch(events, { after: (items) => placeAfter(items, id, afterId) }) === null)
    ui.focusItem = id;
}

export function deleteItem(id: string, focusAfter: string | null): void {
  if (!find(id)) return;
  dispatch([{ type: 'remove', id }]);
  ui.focusItem = focusAfter;
}

/** Pozycja z tekstem na końcu listy; pole początkowe samo nie jest pozycją. */
export function createItemWithText(text: string, place: 'today' | 'backlog' = 'today'): void {
  const id = uid();
  if (dispatch([{ type: 'create', id, text, place, created: Date.now() }]) === null)
    ui.focusItem = id;
}

/* ───────────── Ruch między polami ───────────── */

export function moveToBacklog(id: string): void {
  dispatch([{ type: 'move', id, to: 'backlog' }], {
    refusal: (r) => (r === 'not-allowed' ? 'Wykonane zostaje w swoim dniu' : null),
  });
}

export function moveToToday(id: string): void {
  const w = find(id) ? whenOf(find(id)!) : null;
  dispatch([{ type: 'move', id, to: 'today' }], {
    refusal: (r) => {
      if (r === 'not-allowed' && w?.type === 'recurring')
        return 'Wzorzec przychodzi sam, w swoim dniu';
      if (w?.type === 'dateSlot') return slotRefusal(w.slot)(r);
      return null;
    },
  });
}

/** Odhaczenie w backlogu: rzecz zrobiona ląduje w dziś; wzorzec zostaje. */
export function completeBacklogItem(id: string): void {
  const w = find(id) ? whenOf(find(id)!) : null;
  const slot = w && w.type !== 'date' ? w.slot : null;
  dispatch([{ type: 'markDone', id, copyId: uid() }], {
    refusal: slot !== null ? slotRefusal(slot) : undefined,
  });
}

/**
 * Termin pozycji backlogu: dzień z opcjonalną godziną albo brak terminu.
 * Z regułą dzień jest początkiem serii, a pierwsze wystąpienie to pierwsza
 * pasująca data od niego.
 */
export function scheduleItem(id: string, date: string | null, slot?: number, rule?: RRule): void {
  const when: WhenInput | null =
    date === null
      ? null
      : rule
        ? { type: 'recurring', rule, slot: slot ?? null, start: date }
        : slot === undefined
          ? { type: 'date', date }
          : { type: 'dateSlot', date, slot };
  dispatch([{ type: 'setWhen', id, when }]);
}
