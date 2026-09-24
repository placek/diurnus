# Diurnus — trzy panele, backlog i powtarzalność: plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zamienić przeglądarkę dni w narzędzie o dwóch horyzontach: dzisiejszy dzień po lewej i środku, wszystko pozostałe w backlogu po prawej, z powtarzalnością i przenoszeniem przeciąganiem.

**Architecture:** Nowa logika ląduje w dwóch czystych modułach — `lib/repeat.ts` (wzorce i następne wystąpienie) oraz `lib/backlog.ts` (podział, sortowanie, przeniesienie niedokończonych). `viewDay` znika ze stanu na rzecz wyliczanego „dziś". Panele to trzy dzieci jednego kontenera flex; środkowy jest wyniesiony wizualnie.

**Tech Stack:** Svelte 5 (runy), TypeScript, Vitest (projekty `unit` i `mount`).

**Spec:** [`docs/superpowers/specs/2026-09-24-diurnus-three-panes-backlog-design.md`](../specs/2026-09-24-diurnus-three-panes-backlog-design.md)

## Global Constraints

- **`src/lib/` nie importuje niczego ze Svelte.**
- **`ItemType` to dokładnie `'task' | 'done' | 'note'`.** Żadnego `scheduled`, `migrated`, `movedTo`.
- **`Item.day` jest `string | null`;** `null` znaczy „backlog bez daty".
- **`at` to kwant 0–95**, ta sama jednostka co `Block.q`. Godzina z pola `time` zaokrągla się **w dół** do kwadransa.
- **Bloki istnieją wyłącznie dla dziś i dni minionych.**
- **Powtarzalność to jeden szablon** — nic nie jest generowane z wyprzedzeniem.
- **Przeniesienie niedokończonych bierze tylko `task` bez bloku.**
- **Próg wąskiego ekranu: 1300 px**, przełącznik cykliczny przez trzy panele.
- **Język:** kod, komentarze i UI po polsku; commity po angielsku.

## Review Focus

1. **`nextOccurrence` dla 31. dnia w lutym** — musi dać ostatni dzień miesiąca, nie przeskoczyć miesiąca. → test w zadaniu 1.
2. **`nextOccurrence` zwracające datę równą dacie odniesienia** — wynik musi być ŚCIŚLE późniejszy, inaczej odhaczenie powtarzalnej pozycji zapętli ją na dziś. → test w zadaniu 1.
3. **Przeniesienie niedokończonych uruchomione dwa razy** — musi być idempotentne, bo efekt na zmianę doby może wykonać się wielokrotnie. → test w zadaniu 3.
4. **Pozycja bez daty (`day === null`) w każdym filtrze** — `dayItems`, `reconcile`, `linkedItems` nie mogą jej zgubić ani wciągnąć do dziś. → testy w zadaniach 2 i 3.
5. **Upuszczenie pozycji z godziną na zajęty slot** — nie może utworzyć bloku nachodzącego na istniejący. → test w zadaniu 12.

---

## Task 1: Silnik powtarzalności

**Files:** Create `src/lib/repeat.ts`, `test/repeat.test.ts`

**Interfaces:**
- Produces: `Repeat` (w `types.ts`, zadanie 2 przenosi tam typ; tu definiujemy lokalnie i reeksportujemy), `clampToMonth(year, month, dayOfMonth): number`, `nextOccurrence(repeat: Repeat, after: string): string`, `describeRepeat(repeat: Repeat): string`, `WEEKDAYS: readonly string[]`

- [ ] **Step 1: Napisz testy**

