# Diurnus — powiązanie bloków z pozycjami (faza B): plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sprawić, żeby każdy blok czasu miał dokładnie jedną pozycję na liście tego dnia, a usunięcie lub zmiana tekstu po jednej stronie było widoczne po drugiej.

**Architecture:** Całość niezmiennika mieści się w jednej czystej funkcji `reconcile()` w `src/lib/link.ts`, wołanej wewnątrz `commit()` — jedynego miejsca, przez które przechodzi każda mutacja. Dzięki temu żaden z ośmiu mutatorów bloków nie musi pamiętać o liście. Godzina i kolor pozycji powiązanej są wyliczane z bloku przy renderowaniu, nie przechowywane.

**Tech Stack:** Svelte 5 (runy), TypeScript, Vitest (projekty `unit` i `mount`).

**Spec:** [`docs/superpowers/specs/2026-09-24-diurnus-block-item-link-design.md`](../specs/2026-09-24-diurnus-block-item-link-design.md)

## Global Constraints

- **`src/lib/` nie importuje niczego ze Svelte.** `reconcile` dostaje tablice, zwraca tablicę.
- **`reconcile` robi dwie rzeczy: tworzy brakujące pozycje i usuwa osierocone.** Nie synchronizuje tekstu ani znaczników.
- **Bloki `discarded` nie dostają pozycji**, a istniejące pozycje takich bloków są usuwane.
- **Godzina i kolor pozycji powiązanej są wyliczane, nie przechowywane.**
- **Schemat `v3 → v4`**, migracja wyłącznie w `normalize()`, z jednorazowym pełnym `reconcile`.
- **Przeciąganie pozycji powiązanych jest zablokowane** — ich miejsce to ich godzina.
- **Język:** kod, komentarze i teksty UI po polsku; komunikaty commitów po angielsku.

## Review Focus

1. **`reconcile` wywołany dwa razy z rzędu** — musi być idempotentny, inaczej `commit()` mnożyłby pozycje przy każdej mutacji. → test w zadaniu 1.
2. **Blok, który stał się `discarded`** — jego pozycja musi zniknąć, choć blok nadal istnieje w tablicy. → test w zadaniu 1.
3. **Pozycja swobodna z przypadkowym `block`** wskazującym w pustkę (ręcznie edytowana kopia zapasowa) — musi zostać usunięta, a nie wywrócić listy. → test w zadaniu 1.
4. **Przeniesienie na slot częściowo zajęty** — blok 30-minutowy wchodzący w ostatni kwadrans innego bloku. → test w zadaniu 6.
5. **Usunięcie pozycji powiązanej przez `Backspace`** — kasuje też blok, więc musi dać się cofnąć jednym `Ctrl+Z`. → test w zadaniu 5.

---

## Task 1: `reconcile` i pomocnicy

**Files:**
- Modify: `src/lib/types.ts` (pole `block?`)
- Create: `src/lib/link.ts`, `test/link.test.ts`

**Interfaces:**
- Produces:
  - `reconcile(items, blocks, day: string | null, created: number, makeId: () => string): Item[]`
  - `linkedItems(items, blocks, day): Item[]` — posortowane po `q` bloku
  - `freeItems(items, day): Item[]` — kolejność tablicy
  - `blockOfItem(blocks, item): Block | undefined`
  - `slotFree(blocks, day, q, len, exceptId?): boolean`

- [ ] **Step 1: Dopisz pole do `Item`**

W `src/lib/types.ts`, w `Item`, pod `movedTo`:

```ts
  /** NOWE w v4: identyfikator bloku, którego ta pozycja jest odbiciem */
  block?: string;
```

- [ ] **Step 2: Napisz testy**

