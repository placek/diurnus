import type { Item } from './machine';
export const QDAY = 96; // kwanty 15-minutowe w dobie

export interface Category {
  id: string;
  name: string;
  icon: string | null; // null = dziedzicz ikonę kategorii nadrzędnej
  color?: string; // tylko kategorie główne; podkategorie dziedziczą
  parent: string | null;
  archived?: boolean;
  /** projekt: pozycje backlogu z tą kategorią (albo jej podkategoriami) stoją we własnej sekcji */
  project?: boolean;
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
export type ItemType = 'task' | 'done' | 'failed' | 'note';

export type { RRule } from './rrule';
export type { Item, Step } from './machine';

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
  /**
   * Motyw wspólny dla urządzeń — jedzie z resztą ustawień w `.diurnus.toml`.
   * Brak: nikt go jeszcze nie wybrał po tej zmianie, więc każde urządzenie
   * zostaje przy swoim (`Prefs.theme`) i nic nie trafia do magazynu.
   */
  theme?: Theme;
}

export type Theme = 'auto' | 'light' | 'dark';

export interface Prefs {
  /** motyw tej przeglądarki — używany, dopóki stan nie ma wspólnego (`State.theme`) */
  theme: Theme;
  seenHelp: boolean;
  /** powiadomienia o zadaniach ze slotem; padają tylko przy otwartej karcie */
  notify: boolean;
}
