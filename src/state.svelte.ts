import { normalize, uid } from './lib/model';
import { step } from './lib/machine';
import type { DayHours, Event, Item, Machine, Refusal } from './lib/machine';
import { readJSON, writeJSON } from './lib/persist';
import { dayKey, today } from './lib/time';
import type { Prefs, State } from './lib/types';

const KEY = 'diurnus.v1';
const PREF = 'diurnus.prefs';

// Jednorazowe przeniesienie spod poprzedniej nazwy projektu (gridday → diurnus).
// Warunek „w celu nic nie ma" sprawia, że przeniesienie jest bezpieczne przy
// każdym uruchomieniu i nigdy nie nadpisze nowszych danych.
try {
  const MOVES: [string, string][] = [
    ['gridday.v1', KEY],
    ['gridday.prefs', PREF],
  ];
  for (const [from, to] of MOVES) {
    const v = localStorage.getItem(from);
    if (v !== null && localStorage.getItem(to) === null) {
      localStorage.setItem(to, v);
      localStorage.removeItem(from);
    }
  }
} catch {
  // Tryb prywatny potrafi zabronić dostępu; brak przeniesienia nie może
  // przeszkodzić w starcie.
}

const DEFAULT_PREFS: Prefs = { theme: 'auto', seenHelp: false, notify: false };

export interface Toast {
  msg: string;
  undoable: boolean;
}

export const app = $state({
  S: normalize(readJSON<unknown>(localStorage, KEY, null)),
  prefs: { ...DEFAULT_PREFS, ...readJSON<Partial<Prefs>>(localStorage, PREF, {}) },
  now: Date.now(),
  toast: null as Toast | null,
});

// Stan wyłącznie widokowy: nie trafia do localStorage i nie ma go w State.
// Mieszka tu, bo dzieli go rodzeństwo komponentów, które nie ma wspólnego rodzica
// bliżej niż App.
export interface MenuState {
  q: number;
  /** miejsce nowego zadania; `null` — menu wybiera tylko kategorię */
  fit: { q: number; len: number } | null;
  rel: 'past' | 'now' | 'future';
  level: string | null;
  x: number;
  y: number;
}

export const ui = $state({
  hover: null as string | null,
  cursor: { q: 0, visible: false },
  menu: null as MenuState | null,
  /** widoczny panel na wąskim ekranie; na szerokim widać oba */
  pane: 'grid' as 'grid' | 'list' | 'backlog',
  /** czy ekran jest za wąski na dwa panele — ustawia Panes.svelte */
  narrow: false,
  /** pozycja listy, która ma dostać fokus po operacji strukturalnej */
  focusItem: null as string | null,
  /** trwające przeciąganie pozycji; `toIndex` liczy się w liście dnia BEZ niej */
  drag: null as { id: string; toIndex: number } | null,
  /** trwające przeciąganie bloku po siatce; `q` to kwant, na którym by wylądował
   *  (null = kursor poza siatką), `ok` — czy to miejsce jest wolne */
  blockDrag: null as { id: string; len: number; q: number | null; ok: boolean } | null,
  /** okienko wyboru daty otwarte dla tej pozycji */
  datePrompt: null as { itemId: string; x: number; y: number } | null,
  /** pozycja czekająca na wybór kategorii z menu znacznika */
  catFor: null as string | null,
  edit: null as { id: string; cat: string } | null,
  settings: null as 'cats' | 'day' | 'data' | null,
  help: false,
});

/** Wierzchnia warstwa decyduje, co robią klawisze. */
export function activeLayer(): 'grid' | 'menu' | 'edit' | 'settings' | 'help' {
  if (ui.menu) return 'menu';
  if (ui.edit) return 'edit';
  if (ui.settings) return 'settings';
  if (ui.help) return 'help';
  return 'grid';
}

export function closeAll(): void {
  ui.menu = null;
  ui.edit = null;
  ui.settings = null;
  ui.help = false;
}

/**
 * Aplikacja pokazuje wyłącznie dziś. „Dziś" to dzień maszyny stanów; zegar
 * przesuwa go zdarzeniem `advance`, nie ma innej drogi.
 */
export const currentDay = {
  get value() {
    return app.S.today;
  },
};

export const save = () => writeJSON(localStorage, KEY, $state.snapshot(app.S));
export const savePrefs = () => writeJSON(localStorage, PREF, $state.snapshot(app.prefs));

// Widoczne okno doby, wyliczane ze stanu.
export const win = {
  get startH() {
    return app.S.day.start;
  },
  get endH() {
    return app.S.day.end;
  },
  get hours() {
    return app.S.day.end - app.S.day.start;
  },
  get q0() {
    return app.S.day.start * 4;
  },
  get q1() {
    return app.S.day.end * 4;
  },
  /** aktywna część doby w kwantach, tak jak widzi ją maszyna */
  get dayHours(): DayHours {
    return { q0: app.S.day.start * 4, q1: app.S.day.end * 4 };
  },
};