```ts
// test/link.test.ts
import { test, expect } from 'vitest';
import { reconcile, linkedItems, freeItems, blockOfItem, slotFree } from '../src/lib/link';
import type { Block, Item, Status } from '../src/lib/types';

const A = '2026-09-24';
const B = '2026-09-25';

const blk = (id: string, q: number, day = A, status: Status = 'planned', title = ''): Block =>
  ({ id, day, q, len: 2, cat: 'work', title, status, created: 0 });

const item = (id: string, day = A, over: Partial<Item> = {}): Item =>
  ({ id, day, text: '', type: 'task', created: 0, ...over });

let n = 0;
const ids = () => `gen-${++n}`;
const reset = () => (n = 0);

test('reconcile tworzy pozycję dla bloku, który jej nie ma', () => {
  reset();
  const got = reconcile([], [blk('b1', 32)], A, 7, ids);
  expect(got).toEqual([
    { id: 'gen-1', day: A, text: '', type: 'task', created: 7, block: 'b1' },
  ]);
});

test('reconcile przenosi tytuł bloku do tekstu nowej pozycji', () => {
  reset();
  expect(reconcile([], [blk('b1', 32, A, 'planned', 'Spotkanie')], A, 0, ids)[0]!.text)
    .toBe('Spotkanie');
});

test('reconcile jest idempotentny — drugie wywołanie nic nie dodaje', () => {
  reset();
  const blocks = [blk('b1', 32)];
  const once = reconcile([], blocks, A, 0, ids);
  const twice = reconcile(once, blocks, A, 0, ids);
  expect(twice).toEqual(once);
});

test('reconcile usuwa pozycję osieroconą po skasowanym bloku', () => {
  const items = [item('i1', A, { block: 'znikniety' })];
  expect(reconcile(items, [], A, 0, ids)).toEqual([]);
});

test('reconcile nie rusza pozycji swobodnych', () => {
  const items = [item('i1', A, { text: 'Notatka' })];
  expect(reconcile(items, [], A, 0, ids)).toEqual(items);
});

test('reconcile pomija bloki discarded i usuwa ich pozycje', () => {
  reset();
  const blocks = [blk('b1', 32, A, 'discarded')];
  expect(reconcile([], blocks, A, 0, ids)).toEqual([]);
  const withItem = [item('i1', A, { block: 'b1' })];
  expect(reconcile(withItem, blocks, A, 0, ids)).toEqual([]);
});

test('reconcile z day=null obejmuje wszystkie dni', () => {
  reset();
  const got = reconcile([], [blk('b1', 32, A), blk('b2', 40, B)], null, 0, ids);
  expect(got.map((i) => i.day).sort()).toEqual([A, B]);
});

test('reconcile z konkretnym dniem nie tworzy pozycji dla innych dni', () => {
  reset();
  expect(reconcile([], [blk('b2', 40, B)], A, 0, ids)).toEqual([]);
});

test('reconcile z konkretnym dniem nie usuwa osieroconych pozycji z innych dni', () => {
  const items = [item('i1', B, { block: 'znikniety' })];
  expect(reconcile(items, [], A, 0, ids)).toEqual(items);
});

test('linkedItems sortuje po godzinie bloku, nie po kolejności tablicy', () => {
  const blocks = [blk('b1', 40), blk('b2', 32)];
  const items = [item('i1', A, { block: 'b1' }), item('i2', A, { block: 'b2' })];
  expect(linkedItems(items, blocks, A).map((i) => i.id)).toEqual(['i2', 'i1']);
});

test('linkedItems pomija pozycje bez bloku', () => {
  const items = [item('i1', A), item('i2', A, { block: 'b1' })];
  expect(linkedItems(items, [blk('b1', 32)], A).map((i) => i.id)).toEqual(['i2']);
});

test('freeItems zwraca pozycje bez bloku w kolejności tablicy', () => {
  const items = [item('i1', A), item('i2', A, { block: 'b1' }), item('i3', A)];
  expect(freeItems(items, A).map((i) => i.id)).toEqual(['i1', 'i3']);
});

test('blockOfItem znajduje blok albo zwraca undefined', () => {
  const blocks = [blk('b1', 32)];
  expect(blockOfItem(blocks, item('i1', A, { block: 'b1' }))?.id).toBe('b1');
  expect(blockOfItem(blocks, item('i1', A))).toBeUndefined();
  expect(blockOfItem(blocks, item('i1', A, { block: 'nie-ma' }))).toBeUndefined();
});

test('slotFree wykrywa wolne i zajęte miejsce', () => {
  const blocks = [blk('b1', 32, B)];
  expect(slotFree(blocks, B, 40, 2)).toBe(true);
  expect(slotFree(blocks, B, 32, 2)).toBe(false);
});

test('slotFree wykrywa nałożenie częściowe z obu stron', () => {
  const blocks = [blk('b1', 32, B)]; // zajmuje 32 i 33
  expect(slotFree(blocks, B, 33, 2)).toBe(false);
  expect(slotFree(blocks, B, 31, 2)).toBe(false);
  expect(slotFree(blocks, B, 34, 2)).toBe(true);
  expect(slotFree(blocks, B, 30, 2)).toBe(true);
});

test('slotFree ignoruje bloki innych dni i bloki discarded', () => {
  expect(slotFree([blk('b1', 32, A)], B, 32, 2)).toBe(true);
  expect(slotFree([blk('b1', 32, B, 'discarded')], B, 32, 2)).toBe(true);
});

test('slotFree potrafi pominąć wskazany blok — przy przenoszeniu go samego', () => {
  expect(slotFree([blk('b1', 32, B)], B, 32, 2, 'b1')).toBe(true);
});
```

- [ ] **Step 3: Uruchom — muszą paść**

Run: `make test`
Expected: FAIL, `Cannot find module '../src/lib/link'`.

- [ ] **Step 4: Implementacja**