```ts
// test/repeat.test.ts
import { test, expect } from 'vitest';
import { clampToMonth, nextOccurrence, describeRepeat } from '../src/lib/repeat';
import type { Repeat } from '../src/lib/repeat';

const daily: Repeat = { kind: 'daily' };
const monday: Repeat = { kind: 'weekly', weekday: 1 };
const third: Repeat = { kind: 'monthly', dayOfMonth: 3 };
const lastish: Repeat = { kind: 'monthly', dayOfMonth: 31 };
const nameday: Repeat = { kind: 'yearly', month: 9, dayOfMonth: 24 };

test('clampToMonth przycina do długości miesiąca', () => {
  expect(clampToMonth(2026, 2, 31)).toBe(28);
  expect(clampToMonth(2028, 2, 31)).toBe(29); // rok przestępny
  expect(clampToMonth(2026, 4, 31)).toBe(30);
  expect(clampToMonth(2026, 1, 15)).toBe(15);
});

test('codziennie daje dzień następny', () => {
  expect(nextOccurrence(daily, '2026-09-24')).toBe('2026-09-25');
});

test('codziennie przechodzi przez koniec miesiąca i roku', () => {
  expect(nextOccurrence(daily, '2026-09-30')).toBe('2026-10-01');
  expect(nextOccurrence(daily, '2026-12-31')).toBe('2027-01-01');
});

test('co poniedziałek daje najbliższy poniedziałek po dacie', () => {
  // 2026-09-24 to czwartek
  expect(nextOccurrence(monday, '2026-09-24')).toBe('2026-09-28');
});

test('co poniedziałek w poniedziałek daje poniedziałek ZA tydzień', () => {
  // Wynik musi być ściśle późniejszy, inaczej odhaczenie zapętla pozycję na dziś.
  expect(nextOccurrence(monday, '2026-09-28')).toBe('2026-10-05');
});

test('3. każdego miesiąca daje najbliższy trzeci', () => {
  expect(nextOccurrence(third, '2026-09-24')).toBe('2026-10-03');
  expect(nextOccurrence(third, '2026-10-01')).toBe('2026-10-03');
});

test('3. każdego miesiąca w dniu trzecim daje trzeci miesiąc później', () => {
  expect(nextOccurrence(third, '2026-10-03')).toBe('2026-11-03');
});

test('31. każdego miesiąca w lutym daje ostatni dzień lutego', () => {
  expect(nextOccurrence(lastish, '2026-01-31')).toBe('2026-02-28');
  expect(nextOccurrence(lastish, '2028-01-31')).toBe('2028-02-29');
});

test('co rok daje tę samą datę w roku następnym, gdy już minęła', () => {
  expect(nextOccurrence(nameday, '2026-09-24')).toBe('2027-09-24');
  expect(nextOccurrence(nameday, '2026-01-01')).toBe('2026-09-24');
});

test('co rok 29 lutego w roku nieprzestępnym przypada 28', () => {
  const leapday: Repeat = { kind: 'yearly', month: 2, dayOfMonth: 29 };
  expect(nextOccurrence(leapday, '2026-03-01')).toBe('2027-02-28');
});

test('opisy wzorców są po polsku', () => {
  expect(describeRepeat(daily)).toBe('codziennie');
  expect(describeRepeat(monday)).toBe('co poniedziałek');
  expect(describeRepeat({ kind: 'weekly', weekday: 0 })).toBe('co niedzielę');
  expect(describeRepeat(third)).toBe('3. każdego miesiąca');
  expect(describeRepeat(nameday)).toBe('co rok 24 wrz');
});
```

- [ ] **Step 2: Uruchom — muszą paść**

Run: `make test` · Expected: FAIL, `Cannot find module '../src/lib/repeat'`.

- [ ] **Step 3: Implementacja**

```ts
// src/lib/repeat.ts
export type Repeat =
  | { kind: 'daily' }
  | { kind: 'weekly'; weekday: number }
  | { kind: 'monthly'; dayOfMonth: number }
  | { kind: 'yearly'; month: number; dayOfMonth: number };

const pad = (n: number) => String(n).padStart(2, '0');
const key = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const parse = (s: string): [number, number, number] => {
  const [y, m, d] = s.split('-').map(Number);
  return [y ?? 1970, m ?? 1, d ?? 1];
};

/** Dzień miesiąca przycięty do jego długości: 31 w lutym to 28 albo 29. */
export const clampToMonth = (year: number, month: number, dayOfMonth: number) =>
  Math.min(dayOfMonth, new Date(year, month, 0).getDate());

export const WEEKDAYS = [
  'niedzielę', 'poniedziałek', 'wtorek', 'środę', 'czwartek', 'piątek', 'sobotę',
] as const;

const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'] as const;

/**
 * Pierwsze wystąpienie ŚCIŚLE późniejsze niż `after`. Ścisłość jest istotna:
 * gdyby funkcja mogła zwrócić dzień odniesienia, odhaczenie powtarzalnej
 * pozycji ustawiałoby jej następny termin na dziś i zapętlało ją.
 */
export function nextOccurrence(repeat: Repeat, after: string): string {
  const [y, m, d] = parse(after);

  if (repeat.kind === 'daily') {
    const next = new Date(y, m - 1, d + 1);
    return key(next.getFullYear(), next.getMonth() + 1, next.getDate());
  }

  if (repeat.kind === 'weekly') {
    const from = new Date(y, m - 1, d);
    const delta = (repeat.weekday - from.getDay() + 7) % 7 || 7;
    const next = new Date(y, m - 1, d + delta);
    return key(next.getFullYear(), next.getMonth() + 1, next.getDate());
  }

  if (repeat.kind === 'monthly') {
    const thisMonth = clampToMonth(y, m, repeat.dayOfMonth);
    if (thisMonth > d) return key(y, m, thisMonth);
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    return key(ny, nm, clampToMonth(ny, nm, repeat.dayOfMonth));
  }

  const thisYear = clampToMonth(y, repeat.month, repeat.dayOfMonth);
  if (repeat.month > m || (repeat.month === m && thisYear > d)) {
    return key(y, repeat.month, thisYear);
  }
  return key(y + 1, repeat.month, clampToMonth(y + 1, repeat.month, repeat.dayOfMonth));
}

export function describeRepeat(repeat: Repeat): string {
  switch (repeat.kind) {
    case 'daily':
      return 'codziennie';
    case 'weekly':
      return `co ${WEEKDAYS[repeat.weekday] ?? '?'}`;
    case 'monthly':
      return `${repeat.dayOfMonth}. każdego miesiąca`;
    case 'yearly':
      return `co rok ${repeat.dayOfMonth} ${MONTHS[repeat.month - 1] ?? '?'}`;
  }
}
```

