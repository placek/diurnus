// Losowe stany maszyny dla testów obiegu plików. Plik nie jest testem (nie
// kończy się na .test.ts), więc Vitest go nie uruchamia — tylko importuje.
import { descLines } from '../src/lib/md/line';
import { tagsFor } from '../src/lib/md/slug';
import { step } from '../src/lib/machine';
import type { Event, Item, Machine } from '../src/lib/machine';
import { normalize } from '../src/lib/model';
import type { RRule } from '../src/lib/rrule';
import { shiftDay } from '../src/lib/time';
import type { State } from '../src/lib/types';
import { backlogOrder, todayList } from '../src/lib/view';

export const TODAY = '2026-09-25';

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEXTS = [
  '',
  'Czytanie',
  '09:00 spotkanie',
  '#hashtag',
  '{x}',
  '[ ] nie zadanie',
  '\\ukośnik',
  'koniec ^x',
  '^',
  '3 rzeczy',
  ' spacja',
  'dwie  spacje',
  '\\^y',
  'x \\\\^z',
  '2026-09-25 data',
  'środek #tag',
  // Pułapki [x]it!: końcówki, które czytałyby się jako człony.
  'kupić #dom',
  'kupić #Praca',
  'x -> 2026-10-01',
  'x \\-> 2026-10-01',
  'termin -> 2026',
  '#id=p1',
  'koniec #repeat="FREQ=DAILY"',
  'ukośnik \\#dom',
  '[?] pytanie',
  '! pilne',
  '#tag-xit w tekście #inny',
];

const DESCS = [
  'jedna linia',
  'dwie\nlinie',
  'z pustą\n\nw środku',
  '  własne wcięcie',
  '* wygląda jak pozycja',
  '# nagłówek',
  'z końcową pustą\n',
  'tab\tw środku',
  '\tod tabulatora',
  '\\ukośnik ^x',
  '\npusta na początku',
  '* [ ] wygląda jak krok',
  'opis\n* [x] i krok w środku',
  '\\* [ ] krok z ukośnikiem',
  '* [ ]',
  '\\',
  '[x] wygląda jak krok xit',
  '\\[ ] krok xit z ukośnikiem',
  '[@] trwa',
  '    głęboko',
];

const STEPS: { text: string; done: boolean }[][] = [
  [{ text: 'spakować się', done: false }],
  [
    { text: 'zatankować', done: true },
    { text: '[ ] w nawiasach', done: false },
    { text: '', done: false },
  ],
  [
    { text: '#nie-tag 09:00 \\ukośnik ^x', done: true },
    { text: '* gwiazdka', done: true },
  ],
];

/** Stan zbudowany wyłącznie przejściami maszyny — takie stany aplikacja naprawdę ma. */
export function randomState(seed: number): State {
  const r = rng(seed);
  const base = normalize(null, TODAY);
  // Projekty: kategoria główna (Dom) i podkategoria (Zadania › Programowanie).
  base.cats = base.cats.map((c) =>
    c.name === 'Dom' || c.name === 'Programowanie' ? { ...c, project: true } : c,
  );
  const cats = base.cats.map((c) => c.id);
  const hours = { q0: base.day.start * 4, q1: base.day.end * 4 };
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  let m: Machine = { today: TODAY, items: [] };
  for (let n = 0; n < 300; n++) {
    const ids = m.items.map((i) => i.id);
    const id = ids.length ? pick(ids) : 'x';
    const slot = pick([null, 24, 30, 36, 37, 40, 86]);
    const date = pick(['2026-09-27', '2026-10-01', TODAY]);
    const rule = pick<RRule>([
      { freq: 'DAILY', interval: 1 },
      { freq: 'WEEKLY', interval: 2, byDay: [{ day: 'MO' }, { day: 'TH' }] },
      { freq: 'YEARLY', interval: 1, byMonth: [2], byMonthDay: [-1] },
      { freq: 'MONTHLY', interval: 1, byDay: [{ day: 'FR', n: -1 }], count: 4 },
      { freq: 'DAILY', interval: 3, until: '2026-12-31' },
    ]);
    const create: Event = {
      type: 'create',
      id: `n${n}`,
      text: pick(TEXTS),
      place: pick(['today', 'backlog'] as const),
      ...(r() < 0.7 ? { cat: pick(cats) } : {}),
    };
    const when = pick([
      null,
      { type: 'date' as const, date },
      { type: 'dateSlot' as const, date, slot: slot ?? 40 },
      { type: 'recurring' as const, rule, slot, start: date },
      { type: 'recurring' as const, rule, slot: null, start: date },
    ]);
    // Tworzenie i nadawanie czasu częściej niż usuwanie, żeby stan końcowy był
    // bogaty: wzorce, kopie, archiwum, sloty.
    const e = pick<Event>([
      create,
      create,
      create,
      { type: 'markDone', id, copyId: `c${n}` },
      { type: 'markFailed', id, copyId: `f${n}` },
      { type: 'markOpen', id },
      { type: 'toNote', id },
      { type: 'toTask', id },
      { type: 'setSlot', id, slot },
      { type: 'setWhen', id, when },
      { type: 'setWhen', id, when },
      { type: 'move', id, to: pick(['today', 'backlog'] as const) },
      r() < 0.3 ? { type: 'remove', id } : create,
      { type: 'advance', to: shiftDay(m.today, 1) },
    ]);
    const res = step(m, e, hours);
    if (res.ok) m = res.machine;
    // Opis to dana, nie stan — nadawany wprost, jak w aplikacji; kopie dziedziczą go przez maszynę.
    if (r() < 0.15)
      m = { ...m, items: m.items.map((i) => (i.id === id ? { ...i, desc: pick(DESCS) } : i)) };
    // Kroki też — ale tylko zadaniom; maszyna nie zrobi potem z nich notatki.
    const note = (i: Item) => /note$/.test(i.state.tag);
    if (r() < 0.12)
      m = {
        ...m,
        items: m.items.map((i) => (i.id === id && !note(i) ? { ...i, steps: pick(STEPS) } : i)),
      };
  }
  const theme = pick([undefined, 'auto', 'light', 'dark'] as const);
  return { ...base, today: m.today, items: [...m.items], ...(theme ? { theme } : {}) };
}

/** Wszystko, co jest stanem: bez identyfikatorów i czasu utworzenia, w kolejności kanonicznej. */
export function project(s: State) {
  const tags = tagsFor(s.cats);
  const one = (i: Item) => {
    const isPattern = i.state.tag === 'backlog-task' && i.state.when?.type === 'recurring';
    return {
      state: i.state,
      text: i.text,
      tag: i.cat !== undefined ? tags.get(i.cat) : undefined,
      desc: descLines(i.desc).join('\n') || undefined,
      steps: i.steps?.length ? i.steps : undefined,
      link: isPattern ? `pattern:${i.id}` : i.from !== undefined ? `copy:${i.from}` : undefined,
    };
  };
  const past = s.items.filter((i) => i.state.tag === 'past-done' || i.state.tag === 'past-note');
  const days = [...new Set(past.map((i) => (i.state as { day: string }).day))].sort();
  return {
    today: s.today,
    theme: s.theme,
    past: days.flatMap((d) => past.filter((i) => (i.state as { day: string }).day === d)).map(one),
    today_: todayList(s.items).map(one),
    backlog: backlogOrder(s.items, s.cats).map(one),
  };
}

export const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 1);
