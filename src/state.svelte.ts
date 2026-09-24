import { normalize, uid } from './lib/model';
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
  viewDay: today(),
  now: Date.now(),
  toast: null as Toast | null,
});

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
export function commit(fn: () => void, msg?: string, undoable = false): void {
  if (undoable) {
    history.push($state.snapshot(app.S) as State);
    if (history.length > HISTORY_MAX) history.shift();
  }
  fn();
  if (!save()) {
    app.toast = { msg: 'Zapis nieudany — pobierz kopię zapasową', undoable: false };
    return;
  }
  if (msg) app.toast = { msg, undoable };
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
  let lastToday = today();
  const id = setInterval(() => {
    app.now = Date.now();
    const t = today();
    if (t !== lastToday) {
      if (app.viewDay === lastToday) app.viewDay = t;
      lastToday = t;
    }
    if (autoConfirm()) save();
  }, 1000);
  return () => clearInterval(id);
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
