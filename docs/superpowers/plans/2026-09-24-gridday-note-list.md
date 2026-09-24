# GridDay — lista notatek (faza A): plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać prawy panel z dziennym logiem w duchu bullet journal — płaską listą pozycji pisaną wyłącznie z klawiatury — bez powiązania z blokami czasu.

**Architecture:** `src/lib/items.ts` dostaje całą logikę operacji na liście jako funkcje czyste na tablicy `Item[]`; mutatory w `src/actions.svelte.ts` wołają je i opakowują w `commit()`. Komponenty w `src/components/list/` tylko renderują i podpinają zdarzenia. Fokus jest stanem widokowym (`ui.focusItem`), a nie imperatywnym wywołaniem z mutatora.

**Tech Stack:** Svelte 5 (runy), TypeScript, Vitest (projekty `unit` i `mount`), istniejący harness jsdom.

**Spec:** [`docs/superpowers/specs/2026-09-24-gridday-note-list-design.md`](../specs/2026-09-24-gridday-note-list-design.md)

## Global Constraints

- **`src/lib/` nie importuje niczego ze Svelte.** Operacje na liście są czyste: tablica i indeks na wejściu, nowa tablica albo wartość na wyjściu. Fokus i DOM ich nie dotyczą.
- **Kolejność bez pola `order`.** Lista dnia to `items.filter(i => i.day === day)`; pozycja w tablicy JEST kolejnością.
- **Schemat `v2 → v3`**, migracja wyłącznie w `normalize()`. Klucze `localStorage` bez zmian.
- **Brak zagnieżdżania.** Żadnego pola `depth`, żadnych rodziców i dzieci.
- **Typ domyślny nowej pozycji to `task`.**
- **`Tab` cykluje wyłącznie `task → done → note`.** `scheduled` i `migrated` ustawia się z menu znacznika, bo zapisują do listy innego dnia.
- **Strona się nie przewija.** Przewijać wolno tylko `#list`.
- **Język:** kod, komentarze i teksty UI po polsku; komunikaty commitów po angielsku.
- **Testy:** `TZ=Europe/Warsaw`, uruchamiane przez `make test`.

## Review Focus

Klasy wejścia, których spec wymaga pośrednio, a które łatwo przeoczyć:

1. **Pozycje różnych dni przeplecione w tablicy** — `insertAfter` liczy indeks w pełnej tablicy, nie w przefiltrowanej; pomyłka wstawia pozycję do cudzego dnia. → test w zadaniu 2.
2. **Przeniesienie wykonane dwa razy** — powtórny wybór `migrated` przy ustawionym `movedTo` nie może dopisać drugiej kopii. → test w zadaniu 3.
3. **Stan sprzed migracji bez tablicy `items`** — kopia zapasowa zapisana w `v2` musi wczytać się z pustą listą, a nie wywrócić panel. → test w zadaniu 4.
4. **`↑`/`↓` w środku długiej, zawiniętej pozycji** — muszą poruszać karetką, a nie przeskakiwać między pozycjami. → test w zadaniu 7.
5. **`Backspace` na pozycji 0 pozycji NIEpustej** — nie wolno jej skasować; scalanie jest poza zakresem. → test w zadaniu 7.

---

## Struktura plików

| Plik | Rola |
|---|---|
| `src/lib/types.ts` | `ItemType`, `Item`, pole `items` w `State` |
| `src/lib/items.ts` | **nowy:** `dayItems`, `insertAfter`, `removeById`, `cycleType`, `typeAfterEnter`, `migrateTo`, `MARK` |
| `src/lib/model.ts` | migracja `v2 → v3` |
| `src/actions.svelte.ts` | mutatory listy przez `commit()` |
| `src/state.svelte.ts` | `ui.pane`, `ui.focusItem` |
| `src/components/Panes.svelte` | **nowy:** podział ekranu i próg wąskiego ekranu |
| `src/components/list/List.svelte` | **nowy:** panel listy, pusty stan |
| `src/components/list/ListItem.svelte` | **nowy:** pole tekstowe i klawiatura |
| `src/components/list/Bullet.svelte` | **nowy:** znacznik, klik i menu typów |
| `src/components/Header.svelte` | przełącznik paneli |
| `src/app.css` | `#panes`, `#list`, style pozycji |

---

## Task 1: Typy i znaczniki

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/items.ts` (tylko `MARK`), `test/items.test.ts`

**Interfaces:**
- Produces: `ItemType`, `Item`, `State.items`, `MARK: Record<ItemType, string>`.

- [ ] **Step 1: Napisz testy znaczników**

```ts
// test/items.test.ts
import { test, expect } from 'vitest';
import { MARK } from '../src/lib/items';
import type { ItemType } from '../src/lib/types';

test('każdy typ ma dokładnie jeden znak', () => {
  const types: ItemType[] = ['task', 'done', 'note', 'scheduled', 'migrated'];
  for (const t of types) {
    expect(MARK[t], t).toBeTruthy();
    expect([...MARK[t]], t).toHaveLength(1);
  }
});

test('znaki są zgodne z notacją bullet journal', () => {
  expect(MARK.task).toBe('·');
  expect(MARK.done).toBe('×');
  expect(MARK.note).toBe('–');
  expect(MARK.scheduled).toBe('<');
  expect(MARK.migrated).toBe('>');
});

test('żadne dwa typy nie dzielą znaku', () => {
  const marks = Object.values(MARK);
  expect(new Set(marks).size).toBe(marks.length);
});
```

- [ ] **Step 2: Uruchom — musi paść**

Run: `make test`
Expected: FAIL, `Cannot find module '../src/lib/items'`.

- [ ] **Step 3: Dopisz typy do `src/lib/types.ts`**

Dopisz pod `Block`, a `items` dołóż do `State`:

```ts
export type ItemType = 'task' | 'done' | 'note' | 'scheduled' | 'migrated';