- [ ] **Step 4: Uruchom testy** — Run: `make test` · Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repeat.ts test/repeat.test.ts
git commit -m "feat: add the recurrence pattern engine"
```

---

## Task 2: Model v5 — typy i migracja

**Files:** Modify `src/lib/types.ts`, `src/lib/model.ts`, `test/model.test.ts`

**Interfaces:**
- Consumes: `Repeat` z zadania 1.
- Produces: `ItemType = 'task' | 'done' | 'note'`; `Item` z `day: string | null`, `at?`, `repeat?`, `nextOn?`; `normalize()` zwracające `v === 5`.

- [ ] **Step 1: Napisz testy migracji**

```ts
// dopisz do test/model.test.ts
test('normalize: v4 podnosi się do v5', () => {
  const s = normalize({ v: 4, cats: [], blocks: [], items: [], day: { start: 6, end: 22, bands: [] } });
  expect(s.v).toBe(5);
});

test('normalize: znaczniki przeniesienia zamieniają się w zadania', () => {
  const s = normalize({
    v: 4, cats: [], blocks: [], day: { start: 6, end: 22, bands: [] },
    items: [
      { id: 'a', day: '2026-09-24', text: 'X', type: 'migrated', created: 0, movedTo: '2026-09-25' },
      { id: 'b', day: '2026-09-24', text: 'Y', type: 'scheduled', created: 0, movedTo: '2026-10-01' },
      { id: 'c', day: '2026-09-24', text: 'Z', type: 'note', created: 0 },
    ],
  });
  expect(s.items.map((i) => i.type)).toEqual(['task', 'task', 'note']);
  expect(s.items.every((i) => !('movedTo' in i))).toBe(true);
});

test('normalize: pozycje bez daty przechodzą nietknięte', () => {
  const items = [{ id: 'a', day: null, text: 'Kiedyś', type: 'task', created: 0 }];
  const s = normalize({ v: 5, cats: [], blocks: [], items, day: { start: 6, end: 22, bands: [] } });
  expect(s.items[0]!.day).toBeNull();
});
```

- [ ] **Step 2: Uruchom — muszą paść** — Run: `make test` · Expected: FAIL, `expected 4 to be 5`.

- [ ] **Step 3: Zmień `types.ts`**

```ts
export type ItemType = 'task' | 'done' | 'note';

export type { Repeat } from './repeat';

export interface Item {
  id: string;
  /** `null` = pozycja backlogu bez zadeklarowanej daty */
  day: string | null;
  text: string;
  type: ItemType;
  created: number;
  block?: string;
  /** kwant 0–95: pora bez bloku */
  at?: number;
  repeat?: Repeat;
  /** data najbliższego wystąpienia pozycji powtarzalnej */
  nextOn?: string;
}
```

- [ ] **Step 4: Migracja w `model.ts`**

Pod migracją `v3 → v4`:

```ts
  // v4 znało znaczniki przeniesienia; v5 przenosi pozycje dosłownie, więc
  // znaczniki nie mają czego opisywać.
  if (s && typeof s === 'object' && s.v === 4) {
    s.items = ((s.items ?? []) as Item[]).map((i) => {
      const { movedTo, ...rest } = i as Item & { movedTo?: string };
      const type = rest.type === 'migrated' || rest.type === 'scheduled' ? 'task' : rest.type;
      return { ...rest, type } as Item;
    });
    s.v = 5;
  }
```

Zmień warunek stanu domyślnego na `s.v !== 5` i `v: 5` w obiekcie domyślnym.

- [ ] **Step 5: Napraw miejsca odwołujące się do usuniętych znaczników**

`svelte-check` wskaże je wszystkie. Jedyne miejsce, które naprawdę się łamie, to
`migrateTo` w `lib/items.ts` — ustawia `type: 'migrated'`, którego już nie ma.

Usuń **w tym zadaniu**, nie później: `migrateTo` z `lib/items.ts` wraz z jego testami,
oraz `migrateItem` i `migrateToTomorrow` z `actions.svelte.ts` wraz z `test/migrate-linked.mount.test.ts`.
Ich usunięcie jest wymuszone przez zmianę typu, więc nie da się go odłożyć do zadania 13;
zadaniu 13 zostaje sprzątanie menu i dokumentacji.

`typeAfterEnter`, `CYCLE` i `markForStatus` operują wyłącznie na `task`/`done`/`note`
i zmiany nie wymagają.

- [ ] **Step 6: Uruchom testy i typy** — Run: `make test && make check` · Expected: PASS, zero błędów.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: migrate the schema to v5 and drop the move markers"
```

