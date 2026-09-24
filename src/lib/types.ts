export const QDAY = 96; // kwanty 15-minutowe w dobie

export type Status = 'suggested' | 'planned' | 'active' | 'confirmed' | 'discarded';

export interface Category {
  id: string;
  name: string;
  icon: string | null; // null = dziedzicz ikonę kategorii nadrzędnej
  color?: string; // tylko kategorie główne; podkategorie dziedziczą
  parent: string | null;
  archived?: boolean;
}

export interface Band {
  // pora dnia; trwa do `from` następnej
  id: string;
  name: string;
  from: number; // godzina rozpoczęcia
  color: string;
}

export interface Block {
  id: string;
  day: string; // 'YYYY-MM-DD', czas lokalny
  q: number; // 0–95, kwant liczony od północy
  len: number; // długość w kwantach
  cat: string;
  title: string;
  status: Status;
  created: number;
}

export interface DaySettings {
  start: number;
  end: number;
  bands: Band[];
}

export interface State {
  v: number; // wersja schematu; migracje w normalize()
  cats: Category[];
  day: DaySettings;
  blocks: Block[];
}

export interface Prefs {
  theme: 'auto' | 'light' | 'dark';
  seenHelp: boolean;
}