export interface Item {
  id: string;
  day: string; // 'YYYY-MM-DD', czas lokalny
  text: string;
  type: ItemType;
  created: number;
  /** dzień docelowy, gdy pozycja została przeniesiona; inaczej brak */
  movedTo?: string;
}
```

W `State` dopisz `items: Item[];` pod `blocks`.

- [ ] **Step 4: Utwórz `src/lib/items.ts`**

```ts
import type { ItemType } from './types';

/** Notacja bullet journal. Jeden znak na typ, bez powtórzeń. */
export const MARK: Record<ItemType, string> = {
  task: '·',
  done: '×',
  note: '–',
  scheduled: '<',
  migrated: '>',
};
```

- [ ] **Step 5: Uruchom testy**

Run: `make test`
Expected: PASS. `make check` zgłosi błędy w `normalize()` — `items` jest wymagane, a nie jest zwracane. Naprawia to zadanie 4; na tym etapie to oczekiwane.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/items.ts test/items.test.ts
git commit -m "feat: add the note item type and bullet-journal marks"
```

---

## Task 2: Operacje na liście — filtr, wstawianie, usuwanie

**Files:**
- Modify: `src/lib/items.ts`, `test/items.test.ts`

**Interfaces:**
- Produces:
  - `dayItems(items: readonly Item[], day: string): Item[]`
  - `newItem(day: string, type: ItemType, created: number, makeId: () => string): Item`
  - `insertAfter(items: readonly Item[], afterId: string | null, item: Item): Item[]`
  - `removeById(items: readonly Item[], id: string): Item[]`

- [ ] **Step 1: Napisz testy**

```ts
// dopisz do test/items.test.ts
import { dayItems, insertAfter, removeById, newItem } from '../src/lib/items';
import type { Item } from '../src/lib/types';

const it = (id: string, day: string, text = '', type: ItemType = 'task'): Item =>
  ({ id, day, text, type, created: 0 });

const A = '2026-09-24';
const B = '2026-09-25';

test('dayItems zwraca tylko pozycje danego dnia, w kolejności tablicy', () => {
  const all = [it('1', A), it('2', B), it('3', A)];
  expect(dayItems(all, A).map((x) => x.id)).toEqual(['1', '3']);
});

test('dayItems na pustej tablicy daje pustą listę', () => {
  expect(dayItems([], A)).toEqual([]);
});

test('insertAfter wstawia zaraz za wskazaną pozycją', () => {
  const all = [it('1', A), it('2', A)];
  const got = insertAfter(all, '1', it('x', A));
  expect(got.map((x) => x.id)).toEqual(['1', 'x', '2']);
});

test('insertAfter z null wstawia na koniec listy DNIA, nie tablicy', () => {
  const all = [it('1', A), it('2', B)];
  const got = insertAfter(all, null, it('x', A));
  expect(dayItems(got, A).map((x) => x.id)).toEqual(['1', 'x']);
});

test('insertAfter przy przeplecionych dniach nie gubi kolejności dnia', () => {
  // Klasa wejścia z Review Focus: indeks liczony w pełnej tablicy.
  const all = [it('1', A), it('2', B), it('3', A)];
  const got = insertAfter(all, '1', it('x', A));
  expect(got.map((x) => x.id)).toEqual(['1', 'x', '2', '3']);
  expect(dayItems(got, A).map((x) => x.id)).toEqual(['1', 'x', '3']);
});

test('insertAfter z nieznanym id dokłada na koniec zamiast gubić pozycję', () => {
  const all = [it('1', A)];
  expect(insertAfter(all, 'nie-ma', it('x', A)).map((x) => x.id)).toEqual(['1', 'x']);
});

test('insertAfter nie mutuje wejścia', () => {
  const all = [it('1', A)];
  insertAfter(all, '1', it('x', A));
  expect(all).toHaveLength(1);
});

test('removeById usuwa wskazaną pozycję i zostawia resztę', () => {
  const all = [it('1', A), it('2', A)];
  expect(removeById(all, '1').map((x) => x.id)).toEqual(['2']);
});

test('removeById z nieznanym id nie zmienia niczego', () => {
  const all = [it('1', A)];
  expect(removeById(all, 'nie-ma').map((x) => x.id)).toEqual(['1']);
});

test('newItem tworzy pozycję z pustym tekstem i podanym typem', () => {
  expect(newItem(A, 'note', 99, () => 'id-1')).toEqual({
    id: 'id-1', day: A, text: '', type: 'note', created: 99,
  });
});
```

- [ ] **Step 2: Uruchom — muszą paść**

Run: `make test`
Expected: FAIL, `dayItems is not a function` albo błąd importu.

- [ ] **Step 3: Implementacja**

```ts
import type { Item, ItemType } from './types';

/** Lista jednego dnia. `filter` zachowuje kolejność tablicy, więc pozycja
 *  w tablicy JEST kolejnością — nie ma osobnego pola `order`. */
export const dayItems = (items: readonly Item[], day: string): Item[] =>
  items.filter((i) => i.day === day);

export const newItem = (
  day: string,
  type: ItemType,
  created: number,
  makeId: () => string,
): Item => ({ id: makeId(), day, text: '', type, created });

// Indeks liczony w PEŁNEJ tablicy, nie w przefiltrowanej: dni mogą się
// przeplatać, a wstawka ma trafić tuż za swoją pozycją, nie za pozycją
// o tym samym numerze w innym dniu.
export function insertAfter(
  items: readonly Item[],
  afterId: string | null,
  item: Item,
): Item[] {
  const out = [...items];
  if (afterId === null) {
    const last = out.map((x) => x.day).lastIndexOf(item.day);
    out.splice(last < 0 ? out.length : last + 1, 0, item);
    return out;
  }
  const i = out.findIndex((x) => x.id === afterId);
  out.splice(i < 0 ? out.length : i + 1, 0, item);
  return out;
}

export const removeById = (items: readonly Item[], id: string): Item[] =>
  items.filter((i) => i.id !== id);
```