---

## Task 3: Podział na dziś i backlog

**Files:** Create `src/lib/backlog.ts`, `test/backlog.test.ts`

**Interfaces:**
- Produces: `isBacklog(item, today): boolean`, `backlogItems(items, today): Item[]`, `sortBacklog(items): Item[]`, `lastDayWithItems(items, before): string | null`, `carryOver(items, today, sourceDay): Item[]`

- [ ] **Step 1: Napisz testy**

```ts
// test/backlog.test.ts
import { test, expect } from 'vitest';
import { isBacklog, backlogItems, sortBacklog, lastDayWithItems, carryOver } from '../src/lib/backlog';
import type { Item } from '../src/lib/types';

const T = '2026-09-24';
const item = (id: string, day: string | null, over: Partial<Item> = {}): Item =>
  ({ id, day, text: '', type: 'task', created: 0, ...over });

test('isBacklog: bez daty, w przyszłości — tak; dziś i w przeszłości — nie', () => {
  expect(isBacklog(item('a', null), T)).toBe(true);
  expect(isBacklog(item('a', '2026-09-25'), T)).toBe(true);
  expect(isBacklog(item('a', T), T)).toBe(false);
  expect(isBacklog(item('a', '2026-09-23'), T)).toBe(false);
});

test('backlogItems zbiera przyszłe i bezdatowe', () => {
  const all = [item('a', T), item('b', '2026-09-25'), item('c', null), item('d', '2026-09-01')];
  expect(backlogItems(all, T).map((i) => i.id)).toEqual(['b', 'c']);
});

test('sortBacklog: najpierw daty rosnąco, potem bezdatowe w kolejności tablicy', () => {
  const all = [
    item('bez1', null),
    item('pozno', '2026-10-01'),
    item('bez2', null),
    item('wczesnie', '2026-09-25'),
  ];
  expect(sortBacklog(all).map((i) => i.id)).toEqual(['wczesnie', 'pozno', 'bez1', 'bez2']);
});

test('sortBacklog: ten sam dzień rozstrzyga godzina', () => {
  const all = [item('pozniej', '2026-09-25', { at: 40 }), item('wczesniej', '2026-09-25', { at: 24 })];
  expect(sortBacklog(all).map((i) => i.id)).toEqual(['wczesniej', 'pozniej']);
});

test('sortBacklog: pozycja powtarzalna sortuje się po nextOn', () => {
  const all = [
    item('stala', null, { repeat: { kind: 'daily' }, nextOn: '2026-09-25' }),
    item('pozniejsza', '2026-09-30'),
  ];
  expect(sortBacklog(all).map((i) => i.id)).toEqual(['stala', 'pozniejsza']);
});

test('lastDayWithItems znajduje najpóźniejszy dzień przed podanym', () => {
  const all = [item('a', '2026-09-20'), item('b', '2026-09-22'), item('c', T)];
  expect(lastDayWithItems(all, T)).toBe('2026-09-22');
});

test('lastDayWithItems pomija pozycje bez daty i z przyszłości', () => {
  const all = [item('a', null), item('b', '2026-10-01')];
  expect(lastDayWithItems(all, T)).toBeNull();
});

test('carryOver przenosi niedokończone zadania na dziś', () => {
  const all = [item('a', '2026-09-22'), item('b', T)];
  const got = carryOver(all, T, '2026-09-22');
  expect(got.find((i) => i.id === 'a')!.day).toBe(T);
});

test('carryOver stawia przeniesione na początku tablicy', () => {
  const all = [item('juz-dzis', T), item('wczorajsze', '2026-09-22')];
  expect(carryOver(all, T, '2026-09-22').map((i) => i.id)).toEqual(['wczorajsze', 'juz-dzis']);
});

test('carryOver pomija wykonane, notatki i pozycje powiązane z blokiem', () => {
  const all = [
    item('zrobione', '2026-09-22', { type: 'done' }),
    item('notatka', '2026-09-22', { type: 'note' }),
    item('blok', '2026-09-22', { block: 'b1' }),
    item('zadanie', '2026-09-22'),
  ];
  const got = carryOver(all, T, '2026-09-22');
  expect(got.filter((i) => i.day === T).map((i) => i.id)).toEqual(['zadanie']);
});

test('carryOver wykonany dwa razy nic nie zmienia', () => {
  // Efekt na zmianę doby może odpalić wielokrotnie.
  const all = [item('a', '2026-09-22')];
  const once = carryOver(all, T, '2026-09-22');
  expect(carryOver(once, T, '2026-09-22')).toEqual(once);
});

test('carryOver bez dnia źródłowego nic nie robi', () => {
  const all = [item('a', T)];
  expect(carryOver(all, T, null)).toEqual(all);
});
```

