import { splitDay } from './time';

/*
 * Medytacja poranna na każdy dzień roku: rozdział „De Imitatione Christi"
 * (Tomasz à Kempis) i dobrany do niego Psalm — według planu „Medytacje
 * poranne (rotacja De Imitatione + Psalmy)".
 *
 * Dzieło ma 114 rozdziałów (Liber I: 25, II: 12, III: 59, IV: 18). Dzień roku
 * wybiera rozdział: indeks = (dzień_roku − 1) mod 114, po kolei przez księgi;
 * w roku cykl przechodzi ok. 3,2 raza, a ten sam rozdział wraca zawsze z tym
 * samym Psalmem. Liczy się dzień roku, nie data — w roku przestępnym dzień 366
 * to Liber I, Caput XXIV.
 *
 * Psalmy w numeracji Wulgaty, w nawiasie hebrajskiej: „50 (51)".
 */

export interface Meditation {
  /** księga: 1–4 */
  liber: number;
  /** rozdział w księdze, od 1 */
  caput: number;
  /** numer Psalmu: Wulgata (hebrajska) */
  psalm: string;
  /** myśl przewodnia rozdziału */
  theme: string;
}

/** Rozdziały po kolei, księga po księdze: [Psalm, temat]. */
const PLAN: readonly (readonly [string, string])[] = [
  // Liber I
  ['1 (1)', 'marność świata, dwie drogi'],
  ['130 (131)', 'pokora wobec siebie'],
  ['118 (119)', 'nauka prawdy'],
  ['111 (112)', 'roztropność w działaniu'],
  ['18 (19)', 'czytanie Pisma Świętego'],
  ['72 (73)', 'nieuporządkowane pragnienia'],
  ['145 (146)', 'próżna nadzieja i pycha'],
  ['25 (26)', 'unikanie złego towarzystwa'],
  ['122 (123)', 'posłuszeństwo i poddanie'],
  ['140 (141)', 'powściągliwość w słowach'],
  ['83 (84)', 'pokój i gorliwość w postępie'],
  ['33 (34)', 'pożytek przeciwności'],
  ['90 (91)', 'opieranie się pokusom'],
  ['7 (7)', 'unikanie pochopnego sądu'],
  ['132 (133)', 'uczynki miłości'],
  ['85 (86)', 'znoszenie wad bliźnich'],
  ['14 (15)', 'życie zakonne / mieszkanie u Boga'],
  ['33 (34)', 'przykłady świętych Ojców'],
  ['5 (5)', 'ćwiczenia dobrego zakonnika (poranek)'],
  ['62 (63)', 'miłość samotności i milczenia'],
  ['6 (6)', 'skrucha serca'],
  ['38 (39)', 'rozważanie nędzy człowieka'],
  ['89 (90)', 'rozmyślanie o śmierci'],
  ['142 (143)', 'sąd i kary za grzechy'],
  ['50 (51)', 'gorliwa poprawa życia'],
  // Liber II
  ['45 (46)', 'życie wewnętrzne'],
  ['24 (25)', 'pokorne poddanie się Bogu'],
  ['36 (37)', 'człowiek dobry i spokojny'],
  ['23 (24)', 'czyste serce i prosta intencja'],
  ['4 (4)', 'rozważanie samego siebie'],
  ['31 (32)', 'radość dobrego sumienia'],
  ['17 (18)', 'miłość Jezusa ponad wszystko'],
  ['26 (27)', 'zażyła przyjaźń z Jezusem'],
  ['87 (88)', 'brak wszelkiej pociechy'],
  ['137 (138)', 'wdzięczność za łaskę Bożą'],
  ['21 (22)', 'niewielu miłośników Krzyża'],
  ['43 (44)', 'królewska droga Krzyża'],
  // Liber III
  ['84 (85)', 'wewnętrzna mowa Chrystusa'],
  ['49 (50)', 'prawda mówi wewnątrz'],
  ['94 (95)', 'pokorne słuchanie słów Bożych'],
  ['100 (101)', 'życie w prawdzie i pokorze'],
  ['144 (145)', 'przedziwny skutek miłości Bożej'],
  ['65 (66)', 'próba prawdziwego miłującego'],
  ['112 (113)', 'ukrywanie łaski pod pokorą'],
  ['143 (144)', 'niska ocena siebie wobec Boga'],
  ['113 (115)', 'wszystko odnosić do Boga'],
  ['99 (100)', 'słodycz służby Bogu'],
  ['16 (17)', 'badanie pragnień serca'],
  ['12 (13)', 'nauka cierpliwości'],
  ['114 (116)', 'posłuszeństwo pokornego'],
  ['35 (36)', 'ukryte wyroki Boże'],
  ['20 (21)', 'czego pragnąć i prosić'],
  ['76 (77)', 'prawdziwa pociecha w Bogu'],
  ['54 (55)', 'całą troskę złożyć w Bogu'],
  ['68 (69)', 'cierpliwe znoszenie nędzy'],
  ['108 (109)', 'znoszenie krzywd'],
  ['37 (38)', 'wyznanie własnej słabości'],
  ['27 (28)', 'spoczynek w Bogu ponad wszystko'],
  ['102 (103)', 'pamięć dobrodziejstw Bożych'],
  ['121 (122)', 'cztery rzeczy dające pokój'],
  ['118 (119)', 'nie badać cudzego życia'],
  ['4 (4)', 'na czym polega pokój serca'],
  ['56 (57)', 'wzniesienie wolnego umysłu'],
  ['141 (142)', 'miłość własna największą przeszkodą'],
  ['51 (52)', 'przeciw językom oszczerców'],
  ['30 (31)', 'wzywać Boga w utrapieniu'],
  ['69 (70)', 'błaganie o pomoc Bożą'],
  ['72 (73)', 'wzgarda stworzeń, by znaleźć Stwórcę'],
  ['15 (16)', 'zaparcie się siebie'],
  ['107 (108)', 'niestałość serca'],
  ['96 (97)', 'miłować Boga ponad wszystko'],
  ['123 (124)', 'nie ma bezpieczeństwa od pokusy'],
  ['55 (56)', 'przeciw próżnym ludzkim sądom'],
  ['30 (31)', 'czyste oddanie siebie'],
  ['111 (112)', 'dobre kierowanie sprawami zewnętrznymi'],
  ['126 (127)', 'nie być natrętnym w sprawach'],
  ['113 (115)', 'człowiek nic dobrego z siebie nie ma'],
  ['48 (49)', 'wzgarda doczesnej czci'],
  ['145 (146)', 'nie pokładać pokoju w ludziach'],
  ['130 (131)', 'przeciw próżnej wiedzy świeckiej'],
  ['130 (131)', 'nie przywłaszczać rzeczy zewnętrznych'],
  ['117 (118)', 'nie wszystkim wierzyć; obraza słów'],
  ['55 (56)', 'ufność w Bogu wobec pocisków słów'],
  ['125 (126)', 'znosić trudy dla życia wiecznego'],
  ['83 (84)', 'dzień wieczności a ucisk życia'],
  ['41 (42)', 'pragnienie życia wiecznego'],
  ['22 (23)', 'oddanie się w ręce Boga'],
  ['129 (130)', 'pokorne prace, gdy brak wzniosłych'],
  ['87 (88)', 'nie uważać się za godnego pociech'],
  ['8 (8)', 'łaska nie miesza się z mądrością świata'],
  ['142 (143)', 'poruszenia natury i łaski'],
  ['50 (51)', 'skażenie natury, moc łaski'],
  ['15 (16)', 'zaparcie siebie i naśladowanie Krzyża'],
  ['41 (42)', 'nie upadać na duchu po upadku'],
  ['130 (131)', 'nie badać wysokich, ukrytych wyroków'],
  ['61 (62)', 'cała nadzieja i ufność w samym Bogu'],
  // Liber IV
  ['42 (43)', 'z jaką czcią przyjmować Chrystusa'],
  ['33 (34)', 'dobroć Boga w sakramencie'],
  ['41 (42)', 'pożytek częstej Komunii'],
  ['22 (23)', 'dary dla pobożnie komunikujących'],
  ['109 (110)', 'godność sakramentu i kapłaństwa'],
  ['25 (26)', 'badanie siebie przed Komunią'],
  ['138 (139)', 'rachunek sumienia i postanowienie poprawy'],
  ['39 (40)', 'ofiara Chrystusa i oddanie siebie'],
  ['115 (116)', 'ofiarować Bogu siebie i wszystko'],
  ['83 (84)', 'nie porzucać łatwo Komunii świętej'],
  ['118 (119)', 'Ciało Chrystusa i Pismo konieczne duszy'],
  ['23 (24)', 'pilnie się przygotować do Komunii'],
  ['62 (63)', 'zjednoczyć się z Chrystusem'],
  ['41 (42)', 'gorące pragnienie Ciała Chrystusa'],
  ['130 (131)', 'łaska pobożności przez pokorę'],
  ['101 (102)', 'otwierać przed Chrystusem swe potrzeby'],
  ['83 (84)', 'żarliwa miłość, by przyjąć Chrystusa'],
  ['130 (131)', 'nie badać ciekawie, lecz pokornie naśladować'],
];

/** Liczba rozdziałów w księgach I–IV. */
const BOOKS = [25, 12, 59, 18] as const;

/** Dzień roku (1–366) daty `RRRR-MM-DD`. */
export function dayOfYear(day: string): number {
  const [y, m, d] = splitDay(day);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000) + 1;
}

/** Medytacja na dany dzień: rozdział i Psalm. */
export function meditationOf(day: string): Meditation {
  let i = (dayOfYear(day) - 1) % PLAN.length;
  const [psalm, theme] = PLAN[i]!;
  let liber = 1;
  for (const n of BOOKS) {
    if (i < n) break;
    i -= n;
    liber++;
  }
  return { liber, caput: i + 1, psalm, theme };
}

const ROMAN: [number, string][] = [
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** Liczba rzymska do 89 — tyle trzeba na księgi i rozdziały. */
export function roman(n: number): string {
  let out = '';
  for (const [v, s] of ROMAN) for (; n >= v; n -= v) out += s;
  return out;
}

export const PLAN_LENGTH = PLAN.length;
