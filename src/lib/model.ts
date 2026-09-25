import { fromV5 } from './migrate';
import { fromLegacy, isLegacy } from './rrule';
import type { V5State } from './migrate';
import { today as todayKey } from './time';
import type { Band, Category, DaySettings, Item, State } from './types';

export const COLORS = ['yellow', 'orange', 'red', 'purple', 'blue', 'aqua', 'green'] as const;

export const ICONS = [
  'circle',
  'star',
  'hands-praying',
  'church',
  'cross',
  'book-bible',
  'sun',
  'moon',
  'laptop-code',
  'briefcase',
  'code',
  'book-open',
  'graduation-cap',
  'pen-nib',
  'brain',
  'dumbbell',
  'person-running',
  'bicycle',
  'mountain',
  'house',
  'seedling',
  'broom',
  'utensils',
  'hammer',
  'mug-hot',
  'bed',
  'music',
  'guitar',
  'gamepad',
  'film',
  'users',
  'child',
  'heart',
  'phone',
  'envelope',
  'cart-shopping',
  'car',
  'list-check',
] as const;

export const MAX_TOP = 9;
export const MAX_KIDS = 9; // cyfry 1–9 jako skróty

const DEFAULT_CATS: readonly Category[] = [
  { id: 'tasks', name: 'Zadania', icon: 'list-check', color: 'red', parent: null },
  { id: 'tasks-daily', name: 'Daily', icon: 'circle', parent: 'tasks' },
  { id: 'tasks-meet', name: 'Spotkanie', icon: 'users', parent: 'tasks' },
  { id: 'tasks-code', name: 'Programowanie', icon: 'code', parent: 'tasks' },
  { id: 'tasks-research', name: 'Research', icon: 'graduation-cap', parent: 'tasks' },
  { id: 'pray', name: 'Modlitwa', icon: 'cross', color: 'green', parent: null },
  { id: 'move', name: 'Ruch', icon: 'person-running', color: 'aqua', parent: null },
  { id: 'home', name: 'Dom', icon: 'house', color: 'blue', parent: null },
  { id: 'home-garden', name: 'Ogród', icon: 'seedling', parent: 'home' },
  { id: 'home-car', name: 'Samochód', icon: 'car', parent: 'home' },
  { id: 'home-shop', name: 'Zakupy', icon: 'cart-shopping', parent: 'home' },
  { id: 'home-kids', name: 'Dzieci', icon: 'child', parent: 'home' },
  { id: 'home-fix', name: 'Naprawy', icon: 'hammer', parent: 'home' },
  { id: 'phone', name: 'Telefon', icon: 'phone', color: 'purple', parent: null },
];

export const DEFAULT_DAY: Readonly<DaySettings> = {
  start: 6,
  end: 22,
  bands: [
    { id: 'b-rano', name: 'Rano', from: 6, color: 'aqua' },
    { id: 'b-praca', name: 'Praca', from: 8, color: 'yellow' },
    { id: 'b-dom', name: 'Dom', from: 16, color: 'orange' },
    { id: 'b-cisza', name: 'Cisza', from: 20, color: 'purple' },
  ],
};

export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36);

const clone = <T>(x: T): T => structuredClone(x) as T;

// Pora obowiązująca o danej godzinie: ta o największym `from` nie większym niż `h`.
// Prototyp zakładał posortowaną listę; UI ustawień pozwala dodać porę w dowolnym
// miejscu, więc kolejność nie może mieć znaczenia.
export function bandAt(bands: readonly Band[], h: number): Band | null {
  let best: Band | null = null;
  for (const b of bands) {
    if (b.from <= h && (best === null || b.from > best.from)) best = b;
  }
  return best;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const fresh = (today: string): State => ({
  v: 7,
  cats: clone(DEFAULT_CATS) as Category[],
  day: clone(DEFAULT_DAY) as DaySettings,
  today,
  items: [],
});

/**
 * Stan z pamięci albo z kopii zapasowej, podniesiony do v7. `today` to dzień,
 * na który ustawia się stan przechodzący z v5 — v5 nie wiedziało, który dzień
 * jest „dziś". Stan v6 niesie swój dzień sam; do bieżącego dogania go zegar.
 */
export function normalize(x: unknown, today: string = todayKey()): State {
  // Stare wersje miały pola, których v6 nie zna — stąd luźny typ roboczy.
  const s = x as (Record<string, unknown> & { v?: number }) | null | undefined;
  if (!s || typeof s !== 'object' || Array.isArray(s)) return fresh(today);

  // v1 trzymało q względem 06:00; v2 liczy od północy.
  if (s.v === 1 && Array.isArray(s.blocks)) {
    (s.blocks as { q: number }[]).forEach((b) => {
      b.q += 24;
    });
    s.v = 2;
  }

  // v2 nie znało listy notatek.
  if (s.v === 2) {
    s.items = [];
    s.v = 3;
  }

  // v3 nie znało powiązania bloków z pozycjami. Przejście do v6 i tak zlewa
  // blok z pozycją, a blok bez pozycji dostaje własną — nie ma czego dorabiać.
  if (s.v === 3) s.v = 4;

  // v4 znało znaczniki przeniesienia; v5 przenosi pozycje dosłownie.
  if (s.v === 4) {
    s.items = ((s.items ?? []) as Record<string, unknown>[]).map((i) => {
      const { movedTo: _movedTo, ...rest } = i;
      const raw = rest['type'];
      const type = raw === 'migrated' || raw === 'scheduled' ? 'task' : raw;
      return { ...rest, type };
    });
    s.v = 5;
  }

  if (s.v === 5) {
    if (!Array.isArray(s.blocks)) return fresh(today);
    const v5 = s as unknown as V5State;
    if (!Array.isArray(v5.items)) v5.items = [];
    v5.cats = validCats(v5.cats);
    v5.day = validDay(v5.day);
    return fromV5(v5, today);
  }

  // v6 miało cztery własne wzorce powtarzania; v7 zapisuje je jako RRULE,
  // tak żeby żadna data się nie zmieniła.
  if (s.v === 6 && Array.isArray(s.items)) {
    s.items = (s.items as Item[]).map((i) => {
      const w = i?.state?.tag === 'backlog-task' ? i.state.when : null;
      if (w?.type !== 'recurring' || !isLegacy(w.rule)) return i;
      return { ...i, state: { ...i.state, when: { ...w, rule: fromLegacy(w.rule) } } } as Item;
    });
    s.v = 7;
  }

  if (s.v !== 7 || !Array.isArray(s.items)) return fresh(today);
  const v7 = s as unknown as State;
  v7.cats = validCats(v7.cats);
  v7.day = validDay(v7.day);
  if (typeof v7.today !== 'string' || !DATE.test(v7.today)) v7.today = today;
  // Uszkodzona kopia może mieć pozycje bez stanu; takich nie da się pokazać.
  v7.items = (v7.items as Item[]).filter(
    (i) => i && typeof i.id === 'string' && i.state && typeof i.state.tag === 'string',
  );
  return v7;
}

function validCats(c: unknown): Category[] {
  return Array.isArray(c) && c.length ? (c as Category[]) : (clone(DEFAULT_CATS) as Category[]);
}

function validDay(d: unknown): DaySettings {
  const day = d as DaySettings | undefined;
  return day && day.start < day.end && Array.isArray(day.bands)
    ? day
    : (clone(DEFAULT_DAY) as DaySettings);
}