- [ ] **Step 2: Uruchom — muszą paść** — Run: `make test` · Expected: FAIL.

- [ ] **Step 3: Implementacja**

```ts
// src/lib/backlog.ts
import type { Item } from './types';

/** Backlog to wszystko, co nie należy do dziś: przyszłość i rzeczy bez daty. */
export const isBacklog = (item: Item, today: string): boolean =>
  item.day === null || item.day > today;

export const backlogItems = (items: readonly Item[], today: string): Item[] =>
  items.filter((i) => isBacklog(i, today));

/** Data, po której pozycja jest sortowana: powtarzalna używa najbliższego wystąpienia. */
const sortDate = (i: Item) => i.nextOn ?? i.day;

export function sortBacklog(items: readonly Item[]): Item[] {
  const dated = items.filter((i) => sortDate(i) !== null);
  const undated = items.filter((i) => sortDate(i) === null);
  dated.sort((a, b) => {
    const d = (sortDate(a) as string).localeCompare(sortDate(b) as string);
    return d !== 0 ? d : (a.at ?? -1) - (b.at ?? -1);
  });
  return [...dated, ...undated];
}

/** Najpóźniejszy dzień z pozycjami, wcześniejszy niż `before`. */
export function lastDayWithItems(items: readonly Item[], before: string): string | null {
  let best: string | null = null;
  for (const i of items) {
    if (i.day === null || i.day >= before) continue;
    if (best === null || i.day > best) best = i.day;
  }
  return best;
}

/**
 * Niedokończone zadania z `sourceDay` stają się dzisiejsze i lądują na początku
 * tablicy. Pomijane są rzeczy zrobione (zostają w dniu, w którym je zrobiono),
 * notatki (opisują tamten dzień) i pozycje powiązane z blokiem (blok jest
 * zapisem czasu, który minął).
 *
 * Idempotentne z natury: po przeniesieniu w dniu źródłowym nie ma już czego brać.
 */
export function carryOver(
  items: readonly Item[],
  today: string,
  sourceDay: string | null,
): Item[] {
  if (sourceDay === null) return [...items];
  const moves = items.filter(
    (i) => i.day === sourceDay && i.type === 'task' && !i.block,
  );
  if (!moves.length) return [...items];

  const ids = new Set(moves.map((i) => i.id));
  return [
    ...moves.map((i) => ({ ...i, day: today })),
    ...items.filter((i) => !ids.has(i.id)),
  ];
}
```

- [ ] **Step 4: Uruchom testy** — Run: `make test` · Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/backlog.ts test/backlog.test.ts
git commit -m "feat: add backlog partitioning, ordering and carry-over"
```

---

## Task 4: Usunięcie `viewDay`

Najbardziej inwazyjne zadanie planu. Nic nie dodaje — zamienia „dzień oglądany" na „dziś".

**Files:** Modify `src/state.svelte.ts`, `src/App.svelte`, `src/actions.svelte.ts`, `src/lib/keys.ts`, `src/components/Header.svelte`, `src/components/Grid.svelte`, `src/components/HourRow.svelte`, `src/components/list/*`, `test/keys.test.ts`, `test/header.render.test.ts`

- [ ] **Step 1: Zamień stan**

W `state.svelte.ts`: usuń `viewDay` z `app`, dodaj getter:

```ts
/** Aplikacja pokazuje wyłącznie dziś; data wynika z zegara, nie z nawigacji. */
export const currentDay = {
  get value() {
    return dayKey(new Date(app.now));
  },
};
```

Zamień każde `app.viewDay` na `currentDay.value`. W `startClock()` usuń logikę przenoszenia
widoku na nowy dzień — nie ma czego przenosić.

- [ ] **Step 2: Usuń skróty dni z `keys.ts`**

Skasuj akcje `day` i `today` wraz z ich obsługą w `App.svelte`. W `test/keys.test.ts` zamień
test „nawigacja po dniach" na:

```ts
test('skróty nawigacji po dniach już nie istnieją', () => {
  for (const key of ['[', ']', ',', '.', 't', 'T']) expect(k(key)).toBeNull();
});
```

- [ ] **Step 3: Uprość nagłówek**

Z `Header.svelte` usuń przyciski `chevron-left` / `chevron-right` i props `onPrev`/`onNext`.
Data przestaje być przyciskiem — zostaje `<span id="date">`. Usuń klasę `is-today` (zawsze dziś).
W `test/header.render.test.ts` usuń testy o `is-today` i o przechodzeniu dni, dodaj:

```ts
test('nagłówek nie ma już strzałek nawigacji po dniach', () => {
  expect(htmlToday).not.toContain('Poprzedni dzień');
  expect(htmlToday).not.toContain('Następny dzień');
});
```

- [ ] **Step 4: Uruchom testy i typy** — Run: `make test && make check`

Oczekiwane: kilka testów montowania ustawiających `app.viewDay` przestanie się kompilować.
Zamień je na manipulację `app.now` albo usuń, jeśli sprawdzały wyłącznie nawigację.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: replace the viewed day with today throughout"
```