```ts
// src/lib/link.ts
import { occ } from './occupancy';
import type { Block, Item } from './types';

/** Blok, którego odbiciem jest ta pozycja. */
export const blockOfItem = (blocks: readonly Block[], item: Item): Block | undefined =>
  item.block ? blocks.find((b) => b.id === item.block) : undefined;

// Bloki `discarded` nie są blokami dnia w sensie siatki — nie zajmują miejsca
// i nie dostają pozycji.
const live = (blocks: readonly Block[], day: string | null) =>
  blocks.filter((b) => b.status !== 'discarded' && (day === null || b.day === day));

/**
 * Cały niezmiennik: każdy blok ma dokładnie jedną pozycję, każda pozycja
 * z `block` ma swój blok. Dwie operacje, obie idempotentne — funkcja wykonuje
 * się przy KAŻDEJ mutacji, więc drugie wywołanie nie może nic dodać.
 *
 * `day === null` uzgadnia wszystkie dni (migracja schematu); konkretny dzień
 * ogranicza się do niego i nie rusza pozycji z pozostałych.
 */
export function reconcile(
  items: readonly Item[],
  blocks: readonly Block[],
  day: string | null,
  created: number,
  makeId: () => string,
): Item[] {
  const inScope = (d: string) => day === null || d === day;
  const alive = new Set(live(blocks, day).map((b) => b.id));

  // 1. Usuń pozycje wskazujące na blok, którego nie ma (albo już nie liczy się jako blok).
  const kept = items.filter((i) => !i.block || !inScope(i.day) || alive.has(i.block));

  // 2. Dołóż pozycje dla bloków, które jeszcze swojej nie mają.
  const taken = new Set(kept.map((i) => i.block).filter(Boolean) as string[]);
  const added: Item[] = live(blocks, day)
    .filter((b) => !taken.has(b.id))
    .map((b) => ({
      id: makeId(),
      day: b.day,
      text: b.title,
      type: 'task' as const,
      created,
      block: b.id,
    }));

  return added.length ? [...kept, ...added] : kept;
}

/** Pozycje powiązane danego dnia, w kolejności godzin swoich bloków. */
export function linkedItems(
  items: readonly Item[],
  blocks: readonly Block[],
  day: string,
): Item[] {
  return items
    .filter((i) => i.day === day && i.block)
    .map((i) => ({ i, b: blockOfItem(blocks, i) }))
    .filter((x): x is { i: Item; b: Block } => x.b !== undefined)
    .sort((x, y) => x.b.q - y.b.q)
    .map((x) => x.i);
}

/** Pozycje swobodne danego dnia, w kolejności tablicy. */
export const freeItems = (items: readonly Item[], day: string): Item[] =>
  items.filter((i) => i.day === day && !i.block);

/** Czy przedział `[q, q+len)` jest w danym dniu wolny. */
export function slotFree(
  blocks: readonly Block[],
  day: string,
  q: number,
  len: number,
  exceptId?: string,
): boolean {
  const map = occ(
    blocks.filter((b) => b.id !== exceptId),
    day,
  );
  for (let i = q; i < q + len; i++) if (map[i]) return false;
  return true;
}
```

- [ ] **Step 5: Uruchom testy**

Run: `make test`
Expected: wszystkie testy `link.test.ts` PASS. `make check` może zgłosić błąd w `normalize()` —
naprawia go zadanie 2.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/link.ts test/link.test.ts
git commit -m "feat: add the block-item reconciliation function"
```

---

## Task 2: Migracja schematu v3 → v4

**Files:**
- Modify: `src/lib/model.ts`, `test/model.test.ts`

**Interfaces:**
- Consumes: `reconcile` z zadania 1.
- Produces: `normalize()` zwracające `State` z `v === 4` i niezmiennikiem spełnionym dla wszystkich dni.

- [ ] **Step 1: Napisz testy**

```ts
// dopisz do test/model.test.ts
test('normalize: v3 z blokami bez pozycji dostaje pozycje i wersję 4', () => {
  const s = normalize({
    v: 3,
    cats: [{ id: 'x', name: 'X', icon: 'circle', color: 'red', parent: null }],
    day: { start: 6, end: 22, bands: [] },
    blocks: [
      { id: 'b1', day: '2026-09-24', q: 32, len: 2, cat: 'x', title: 'Praca', status: 'confirmed', created: 0 },
      { id: 'b2', day: '2026-09-25', q: 40, len: 2, cat: 'x', title: '', status: 'planned', created: 0 },
    ],
    items: [],
  });
  expect(s.v).toBe(4);
  expect(s.items).toHaveLength(2);
  expect(s.items.map((i) => i.block).sort()).toEqual(['b1', 'b2']);
  expect(s.items.find((i) => i.block === 'b1')!.text).toBe('Praca');
});

test('normalize: migracja do v4 zachowuje pozycje swobodne', () => {
  const s = normalize({
    v: 3,
    cats: [],
    day: { start: 6, end: 22, bands: [] },
    blocks: [],
    items: [{ id: 'i1', day: '2026-09-24', text: 'Notatka', type: 'note', created: 1 }],
  });
  expect(s.v).toBe(4);
  expect(s.items).toEqual([{ id: 'i1', day: '2026-09-24', text: 'Notatka', type: 'note', created: 1 }]);
});