- [ ] **Step 4: Uruchom testy**

Run: `make test`
Expected: wszystkie testy `items.test.ts` PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/items.ts test/items.test.ts
git commit -m "feat: add day filtering, insertion and removal for note items"
```

---

## Task 3: Znaczniki — cykl, dziedziczenie po Enterze, przeniesienie

**Files:**
- Modify: `src/lib/items.ts`, `test/items.test.ts`

**Interfaces:**
- Consumes: `dayItems`, `insertAfter`, `newItem` z zadania 2.
- Produces:
  - `CYCLE: readonly ItemType[]` — `['task', 'done', 'note']`
  - `cycleType(type: ItemType, dir?: 1 | -1): ItemType`
  - `typeAfterEnter(type: ItemType): ItemType`
  - `migrateTo(items, id, targetDay, created, makeId): Item[]`

- [ ] **Step 1: Napisz testy**

```ts
// dopisz do test/items.test.ts
import { CYCLE, cycleType, typeAfterEnter, migrateTo } from '../src/lib/items';

test('Tab cykluje wyłącznie znaczniki opisujące stan pozycji tutaj', () => {
  expect(CYCLE).toEqual(['task', 'done', 'note']);
  expect(cycleType('task')).toBe('done');
  expect(cycleType('done')).toBe('note');
  expect(cycleType('note')).toBe('task');
});

test('Shift+Tab cykluje w drugą stronę', () => {
  expect(cycleType('task', -1)).toBe('note');
  expect(cycleType('note', -1)).toBe('done');
});

test('cykl z typu przeniesionego wraca do zadania', () => {
  // scheduled i migrated nie są w cyklu — Tab wyprowadza z nich do task.
  expect(cycleType('migrated')).toBe('task');
  expect(cycleType('scheduled')).toBe('task');
  expect(cycleType('migrated', -1)).toBe('task');
});

test('Enter dziedziczy typ zadania i notatki', () => {
  expect(typeAfterEnter('task')).toBe('task');
  expect(typeAfterEnter('note')).toBe('note');
});

test('Enter po stanie końcowym daje zwykłe zadanie', () => {
  // Nikt nie chce pozycji urodzonej jako wykonana albo przeniesiona.
  expect(typeAfterEnter('done')).toBe('task');
  expect(typeAfterEnter('scheduled')).toBe('task');
  expect(typeAfterEnter('migrated')).toBe('task');
});

test('migrateTo dopisuje kopię na koniec listy dnia docelowego', () => {
  const all = [{ ...it('1', A), text: 'Zadzwonić' }];
  const got = migrateTo(all, '1', B, 5, () => 'kopia');
  expect(dayItems(got, B)).toEqual([
    { id: 'kopia', day: B, text: 'Zadzwonić', type: 'task', created: 5 },
  ]);
});

test('migrateTo oznacza pozycję źródłową i zapisuje dzień docelowy', () => {
  const got = migrateTo([it('1', A)], '1', B, 5, () => 'kopia');
  const src = got.find((x) => x.id === '1')!;
  expect(src.type).toBe('migrated');
  expect(src.movedTo).toBe(B);
});

test('migrateTo na jutro daje typ migrated, na inny dzień scheduled', () => {
  const tomorrow = migrateTo([it('1', A)], '1', B, 5, () => 'k', 'migrated');
  expect(tomorrow.find((x) => x.id === '1')!.type).toBe('migrated');
  const later = migrateTo([it('1', A)], '1', '2026-10-01', 5, () => 'k', 'scheduled');
  expect(later.find((x) => x.id === '1')!.type).toBe('scheduled');
});

test('migrateTo wykonane dwa razy nie dopisuje drugiej kopii', () => {
  // Klasa wejścia z Review Focus.
  const once = migrateTo([it('1', A)], '1', B, 5, () => 'k1');
  const twice = migrateTo(once, '1', B, 6, () => 'k2');
  expect(dayItems(twice, B)).toHaveLength(1);
  expect(twice).toEqual(once);
});

test('migrateTo z nieznanym id nie zmienia niczego', () => {
  const all = [it('1', A)];
  expect(migrateTo(all, 'nie-ma', B, 5, () => 'k')).toEqual(all);
});

test('migrateTo nie mutuje wejścia', () => {
  const all = [it('1', A)];
  migrateTo(all, '1', B, 5, () => 'k');
  expect(all[0]!.type).toBe('task');
});
```

- [ ] **Step 2: Uruchom — muszą paść**

Run: `make test`
Expected: FAIL, `CYCLE is not defined`.

- [ ] **Step 3: Implementacja**

```ts
// Tab cykluje TYLKO znaczniki opisujące stan pozycji w tym dniu. `scheduled`
// i `migrated` są poza cyklem, bo ich ustawienie zapisuje do listy innego
// dnia — dwa naciśnięcia w tę i z powrotem zostawiłyby tam duplikaty.
export const CYCLE = ['task', 'done', 'note'] as const;

export function cycleType(type: ItemType, dir: 1 | -1 = 1): ItemType {
  const i = CYCLE.indexOf(type as (typeof CYCLE)[number]);
  if (i < 0) return 'task'; // wyjście ze stanu przeniesionego
  return CYCLE[(i + dir + CYCLE.length) % CYCLE.length]!;
}

/** Nowa pozycja dziedziczy typ, ale nigdy nie rodzi się w stanie końcowym. */
export const typeAfterEnter = (type: ItemType): ItemType =>
  type === 'note' ? 'note' : 'task';