---

## Task 5: Trzeci panel i układ

**Files:** Modify `src/components/Panes.svelte`, `src/state.svelte.ts`, `src/components/Header.svelte`, `src/app.css`; Create `src/components/backlog/Backlog.svelte`

- [ ] **Step 1: Trójstanowy panel w `ui`**

```ts
  pane: 'grid' as 'grid' | 'list' | 'backlog',
```

- [ ] **Step 2: Pusty panel backlogu**

```svelte
<!-- src/components/backlog/Backlog.svelte -->
<script lang="ts">
  import { app, currentDay } from '../../state.svelte';
  import { backlogItems, sortBacklog } from '../../lib/backlog';

  const items = $derived(sortBacklog(backlogItems(app.S.items, currentDay.value)));
</script>

<section id="backlog">
  <h2 class="pane-title">Backlog</h2>
  {#if items.length === 0}
    <p class="list-empty">Nic nie czeka.</p>
  {/if}
</section>
```

- [ ] **Step 3: Trzy panele w `Panes.svelte`**

Próg `(min-width: 1300px)`; przy wąskim ekranie renderuj panel wskazany przez `ui.pane`.

- [ ] **Step 4: Przełącznik cykliczny w nagłówku**

```ts
  const ORDER = ['grid', 'list', 'backlog'] as const;
  const nextPane = () => ORDER[(ORDER.indexOf(ui.pane) + 1) % ORDER.length]!;
```

- [ ] **Step 5: Style — środkowy panel wyniesiony**

```css
#panes > *{flex:1;min-width:0}
#list{
  background:var(--raise);
  border-left:1px solid var(--line-2);border-right:1px solid var(--line-2);
  padding:10px 16px;
}
#backlog{min-height:0;overflow-y:auto;padding:10px}
.pane-title{
  margin:0 0 8px;font:600 12px var(--sans);color:var(--fg-faint);
  text-transform:uppercase;letter-spacing:.07em;
}
```

- [ ] **Step 6: Weryfikacja** — `make check && make test && make build`, potem `make dev`:
trzy panele obok siebie, środkowy wyraźnie wyniesiony, brak przewijania strony; poniżej 1300 px
przełącznik przechodzi kolejno przez trzy panele.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add the backlog pane and raise the notes pane"
```

---

## Task 6: Wiersz backlogu

**Files:** Create `src/components/backlog/BacklogItem.svelte`; Modify `src/components/backlog/Backlog.svelte`, `src/app.css`

- [ ] **Step 1: Komponent wiersza**

Pokazuje: znacznik (kółko, gdy `repeat`, inaczej kropka/`×`), tekst, a po prawej metrykę —
datę (`wt 29 wrz`), godzinę (`09:00`) albo opis wzorca. Pole tekstowe jak w `ListItem`,
z tą samą obsługą `Enter`, `Backspace` i strzałek.

- [ ] **Step 2: Formatowanie metryki**

```ts
  const fmtShort = new Intl.DateTimeFormat('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' });
  const meta = $derived.by(() => {
    if (item.repeat) return describeRepeat(item.repeat);
    if (!item.day) return '';
    const [y, m, d] = item.day.split('-').map(Number);
    const date = fmtShort.format(new Date(y!, m! - 1, d!)).replace(',', '');
    return item.at !== undefined ? `${date} ${fmtQ(item.day, item.at)}` : date;
  });
```

- [ ] **Step 3: Style**

```css
.backlog-item{display:flex;align-items:center;gap:7px;padding:2px 0;position:relative}
.backlog-meta{flex:none;font:500 12px var(--sans);color:var(--fg-faint);white-space:nowrap}
.bullet.is-repeat{border:2px solid currentColor;border-radius:50%;width:20px;height:20px;font-size:0}
```

- [ ] **Step 4: Weryfikacja** — `make check`, potem ręcznie: pozycja z datą pokazuje datę,
z godziną — datę i godzinę, powtarzalna — opis wzorca i kółko.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: render backlog rows with their date, time or pattern"
```

---

## Task 7: Przeniesienie niedokończonych przy zmianie doby

**Files:** Modify `src/state.svelte.ts`, `src/App.svelte`; Create `test/carryover.mount.test.ts`

- [ ] **Step 1: Napisz test montowania**