test('normalize: migracja v2 → v4 przechodzi przez wszystkie wersje', () => {
  const s = normalize({
    v: 2,
    cats: [],
    day: { start: 6, end: 22, bands: [] },
    blocks: [{ id: 'b1', day: '2026-09-24', q: 32, len: 2, cat: 'x', title: '', status: 'planned', created: 0 }],
  });
  expect(s.v).toBe(4);
  expect(s.items).toHaveLength(1);
  expect(s.items[0]!.block).toBe('b1');
});

test('normalize: brak stanu daje wersję 4', () => {
  expect(normalize(null).v).toBe(4);
});
```

- [ ] **Step 2: Uruchom — muszą paść**

Run: `make test`
Expected: FAIL — `expected 3 to be 4`.

- [ ] **Step 3: Implementacja**

W `src/lib/model.ts` dopisz import `import { reconcile } from './link';` i `uid` jest już w tym pliku.

Pod migracją `v2 → v3` dodaj:

```ts
  // v3 nie znało powiązania bloków z pozycjami: dorabiamy je dla wszystkich dni
  // jeden raz, żeby niezmiennik obowiązywał także w dniach, których użytkownik
  // jeszcze nie odwiedził.
  if (s && typeof s === 'object' && s.v === 3) {
    s.items = reconcile(s.items ?? [], s.blocks ?? [], null, Date.now(), uid);
    s.v = 4;
  }