const history: State[] = [];
const HISTORY_MAX = 50;

// Migawki zamiast dziennika operacji odwrotnych: stan jest mały, a migawka
// nie może rozjechać się z operacją, którą miała cofać.
// Migawka powstaje przy KAŻDEJ mutacji, nie tylko przy tych z przyciskiem
// cofania: `undoable` decyduje wyłącznie o tym, czy toast zaproponuje cofnięcie,
// a skrót klawiszowy ma cofać wszystko.
export function commit(fn: () => void, msg?: string, undoable = false): void {
  history.push($state.snapshot(app.S) as State);
  if (history.length > HISTORY_MAX) history.shift();
  fn();
  if (!save()) {
    app.toast = { msg: 'Zapis nieudany — pobierz kopię zapasową', undoable: false };
    return;
  }
  if (msg) app.toast = { msg, undoable };
}

/** Migawka bez mutacji — dla edycji tekstu, gdzie zmiana idzie znak po znaku
 *  i pierwszy znak ma wyznaczyć punkt cofnięcia. */
export function pushHistory(): void {
  history.push($state.snapshot(app.S) as State);
  if (history.length > HISTORY_MAX) history.shift();
}

export function undo(): void {
  const prev = history.pop();
  if (!prev) return;
  app.S = prev;
  save();
  app.toast = { msg: 'Cofnięto', undoable: false };
}

/* ───────────── Maszyna stanów ───────────── */

/** Odmowy maszyny po ludzku. Wołający może podać własny tekst. */
export const REFUSAL_MSG: Record<Refusal, string> = {
  'unknown-item': 'Tej pozycji już nie ma',
  'duplicate-id': 'Taka pozycja już istnieje',
  'not-allowed': 'Tego nie można zrobić z tą pozycją',
  'slot-taken': 'Ta godzina jest już zajęta',
  'slot-outside-day': 'Ta godzina nie mieści się w dniu',
  'bad-date': 'Nieprawidłowa data',
};

export interface DispatchOptions {
  /** komunikat po udanej zmianie */
  msg?: string;
  undoable?: boolean;
  /** własny komunikat odmowy; `null` — odmowa bez komunikatu */
  refusal?: (r: Refusal) => string | null;
  /** zmiana danych, nie stanu (kolejność, kategoria) w tej samej migawce */
  after?: (items: Item[]) => Item[];
}

const machineOf = (): Machine => ({
  today: app.S.today,
  items: $state.snapshot(app.S.items) as Item[],
});

/**
 * Jedyna droga zmiany stanu pozycji: zdarzenia idą przez maszynę po kolei.
 * Wszystkie muszą przejść — pierwsza odmowa zostawia stan nietknięty i jest
 * zwracana. Udane trafiają do jednej migawki, więc jedno cofnięcie cofa całość.
 */
export function dispatch(events: readonly Event[], opts: DispatchOptions = {}): Refusal | null {
  let m = machineOf();
  for (const e of events) {
    const r = step(m, e, win.dayHours);
    if (!r.ok) {
      const msg = opts.refusal ? opts.refusal(r.reason) : REFUSAL_MSG[r.reason];
      if (msg) app.toast = { msg, undoable: false };
      return r.reason;
    }
    m = r.machine;
  }
  const items = opts.after ? opts.after([...m.items]) : [...m.items];
  commit(
    () => {
      app.S.items = items;
      app.S.today = m.today;
    },
    opts.msg,
    opts.undoable,
  );
  return null;
}

/**
 * Zegar przesuwa dzień maszyny. Poza historią cofania: cofnięcie przez północ
 * przywróciłoby wczorajszy stan, który zegar i tak zaraz przesunie — więc
 * historia sprzed północy przestaje mieć sens i jest czyszczona.
 */
export function advanceTo(day: string): boolean {
  if (day <= app.S.today) return false;
  const r = step(machineOf(), { type: 'advance', to: day }, win.dayHours);
  if (!r.ok) return false;
  app.S.items = [...r.machine.items];
  app.S.today = r.machine.today;
  history.length = 0;
  save();
  return true;
}

// Stan z pamięci mógł zostać zapisany wczoraj albo tydzień temu.
advanceTo(today());

// Raz na sekundę: wskaźnik TERAZ i odliczanie wyprowadzają się z `now`,
// a zmiana doby przesuwa dzień maszyny.
export function startClock(): () => void {
  const id = setInterval(tickOnce, 1000);
  return () => clearInterval(id);
}

/** Jedno tyknięcie zegara — na potrzeby testów, bez czekania na interwał. */
export function tickOnce(): void {
  app.now = Date.now();
  advanceTo(dayKey(new Date(app.now)));
}

// Druga karta tej samej przeglądarki zapisała stan — przejmij go.
export function startCrossTabSync(): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY || e.newValue === null) return;
    app.S = normalize(JSON.parse(e.newValue) as unknown);
  };
  addEventListener('storage', onStorage);
  return () => removeEventListener('storage', onStorage);
}

export { uid, dayKey };
