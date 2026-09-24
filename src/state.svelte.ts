import { normalize, uid } from './lib/model';
import { reconcile } from './lib/link';
import { readJSON, writeJSON } from './lib/persist';
import { dayKey, qTime, today } from './lib/time';
import type { Block, Prefs, State } from './lib/types';

const KEY = 'gridday.v1';
const PREF = 'gridday.prefs';

const DEFAULT_PREFS: Prefs = { theme: 'auto', seenHelp: false };

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
  fit: { q: number; len: number };
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
  /** okienko wyboru daty otwarte dla tej pozycji */
  datePrompt: null as { itemId: string; x: number; y: number } | null,
  /** pozycja czekająca na wybór kategorii po przeciągnięciu z backlogu */
  pullTo: null as string | null,
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
 * Aplikacja pokazuje wyłącznie dziś. Data wynika z zegara, nie z nawigacji —
 * nie ma czego przewijać, więc nie ma czego trzymać w stanie.
 */
export const currentDay = {
  get value() {
    return dayKey(new Date(app.now));
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
};

const history: State[] = [];
const HISTORY_MAX = 50;

export const canUndo = () => history.length > 0;

// Migawki zamiast dziennika operacji odwrotnych: stan jest mały, a migawka
// nie może rozjechać się z operacją, którą miała cofać.
// Migawka powstaje przy KAŻDEJ mutacji, nie tylko przy tych z przyciskiem
// cofania: `undoable` decyduje wyłącznie o tym, czy toast zaproponuje cofnięcie,
// a skrót klawiszowy ma cofać wszystko.
export function commit(fn: () => void, msg?: string, undoable = false): void {
  history.push($state.snapshot(app.S) as State);
  if (history.length > HISTORY_MAX) history.shift();
  fn();
  // Niezmiennik utrzymywany w jednym miejscu: żaden z mutatorów bloków nie
  // musi pamiętać o liście, bo każdy i tak przechodzi tędy.
  app.S.items = reconcile(app.S.items, app.S.blocks, currentDay.value, Date.now(), uid);
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

const blockEnd = (b: Block) => qTime(b.day, b.q + b.len);

// Blok w toku domyka się sam, gdy minie jego czas.
function autoConfirm(): boolean {
  let changed = false;
  for (const b of app.S.blocks) {
    if (b.status === 'active' && blockEnd(b) <= app.now) {
      b.status = 'confirmed';
      changed = true;
    }
  }
  return changed;
}

// Raz na sekundę: wskaźnik TERAZ i odliczanie wyprowadzają się z `now`.
// Gdy zmieni się doba, widok przechodzi na nowy dzień tylko wtedy, gdy
// użytkownik patrzył na poprzednie „dzisiaj" — ręcznie wybrany dzień zostaje.
export function startClock(): () => void {
  const id = setInterval(() => {
    app.now = Date.now();
    if (autoConfirm()) {
      // Domknięcie bloku omija commit(), więc znacznik na liście trzeba
      // uzgodnić tutaj — inaczej siatka pokazywałaby wykonanie, a lista nie.
      app.S.items = reconcile(app.S.items, app.S.blocks, currentDay.value, Date.now(), uid);
      save();
    }
  }, 1000);
  return () => clearInterval(id);
}

/** Jedno tyknięcie zegara — na potrzeby testów, bez czekania na interwał. */
export function tickOnce(): void {
  app.now = Date.now();
  if (autoConfirm()) {
    app.S.items = reconcile(app.S.items, app.S.blocks, currentDay.value, Date.now(), uid);
    save();
  }
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