Ustaw w `localStorage` stan z zadaniem na dniu wczorajszym, zamontuj aplikację, sprawdź,
że pozycja ma dzisiejszą datę i stoi na początku listy notatek.

- [ ] **Step 2: Efekt w `App.svelte`**

```ts
  // Przeniesienie niedokończonych: przy starcie i przy każdej zmianie doby.
  let carriedFor = $state<string | null>(null);
  $effect(() => {
    const today = currentDay.value;
    if (carriedFor === today) return;
    carriedFor = today;
    const source = lastDayWithItems(app.S.items, today);
    const next = carryOver(app.S.items, today, source);
    if (next !== app.S.items) {
      app.S.items = next;
      save();
    }
  });
```

- [ ] **Step 3: Uruchom testy** — Run: `make test` · Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: carry unfinished tasks forward to today"
```

---

## Task 8: Odhaczenie pozycji backlogu

**Files:** Modify `src/actions.svelte.ts`, `src/components/list/Bullet.svelte`; Create `test/backlog-done.mount.test.ts`

- [ ] **Step 1: Napisz testy** — odhaczona pozycja backlogu trafia do dziś jako wykonana;
odhaczona powtarzalna zostaje w backlogu, rodzi wykonaną kopię w dziś i przesuwa `nextOn`.

- [ ] **Step 2: Mutator**

```ts
/** Odhaczenie w backlogu: rzecz zrobiona należy do dzisiejszego dziennika. */
export function completeBacklogItem(id: string): void {
  const item = app.S.items.find((i) => i.id === id);
  if (!item) return;
  const today = currentDay.value;

  if (!item.repeat) {
    commit(() => {
      item.day = today;
      item.type = 'done';
      delete item.at;
    });
    return;
  }

  // Powtarzalna: szablon zostaje, kopia idzie do dziś, termin przesuwa się dalej.
  const copy: Item = {
    id: uid(), day: today, text: item.text, type: 'done', created: Date.now(),
  };
  commit(() => {
    app.S.items = [...app.S.items, copy];
    item.nextOn = nextOccurrence(item.repeat!, item.nextOn ?? today);
  });
}
```

- [ ] **Step 3: Podepnij w `Bullet.svelte`** — klik w znacznik pozycji backlogu woła
`completeBacklogItem` zamiast `setItemType`.

- [ ] **Step 4: Uruchom testy** — Run: `make test && make check`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: completing a backlog item files it into today"
```

---

## Task 9: Ustawianie wzorca powtarzania

**Files:** Create `src/components/backlog/RepeatMenu.svelte`; Modify `src/actions.svelte.ts`, `src/components/backlog/BacklogItem.svelte`

- [ ] **Step 1: Mutator**

```ts
export function setRepeat(id: string, repeat: Repeat | undefined): void {
  const item = app.S.items.find((i) => i.id === id);
  if (!item) return;
  commit(() => {
    if (repeat) {
      item.repeat = repeat;
      item.nextOn = nextOccurrence(repeat, currentDay.value);
    } else {
      delete item.repeat;
      delete item.nextOn;
    }
  });
}
```

- [ ] **Step 2: Menu** — prawy przycisk na znaczniku pozycji backlogu otwiera listę:
`codziennie`, `co <dzień tygodnia dzisiejszy>`, `<dzień miesiąca>. każdego miesiąca`,
`co rok <data>`, `bez powtarzania`. Wzorce budowane z dzisiejszej daty, więc nie trzeba
osobnego formularza.

- [ ] **Step 3: Weryfikacja** — `make check && make test`, potem ręcznie: ustawienie wzorca
zmienia znacznik na kółko i pokazuje opis; „bez powtarzania" wraca do kropki.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: set a recurrence pattern from the backlog bullet menu"
```

---

## Task 10: Okienko wyboru daty

**Files:** Create `src/components/backlog/DatePrompt.svelte`; Modify `src/state.svelte.ts`, `src/app.css`

- [ ] **Step 1: Stan** — `ui.datePrompt: { itemId: string; x: number; y: number } | null`

- [ ] **Step 2: Komponent** — `<input type="date">` z jutrzejszą datą, opcjonalne
`<input type="time">`, przyciski „Zaplanuj" i „Anuluj", `Escape` anuluje.

```ts
  /** Godzina zaokrąglana W DÓŁ do kwadransa — siatka nie umie pokazać innych. */
  const toQuantum = (hhmm: string): number | undefined => {
    if (!hhmm) return undefined;
    const [h, m] = hhmm.split(':').map(Number);
    return (h ?? 0) * 4 + Math.floor((m ?? 0) / 15);
  };
```

- [ ] **Step 3: Weryfikacja** — `make check && make test`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add the date and time prompt for scheduling"
```

---

## Task 11: Przeciąganie notatki do backlogu