// Kopia trafia na koniec listy dnia docelowego, źródło dostaje znacznik
// i `movedTo`. Ustawione `movedTo` blokuje powtórkę: bez tego ponowny wybór
// tego samego typu dosypywałby kopie do dnia, na który nikt nie patrzy.
export function migrateTo(
  items: readonly Item[],
  id: string,
  targetDay: string,
  created: number,
  makeId: () => string,
  type: 'migrated' | 'scheduled' = 'migrated',
): Item[] {
  const src = items.find((i) => i.id === id);
  if (!src || src.movedTo) return [...items];

  const copy: Item = { id: makeId(), day: targetDay, text: src.text, type: 'task', created };
  const withCopy = insertAfter(items, null, copy);
  return withCopy.map((i) => (i.id === id ? { ...i, type, movedTo: targetDay } : i));
}
```

- [ ] **Step 4: Uruchom testy**

Run: `make test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/items.ts test/items.test.ts
git commit -m "feat: add mark cycling and cross-day migration for note items"
```

---

## Task 4: Migracja schematu v2 → v3

**Files:**
- Modify: `src/lib/model.ts`, `test/model.test.ts`

**Interfaces:**
- Consumes: `Item` z zadania 1.
- Produces: `normalize()` zwracające `State` z gwarantowaną tablicą `items` i `v === 3`.

- [ ] **Step 1: Napisz testy**

```ts
// dopisz do test/model.test.ts
test('normalize: stan v2 dostaje pustą listę notatek i wersję 3', () => {
  const s = normalize({
    v: 2,
    cats: [{ id: 'x', name: 'X', icon: 'circle', color: 'red', parent: null }],
    blocks: [{ id: 'a', day: '2026-09-24', q: 32, len: 2, cat: 'x', title: '', status: 'planned', created: 0 }],
    day: { start: 6, end: 22, bands: [] },
  });
  expect(s.v).toBe(3);
  expect(s.items).toEqual([]);
  expect(s.blocks).toHaveLength(1);
  expect(s.cats).toHaveLength(1);
});

test('normalize: migracja v1 → v3 przechodzi przez obie wersje', () => {
  const s = normalize({
    v: 1,
    cats: [{ id: 'x', name: 'X', icon: 'circle', color: 'red', parent: null }],
    blocks: [{ id: 'a', day: '2026-09-24', q: 0, len: 2, cat: 'x', title: '', status: 'confirmed', created: 0 }],
  });
  expect(s.v).toBe(3);
  expect(s.blocks[0]!.q).toBe(24);
  expect(s.items).toEqual([]);
});

test('normalize: stan v3 bez tablicy items dostaje pustą', () => {
  // Klasa wejścia z Review Focus: uszkodzona kopia zapasowa.
  const s = normalize({ v: 3, cats: [], blocks: [], day: { start: 6, end: 22, bands: [] } });
  expect(s.items).toEqual([]);
});

test('normalize: istniejące notatki przechodzą nietknięte', () => {
  const items = [{ id: 'i1', day: '2026-09-24', text: 'Notka', type: 'note', created: 1 }];
  const s = normalize({ v: 3, cats: [], blocks: [], day: { start: 6, end: 22, bands: [] }, items });
  expect(s.items).toEqual(items);
});

test('normalize: brak stanu daje pustą listę notatek', () => {
  expect(normalize(null).items).toEqual([]);
});
```

- [ ] **Step 2: Uruchom — muszą paść**

Run: `make test`
Expected: FAIL — `expected 2 to be 3`.

- [ ] **Step 3: Implementacja**

W `src/lib/model.ts` w `normalize()`, pod migracją `v1 → v2`, dopisz:

```ts
  // v2 nie znało listy notatek.
  if (s && typeof s === 'object' && s.v === 2) {
    s.items = [];
    s.v = 3;
  }
```

Zmień warunek stanu domyślnego z `s.v !== 2` na `s.v !== 3` i dołóż `items: []` do zwracanego obiektu domyślnego. Na końcu, obok napraw `cats` i `day`, dopisz:

```ts
  if (!Array.isArray(s.items)) s.items = [];
```

- [ ] **Step 4: Uruchom testy**

Run: `make test && make check`
Expected: testy PASS, `svelte-check` bez błędów — `State.items` jest już zawsze wypełniane.

- [ ] **Step 5: Commit**

```bash
git add src/lib/model.ts test/model.test.ts
git commit -m "feat: migrate the schema to v3 with a note list"
```

---

## Task 5: Podział ekranu

**Files:**
- Modify: `src/App.svelte`, `src/app.css`, `src/state.svelte.ts`
- Create: `src/components/Panes.svelte`, `src/components/list/List.svelte`

**Interfaces:**
- Produces: `ui.pane: 'grid' | 'list'` w `src/state.svelte.ts`; `Panes.svelte` renderujące oba panele.

- [ ] **Step 1: Dodaj stan widokowy panelu**

W `src/state.svelte.ts`, w obiekcie `ui`, dopisz pod `menu`:

```ts
  /** widoczny panel na wąskim ekranie; na szerokim widać oba */
  pane: 'grid' as 'grid' | 'list',
  /** czy ekran jest za wąski na dwa panele — ustawia Panes.svelte */
  narrow: false,
  /** pozycja listy, która ma dostać fokus po operacji strukturalnej */
  focusItem: null as string | null,
```

- [ ] **Step 2: Utwórz pusty panel listy**

```svelte
<!-- src/components/list/List.svelte -->
<script lang="ts">
  import { app } from '../../state.svelte';
  import { dayItems } from '../../lib/items';

  const items = $derived(dayItems(app.S.items, app.viewDay));
</script>