```

Zmień warunek stanu domyślnego z `s.v !== 3` na `s.v !== 4` i `v: 3` na `v: 4` w zwracanym
obiekcie domyślnym.

- [ ] **Step 4: Uruchom testy**

Run: `make test`
Expected: PASS. Cztery starsze testy oczekujące `v === 3` trzeba zaktualizować do `4` —
kodują numer schematu, nie zachowanie.

- [ ] **Step 5: Commit**

```bash
git add src/lib/model.ts test/model.test.ts
git commit -m "feat: migrate the schema to v4 and back-fill items for existing blocks"
```

---

## Task 3: `reconcile` w `commit()` i przy zmianie dnia

**Files:**
- Modify: `src/state.svelte.ts`, `src/App.svelte`
- Create: `test/reconcile.mount.test.ts`

**Interfaces:**
- Consumes: `reconcile` z zadania 1.
- Produces: gwarancja, że po każdej mutacji i po zmianie dnia niezmiennik obowiązuje dla dnia oglądanego.

- [ ] **Step 1: Napisz testy**

```ts
// test/reconcile.mount.test.ts
// @vitest-environment jsdom
import { test, expect, beforeEach, vi } from 'vitest';
import { today } from '../src/lib/time';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem('diurnus.prefs', JSON.stringify({ theme: 'auto', seenHelp: true }));
  document.body.innerHTML = '';
  document.head.innerHTML = '<meta name="theme-color" content="#282828">';
  delete document.documentElement.dataset.theme;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({
      matches: q.includes('min-width'),
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

// Zadanie 3 wprowadza uzgadnianie, nie wyświetlanie — asercje idą na stan,
// żeby zadanie było samodzielne. Widok sprawdza zadanie 4.
async function createBlock(flush: () => void) {
  document.querySelector<HTMLElement>('#grid .cell[data-q="32"]')!.click();
  flush();
  document.querySelector<HTMLElement>('#radial .rb[aria-label="Nauka"]')!.click();
  flush();
}

test('utworzenie bloku tworzy powiązaną pozycję', async () => {
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  await createBlock(flush);
  expect(app.S.items).toHaveLength(1);
  expect(app.S.items[0]!.block).toBe(app.S.blocks[0]!.id);
});

test('powiązana pozycja utrwala się razem ze stanem', async () => {
  const flush = await mountApp();
  await createBlock(flush);
  const saved = JSON.parse(localStorage.getItem('diurnus.v1') ?? '{}');
  expect(saved.items).toHaveLength(1);
  expect(saved.items[0].block).toBe(saved.blocks[0].id);
});

test('zmiana dnia uzgadnia listę nowego dnia', async () => {
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  const { shiftDay } = await import('../src/lib/time');
  await createBlock(flush);

  app.viewDay = shiftDay(today(), 1);
  flush();
  expect(app.S.items.filter((i) => i.day === app.viewDay)).toHaveLength(0);

  app.viewDay = today();
  flush();
  expect(app.S.items.filter((i) => i.day === app.viewDay && i.block)).toHaveLength(1);
});

test('powtarzane mutacje nie mnożą pozycji', async () => {
  const flush = await mountApp();
  const { app, commit } = await import('../src/state.svelte');
  await createBlock(flush);
  for (let i = 0; i < 5; i++) commit(() => {});
  flush();
  expect(app.S.items).toHaveLength(1);
});
```

- [ ] **Step 2: Uruchom — muszą paść**

Run: `make test`
Expected: FAIL — `commit()` nie uzgadnia jeszcze niczego, więc lista zostaje pusta po
utworzeniu bloku.

- [ ] **Step 3: `reconcile` w `commit()`**

W `src/state.svelte.ts` dopisz import:

```ts
import { reconcile } from './lib/link';
```

W `commit()`, po `fn()` a przed zapisem:

```ts
  fn();
  // Niezmiennik utrzymywany w jednym miejscu: żaden z mutatorów bloków nie
  // musi pamiętać o liście, bo każdy i tak przechodzi tędy.
  app.S.items = reconcile(app.S.items, app.S.blocks, app.viewDay, Date.now(), uid);
```

- [ ] **Step 4: Uzgadnianie przy zmianie dnia**

Zmiana dnia nie jest mutacją, więc `commit()` jej nie obejmuje. W `src/App.svelte` dopisz efekt:

```ts
  // Wejście na dzień, którego bloki powstały wcześniej (albo przed migracją),
  // musi dorobić ich pozycje — to nie jest mutacja, więc commit() tu nie sięga.
  $effect(() => {
    const day = app.viewDay;
    const next = reconcile(app.S.items, app.S.blocks, day, Date.now(), uid);
    if (next.length !== app.S.items.length) {
      app.S.items = next;
      save();
    }
  });
```

wraz z importami `reconcile` z `./lib/link` oraz `save` i `uid` z `./state.svelte`.

- [ ] **Step 5: Uruchom testy**

Run: `make test`
Expected: wszystkie cztery testy `reconcile.mount.test.ts` PASS.

- [ ] **Step 6: Commit**

```bash
git add src/state.svelte.ts src/App.svelte test/reconcile.mount.test.ts
git commit -m "feat: reconcile blocks and items inside commit"
```

---

## Task 4: Wyświetlanie pozycji powiązanej

**Files:**
- Modify: `src/components/list/List.svelte`, `src/components/list/ListItem.svelte`, `src/components/list/Bullet.svelte`, `src/app.css`

**Interfaces:**
- Consumes: `linkedItems`, `freeItems`, `blockOfItem` z zadania 1.

- [ ] **Step 1: Dwie grupy w `List.svelte`**

Zamień wyliczenie `items` na dwie listy i renderuj je po kolei:

```svelte
  import { linkedItems, freeItems } from '../../lib/link';

  const linked = $derived(linkedItems(app.S.items, app.S.blocks, app.viewDay));
  const free = $derived(freeItems(app.S.items, app.viewDay));
```

W znacznikach: najpierw `{#each linked as item (item.id)}<ListItem {item} />{/each}`, potem
kreska wstawienia i `{#each free as item (item.id)}` z dotychczasową obsługą przeciągania,
na końcu pole początkowe. Obliczenia `others`, `dropBefore` i `dropAtEnd` liczą się **na liście
swobodnej**, bo tylko ona jest przestawialna.

- [ ] **Step 2: Godzina i kolor w `ListItem.svelte`**

```svelte
  import { blockOfItem } from '../../lib/link';
  import { catOf, colorOf } from '../../lib/categories';
  import { fmtQ } from '../../lib/time';

  const block = $derived(blockOfItem(app.S.blocks, item));
  const cat = $derived(block ? catOf(app.S.cats, block.cat) : null);
  // Godzina i kolor są wyliczane z bloku, nie przechowywane w pozycji: zmiana
  // kategorii bloku przebarwia pozycję sama, bez trzeciego pola do rozjechania.
  const color = $derived(cat ? colorOf(app.S.cats, cat) : null);
</script>

<div
  class="item t-{item.type}"
  class:is-linked={!!block}
  class:is-dragging={ui.drag?.id === item.id}
  data-id={item.id}
  style={color ? `--c:var(--${color})` : undefined}
>
  <Bullet {item} draggable={!block} />
  {#if block}<span class="item-hour">{fmtQ(block.day, block.q)}</span>{/if}
  <!-- pozostałe atrybuty <input> bez zmian; dochodzi tylko placeholder -->
  <input … placeholder={cat ? cat.name : ''} />
```

- [ ] **Step 3: Zablokuj przeciąganie pozycji powiązanej**

`Bullet.svelte` dostaje props `draggable = true`; w `onPointerDown` na początku:

```ts
    if (!draggable) return; // pozycja powiązana: jej miejsce to jej godzina
```

Klik i menu działają dalej.

- [ ] **Step 4: Style**

```css
.item.is-linked .item-hour{
  flex:none;font:600 14px var(--sans);color:var(--c,var(--fg-dim));
  min-width:44px;font-variant-numeric:tabular-nums;
}
.item.is-linked .bullet{color:var(--c,var(--fg-dim));cursor:pointer}
.item.is-linked .item-text{color:var(--fg)}
```

- [ ] **Step 5: Dopisz testy widoku**

Dopisz do `test/reconcile.mount.test.ts`:

```ts
const linkedRows = () => [...document.querySelectorAll('#list .item.is-linked')];

test('pozycja powiązana pokazuje godzinę swojego bloku', async () => {
  const flush = await mountApp();
  await createBlock(flush);
  expect(linkedRows()).toHaveLength(1);
  expect(linkedRows()[0]!.querySelector('.item-hour')!.textContent).toBe('08:00');
});

test('pozycje powiązane stoją nad swobodnymi, posortowane po godzinie', async () => {
  const flush = await mountApp();
  const d = document.querySelector<HTMLInputElement>('#list .is-draft .item-text')!;
  d.value = 'Notatka';
  d.dispatchEvent(new Event('input', { bubbles: true }));
  flush();

  await createBlock(flush); // 08:00
  document.querySelector<HTMLElement>('#grid .cell[data-q="24"]')!.click();
  flush();
  document.querySelector<HTMLElement>('#radial .rb[aria-label="Ruch"]')!.click();
  flush();

  const rows = [...document.querySelectorAll('#list .item[data-id]')];
  expect(rows[0]!.querySelector('.item-hour')!.textContent).toBe('06:00');
  expect(rows[1]!.querySelector('.item-hour')!.textContent).toBe('08:00');
  expect(rows[2]!.classList.contains('is-linked')).toBe(false);
});

test('przeciąganie pozycji powiązanej nic nie zmienia', async () => {
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  await createBlock(flush);

  const bullet = document.querySelector<HTMLElement>('#list .item.is-linked .bullet')!;
  bullet.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 15, button: 0, pointerId: 1 }),
  );
  bullet.dispatchEvent(
    new PointerEvent('pointermove', { bubbles: true, clientX: 5, clientY: 200, pointerId: 1 }),
  );
  flush();
  expect(document.querySelector('.drop-line')).toBeNull();
  expect(app.S.items).toHaveLength(1);
});
```

- [ ] **Step 6: Uruchom testy**

Run: `make test && make check`
Expected: wszystkie PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/list src/app.css test/reconcile.mount.test.ts
git commit -m "feat: show linked items with their hour and category colour"
```

---

## Task 5: Lustro — usuwanie i synchronizacja tekstu

**Files:**
- Modify: `src/actions.svelte.ts`, `src/components/EditSheet.svelte`
- Create: `test/mirror.mount.test.ts`

**Interfaces:**
- Consumes: `blockOfItem` z zadania 1.
- Produces: `deleteItem` usuwające też blok; `setItemText` ustawiające `block.title`.

- [ ] **Step 1: Napisz testy**

```ts
// test/mirror.mount.test.ts
// @vitest-environment jsdom
import { test, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem('diurnus.prefs', JSON.stringify({ theme: 'auto', seenHelp: true }));
  document.body.innerHTML = '';
  document.head.innerHTML = '<meta name="theme-color" content="#282828">';
  delete document.documentElement.dataset.theme;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({
      matches: q.includes('min-width'),
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

const blocks = () => document.querySelectorAll('#grid .blk:not(.ghost)');
const linkedInput = () =>
  document.querySelector<HTMLInputElement>('#list .item.is-linked .item-text')!;

async function createBlock(flush: () => void) {
  document.querySelector<HTMLElement>('#grid .cell[data-q="32"]')!.click();
  flush();
  document.querySelector<HTMLElement>('#radial .rb[aria-label="Nauka"]')!.click();
  flush();
}

test('usunięcie bloku usuwa jego pozycję z listy', async () => {
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  const { removeBlock } = await import('../src/actions.svelte');
  await createBlock(flush);
  expect(document.querySelectorAll('#list .item.is-linked')).toHaveLength(1);

  removeBlock(app.S.blocks[0]!.id);
  flush();
  expect(document.querySelectorAll('#list .item.is-linked')).toHaveLength(0);
});

test('Backspace na pustej pozycji powiązanej usuwa blok z siatki', async () => {
  const flush = await mountApp();
  await createBlock(flush);
  expect(blocks().length).toBeGreaterThan(0);

  const input = linkedInput();
  input.selectionStart = input.selectionEnd = 0;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
  flush();
  expect(blocks()).toHaveLength(0);
});

test('usunięcie pozycji powiązanej cofa się jednym Ctrl+Z', async () => {
  const flush = await mountApp();
  const { undo } = await import('../src/state.svelte');
  await createBlock(flush);

  const input = linkedInput();
  input.selectionStart = input.selectionEnd = 0;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
  flush();
  expect(blocks()).toHaveLength(0);

  undo();
  flush();
  expect(blocks().length).toBeGreaterThan(0);
  expect(document.querySelectorAll('#list .item.is-linked')).toHaveLength(1);
});

test('tekst wpisany w pozycji powiązanej trafia do tytułu bloku', async () => {
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  await createBlock(flush);

  const input = linkedInput();
  input.value = 'Rozdział trzeci';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flush();
  expect(app.S.blocks[0]!.title).toBe('Rozdział trzeci');
});
```

- [ ] **Step 2: Uruchom — muszą paść**

Run: `make test`
Expected: FAIL — usunięcie pozycji nie rusza bloku, tytuł się nie zmienia.

- [ ] **Step 3: Lustrzane usuwanie**

W `src/actions.svelte.ts` zamień `deleteItem`:

```ts
export function deleteItem(id: string, focusAfter: string | null): void {
  const item = app.S.items.find((i) => i.id === id);
  // Lustro: pozycja JEST blokiem, więc usunięcie jednej strony usuwa drugą.
  // Blok znika w tej samej migawce, więc jedno Ctrl+Z przywraca oba.
  const blockId = item?.block;
  commit(() => {
    app.S.items = removeById(app.S.items, id);
    if (blockId) app.S.blocks = app.S.blocks.filter((b) => b.id !== blockId);
  });
  ui.focusItem = focusAfter;
}
```

- [ ] **Step 4: Synchronizacja tekstu z listy do bloku**

```ts
export function setItemText(id: string, text: string): void {
  const item = app.S.items.find((i) => i.id === id);
  if (!item) return;
  item.text = text;
  // Tekst piszą obie ścieżki edycji, nie reconcile — inaczej trzeba by zgadywać,
  // która strona zmieniła się jako ostatnia.
  if (item.block) {
    const block = app.S.blocks.find((b) => b.id === item.block);
    if (block) block.title = text;
  }
}
```

- [ ] **Step 5: Synchronizacja tekstu z arkusza bloku do pozycji**

W `src/components/EditSheet.svelte`, w funkcji `apply()`, w bloku `commit`, pod `b.title = nextTitle;`:

```ts
        const linked = app.S.items.find((i) => i.block === b.id);
        if (linked) linked.text = nextTitle;
```

- [ ] **Step 6: Uruchom testy**

Run: `make test && make check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/actions.svelte.ts src/components/EditSheet.svelte test/mirror.mount.test.ts
git commit -m "feat: mirror deletion and text between blocks and items"
```

---

## Task 6: Przeniesienie pozycji powiązanej przenosi blok

**Files:**
- Modify: `src/actions.svelte.ts`
- Create: `test/migrate-linked.mount.test.ts`

**Interfaces:**
- Consumes: `slotFree`, `reconcile` z zadania 1.

- [ ] **Step 1: Napisz testy**

```ts
// test/migrate-linked.mount.test.ts
// @vitest-environment jsdom
import { test, expect, beforeEach, vi } from 'vitest';
import { shiftDay, today } from '../src/lib/time';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem('diurnus.prefs', JSON.stringify({ theme: 'auto', seenHelp: true }));
  document.body.innerHTML = '';
  document.head.innerHTML = '<meta name="theme-color" content="#282828">';
  delete document.documentElement.dataset.theme;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({
      matches: q.includes('min-width'),
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

async function createBlockAt(q: number, flush: () => void) {
  document.querySelector<HTMLElement>(`#grid .cell[data-q="${q}"]`)!.click();
  flush();
  document.querySelector<HTMLElement>('#radial .rb[aria-label="Nauka"]')!.click();
  flush();
}

test('przeniesienie pozycji powiązanej przenosi blok na jutro', async () => {
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  const { migrateToTomorrow } = await import('../src/actions.svelte');
  await createBlockAt(32, flush);

  const linked = app.S.items.find((i) => i.block)!;
  migrateToTomorrow(linked.id);
  flush();

  expect(app.S.blocks[0]!.day).toBe(shiftDay(today(), 1));
  const src = app.S.items.find((i) => i.id === linked.id)!;
  expect(src.type).toBe('migrated');
  expect(src.block).toBeUndefined();
  expect(src.movedTo).toBe(shiftDay(today(), 1));
});

test('w dniu docelowym powstaje nowa pozycja powiązana', async () => {
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  const { migrateToTomorrow } = await import('../src/actions.svelte');
  await createBlockAt(32, flush);

  const linked = app.S.items.find((i) => i.block)!;
  migrateToTomorrow(linked.id);
  flush();

  const tomorrow = shiftDay(today(), 1);
  const target = app.S.items.filter((i) => i.day === tomorrow && i.block);
  expect(target).toHaveLength(1);
  expect(target[0]!.block).toBe(app.S.blocks[0]!.id);
});

test('zajęty slot w dniu docelowym blokuje przeniesienie', async () => {
  const flush = await mountApp();
  const { app, uid } = await import('../src/state.svelte');
  const { migrateToTomorrow } = await import('../src/actions.svelte');
  await createBlockAt(32, flush);

  const tomorrow = shiftDay(today(), 1);
  app.S.blocks.push({
    id: uid(), day: tomorrow, q: 32, len: 2, cat: 'learn', title: 'Zajęte', status: 'planned', created: 0,
  });
  flush();

  const linked = app.S.items.find((i) => i.block && i.day === today())!;
  migrateToTomorrow(linked.id);
  flush();

  expect(app.S.blocks.find((b) => b.id === linked.block)!.day).toBe(today());
  expect(app.S.items.find((i) => i.id === linked.id)!.type).toBe('task');
  expect(app.toast?.msg).toMatch(/zajęte/);
});

test('nałożenie częściowe też blokuje przeniesienie', async () => {
  // Klasa wejścia z Review Focus: blok wchodzący w ostatni kwadrans innego.
  const flush = await mountApp();
  const { app, uid } = await import('../src/state.svelte');
  const { migrateToTomorrow } = await import('../src/actions.svelte');
  await createBlockAt(32, flush); // zajmie 32 i 33

  const tomorrow = shiftDay(today(), 1);
  app.S.blocks.push({
    id: uid(), day: tomorrow, q: 33, len: 2, cat: 'learn', title: '', status: 'planned', created: 0,
  });
  flush();

  const linked = app.S.items.find((i) => i.block && i.day === today())!;
  migrateToTomorrow(linked.id);
  flush();
  expect(app.S.blocks.find((b) => b.id === linked.block)!.day).toBe(today());
});

test('przeniesienie pozycji NIEpowiązanej działa jak dotąd', async () => {
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  const { migrateToTomorrow } = await import('../src/actions.svelte');

  const d = document.querySelector<HTMLInputElement>('#list .is-draft .item-text')!;
  d.value = 'Zwykła notatka';
  d.dispatchEvent(new Event('input', { bubbles: true }));
  flush();

  const free = app.S.items.find((i) => !i.block)!;
  migrateToTomorrow(free.id);
  flush();

  const tomorrow = shiftDay(today(), 1);
  expect(app.S.items.filter((i) => i.day === tomorrow)).toHaveLength(1);
  expect(app.S.items.find((i) => i.id === free.id)!.type).toBe('migrated');
});
```

- [ ] **Step 2: Uruchom — muszą paść**

Run: `make test`
Expected: FAIL — blok zostaje w dniu źródłowym.

- [ ] **Step 3: Implementacja**

W `src/actions.svelte.ts` zamień `migrateItem`:

```ts
export function migrateItem(
  id: string,
  targetDay: string,
  type: 'migrated' | 'scheduled',
): void {
  const item = app.S.items.find((i) => i.id === id);
  if (!item || item.movedTo) {
    app.toast = { msg: 'Ta pozycja została już przeniesiona', undoable: false };
    return;
  }

  const block = item.block ? app.S.blocks.find((b) => b.id === item.block) : undefined;

  // Pozycja swobodna: kopiujemy ją, jak dotąd.
  if (!block) {
    const before = app.S.items;
    const after = migrateTo(before, id, targetDay, Date.now(), uid, type);
    if (after.length === before.length) return;
    commit(() => (app.S.items = after), `Przeniesiono na ${targetDay}`, true);
    return;
  }

  // Pozycja powiązana: przenosi się BLOK, a pozycję w dniu docelowym
  // materializuje reconcile — nie ma tu osobnego kopiowania.
  if (!slotFree(app.S.blocks, targetDay, block.q, block.len, block.id)) {
    app.toast = {
      msg: `W dniu ${targetDay} o ${fmtQ(targetDay, block.q)} jest już zajęte`,
      undoable: false,
    };
    return;
  }

  commit(
    () => {
      block.day = targetDay;
      item.block = undefined;
      item.type = type;
      item.movedTo = targetDay;
      // commit() uzgadnia tylko dzień oglądany; dzień docelowy trzeba osobno.
      app.S.items = reconcile(app.S.items, app.S.blocks, targetDay, Date.now(), uid);
    },
    `Przeniesiono na ${targetDay}`,
    true,
  );
}
```

Dopisz importy `slotFree` i `reconcile` z `./lib/link`.

- [ ] **Step 4: Uruchom testy**

Run: `make test && make check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/actions.svelte.ts test/migrate-linked.mount.test.ts
git commit -m "feat: migrating a linked item moves its block"
```

---

## Stan po wykonaniu planu

Każdy blok ma swoją pozycję na liście, usunięcie jednej strony usuwa drugą, a tekst jest
wspólny. Lista dnia czyta się jako „najpierw plan według godzin, potem notatki".

**Poza zakresem tej fazy:** nadanie godziny pozycji z listy (pozycja → nowy blok),
powiązanie pozycji z istniejącym blokiem, synchronizacja znacznika ze statusem bloku.