**Files:** Modify `src/components/list/Bullet.svelte`, `src/actions.svelte.ts`; Create `test/drag-to-backlog.mount.test.ts`

- [ ] **Step 1: Rozpoznanie panelu docelowego**

W `onPointerUp` sprawdź, nad którym panelem jest kursor:

```ts
  const paneUnder = (x: number, y: number): 'list' | 'backlog' | null => {
    for (const el of document.elementsFromPoint(x, y)) {
      if (el.id === 'backlog') return 'backlog';
      if (el.id === 'list') return 'list';
    }
    return null;
  };
```

- [ ] **Step 2: Mutator**

```ts
export function scheduleItem(id: string, day: string | null, at?: number): void {
  const item = app.S.items.find((i) => i.id === id);
  if (!item) return;
  commit(() => {
    item.day = day;
    if (at === undefined) delete item.at;
    else item.at = at;
    // Pozycja opuszczająca dziś nie może dalej wskazywać na blok tego dnia.
    if (item.block) delete item.block;
  });
}
```

- [ ] **Step 3: Podepnij** — upuszczenie na `#backlog` otwiera `DatePrompt` dla tej pozycji.

- [ ] **Step 4: Testy** — przeciągnięcie z notatek na backlog otwiera okienko; zatwierdzenie
ustawia dzień; anulowanie nie zmienia niczego.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: drag a note into the backlog to schedule it"
```

---

## Task 12: Przeciąganie backlogu do dziś

**Files:** Modify `src/components/backlog/BacklogItem.svelte`, `src/actions.svelte.ts`; Create `test/drag-to-today.mount.test.ts`

**Interfaces:** Consumes `slotFree`, `fit`, `occ`.

- [ ] **Step 1: Napisz testy** — pozycja bez godziny ląduje jako zwykła pozycja dziś;
pozycja z godziną na wolnym slocie tworzy blok i wiąże się z nim; na slocie zajętym ląduje
bez bloku i pokazuje komunikat.

- [ ] **Step 2: Mutator**

```ts
/** Wzięcie rzeczy z backlogu na dziś. Godzina staje się blokiem, jeśli jest miejsce. */
export function pullToToday(id: string, catId: string | null): void {
  const item = app.S.items.find((i) => i.id === id);
  if (!item) return;
  const today = currentDay.value;
  const at = item.at;

  if (at === undefined || catId === null) {
    commit(() => {
      item.day = today;
      delete item.at;
    });
    return;
  }

  if (!slotFree(app.S.blocks, today, at, 2)) {
    commit(() => {
      item.day = today;
    });
    app.toast = { msg: `O ${fmtQ(today, at)} jest już zajęte — pozycja bez bloku`, undoable: false };
    return;
  }

  const block = newBlock(today, at, 2, catId, statusFor(today, at, 2, app.now), Date.now(), uid);
  commit(() => {
    app.S.blocks.push(block);
    item.day = today;
    delete item.at;
    item.block = block.id;
  });
}
```

- [ ] **Step 3: Wybór kategorii** — pozycja z godziną upuszczona na notatki otwiera menu
radialne; wybór kategorii woła `pullToToday(id, catId)`. Pozycja bez godziny pomija menu.

- [ ] **Step 4: Uruchom testy** — Run: `make test && make check`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: drag a backlog item into today, becoming a block when timed"
```

---

## Task 13: Sprzątanie i dokumentacja

**Files:** Modify `src/components/list/Bullet.svelte`, `src/components/Help.svelte`, `README.md`, `PLAN.md`

- [ ] **Step 1: Usuń resztki przeniesień z interfejsu** — z menu znacznika znikają pozycje
`Na jutro` i `Na dzień…`. Same mutatory zniknęły już w zadaniu 2, wymuszone zmianą typu.

- [ ] **Step 2: Pomoc** — opisz trzy panele, przeciąganie w obie strony i powtarzalność;
usuń wiersze o nawigacji po dniach.

- [ ] **Step 3: README i PLAN** — zaktualizuj opis struktury o `src/components/backlog/`
i o tym, że aplikacja pokazuje wyłącznie dziś.

- [ ] **Step 4: Pełna weryfikacja** — `make check && make test && make build`, potem `make dev`
i lista kontrolna: trzy panele; brak strzałek dni; pozycja backlogu z datą, godziną i wzorcem;
odhaczenie w backlogu; przeciąganie w obie strony; przeniesienie niedokończonych po zmianie doby;
kopia zapasowa zawiera `repeat` i `nextOn`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: retire the move markers and document the three panes"
```

---

## Stan po wykonaniu planu

Aplikacja pokazuje dziś i backlog. Planowanie to przeciągnięcie w prawo, wzięcie do roboty —
w lewo. Powtarzalne rzeczy wracają same. Dni minione są w danych, ale nie ma ich jak obejrzeć
do czasu powstania widoku historii.