<section id="list">
  {#if items.length === 0}
    <p class="list-empty">Zacznij pisać, żeby dodać pierwszą pozycję.</p>
  {/if}
</section>
```

- [ ] **Step 3: Utwórz `Panes.svelte`**

```svelte
<!-- src/components/Panes.svelte -->
<script lang="ts">
  import { ui } from '../state.svelte';
  import Grid from './Grid.svelte';
  import List from './list/List.svelte';

  // Dwa panele potrzebują mniej więcej tyle miejsca, ile dotąd miał cały
  // ekran, więc próg jest wyżej niż istniejące 560px w arkuszu.
  const WIDE = '(min-width: 900px)';
  let wide = $state(true);

  $effect(() => {
    const mq = matchMedia(WIDE);
    wide = mq.matches;
    const on = (e: MediaQueryListEvent) => (wide = e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  });
</script>

<div id="panes" class:narrow={!wide}>
  {#if wide || ui.pane === 'grid'}<Grid />{/if}
  {#if wide || ui.pane === 'list'}<List />{/if}
</div>
```

- [ ] **Step 4: Podepnij w `App.svelte`**

Zamień `<Grid />` na `<Panes />` i popraw import:

```svelte
  import Panes from './components/Panes.svelte';
```

```svelte
<Panes />
```

- [ ] **Step 5: Style**

W `src/app.css`, pod regułą `#grid`, dopisz:

```css
/* ───────────── Podział ekranu ───────────── */
/* min-height:0 powtórzone celowo: bez niego zagnieżdżony flex rozpycha
   stronę i psuje niezmiennik „brak przewijania". */
#panes{flex:1;min-height:0;display:flex}
#panes > *{flex:1;min-width:0}
#panes.narrow > *{flex:1 0 100%}

/* Jedyna przewijalna powierzchnia w aplikacji: doba ma skończoną liczbę
   kwantów, ale nie ma skończonej liczby notatek. */
#list{
  min-height:0;overflow-y:auto;overflow-x:hidden;
  border-left:1px solid var(--line-2);
  padding:10px max(10px,env(safe-area-inset-right)) 10px 10px;
}
#panes.narrow #list{border-left:0}
.list-empty{margin:4px 2px;font:400 14px var(--sans);color:var(--fg-faint)}
```

- [ ] **Step 6: Weryfikacja**

```bash
make check && make test && make build
```

Następnie `make dev` i sprawdź: siatka zajmuje lewą połowę i nadal nie ma paska przewijania
strony; prawa połowa pokazuje tekst zachęty; zwężenie okna poniżej 900 px zostawia jeden panel.

- [ ] **Step 7: Commit**

```bash
git add src/App.svelte src/app.css src/state.svelte.ts src/components/Panes.svelte src/components/list/List.svelte
git commit -m "feat: split the day view into grid and list panes"
```

---

## Task 6: Znacznik pozycji

**Files:**
- Create: `src/components/list/Bullet.svelte`
- Modify: `src/actions.svelte.ts`, `src/app.css`

**Interfaces:**
- Consumes: `MARK`, `cycleType`, `migrateTo` z zadań 1–3.
- Produces: mutatory `setItemType(id, type)`, `migrateItem(id, targetDay, type)`; `Bullet.svelte` z propsami `{ item }`.

- [ ] **Step 1: Mutatory**

Dopisz na końcu `src/actions.svelte.ts`:

```ts
import { cycleType, migrateTo, newItem, insertAfter, removeById, typeAfterEnter } from './lib/items';
import type { ItemType } from './lib/types';
import { shiftDay } from './lib/time';

export function setItemType(id: string, type: ItemType): void {
  const item = app.S.items.find((i) => i.id === id);
  if (!item || item.type === type) return;
  commit(() => {
    item.type = type;
    // Wyjście ze stanu przeniesionego czyści ślad, ale NIE kasuje kopii
    // w dniu docelowym — to osobna pozycja, którą użytkownik usuwa sam.
    if (type !== 'migrated' && type !== 'scheduled') delete item.movedTo;
  });
}

export const cycleItemType = (id: string, dir: 1 | -1 = 1): void => {
  const item = app.S.items.find((i) => i.id === id);
  if (item) setItemType(id, cycleType(item.type, dir));
};

export function migrateItem(id: string, targetDay: string, type: 'migrated' | 'scheduled'): void {
  const before = app.S.items;
  const after = migrateTo(before, id, targetDay, Date.now(), uid, type);
  if (after === before || after.length === before.length) {
    app.toast = { msg: 'Ta pozycja została już przeniesiona', undoable: false };
    return;
  }
  commit(() => (app.S.items = after), `Przeniesiono na ${targetDay}`, true);
}

export const migrateToTomorrow = (id: string): void =>
  migrateItem(id, shiftDay(app.viewDay, 1), 'migrated');
```

- [ ] **Step 2: Komponent znacznika**

```svelte
<!-- src/components/list/Bullet.svelte -->
<script lang="ts">
  import { MARK } from '../../lib/items';
  import { migrateItem, migrateToTomorrow, setItemType } from '../../actions.svelte';
  import { app } from '../../state.svelte';
  import { shiftDay } from '../../lib/time';
  import type { Item, ItemType } from '../../lib/types';

  interface Props { item: Item }
  const { item }: Props = $props();

  let menu = $state(false);

  const TYPES: { type: ItemType; label: string }[] = [
    { type: 'task', label: 'Zadanie' },
    { type: 'done', label: 'Wykonane' },
    { type: 'note', label: 'Notatka' },
    { type: 'migrated', label: 'Na jutro' },
    { type: 'scheduled', label: 'Na dzień…' },
  ];

  function choose(type: ItemType) {
    menu = false;
    if (type === 'migrated') return migrateToTomorrow(item.id);
    if (type === 'scheduled') {
      const target = prompt('Na który dzień? (RRRR-MM-DD)', shiftDay(app.viewDay, 1));
      if (target && /^\d{4}-\d{2}-\d{2}$/.test(target)) migrateItem(item.id, target, 'scheduled');
      return;
    }
    setItemType(item.id, type);
  }
</script>

<button
  class="bullet t-{item.type}"
  aria-label="Znacznik: {item.type}"
  onclick={() => setItemType(item.id, item.type === 'done' ? 'task' : 'done')}
  oncontextmenu={(e) => { e.preventDefault(); menu = !menu; }}
>{MARK[item.type]}</button>

{#if menu}
  <div class="bullet-menu" role="menu">
    {#each TYPES as t (t.type)}
      <button role="menuitem" class:sel={t.type === item.type} onclick={() => choose(t.type)}>
        <span class="bm-mark">{MARK[t.type]}</span>{t.label}
      </button>
    {/each}
  </div>
{/if}
```

Klik przełącza **tylko** `task ↔ done` — to ruch wykonywany kilkadziesiąt razy dziennie
i nie może wymagać celowania w menu. Pozostałe typy są w menu pod prawym przyciskiem.

- [ ] **Step 3: Style**

```css
.bullet{
  flex:none;width:22px;height:22px;border:0;border-radius:6px;background:transparent;
  color:var(--fg-dim);cursor:pointer;display:grid;place-items:center;
  font:600 15px var(--sans);line-height:1;
}
.bullet:hover{background:var(--line)}
.bullet.t-done{color:var(--green)}
.bullet.t-migrated,.bullet.t-scheduled{color:var(--yellow)}
.bullet-menu{
  position:absolute;z-index:40;margin-top:2px;background:var(--raise);
  border:1px solid var(--line-2);border-radius:10px;padding:4px;box-shadow:var(--shadow);
  display:flex;flex-direction:column;min-width:150px;
}
.bullet-menu button{
  display:flex;align-items:center;gap:8px;border:0;background:transparent;cursor:pointer;
  padding:6px 8px;border-radius:6px;font:500 14px var(--sans);color:var(--fg);text-align:left;
}
.bullet-menu button:hover{background:var(--line)}
.bullet-menu button.sel{color:var(--fg);background:var(--line)}
.bm-mark{width:14px;text-align:center;color:var(--fg-dim)}
```

- [ ] **Step 4: Weryfikacja**

`make check && make test` — bez błędów. Komponent nie jest jeszcze renderowany; zadanie 7 go podpina.

- [ ] **Step 5: Commit**

```bash
git add src/components/list/Bullet.svelte src/actions.svelte.ts src/app.css
git commit -m "feat: add the item bullet with its type menu"
```

---

## Task 7: Pozycja listy i klawiatura

**Files:**
- Create: `src/components/list/ListItem.svelte`, `test/list.mount.test.ts`
- Modify: `src/components/list/List.svelte`, `src/actions.svelte.ts`, `src/app.css`

**Interfaces:**
- Consumes: `Bullet.svelte`, mutatory z zadania 6, `ui.focusItem`.
- Produces: mutatory `addItemAfter(id | null)`, `deleteItem(id)`, `setItemText(id, text)`.

- [ ] **Step 1: Napisz testy montowania**

```ts
// test/list.mount.test.ts
// @vitest-environment jsdom
import { test, expect, beforeEach, vi } from 'vitest';
import { today } from '../src/lib/time';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem('gridday.prefs', JSON.stringify({ theme: 'auto', seenHelp: true }));
  document.body.innerHTML = '';
  document.head.innerHTML = '<meta name="theme-color" content="#282828">';
  delete document.documentElement.dataset.theme;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({
      matches: q.includes('min-width'), // szeroki ekran: oba panele
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
});

async function mountApp() {
  const { mount, flushSync } = await import('svelte');
  const App = (await import('../src/App.svelte')).default;
  mount(App, { target: document.body });
  flushSync();
  return flushSync;
}

const inputs = () => [...document.querySelectorAll<HTMLInputElement>('#list .item-text')];

async function typeInto(el: HTMLInputElement, text: string, flush: () => void) {
  el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  flush();
}

const press = (el: HTMLElement, key: string, init: KeyboardEventInit = {}) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));

test('oba panele są na szerokim ekranie', async () => {
  await mountApp();
  expect(document.querySelector('#grid')).not.toBeNull();
  expect(document.querySelector('#list')).not.toBeNull();
});

test('pusty panel pokazuje zachętę i jedno puste pole', async () => {
  await mountApp();
  expect(inputs()).toHaveLength(1);
  expect(inputs()[0]!.value).toBe('');
});

test('wpisanie tekstu utrwala pozycję w localStorage', async () => {
  const flush = await mountApp();
  await typeInto(inputs()[0]!, 'Kupić chleb', flush);
  inputs()[0]!.dispatchEvent(new Event('blur', { bubbles: true }));
  flush();
  const saved = JSON.parse(localStorage.getItem('gridday.v1') ?? '{}');
  expect(saved.items).toHaveLength(1);
  expect(saved.items[0].text).toBe('Kupić chleb');
  expect(saved.items[0].day).toBe(today());
});

test('Enter tworzy kolejną pozycję', async () => {
  const flush = await mountApp();
  await typeInto(inputs()[0]!, 'Pierwsza', flush);
  press(inputs()[0]!, 'Enter');
  flush();
  expect(inputs()).toHaveLength(2);
  expect(inputs()[1]!.value).toBe('');
});

test('Tab zmienia znacznik i nie przenosi fokusu', async () => {
  const flush = await mountApp();
  await typeInto(inputs()[0]!, 'Zadanie', flush);
  const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  inputs()[0]!.dispatchEvent(ev);
  flush();
  expect(ev.defaultPrevented).toBe(true);
  expect(document.querySelector('#list .bullet')!.textContent).toBe('×');
});

test('Backspace na pustej pozycji usuwa ją', async () => {
  const flush = await mountApp();
  await typeInto(inputs()[0]!, 'Pierwsza', flush);
  press(inputs()[0]!, 'Enter');
  flush();
  const second = inputs()[1]!;
  second.selectionStart = second.selectionEnd = 0;
  press(second, 'Backspace');
  flush();
  expect(inputs()).toHaveLength(1);
});

test('Backspace na pozycji 0 NIEpustej pozycji jej nie usuwa', async () => {
  // Klasa wejścia z Review Focus: scalanie jest poza zakresem.
  const flush = await mountApp();
  await typeInto(inputs()[0]!, 'Pierwsza', flush);
  press(inputs()[0]!, 'Enter');
  flush();
  await typeInto(inputs()[1]!, 'Druga', flush);
  const second = inputs()[1]!;
  second.selectionStart = second.selectionEnd = 0;
  press(second, 'Backspace');
  flush();
  expect(inputs()).toHaveLength(2);
});

test('strzałki na krawędziach przechodzą między pozycjami', async () => {
  const flush = await mountApp();
  await typeInto(inputs()[0]!, 'Pierwsza', flush);
  press(inputs()[0]!, 'Enter');
  flush();
  await typeInto(inputs()[1]!, 'Druga', flush);

  const second = inputs()[1]!;
  second.selectionStart = second.selectionEnd = 0;
  const up = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
  second.dispatchEvent(up);
  flush();
  expect(up.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(inputs()[0]);
});

test('strzałka w środku tekstu NIE przechodzi między pozycjami', async () => {
  // Klasa wejścia z Review Focus: inaczej nie da się przejść długiej pozycji.
  const flush = await mountApp();
  await typeInto(inputs()[0]!, 'Pierwsza', flush);
  press(inputs()[0]!, 'Enter');
  flush();
  await typeInto(inputs()[1]!, 'Druga', flush);

  const second = inputs()[1]!;
  second.selectionStart = second.selectionEnd = 2;
  const up = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
  second.dispatchEvent(up);
  flush();
  expect(up.defaultPrevented).toBe(false);
});

test('klik w znacznik przełącza zadanie i wykonane', async () => {
  const flush = await mountApp();
  await typeInto(inputs()[0]!, 'Zadanie', flush);
  const bullet = document.querySelector<HTMLElement>('#list .bullet')!;
  bullet.click();
  flush();
  expect(document.querySelector('#list .bullet')!.textContent).toBe('×');
  document.querySelector<HTMLElement>('#list .bullet')!.click();
  flush();
  expect(document.querySelector('#list .bullet')!.textContent).toBe('·');
});
```

- [ ] **Step 2: Uruchom — muszą paść**

Run: `make test`
Expected: FAIL — `#list .item-text` nie istnieje.

- [ ] **Step 3: Migawka na żądanie**

`commit()` robi migawkę i od razu wykonuje mutację; pisanie potrzebuje samej migawki.
W `src/state.svelte.ts`, obok `commit()`, dopisz:

```ts
/** Migawka bez mutacji — dla edycji tekstu, gdzie zmiana idzie znak po znaku
 *  i pierwszy znak ma wyznaczyć punkt cofnięcia. */
export function pushHistory(): void {
  history.push($state.snapshot(app.S) as State);
  if (history.length > HISTORY_MAX) history.shift();
}
```

- [ ] **Step 4: Mutatory listy**

Dopisz do `src/actions.svelte.ts`:

```ts
/** Nowa pozycja pod wskazaną (albo na końcu listy dnia, gdy `afterId` jest null). */
export function addItemAfter(afterId: string | null): void {
  const prev = afterId ? app.S.items.find((i) => i.id === afterId) : undefined;
  const type = prev ? typeAfterEnter(prev.type) : 'task';
  const item = newItem(app.viewDay, type, Date.now(), uid);
  commit(() => (app.S.items = insertAfter(app.S.items, afterId, item)));
  ui.focusItem = item.id;
}

export function deleteItem(id: string, focusAfter: string | null): void {
  commit(() => (app.S.items = removeById(app.S.items, id)));
  ui.focusItem = focusAfter;
}

/** Tekst zmienia się bez migawki — tę robi `pushHistory()` przy pierwszym
 *  naciśnięciu klawisza w danej pozycji, a `save()` utrwala każdą zmianę. */
export function setItemText(id: string, text: string): void {
  const item = app.S.items.find((i) => i.id === id);
  if (item) item.text = text;
}
```

- [ ] **Step 5: Komponent pozycji**

```svelte
<!-- src/components/list/ListItem.svelte -->
<script lang="ts">
  import { app, pushHistory, save, ui } from '../../state.svelte';
  import { addItemAfter, cycleItemType, deleteItem, setItemText } from '../../actions.svelte';
  import { dayItems } from '../../lib/items';
  import type { Item } from '../../lib/types';
  import Bullet from './Bullet.svelte';

  interface Props { item: Item }
  const { item }: Props = $props();

  let el = $state<HTMLInputElement | null>(null);
  /** czy w tej pozycji padł już znak od ostatniego wejścia w nią */
  let dirty = false;

  // Fokus jest stanem widokowym: mutator mówi KTÓRA pozycja ma go dostać,
  // a przeniesienie go jest deklaracją tutaj — nie grzebaniem w DOM z mutatora.
  $effect(() => {
    if (ui.focusItem === item.id && el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      ui.focusItem = null;
    }
  });

  const siblings = $derived(dayItems(app.S.items, app.viewDay));
  const index = $derived(siblings.findIndex((i) => i.id === item.id));

  function focusSibling(offset: -1 | 1) {
    const target = siblings[index + offset];
    if (target) ui.focusItem = target.id;
  }

  function onKeydown(e: KeyboardEvent) {
    const input = e.currentTarget as HTMLInputElement;
    const at = input.selectionStart ?? 0;
    const collapsed = input.selectionStart === input.selectionEnd;

    if (e.key === 'Enter') {
      e.preventDefault();
      addItemAfter(item.id);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      cycleItemType(item.id, e.shiftKey ? -1 : 1);
      return;
    }
    if (e.key === 'Backspace' && at === 0 && collapsed && input.value === '') {
      e.preventDefault();
      deleteItem(item.id, siblings[index - 1]?.id ?? null);
      return;
    }
    // Strzałki przechodzą między pozycjami TYLKO na krawędziach tekstu;
    // w środku muszą normalnie poruszać karetką.
    if (e.key === 'ArrowUp' && at === 0 && collapsed && index > 0) {
      e.preventDefault();
      focusSibling(-1);
      return;
    }
    if (e.key === 'ArrowDown' && at === input.value.length && collapsed && index < siblings.length - 1) {
      e.preventDefault();
      focusSibling(1);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      input.blur();
    }
  }
</script>

<div class="item t-{item.type}">
  <Bullet {item} />
  <input
    bind:this={el}
    class="item-text"
    value={item.text}
    maxlength="200"
    autocomplete="off"
    oninput={(e) => {
      // Migawka przy PIERWSZYM znaku w tej pozycji, nie przy wyjściu z niej:
      // commit() po edycji zapisałby stan już zmieniony, więc cofnięcie
      // przywracałoby wpisany tekst zamiast poprzedniego.
      if (!dirty) {
        pushHistory();
        dirty = true;
      }
      setItemText(item.id, e.currentTarget.value);
      save();
    }}
    onfocus={() => (dirty = false)}
    onblur={() => (dirty = false)}
    onkeydown={onKeydown}
  />
  {#if item.movedTo}<span class="item-moved">→ {item.movedTo.slice(5)}</span>{/if}
</div>
```

- [ ] **Step 6: Panel renderuje pozycje**

Zastąp treść `src/components/list/List.svelte`:

```svelte
<script lang="ts">
  import { app } from '../../state.svelte';
  import { addItemAfter } from '../../actions.svelte';
  import { dayItems } from '../../lib/items';
  import ListItem from './ListItem.svelte';

  const items = $derived(dayItems(app.S.items, app.viewDay));

  // Pusty dzień dostaje jedną pustą pozycję, żeby było w co pisać —
  // „zacznij pisać" bez pola do pisania byłoby ślepym zaułkiem.
  $effect(() => {
    if (items.length === 0) addItemAfter(null);
  });
</script>

<section id="list">
  {#each items as item (item.id)}
    <ListItem {item} />
  {/each}
</section>
```

- [ ] **Step 7: Style**

```css
.item{display:flex;align-items:center;gap:6px;position:relative;padding:1px 0}
.item-text{
  flex:1;min-width:0;border:0;background:transparent;outline:0;padding:4px 2px;
  font:500 15px var(--sans);color:var(--fg);
}
.item-text:focus{background:color-mix(in srgb,var(--fg) 4%,transparent);border-radius:6px}
.item.t-done .item-text{color:var(--fg-faint);text-decoration:line-through}
.item.t-note .item-text{color:var(--fg-dim)}
.item.t-migrated .item-text,.item.t-scheduled .item-text{color:var(--fg-faint)}
.item-moved{flex:none;font:500 11px var(--sans);color:var(--fg-faint);white-space:nowrap}
```

- [ ] **Step 8: Uruchom testy**

Run: `make test && make check`
Expected: wszystkie PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/list src/actions.svelte.ts src/app.css test/list.mount.test.ts
git commit -m "feat: add keyboard-driven note items"
```

---

## Task 8: Przełącznik paneli i domknięcie

**Files:**
- Modify: `src/components/Header.svelte`, `src/components/Panes.svelte`, `src/components/Help.svelte`, `src/app.css`, `README.md`

- [ ] **Step 1: Przełącznik w nagłówku**

W `Header.svelte` dołóż props `narrow: boolean` i, gdy jest prawdziwy, przycisk przed narzędziami:

```svelte
  {#if narrow}
    <button class="ib" onclick={() => (ui.pane = ui.pane === 'grid' ? 'list' : 'grid')}
      aria-label="Przełącz panel" title="Przełącz siatkę i listę">
      <Icon name={ui.pane === 'grid' ? 'list-check' : 'table-cells'} fallback="≡" />
    </button>
  {/if}
```

Dodaj `table-cells` do listy ikon interfejsu w `src/lib/icons.ts` i do `UI_ICONS` w `test/icons.test.ts`.
`Panes.svelte` przekazuje `narrow` do `Header` przez stan `ui`: ustaw `ui.narrow = !wide` w efekcie
i czytaj je w `App.svelte`.

- [ ] **Step 2: Pomoc**

W `Help.svelte`, w liście skrótów, dopisz przed wierszem `Ctrl Z`:

```svelte
    <dt class="kb"><kbd>Enter</kbd> <kbd>Tab</kbd></dt>
    <dd class="kb">na liście po prawej: nowa pozycja, zmiana znacznika</dd>
```

- [ ] **Step 3: README**

W sekcji „Struktura" dopisz `src/components/list/` jako panel dziennego logu, a w opisie danych
wspomnij, że kopia zapasowa obejmuje też notatki.

- [ ] **Step 4: Pełna weryfikacja**

```bash
make check && make test && make build
```

Potem `make dev` i lista kontrolna:

1. Siatka po lewej, lista po prawej; strona się nie przewija.
2. Pisanie, `Enter`, `Tab`, `Backspace` na pustej pozycji działają wyłącznie z klawiatury.
3. Klik w znacznik przełącza zadanie i wykonane; prawy przycisk otwiera menu typów.
4. „Na jutro" dopisuje pozycję do jutrzejszej listy i oznacza dzisiejszą jako `>`.
5. Zmiana dnia strzałkami w nagłówku pokazuje listę tego dnia.
6. Zwężenie okna poniżej 900 px zostawia jeden panel i przełącznik w nagłówku.
7. Eksport kopii zapasowej zawiera `items`; import je przywraca.
8. `Ctrl+Z` cofa usunięcie pozycji i przeniesienie.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add the pane switch for narrow screens and document the list"
```

---

## Stan po wykonaniu planu

Dzienny log działa z klawiatury, utrwala się razem z resztą stanu i wchodzi do kopii zapasowej.
Siatka nie zmieniła zachowania, tylko szerokość.

**Następny projekt (faza B):** godzina przy pozycji, powiązanie pozycji z blokiem i niezmiennik
„każdy blok ma swoją pozycję na liście".
