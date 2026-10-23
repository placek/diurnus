import { splitDay } from './time';

/*
 * Tajemnice różańca na dzień tygodnia — według „Rosarium Virginis Mariae"
 * (2002): poniedziałek i sobota radosne, wtorek i piątek bolesne, środa
 * i niedziela chwalebne, czwartek światła. Nazwy łacińskie, każda tajemnica
 * jednym słowem tam, gdzie się da.
 */

export interface RosaryPart {
  /** nazwa części: „Mysteria gaudiosa" */
  name: string;
  /** pięć tajemnic po kolei */
  mysteries: readonly string[];
}

const GAUDIOSA: RosaryPart = {
  name: 'Mysteria gaudiosa',
  mysteries: ['Annuntiatio', 'Visitatio', 'Nativitas', 'Praesentatio', 'Inventio'],
};

const LUMINOSA: RosaryPart = {
  name: 'Mysteria luminosa',
  mysteries: ['Baptismus', 'Cana', 'Proclamatio', 'Transfiguratio', 'Eucharistia'],
};

const DOLOROSA: RosaryPart = {
  name: 'Mysteria dolorosa',
  // Cierniem ukoronowanie w dwóch słowach — samo „Coronatio" to piąta chwalebna.
  mysteries: ['Agonia', 'Flagellatio', 'Coronatio spinis', 'Baiulatio', 'Crucifixio'],
};

const GLORIOSA: RosaryPart = {
  name: 'Mysteria gloriosa',
  mysteries: ['Resurrectio', 'Ascensio', 'Pentecoste', 'Assumptio', 'Coronatio'],
};

/** Od niedzieli (0) do soboty (6). */
const BY_WEEKDAY: readonly RosaryPart[] = [
  GLORIOSA,
  GAUDIOSA,
  DOLOROSA,
  GLORIOSA,
  LUMINOSA,
  DOLOROSA,
  GAUDIOSA,
];

/** Część różańca na dzień `RRRR-MM-DD`. */
export function rosaryOf(day: string): RosaryPart {
  const [y, m, d] = splitDay(day);
  return BY_WEEKDAY[new Date(y, m - 1, d).getDay()]!;
}
