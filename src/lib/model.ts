import { reconcile } from './link';
import type { Band, Block, Category, DaySettings, Item, State, Status } from './types';

export const COLORS = ['yellow', 'orange', 'red', 'purple', 'blue', 'aqua', 'green'] as const;

export const ICONS = [
  'circle', 'star', 'hands-praying', 'church', 'cross', 'book-bible', 'sun', 'moon',
  'laptop-code', 'briefcase', 'code', 'book-open', 'graduation-cap', 'pen-nib', 'brain',
  'dumbbell', 'person-running', 'bicycle', 'mountain', 'house', 'seedling', 'broom',
  'utensils', 'hammer', 'mug-hot', 'bed', 'music', 'guitar', 'gamepad', 'film', 'users',
  'child', 'heart', 'phone', 'envelope', 'cart-shopping', 'car', 'list-check',
] as const;

export const MAX_TOP = 9;
export const MAX_KIDS = 9; // cyfry 1–9 jako skróty

export const STATUS_LABEL: Record<Status, string> = {
  suggested: 'sugestia',
  planned: 'plan',
  active: 'w toku',
  confirmed: 'wykonane',
  discarded: 'odrzucone',
};

const DEFAULT_CATS: readonly Category[] = [
  { id: 'work', name: 'Praca', icon: 'laptop-code', color: 'yellow', parent: null },
  { id: 'work-a', name: 'Projekt A', icon: null, parent: 'work' },
  { id: 'pray', name: 'Modlitwa', icon: 'hands-praying', color: 'purple', parent: null },
  { id: 'pray-j', name: 'Jutrznia', icon: 'sun', parent: 'pray' },
  { id: 'pray-t', name: 'Tercja', icon: null, parent: 'pray' },
  { id: 'learn', name: 'Nauka', icon: 'book-open', color: 'blue', parent: null },
  { id: 'move', name: 'Ruch', icon: 'dumbbell', color: 'green', parent: null },
  { id: 'home', name: 'Dom', icon: 'house', color: 'orange', parent: null },
  { id: 'home-g', name: 'Ogród', icon: 'seedling', parent: 'home' },
  { id: 'rest', name: 'Odpoczynek', icon: 'mug-hot', color: 'aqua', parent: null },
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

export function normalize(x: unknown): State {
  const s = x as Partial<State> | null | undefined;

  // v1 trzymało q względem 06:00; v2 liczy od północy.
  if (s && typeof s === 'object' && s.v === 1 && Array.isArray(s.blocks)) {
    s.blocks.forEach((b) => {
      b.q += 24;
    });
    s.v = 2;
  }

  // v2 nie znało listy notatek.
  if (s && typeof s === 'object' && s.v === 2) {
    s.items = [];
    s.v = 3;
  }

  // v3 nie znało powiązania bloków z pozycjami: dorabiamy je dla wszystkich dni
  // jeden raz, żeby niezmiennik obowiązywał także w dniach, których użytkownik
  // jeszcze nie odwiedził.
  if (s && typeof s === 'object' && s.v === 3) {
    s.items = reconcile(
      (s.items ?? []) as Item[],
      (s.blocks ?? []) as Block[],
      null,
      Date.now(),
      uid,
    );
    s.v = 4;
  }

  if (!s || typeof s !== 'object' || Array.isArray(s) || s.v !== 4 || !Array.isArray(s.blocks)) {
    return {
      v: 4,
      cats: clone(DEFAULT_CATS) as Category[],
      day: clone(DEFAULT_DAY) as DaySettings,
      blocks: [],
      items: [],
    };
  }

  if (!Array.isArray(s.cats) || !s.cats.length) s.cats = clone(DEFAULT_CATS) as Category[];
  if (!s.day || !(s.day.start < s.day.end) || !Array.isArray(s.day.bands)) {
    s.day = clone(DEFAULT_DAY) as DaySettings;
  }
  // Uszkodzona kopia zapasowa może nie mieć listy w ogóle.
  if (!Array.isArray(s.items)) s.items = [] as Item[];

  // Bloki poza widocznym oknem doby zostają w danych. Zwężenie dnia chowa je
  // z widoku; rozszerzenie musi je przywrócić, a nie odkryć, że zniknęły.
  return s as State;
}
