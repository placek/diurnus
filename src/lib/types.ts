import type { Item } from './machine';
export const QDAY = 96; // kwanty 15-minutowe w dobie

export interface Category {
  id: string;
  name: string;
  icon: string | null; // null = dziedzicz ikonę kategorii nadrzędnej
  color?: string; // tylko kategorie główne; podkategorie dziedziczą
  parent: string | null;
  archived?: boolean;
  /** slug w plikach markdown (`#tag`); brak — wyliczany z nazwy */
  tag?: string;
}

export interface Band {
  // pora dnia; trwa do `from` następnej
  id: string;
  name: string;
  from: number; // godzina rozpoczęcia
  color: string;
}

/** Jak pozycja wygląda na liście: znacznik bullet journal. Wynika ze stanu. */
export type ItemType = 'task' | 'done' | 'note';

export type { RRule } from './rrule';
export type { Item } from './machine';

export interface DaySettings {
  start: number;
  end: number;
  bands: Band[];
}

/**
 * v7: pozycje są stanami maszyny z `machine.ts`, a wzorce powtarzania to
 * reguły iCal (RRULE, `rrule.ts`); v6 miało cztery własne wzorce. Siatka nie ma własnych
 * danych — to rzut dzisiejszych zadań ze slotem. `today` zmienia wyłącznie
 * zdarzenie `advance`.
 */
export interface State {
  v: 7;
  cats: Category[];
  day: DaySettings;
  today: string;
  items: Item[];
}

export interface Prefs {
  theme: 'auto' | 'light' | 'dark';
  seenHelp: boolean;
  /** powiadomienia o zadaniach ze slotem; padają tylko przy otwartej karcie */
  notify: boolean;
}
