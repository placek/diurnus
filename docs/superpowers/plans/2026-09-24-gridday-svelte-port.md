# GridDay — port do projektu Svelte (plan wdrożenia)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Przenieść działający prototyp `gridday.html` do projektu Svelte 5 + TypeScript + Vite ze środowiskiem Nix, Makefile'em i wdrożeniem na GitHub Pages, bez utraty żadnej funkcji.

**Architecture:** Czysta logika ląduje w `src/lib/` jako moduły TypeScript, które **nie importują niczego ze Svelte** — testuje je Vitest zwykłym `import`. Stan aplikacji trzyma jeden moduł `state.svelte.ts` oparty na runach Svelte 5, z trwałością w `localStorage` przez `$effect`. Komponenty renderują i podpinają zdarzenia; nic nie liczą.

**Tech Stack:** Svelte 5, TypeScript 5, Vite 6, Vitest 2, `@fortawesome/free-solid-svg-icons` (tree-shaken), `@fontsource/*`, Nix (flake + `shell.nix`), GNU Make.

**Spec:** [`PLAN.md`](../../../PLAN.md)

## Zakres

Port do parzystości funkcjonalnej z prototypem, plus eksport/import JSON i wdrożenie.
**Poza zakresem:** iCalendar (odłożony świadomie — `PLAN.md` §9), raporty, PWA.

`gridday.html` **zostaje w repozytorium do zadania 14**. Jest odniesieniem przy porcie i
pozwala porównać zachowanie obok siebie; usuwamy go dopiero, gdy port osiągnie parzystość.

## Global Constraints

- **`src/lib/` nie importuje niczego ze Svelte.** Żadnego `$state`, żadnego `.svelte`. Moduł, który tego potrzebuje, należy do `src/state.svelte.ts` albo do komponentu.
- **Zero zewnętrznych żądań sieciowych w zbudowanej aplikacji.** Ikony i czcionki wchodzą do bundla. Brak `<link>` i `<script>` do CDN-ów.
- **Strefa czasowa testów:** `TZ=Europe/Warsaw`, ustawiane w skrypcie `test` w `package.json`.
- **`q` zawsze liczone od północy** (0–95). Nigdy od początku widocznego okna.
- **Klucze `localStorage`:** `gridday.v1` (stan) i `gridday.prefs` (preferencje). Nazwy stałe; wersję schematu trzyma pole `State.v`.
- **Język:** komentarze, nazwy testów i teksty UI po polsku; komunikaty commitów po angielsku.
- **`BASE_PATH`** steruje `base` w Vite: `/` lokalnie, `/gridday/` przy wdrożeniu.
- **Styl:** 2 spacje wcięcia, TypeScript bez `any`, Prettier z `prettier-plugin-svelte`.

## Review Focus

Klasy wejścia, które spec zakłada, a które łatwo przeoczyć:

1. **Pierwsze uruchomienie bez danych** — `localStorage` pusty, `normalize(null)` musi dać komplet domyślnych kategorii i pór dnia, a nie pustą siatkę. → test w zadaniu 3.
2. **`localStorage` niedostępny lub pełny** (tryb prywatny, limit 5 MB) — zapis musi zawieść cicho z komunikatem, a nie wywrócić aplikacji przy każdej zmianie. → test i obsługa w zadaniu 6.
3. **Doba zmiany czasu** — 29 marca 2026 ma 23 godziny; kwant 32 musi nadal oznaczać 08:00 ściany. → test w zadaniu 2.
4. **Blok przechodzący przez granicę godziny** (start o `:45`) — musi dać dwa segmenty z zaokrągleniem tylko skrajnych rogów. → test w zadaniu 5.
5. **Okno doby węższe niż bloki** — użytkownik zwęża dzień do 08:00–16:00, gdy istnieją bloki o 07:00; muszą przetrwać w danych i wrócić po rozszerzeniu okna. → test w zadaniu 4.

---

## Zadanie 1: Szkielet projektu, Nix i Makefile

Nic z logiki aplikacji. Cel: `make dev`, `make build`, `make test` i `make check` działają na pustej stronie.

**Files:**
- Create: `flake.nix`, `shell.nix`, `Makefile`, `package.json`, `tsconfig.json`, `tsconfig.node.json`, `svelte.config.js`, `vite.config.ts`, `index.html`, `.gitignore`, `.prettierrc`, `src/main.ts`, `src/App.svelte`

**Interfaces:**
- Produces: działające cele Make, na których opierają się wszystkie kolejne zadania.

- [ ] **Step 1: `flake.nix`**

```nix
{
  description = "GridDay — kwantowanie doby na 15-minutowe tokeny";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAll = f: nixpkgs.lib.genAttrs systems (s: f nixpkgs.legacyPackages.${s});
    in {
      devShells = forAll (pkgs: {
        default = pkgs.mkShell {
          packages = [ pkgs.nodejs_22 pkgs.gnumake ];
          shellHook = ''
            echo "GridDay · node $(node --version) · npm $(npm --version)"
            echo "make help — lista celów"
          '';
        };
      });
    };
}
```

- [ ] **Step 2: `shell.nix`**

```nix
# Nakładka zgodności dla `nix-shell` bez włączonych flake'ów.
# Bierze nixpkgs z kanału systemowego, więc jest mniej odtwarzalna niż flake —
# i dlatego CI oraz zalecana praca lokalna idą przez `nix develop`.
{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  packages = [ pkgs.nodejs_22 pkgs.gnumake ];
}
```

- [ ] **Step 3: `Makefile`**

```make
NPM       := npm
BASE_PATH ?= /gridday/

.DEFAULT_GOAL := help
.PHONY: help install dev build serve test check fmt clean

## instalacja zależności, gdy package.json jest nowszy niż node_modules
node_modules: package.json
	@if [ -f package-lock.json ]; then $(NPM) ci; else $(NPM) install; fi
	@touch node_modules

install: node_modules  ## zainstaluj zależności

dev: node_modules      ## serwer deweloperski z HMR
	BASE_PATH=/ $(NPM) run dev

build: node_modules    ## produkcyjna budowa do dist/
	BASE_PATH=$(BASE_PATH) $(NPM) run build

serve: build           ## podgląd zbudowanej aplikacji
	BASE_PATH=$(BASE_PATH) $(NPM) run preview

test: node_modules     ## testy jednostkowe
	$(NPM) run test

check: node_modules    ## sprawdzenie typów i komponentów
	$(NPM) run check

fmt: node_modules      ## formatowanie
	$(NPM) run fmt

clean:                 ## usuń wyniki budowy i zależności
	rm -rf dist node_modules

help:                  ## ta lista
	@grep -hE '^[a-z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-8s\033[0m %s\n", $$1, $$2}'
```

`node_modules` jest celem plikowym zależnym od `package.json`, więc instalacja odpala się sama
po zmianie zależności i **nie odpala się**, gdy nic się nie zmieniło. `touch` na końcu jest
konieczny, bo `npm` nie zawsze podbija czas modyfikacji katalogu.

- [ ] **Step 4: `package.json`**

```json
{
  "name": "gridday",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview --port 4173",
    "test": "TZ=Europe/Warsaw vitest run",
    "test:watch": "TZ=Europe/Warsaw vitest",
    "check": "svelte-check --tsconfig ./tsconfig.json",
    "fmt": "prettier --write ."
  },
  "dependencies": {
    "@fontsource/ibm-plex-mono": "^5.1.0",
    "@fontsource/ibm-plex-sans-condensed": "^5.1.0",
    "@fortawesome/free-solid-svg-icons": "^6.7.1"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^5.0.0",
    "@tsconfig/svelte": "^5.0.4",
    "prettier": "^3.4.0",
    "prettier-plugin-svelte": "^3.3.0",
    "svelte": "^5.15.0",
    "svelte-check": "^4.1.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 5: `vite.config.ts`, `svelte.config.js`, `tsconfig.json`, `.prettierrc`**

```ts
// vite.config.ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  // GitHub Pages serwuje projekt pod /gridday/; Makefile ustawia / dla dev.
  base: process.env.BASE_PATH ?? '/',
  plugins: [svelte()],
  build: { target: 'es2022' },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
```

```js
// svelte.config.js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
export default { preprocess: vitePreprocess() };
```

```json
// tsconfig.json
{
  "extends": "@tsconfig/svelte/tsconfig.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.svelte", "test/**/*.ts", "vite.config.ts"]
}
```

```json
// .prettierrc
{
  "useTabs": false,
  "tabWidth": 2,
  "singleQuote": true,
  "printWidth": 100,
  "plugins": ["prettier-plugin-svelte"],
  "overrides": [{ "files": "*.svelte", "options": { "parser": "svelte" } }]
}
```

`noUncheckedIndexedAccess` jest włączone celowo: kod operuje na tablicy 96 kwantów indeksowanej
liczbami i chcemy, żeby kompilator wymuszał sprawdzenie `undefined` przy każdym dostępie.

- [ ] **Step 6: `index.html`, `src/main.ts`, `src/App.svelte`, `.gitignore`**

```html
<!-- index.html -->
<!doctype html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#282828" />
    <meta name="mobile-web-app-capable" content="yes" />
    <title>GridDay</title>
  </head>
  <body>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

```ts
// src/main.ts
import { mount } from 'svelte';
import App from './App.svelte';

export default mount(App, { target: document.body });
```

```svelte
<!-- src/App.svelte -->
<script lang="ts">
</script>

<main>
  <h1>GridDay</h1>
  <p>Szkielet projektu działa.</p>
</main>
```

```gitignore
node_modules/
dist/
.DS_Store
*.log
```

- [ ] **Step 7: Weryfikacja**

```bash
nix develop -c make install    # albo: nix-shell --run "make install"
make check                     # brak błędów typów
make test                      # "No test files found" — to poprawny wynik na tym etapie
make build                     # dist/ powstaje
make dev                       # strona z nagłówkiem GridDay pod localhost:5173
```

Sprawdź też `make help` — wypisuje listę celów z opisami.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "build: scaffold the Svelte project, Nix shell and Makefile

Sets up Svelte 5, TypeScript, Vite and Vitest with a pinned Nix flake for
the toolchain and a shell.nix shim so plain nix-shell still works.

The Makefile is the only interface anyone needs to remember. node_modules is
a file target depending on package.json, so installs happen automatically
when dependencies change and are skipped when they have not.

Vite reads base from BASE_PATH: / for local work, /gridday/ for the Pages
build. Getting that wrong ships a page that loads and then 404s every asset.

noUncheckedIndexedAccess is on because the core data structure is a 96-slot
array indexed by number, and an unchecked read there is a real bug class."
```

---

## Zadanie 2: Typy i arytmetyka czasu

**Files:**
- Create: `src/lib/types.ts`, `src/lib/time.ts`, `test/time.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `QDAY`, `Status`, `Category`, `Band`, `Block`, `State`, `Prefs` (kształty jak w `PLAN.md` §4).
  - `time.ts`: `pad`, `dayKey(d: Date): string`, `today(): string`, `splitDay(k: string): [number, number, number]`, `qTime(day: string, q: number): number`, `shiftDay(day: string, n: number): string`, `fmtQ(day: string, q: number): string`, `rel(day, q0, q1, now?): 'past' | 'now' | 'future'`, `nowQ(day: string, now?): number | null`, `fmtDur(min: number): string`.

- [ ] **Step 1: Napisz testy**

```ts
// test/time.test.ts
import { describe, test, expect } from 'vitest';
import { dayKey, today, qTime, shiftDay, fmtQ, rel, nowQ, fmtDur } from '../src/lib/time';

const D = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();

describe('dayKey / shiftDay', () => {
  test('dayKey formatuje z zerami wiodącymi', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  test('shiftDay przechodzi przez granicę miesiąca', () => {
    expect(shiftDay('2026-01-31', 1)).toBe('2026-02-01');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  });

  test('shiftDay przechodzi przez granicę roku', () => {
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
  });

  test('shiftDay o tydzień wstecz', () => {
    expect(shiftDay('2026-09-24', -7)).toBe('2026-09-17');
  });
});

describe('qTime / fmtQ', () => {
  test('kwant 32 to 08:00 czasu lokalnego', () => {
    expect(qTime('2026-09-24', 32)).toBe(D(2026, 9, 24, 8));
  });

  test('kwant 0 to północ, 95 to 23:45', () => {
    expect(qTime('2026-09-24', 0)).toBe(D(2026, 9, 24, 0));
    expect(fmtQ('2026-09-24', 95)).toBe('23:45');
  });

  test('kwant 96 wyświetla się jako 24:00', () => {
    expect(fmtQ('2026-09-24', 96)).toBe('24:00');
  });

  test('w dobie zmiany czasu kwant 32 to nadal 08:00 ściany', () => {
    // 29.03.2026 — przejście na czas letni, doba ma 23 godziny
    expect(new Date(qTime('2026-03-29', 32)).getHours()).toBe(8);
    expect(fmtQ('2026-03-29', 32)).toBe('08:00');
  });

  test('w dobie powrotu do czasu zimowego kwant 32 to nadal 08:00', () => {
    expect(fmtQ('2026-10-25', 32)).toBe('08:00');
  });
});

describe('rel', () => {
  const now = D(2026, 9, 24, 10, 7);
  test('blok zakończony przed chwilą to przeszłość', () => {
    expect(rel('2026-09-24', 36, 40, now)).toBe('past');   // 09:00–10:00
  });
  test('blok obejmujący teraz to teraźniejszość', () => {
    expect(rel('2026-09-24', 40, 42, now)).toBe('now');    // 10:00–10:30
  });
  test('blok przyszły to przyszłość', () => {
    expect(rel('2026-09-24', 44, 46, now)).toBe('future'); // 11:00–11:30
  });
  test('granica: blok kończący się dokładnie teraz to przeszłość', () => {
    expect(rel('2026-09-24', 38, 40, D(2026, 9, 24, 10))).toBe('past');
  });
  test('inny dzień liczy się względem tego samego zegara', () => {
    expect(rel('2026-09-23', 40, 42, now)).toBe('past');
    expect(rel('2026-09-25', 40, 42, now)).toBe('future');
  });
});

describe('nowQ', () => {
  test('zwraca kwant bieżącej chwili dla dzisiejszego dnia', () => {
    expect(nowQ('2026-09-24', D(2026, 9, 24, 10, 7))).toBe(40);   // 10:00–10:15
  });
  test('zwraca null dla innego dnia', () => {
    expect(nowQ('2026-09-23', D(2026, 9, 24, 10, 7))).toBeNull();
  });
  test('kwadrans zaokrągla w dół', () => {
    expect(nowQ('2026-09-24', D(2026, 9, 24, 10, 59))).toBe(43);
  });
});

describe('fmtDur', () => {
  test('minuty, godziny i mieszane', () => {
    expect(fmtDur(30)).toBe('30 min');
    expect(fmtDur(60)).toBe('1 h');
    expect(fmtDur(90)).toBe('1 h 30 min');
  });
});

test('today zwraca klucz dzisiejszego dnia', () => {
  expect(today()).toBe(dayKey(new Date()));
});
```

- [ ] **Step 2: Uruchom testy — muszą paść**

Run: `make test`
Expected: FAIL — `Cannot find module '../src/lib/time'`.

- [ ] **Step 3: Napisz `src/lib/types.ts`**

```ts
export const QDAY = 96; // kwanty 15-minutowe w dobie

export type Status = 'suggested' | 'planned' | 'active' | 'confirmed' | 'discarded';

export interface Category {
  id: string;
  name: string;
  icon: string | null;   // null = dziedzicz ikonę kategorii nadrzędnej
  color?: string;        // tylko kategorie główne; podkategorie dziedziczą
  parent: string | null;
  archived?: boolean;
}

export interface Band {  // pora dnia; trwa do `from` następnej
  id: string;
  name: string;
  from: number;          // godzina rozpoczęcia
  color: string;
}

export interface Block {
  id: string;
  day: string;           // 'YYYY-MM-DD', czas lokalny
  q: number;             // 0–95, kwant liczony od północy
  len: number;           // długość w kwantach
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
  v: number;             // wersja schematu; migracje w normalize()
  cats: Category[];
  day: DaySettings;
  blocks: Block[];
}

export interface Prefs {
  theme: 'auto' | 'light' | 'dark';
  seenHelp: boolean;
}
```

- [ ] **Step 4: Napisz `src/lib/time.ts`**

```ts
import { QDAY } from './types';

export const pad = (n: number) => String(n).padStart(2, '0');

export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const today = () => dayKey(new Date());

export function splitDay(k: string): [number, number, number] {
  const [y, m, d] = k.split('-').map(Number);
  return [y ?? 1970, m ?? 1, d ?? 1];
}

// Minuty przepełniają się celowo: Date normalizuje pola w czasie LOKALNYM,
// więc kwant 32 to 08:00 ściany także w dobie zmiany czasu.
export function qTime(day: string, q: number): number {
  const [y, m, d] = splitDay(day);
  return new Date(y, m - 1, d, 0, q * 15).getTime();
}

export function shiftDay(day: string, n: number): string {
  const [y, m, d] = splitDay(day);
  return dayKey(new Date(y, m - 1, d + n));
}

export function fmtQ(day: string, q: number): string {
  if (q >= QDAY) return '24:00';
  const t = new Date(qTime(day, q));
  return `${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

export type Rel = 'past' | 'now' | 'future';

export function rel(day: string, q0: number, q1: number, now = Date.now()): Rel {
  if (qTime(day, q1) <= now) return 'past';
  if (qTime(day, q0) <= now) return 'now';
  return 'future';
}

export function nowQ(day: string, now = Date.now()): number | null {
  const d = new Date(now);
  if (dayKey(d) !== day) return null;
  return d.getHours() * 4 + Math.floor(d.getMinutes() / 15);
}

export function fmtDur(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
```

- [ ] **Step 5: Uruchom testy**

Run: `make test`
Expected: wszystkie testy `time.test.ts` PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/time.ts test/time.test.ts
git commit -m "feat: add the domain types and day arithmetic

Quanta are indexed from midnight, 0 to 95, so narrowing the visible day does
not move existing blocks.

qTime builds dates by overflowing the minutes field rather than adding
milliseconds. The Date constructor normalises its fields in local time, so
quantum 32 stays 08:00 on the wall clock even on the spring-forward day,
which has only 23 hours. Millisecond arithmetic would place it at 07:00.
Both DST days are covered by tests."
```

---

## Zadanie 3: Model stanu i migracje

**Files:**
- Create: `src/lib/model.ts`, `test/model.test.ts`

**Interfaces:**
- Consumes: `types.ts`.
- Produces: `DEFAULT_CATS`, `DEFAULT_DAY`, `COLORS`, `ICONS`, `MAX_TOP`, `MAX_KIDS`, `STATUS_LABEL`, `uid(): string`, `normalize(x: unknown): State`.

- [ ] **Step 1: Napisz testy**

```ts
// test/model.test.ts
import { test, expect } from 'vitest';
import { normalize, DEFAULT_DAY, uid } from '../src/lib/model';

test('normalize: brak stanu daje domyślne kategorie, pory dnia i wersję bieżącą', () => {
  const s = normalize(null);
  expect(s.v).toBe(2);
  expect(s.blocks).toEqual([]);
  expect(s.cats.length).toBeGreaterThan(0);
  expect(s.day.start).toBe(6);
  expect(s.day.end).toBe(22);
  expect(s.day.bands.length).toBeGreaterThan(0);
});

test('normalize: migracja v1 → v2 przesuwa q z bazy 06:00 na bazę północy', () => {
  const s = normalize({
    v: 1,
    cats: [{ id: 'x', name: 'X', icon: 'circle', color: 'red', parent: null }],
    blocks: [{ id: 'a', day: '2026-09-24', q: 0, len: 2, cat: 'x', title: '', status: 'confirmed', created: 0 }],
  });
  expect(s.v).toBe(2);
  expect(s.blocks[0]!.q).toBe(24);
});

test('normalize: uszkodzone ustawienia dnia wracają do domyślnych, bloki zostają', () => {
  const s = normalize({
    v: 2,
    cats: [{ id: 'x', name: 'X', icon: 'circle', color: 'red', parent: null }],
    blocks: [{ id: 'a', day: '2026-09-24', q: 32, len: 2, cat: 'x', title: '', status: 'planned', created: 0 }],
    day: { start: 22, end: 6, bands: [] },
  });
  expect(s.day.start).toBe(6);
  expect(s.blocks).toHaveLength(1);
});

test('normalize: bloki poza zwężonym oknem doby NIE są kasowane', () => {
  const s = normalize({
    v: 2,
    cats: [{ id: 'x', name: 'X', icon: 'circle', color: 'red', parent: null }],
    blocks: [{ id: 'a', day: '2026-09-24', q: 28, len: 2, cat: 'x', title: '', status: 'confirmed', created: 0 }],
    day: { start: 8, end: 16, bands: [{ id: 'b', name: 'P', from: 8, color: 'yellow' }] },
  });
  expect(s.blocks).toHaveLength(1);
  expect(s.blocks[0]!.q).toBe(28);   // 07:00, poza oknem 08–16, ale w danych
});

test('normalize: pusta lista kategorii wraca do domyślnych', () => {
  const s = normalize({ v: 2, cats: [], blocks: [], day: DEFAULT_DAY });
  expect(s.cats.length).toBeGreaterThan(0);
});

test('normalize: śmieci dają czysty stan domyślny', () => {
  for (const junk of [undefined, 0, 'tekst', [], { v: 99 }]) {
    const s = normalize(junk);
    expect(s.v).toBe(2);
    expect(s.blocks).toEqual([]);
  }
});

test('normalize: DEFAULT_DAY nie jest współdzielony między wywołaniami', () => {
  const a = normalize(null);
  const b = normalize(null);
  a.day.bands.push({ id: 'zzz', name: 'Test', from: 12, color: 'red' });
  expect(a.day.bands.length).not.toBe(b.day.bands.length);
});

test('normalize: domyślne kategorie też nie są współdzielone', () => {
  const a = normalize(null);
  const b = normalize(null);
  a.cats[0]!.name = 'Zmienione';
  expect(b.cats[0]!.name).not.toBe('Zmienione');
});

test('uid: kolejne wywołania dają różne identyfikatory', () => {
  const seen = new Set(Array.from({ length: 500 }, () => uid()));
  expect(seen.size).toBe(500);
});
```

- [ ] **Step 2: Uruchom testy — muszą paść**

Run: `make test`
Expected: FAIL — `Cannot find module '../src/lib/model'`.

- [ ] **Step 3: Napisz implementację**

Wartości `DEFAULT_CATS`, `DEFAULT_DAY`, `COLORS` i `ICONS` przenieś **dosłownie** z prototypu
(`gridday.html`, linie 451–476). Poniżej kształt modułu:

```ts
import type { Category, DaySettings, State, Status } from './types';

export const COLORS = ['yellow', 'orange', 'red', 'purple', 'blue', 'aqua', 'green'] as const;

export const ICONS = [ /* 38 nazw, przeniesione z gridday.html:464-467 */ ] as const;

export const MAX_TOP = 9;
export const MAX_KIDS = 9;   // cyfry 1–9 jako skróty

export const STATUS_LABEL: Record<Status, string> = {
  suggested: 'sugestia', planned: 'plan', active: 'w toku',
  confirmed: 'wykonane', discarded: 'odrzucone',
};

const DEFAULT_CATS: readonly Category[] = [ /* przeniesione z gridday.html:451-462 */ ];

export const DEFAULT_DAY: DaySettings = { /* przeniesione z gridday.html:469-474 */ };

export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36);

const clone = <T>(x: T): T => structuredClone(x);

export function normalize(x: unknown): State {
  let s = x as Partial<State> | null | undefined;

  // v1 trzymało q względem 06:00; v2 liczy od północy.
  if (s && s.v === 1 && Array.isArray(s.blocks)) {
    s.blocks.forEach((b) => { b.q += 24; });
    s.v = 2;
  }

  if (!s || typeof s !== 'object' || s.v !== 2 || !Array.isArray(s.blocks)) {
    return { v: 2, cats: clone(DEFAULT_CATS) as Category[], day: clone(DEFAULT_DAY), blocks: [] };
  }
  if (!Array.isArray(s.cats) || !s.cats.length) s.cats = clone(DEFAULT_CATS) as Category[];
  if (!s.day || !(s.day.start < s.day.end) || !Array.isArray(s.day.bands)) s.day = clone(DEFAULT_DAY);

  return s as State;
}
```

`structuredClone` zamiast `JSON.parse(JSON.stringify(...))`: jest w każdej przeglądarce
docelowej i w Node 22, i nie gubi typów przy głębokim kopiowaniu.

**Bloki nigdy nie są filtrowane po oknie doby.** Zwężenie dnia do 08:00–16:00 chowa bloki
z 07:00 z widoku, ale zostawia je w danych — rozszerzenie okna musi je przywrócić.

- [ ] **Step 4: Uruchom testy**

Run: `make test` — wszystkie PASS. Następnie `make check` — brak błędów typów.

- [ ] **Step 5: Commit**

```bash
git add src/lib/model.ts test/model.test.ts
git commit -m "feat: add the state model with schema migrations

normalize() is the only entry point for state: it repairs damaged settings,
restores defaults and runs schema migrations, including the v1 to v2 change
that rebased quanta from 06:00 to midnight.

Defaults are deep-cloned per call. Handing out a shared DEFAULT_DAY means the
first edit mutates every future default, which shows up much later as
settings that were never saved.

Blocks outside the visible day window are kept, never pruned. Narrowing the
day to 08:00-16:00 hides a 07:00 block; widening it again must bring the
block back rather than reveal that it was silently deleted."
```

---

## Zadanie 4: Zajętość siatki

**Files:**
- Create: `src/lib/occupancy.ts`, `test/occupancy.test.ts`

**Interfaces:**
- Produces:
  - `occ(blocks: Block[], day: string): (Block | null)[]` — tablica długości `QDAY`.
  - `fit(o: (Block | null)[], q: number, max?: number): { q: number; len: number } | null`
  - `activeBlock(blocks: Block[]): Block | undefined`

- [ ] **Step 1: Napisz testy**

```ts
// test/occupancy.test.ts
import { test, expect } from 'vitest';
import { occ, fit, activeBlock } from '../src/lib/occupancy';
import { QDAY } from '../src/lib/types';
import type { Block, Status } from '../src/lib/types';

const blk = (id: string, q: number, len: number, status: Status = 'planned', day = '2026-09-24'): Block =>
  ({ id, day, q, len, cat: 'work', title: '', status, created: 0 });

test('occ: tablica ma 96 slotów, zajęte wskazują na blok', () => {
  const o = occ([blk('a', 32, 2)], '2026-09-24');
  expect(o).toHaveLength(QDAY);
  expect(o[31]).toBeNull();
  expect(o[32]?.id).toBe('a');
  expect(o[33]?.id).toBe('a');
  expect(o[34]).toBeNull();
});

test('occ: bloki z innego dnia są pomijane', () => {
  expect(occ([blk('a', 32, 2, 'planned', '2026-09-23')], '2026-09-24')[32]).toBeNull();
});

test('occ: bloki discarded nie zajmują miejsca', () => {
  expect(occ([blk('a', 32, 2, 'discarded')], '2026-09-24')[32]).toBeNull();
});

test('occ: blok wychodzący poza dobę jest przycinany bez błędu', () => {
  const o = occ([blk('a', 95, 4)], '2026-09-24');
  expect(o[95]?.id).toBe('a');
  expect(o).toHaveLength(QDAY);
});

test('fit: wolne miejsce daje pełne dwa kwanty', () => {
  expect(fit(occ([], '2026-09-24'), 32)).toEqual({ q: 32, len: 2 });
});

test('fit: sąsiad z prawej skraca dopasowanie do jednego kwantu', () => {
  expect(fit(occ([blk('a', 33, 2)], '2026-09-24'), 32)).toEqual({ q: 32, len: 1 });
});

test('fit: zajęty kwant daje null', () => {
  expect(fit(occ([blk('a', 32, 2)], '2026-09-24'), 32)).toBeNull();
});

test('fit: koniec doby skraca dopasowanie', () => {
  expect(fit(occ([], '2026-09-24'), 95)).toEqual({ q: 95, len: 1 });
});

test('fit: indeks poza zakresem daje null', () => {
  const o = occ([], '2026-09-24');
  expect(fit(o, -1)).toBeNull();
  expect(fit(o, QDAY)).toBeNull();
});

test('activeBlock: znajduje jedyny blok w toku', () => {
  expect(activeBlock([blk('a', 32, 2), blk('b', 40, 2, 'active')])?.id).toBe('b');
});

test('activeBlock: brak aktywnego daje undefined', () => {
  expect(activeBlock([blk('a', 32, 2)])).toBeUndefined();
});
```

- [ ] **Step 2: Uruchom testy — muszą paść**

Run: `make test`
Expected: FAIL — `Cannot find module '../src/lib/occupancy'`.

- [ ] **Step 3: Napisz implementację**

```ts
import { QDAY } from './types';
import type { Block } from './types';

// Mapa kwant → blok dla jednego dnia. Klienckie zastąpienie ograniczenia
// wykluczającego nakładanie się, które w fazie z bazą przejmie GiST.
export function occ(blocks: Block[], day: string): (Block | null)[] {
  const o: (Block | null)[] = new Array(QDAY).fill(null);
  for (const b of blocks) {
    if (b.day !== day || b.status === 'discarded') continue;
    for (let i = Math.max(0, b.q); i < Math.min(b.q + b.len, QDAY); i++) o[i] = b;
  }
  return o;
}

// Największy wolny wycinek zaczynający się w q, nie dłuższy niż `max`.
export function fit(o: (Block | null)[], q: number, max = 2): { q: number; len: number } | null {
  if (q < 0 || q >= QDAY || o[q]) return null;
  let len = 0;
  while (len < max && q + len < QDAY && !o[q + len]) len++;
  return len ? { q, len } : null;
}

export const activeBlock = (blocks: Block[]) => blocks.find((b) => b.status === 'active');
```

- [ ] **Step 4: Uruchom testy**

Run: `make test` — wszystkie PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/occupancy.ts test/occupancy.test.ts
git commit -m "feat: add grid occupancy and placement

occ() builds a 96-slot map from quantum to block for one day; fit() returns
the largest free run starting at a quantum, capped at the 30-minute block
size. Together they are the client-side stand-in for the overlap-exclusion
constraint the database phase will enforce with GiST.

Discarded blocks do not occupy space but still exist, which is what lets a
rejected suggestion stay rejected without blocking the slot."
```

---

## Zadanie 5: Hierarchia kategorii i segmenty bloków

**Files:**
- Create: `src/lib/categories.ts`, `src/lib/segments.ts`, `test/categories.test.ts`, `test/segments.test.ts`

**Interfaces:**
- Produces:
  - `categories.ts`: `catOf(cats, id)`, `topCats(cats)`, `kids(cats, id)`, `rootOf(cats, c)`, `colorOf(cats, c)`, `iconOf(cats, c)`, `pathOf(cats, c)`, `catOrder(cats): Map<string, number>`
  - `segments.ts`: `Segment { hour, from, to, first, last }`, `segments(q, len, startH, endH): Segment[]`

- [ ] **Step 1: Napisz testy kategorii**

```ts
// test/categories.test.ts
import { test, expect } from 'vitest';
import { catOf, topCats, kids, rootOf, colorOf, iconOf, pathOf } from '../src/lib/categories';
import type { Category } from '../src/lib/types';

const cats: Category[] = [
  { id: 'work', name: 'Praca', icon: 'laptop-code', color: 'yellow', parent: null },
  { id: 'work-a', name: 'Projekt A', icon: null, parent: 'work' },
  { id: 'work-b', name: 'Projekt B', icon: 'code', parent: 'work' },
  { id: 'old', name: 'Archiwalna', icon: 'circle', color: 'red', parent: null, archived: true },
];

test('topCats pomija podkategorie i archiwalne', () => {
  expect(topCats(cats).map((c) => c.id)).toEqual(['work']);
});

test('kids zwraca podkategorie w kolejności', () => {
  expect(kids(cats, 'work').map((c) => c.id)).toEqual(['work-a', 'work-b']);
});

test('rootOf podkategorii wskazuje rodzica, rootOf głównej wskazuje ją samą', () => {
  expect(rootOf(cats, cats[1]!).id).toBe('work');
  expect(rootOf(cats, cats[0]!).id).toBe('work');
});

test('colorOf: podkategoria dziedziczy kolor rodzica', () => {
  expect(colorOf(cats, cats[1]!)).toBe('yellow');
});

test('iconOf: null oznacza dziedziczenie, własna ikona wygrywa', () => {
  expect(iconOf(cats, cats[1]!)).toBe('laptop-code');
  expect(iconOf(cats, cats[2]!)).toBe('code');
});

test('pathOf: podkategoria pokazuje ścieżkę, główna samą nazwę', () => {
  expect(pathOf(cats, cats[1]!)).toBe('Praca › Projekt A');
  expect(pathOf(cats, cats[0]!)).toBe('Praca');
});

test('catOf: nieznane id daje zastępczą kategorię zamiast wyjątku', () => {
  const c = catOf(cats, 'nie-ma');
  expect(c.name).toBe('—');
  expect(c.icon).toBe('circle');
});

test('rootOf: osierocona podkategoria nie zapętla się', () => {
  const orphan: Category[] = [{ id: 'k', name: 'K', icon: null, parent: 'znikniety' }];
  expect(rootOf(orphan, orphan[0]!).id).toBe('k');
});
```

- [ ] **Step 2: Napisz testy segmentów**

```ts
// test/segments.test.ts
import { test, expect } from 'vitest';
import { segments } from '../src/lib/segments';

test('blok w całości wewnątrz godziny daje jeden segment z obydwoma rogami', () => {
  expect(segments(32, 2, 6, 22)).toEqual([{ hour: 8, from: 32, to: 34, first: true, last: true }]);
});

test('blok startujący o :45 przełamuje się na dwa segmenty', () => {
  // 08:45–09:15
  expect(segments(35, 2, 6, 22)).toEqual([
    { hour: 8, from: 35, to: 36, first: true, last: false },
    { hour: 9, from: 36, to: 37, first: false, last: true },
  ]);
});

test('blok obejmujący pełną godzinę daje jeden segment', () => {
  expect(segments(32, 4, 6, 22)).toEqual([{ hour: 8, from: 32, to: 36, first: true, last: true }]);
});

test('blok dłuższy niż godzina daje segment środkowy bez zaokrągleń', () => {
  const s = segments(34, 6, 6, 22);   // 08:30–10:00
  expect(s).toHaveLength(2);
  expect(s[0]).toEqual({ hour: 8, from: 34, to: 36, first: true, last: false });
  expect(s[1]).toEqual({ hour: 9, from: 36, to: 40, first: false, last: true });
});

test('część bloku poza oknem doby jest pomijana', () => {
  // 05:45–06:15 przy oknie 06–22: widoczny tylko fragment po 06:00
  expect(segments(23, 2, 6, 22)).toEqual([{ hour: 6, from: 24, to: 25, first: false, last: true }]);
});

test('blok w całości poza oknem nie daje segmentów', () => {
  expect(segments(8, 2, 6, 22)).toEqual([]);
});

test('blok sięgający poza koniec okna jest ucinany', () => {
  expect(segments(87, 2, 6, 22)).toEqual([{ hour: 21, from: 87, to: 88, first: true, last: false }]);
});
```

- [ ] **Step 3: Uruchom testy — muszą paść**

Run: `make test`
Expected: FAIL dla obu nowych plików.

- [ ] **Step 4: Napisz `src/lib/categories.ts`**

```ts
import type { Category } from './types';

const FALLBACK: Category = { id: '', name: '—', icon: 'circle', color: 'fg-faint', parent: null };

export const catOf = (cats: Category[], id: string): Category =>
  cats.find((c) => c.id === id) ?? { ...FALLBACK, id };

export const topCats = (cats: Category[]) => cats.filter((c) => !c.parent && !c.archived);

export const kids = (cats: Category[], id: string) => cats.filter((c) => c.parent === id && !c.archived);

// Osierocona podkategoria (rodzic usunięty) traktuje siebie jako korzeń,
// zamiast zwracać undefined i wywracać render.
export const rootOf = (cats: Category[], c: Category): Category =>
  (c.parent ? cats.find((x) => x.id === c.parent) : undefined) ?? c;

export const colorOf = (cats: Category[], c: Category) => rootOf(cats, c).color ?? 'fg-faint';

export const iconOf = (cats: Category[], c: Category) => c.icon ?? rootOf(cats, c).icon ?? 'circle';

export const pathOf = (cats: Category[], c: Category) =>
  c.parent ? `${rootOf(cats, c).name} › ${c.name}` : c.name;

// Kolejność do paska tokenów: główne wg pozycji, dzieci tuż za rodzicem.
export function catOrder(cats: Category[]): Map<string, number> {
  const m = new Map<string, number>();
  let i = 0;
  for (const t of topCats(cats)) {
    m.set(t.id, i++);
    for (const k of kids(cats, t.id)) m.set(k.id, i++);
  }
  return m;
}
```

- [ ] **Step 5: Napisz `src/lib/segments.ts`**

```ts
export interface Segment {
  hour: number;    // rząd siatki
  from: number;    // pierwszy kwant segmentu (od północy)
  to: number;      // pierwszy kwant poza segmentem
  first: boolean;  // początek bloku — zaokrąglić lewe rogi
  last: boolean;   // koniec bloku — zaokrąglić prawe rogi
}

// Blok [q, q+len) pocięty na fragmenty mieszczące się w pojedynczych rzędach.
// Blok startujący o :45 daje dwa segmenty w sąsiednich rzędach; zaokrąglone
// są tylko rogi skrajne, więc wizualnie czyta się jako jedna całość.
export function segments(q: number, len: number, startH: number, endH: number): Segment[] {
  const a = q;
  const e = q + len;
  const out: Segment[] = [];
  for (let hour = startH; hour < endH; hour++) {
    const rs = hour * 4;
    const from = Math.max(a, rs);
    const to = Math.min(e, rs + 4);
    if (to <= from) continue;
    out.push({ hour, from, to, first: from === a, last: to === e });
  }
  return out;
}
```

- [ ] **Step 6: Uruchom testy**

Run: `make test` — wszystkie PASS. `make check` — czysto.

- [ ] **Step 7: Commit**

```bash
git add src/lib/categories.ts src/lib/segments.ts test/categories.test.ts test/segments.test.ts
git commit -m "feat: add category hierarchy helpers and block segmentation

Subcategories inherit colour from their parent and may override the icon,
which keeps the palette readable while letting each child be distinguishable.
An orphaned subcategory treats itself as a root rather than returning
undefined, so deleting a parent degrades the display instead of breaking it.

segments() cuts a block into per-row pieces. A block starting at :45 spans
an hour boundary and becomes two segments in adjacent rows, with only the
outer corners rounded so it still reads as one object. Clipping to the
visible window happens here too, so components never compute geometry."
```

---

## Zadanie 6: Magazyn stanu, trwałość i historia

Pierwsze zadanie dotykające Svelte. `state.svelte.ts` jest jedynym miejscem, gdzie żyje
mutowalny stan aplikacji.

**Files:**
- Create: `src/state.svelte.ts`, `test/persist.test.ts`
- Create: `src/lib/persist.ts` (czysta część: odczyt i zapis z obsługą błędów)

**Interfaces:**
- Produces:
  - `persist.ts`: `readJSON<T>(storage, key, fallback): T`, `writeJSON(storage, key, value): boolean`
  - `state.svelte.ts`: `app` (obiekt `$state` z `S`, `prefs`, `viewDay`, `now`), `commit(fn, msg?, undoable?)`, `undo()`, `save()`, `derived` gettery `startH`, `endH`, `hours`, `q0`, `q1`.

- [ ] **Step 1: Napisz testy warstwy trwałości**

```ts
// test/persist.test.ts
import { test, expect } from 'vitest';
import { readJSON, writeJSON } from '../src/lib/persist';

const fake = (init: Record<string, string> = {}, failOnSet = false): Storage => {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => { if (failOnSet) throw new DOMException('QuotaExceededError'); m.set(k, v); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
};

test('readJSON zwraca zapisaną wartość', () => {
  expect(readJSON(fake({ k: '{"a":1}' }), 'k', null)).toEqual({ a: 1 });
});

test('readJSON zwraca wartość zastępczą dla braku klucza', () => {
  expect(readJSON(fake(), 'k', { d: true })).toEqual({ d: true });
});

test('readJSON zwraca wartość zastępczą dla uszkodzonego JSON-a', () => {
  expect(readJSON(fake({ k: '{nie-json' }), 'k', 'fb')).toBe('fb');
});

test('writeJSON zwraca true przy sukcesie', () => {
  const s = fake();
  expect(writeJSON(s, 'k', { a: 1 })).toBe(true);
  expect(s.getItem('k')).toBe('{"a":1}');
});

test('writeJSON zwraca false przy przepełnionym magazynie zamiast rzucać', () => {
  expect(writeJSON(fake({}, true), 'k', { a: 1 })).toBe(false);
});

test('readJSON zwraca wartość zastępczą, gdy magazyn w ogóle nie działa', () => {
  const broken = { getItem() { throw new DOMException('SecurityError'); } } as unknown as Storage;
  expect(readJSON(broken, 'k', 'fb')).toBe('fb');
});
```

- [ ] **Step 2: Uruchom testy — muszą paść**

Run: `make test`
Expected: FAIL — `Cannot find module '../src/lib/persist'`.

- [ ] **Step 3: Napisz `src/lib/persist.ts`**

```ts
// Tryb prywatny potrafi zabronić dostępu do localStorage, a limit ~5 MB
// potrafi go zapełnić. Obie sytuacje muszą kończyć się wartością zastępczą
// albo `false`, nigdy wyjątkiem przy każdej zmianie stanu.
export function readJSON<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const v = storage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(storage: Storage, key: string, value: unknown): boolean {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Napisz `src/state.svelte.ts`**

```ts
import { normalize, uid } from './lib/model';
import { readJSON, writeJSON } from './lib/persist';
import { today } from './lib/time';
import type { Block, Prefs, State } from './lib/types';

const KEY = 'gridday.v1';
const PREF = 'gridday.prefs';

const DEFAULT_PREFS: Prefs = { theme: 'auto', seenHelp: false };

export const app = $state({
  S: normalize(readJSON<unknown>(localStorage, KEY, null)),
  prefs: { ...DEFAULT_PREFS, ...readJSON<Partial<Prefs>>(localStorage, PREF, {}) } as Prefs,
  viewDay: today(),
  now: Date.now(),
  toast: null as { msg: string; undoable: boolean } | null,
});

export const save = () => writeJSON(localStorage, KEY, $state.snapshot(app.S));
export const savePrefs = () => writeJSON(localStorage, PREF, $state.snapshot(app.prefs));

// Widoczne okno doby, wyliczane ze stanu.
export const win = {
  get startH() { return app.S.day.start; },
  get endH() { return app.S.day.end; },
  get hours() { return app.S.day.end - app.S.day.start; },
  get q0() { return app.S.day.start * 4; },
  get q1() { return app.S.day.end * 4; },
};

const history: State[] = [];
const HISTORY_MAX = 50;

export function commit(fn: () => void, msg?: string, undoable = false): void {
  if (undoable) {
    history.push($state.snapshot(app.S) as State);
    if (history.length > HISTORY_MAX) history.shift();
  }
  fn();
  if (!save()) app.toast = { msg: 'Zapis nieudany — zrób kopię zapasową', undoable: false };
  else if (msg) app.toast = { msg, undoable };
}

export function undo(): void {
  const prev = history.pop();
  if (!prev) return;
  app.S = prev;
  save();
  app.toast = { msg: 'Cofnięto', undoable: false };
}

export { uid };

// Zegar: raz na sekundę odświeża `now`, z czego komponenty wyprowadzają
// wskaźnik TERAZ i odliczanie. Blok active po swoim czasie sam się domyka.
export function startClock(): () => void {
  const id = setInterval(() => {
    app.now = Date.now();
    const t = today();
    if (t !== app.viewDay && app.viewDay === todayAtStart) app.viewDay = t;
    autoConfirm();
  }, 1000);
  return () => clearInterval(id);
}

let todayAtStart = today();

function autoConfirm(): void {
  let changed = false;
  for (const b of app.S.blocks) {
    if (b.status === 'active' && qEnd(b) <= app.now) {
      b.status = 'confirmed';
      changed = true;
    }
  }
  if (changed) save();
}

const qEnd = (b: Block) => {
  const [y, m, d] = b.day.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 0, (b.q + b.len) * 15).getTime();
};
```

- [ ] **Step 5: Uruchom testy i sprawdzenie typów**

Run: `make test && make check`
Expected: testy PASS, `svelte-check` bez błędów.

- [ ] **Step 6: Commit**

```bash
git add src/lib/persist.ts src/state.svelte.ts test/persist.test.ts
git commit -m "feat: add the reactive state store with persistence and undo

state.svelte.ts is the single place mutable application state lives. Svelte 5
deep reactivity replaces the prototype's manual save-then-render discipline:
mutating a block re-renders only what depends on it.

Storage access is wrapped because both failure modes are real. Private mode
can forbid localStorage outright, and the ~5MB quota can fill up. Either one
throwing on every state change would take the application down, so reads fall
back and writes return false and surface a toast pointing at the backup.

Undo keeps bounded snapshots rather than an inverse-operation log: the state
is small, and snapshots cannot drift out of sync with the operations."
```

---

## Zadanie 7: Warstwa prezentacji — style, ikony, czcionki

**Files:**
- Create: `src/app.css`, `src/lib/icons.ts`, `src/components/Icon.svelte`
- Modify: `src/main.ts` (importy CSS i czcionek)

**Interfaces:**
- Produces: `icons.ts` eksportuje `ICON_PATHS: Record<string, [number, number, string]>` (szerokość, wysokość, `d`); `Icon.svelte` przyjmuje `name` i `fallback`.

- [ ] **Step 1: Przenieś style z prototypu**

Skopiuj do `src/app.css` zawartość `<style>` z `gridday.html`, **linie 16–400**, zachowując
kolejność sekcji: tokeny (Gruvbox light/dark), baza, nagłówek, siatka, menu radialne, arkusz
i pomoc, toast, responsywność.

Jedna zmiana merytoryczna: usuń reguły `@import`/`@font-face` odnoszące się do Google Fonts —
czcionki przychodzą teraz z `@fontsource` przez `main.ts`.

Style **pozostają globalne**, nie przenosimy ich do `<style>` komponentów. Powód: siatka opiera
się na custom properties dziedziczonych przez wiele poziomów DOM (`--hourw`, `--hours`, `--band`,
`--c`, `--p`), a zakresowanie Svelte dodałoby atrybuty do selektorów i rozerwało tę kaskadę.
Style specyficzne dla pojedynczego komponentu i nieuczestniczące w kaskadzie mogą iść do `<style>`.

- [ ] **Step 2: Napisz `src/lib/icons.ts`**

```ts
// Tylko ikony faktycznie używane. Każdy import to osobny moduł, więc bundler
// wciąga wyłącznie te path-e — zamiast całej biblioteki z CDN-u.
import { faCircle } from '@fortawesome/free-solid-svg-icons/faCircle';
import { faLaptopCode } from '@fortawesome/free-solid-svg-icons/faLaptopCode';
import { faHandsPraying } from '@fortawesome/free-solid-svg-icons/faHandsPraying';
// … pozostałe z listy ICONS w src/lib/model.ts …

import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';

const DEFS: IconDefinition[] = [faCircle, faLaptopCode, faHandsPraying /* … */];

// Nazwy w stanie są w postaci kebab-case ('laptop-code'), tak jak w prototypie.
export const ICON_PATHS: Record<string, [number, number, string]> = Object.fromEntries(
  DEFS.map((d) => [d.iconName, [d.icon[0], d.icon[1], d.icon[4] as string]]),
);
```

Lista musi pokrywać **wszystkie** nazwy z `ICONS` w `model.ts` oraz ikony interfejsu używane
w nagłówku i arkuszach: `wand-magic-sparkles`, `circle-half-stroke`, `sliders`, `keyboard`,
`chevron-left`, `chevron-right`, `xmark`, `trash-can`, `plus`, `arrow-up`, `check`,
`rotate-left`, `download`, `upload`.

- [ ] **Step 3: Napisz `src/components/Icon.svelte`**

```svelte
<script lang="ts">
  import { ICON_PATHS } from '../lib/icons';

  interface Props { name: string; fallback?: string }
  const { name, fallback = '' }: Props = $props();

  const def = $derived(ICON_PATHS[name]);
</script>

{#if def}
  <span class="ic" aria-hidden="true">
    <svg viewBox="0 0 {def[0]} {def[1]}" fill="currentColor"><path d={def[2]} /></svg>
  </span>
{:else}
  <span class="ic ltr" aria-hidden="true">{fallback}</span>
{/if}
```

Zachowanie zastępcze (pierwsza litera nazwy kategorii) jest przeniesione z prototypu — jeśli
ikona nie istnieje, użytkownik widzi literę, a nie pustkę.

- [ ] **Step 4: Podepnij czcionki i style w `main.ts`**

```ts
import '@fontsource/ibm-plex-sans-condensed/400.css';
import '@fontsource/ibm-plex-sans-condensed/500.css';
import '@fontsource/ibm-plex-sans-condensed/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './app.css';

import { mount } from 'svelte';
import App from './App.svelte';

export default mount(App, { target: document.body });
```

- [ ] **Step 5: Weryfikacja**

```bash
make build
grep -rE 'https?://(fonts\.googleapis|fonts\.gstatic|cdnjs)' dist/ && echo "ZNALEZIONO CDN — popraw" || echo "brak odwołań do CDN"
ls -la dist/assets/*.woff2 | head       # czcionki są w bundlu
```

Uruchom `make serve`, odłącz sieć w narzędziach deweloperskich (Network → Offline), przeładuj:
typografia i ikony muszą zostać.

- [ ] **Step 6: Commit**

```bash
git add src/app.css src/lib/icons.ts src/components/Icon.svelte src/main.ts
git commit -m "feat: bundle the stylesheet, icons and fonts

Ports the prototype's stylesheet unchanged and pulls its two CDN dependencies
into the bundle: icons as individually imported SVG path data, fonts via
@fontsource. The built application now makes no third-party requests, which
is what makes offline rendering actually work.

Styles stay global rather than moving into component <style> blocks. The grid
is built on custom properties inherited across several DOM levels, and
Svelte's scoping would rewrite those selectors and break the cascade.

Icon.svelte keeps the prototype's fallback: an unknown icon renders the
category's first letter instead of nothing."
```

---

## Zadanie 8: Siatka

**Files:**
- Create: `src/components/Grid.svelte`, `src/components/HourRow.svelte`, `src/components/Block.svelte`, `src/components/NowIndicator.svelte`
- Modify: `src/App.svelte`

- [ ] **Step 1: `Grid.svelte`**

```svelte
<script lang="ts">
  import { app, win } from '../state.svelte';
  import { occ } from '../lib/occupancy';
  import HourRow from './HourRow.svelte';

  const blocks = $derived(app.S.blocks.filter((b) => b.day === app.viewDay && b.status !== 'discarded'));
  const hours = $derived(Array.from({ length: win.hours }, (_, i) => win.startH + i));
</script>

<div id="grid" style="--hours:{win.hours}">
  {#each hours as hour (hour)}
    <HourRow {hour} {blocks} />
  {/each}
</div>
```

- [ ] **Step 2: `HourRow.svelte`**

Renderuje etykietę godziny z paskiem pory dnia, cztery komórki-kwanty i segmenty bloków
przypadające na ten rząd. Strukturę i nazwy klas przenieś z `gridday.html` (funkcje `render()`
i `segHTML()`, linie 694–746); geometrię liczy `segments()` z zadania 5.

```svelte
<script lang="ts">
  import { app, win } from '../state.svelte';
  import { segments } from '../lib/segments';
  import { bandAt } from '../lib/model';
  import { nowQ } from '../lib/time';
  import type { Block as BlockT } from '../lib/types';
  import Block from './Block.svelte';
  import NowIndicator from './NowIndicator.svelte';

  interface Props { hour: number; blocks: BlockT[] }
  const { hour, blocks }: Props = $props();

  const band = $derived(bandAt(app.S.day.bands, hour));
  const cur = $derived(nowQ(app.viewDay, app.now));
  const isNow = $derived(cur !== null && Math.floor(cur / 4) === hour);

  // Segmenty bloków przypadające na ten rząd.
  const segs = $derived(
    blocks.flatMap((b) =>
      segments(b.q, b.len, win.startH, win.endH)
        .filter((s) => s.hour === hour)
        .map((s) => ({ block: b, seg: s })),
    ),
  );
</script>

<div class="row" class:is-now={isNow} class:band-start={band?.from === hour} style="--band:var(--{band?.color ?? 'fg-faint'})">
  <div class="hour">
    <span class="h">{String(hour).padStart(2, '0')}:00</span>
    {#if band?.from === hour}<span class="bn">{band.name}</span>{/if}
  </div>

  {#each [0, 1, 2, 3] as i (i)}
    <button class="cell" data-q={hour * 4 + i} aria-label="{hour}:{String(i * 15).padStart(2, '0')}"></button>
  {/each}

  {#each segs as { block, seg } (block.id + ':' + seg.from)}
    <Block {block} {seg} />
  {/each}

  {#if isNow}<NowIndicator />{/if}
</div>
```

- [ ] **Step 3: `Block.svelte` i `NowIndicator.svelte`**

`Block.svelte` pozycjonuje segment w kolumnach `grid-column: {from % 4 + 2} / span {to - from}`,
nakłada klasy `st-{status}`, `stale` (blok `planned`, którego czas minął) i `hl` (podświetlenie
przy `hover` drugiego segmentu), oraz renderuje ikonę kategorii, tytuł i — dla bloku `active` —
odliczanie. Wzorzec znaczników i klas: `gridday.html`, funkcja `blockHTML()`, linie 701–716.

`NowIndicator.svelte` to pionowa linia z pulsującym punktem, pozycjonowana `left: {minuta/60 * 100}%`
w obszarze kwantów rzędu.

- [ ] **Step 4: Weryfikacja wizualna**

`make dev`, następnie sprawdź:

1. Siatka wypełnia dokładnie wysokość okna, bez paska przewijania, przy oknie 06:00–22:00.
2. Zmień rozmiar okna na wysokość 400 px — nadal brak przewijania, rzędy się kurczą.
3. Na telefonie (lub w emulacji) pasek adresu nie rozcina siatki.
4. Blok 08:00–08:30 zajmuje dwa pierwsze kwanty rzędu 08 i ma zaokrąglone wszystkie rogi.
5. Blok 08:45–09:15 daje dwa segmenty; najechanie kursorem podświetla oba jednocześnie.
6. Wskaźnik TERAZ stoi w rzędzie bieżącej godziny, we właściwym miejscu w poziomie.
7. Przełącz motyw systemowy na jasny i ciemny — paleta podąża.

- [ ] **Step 5: Commit**

```bash
git add src/components/Grid.svelte src/components/HourRow.svelte src/components/Block.svelte src/components/NowIndicator.svelte src/App.svelte
git commit -m "feat: port the grid, blocks and now indicator

The container sizes itself with flex rather than calc(100dvh - header), so a
mobile address bar collapsing does not cut the last row off.

Geometry comes from segments() in lib/, not from the components. A block
starting at :45 arrives as two pre-computed segments that render in adjacent
rows and highlight together on hover, which is why nothing here does
arithmetic on quanta."
```

---

## Zadanie 9: Nagłówek i pasek tokenów

**Files:**
- Create: `src/components/Header.svelte`, `src/components/TokenPips.svelte`, `src/lib/stats.ts`, `test/stats.test.ts`
- Modify: `src/App.svelte`

**Interfaces:**
- Produces: `stats.ts`: `tokenStats(blocks, day, cats, q0, q1): { done: string[]; plan: string[]; usedQ: number; totalQ: number }` — listy kolorów kwantów w kolejności kategorii.

- [ ] **Step 1: Napisz testy statystyk**

```ts
// test/stats.test.ts
import { test, expect } from 'vitest';
import { tokenStats } from '../src/lib/stats';
import type { Block, Category, Status } from '../src/lib/types';

const cats: Category[] = [
  { id: 'work', name: 'Praca', icon: 'laptop-code', color: 'yellow', parent: null },
  { id: 'rest', name: 'Odpoczynek', icon: 'mug-hot', color: 'aqua', parent: null },
];
const blk = (id: string, q: number, len: number, cat: string, status: Status): Block =>
  ({ id, day: '2026-09-24', q, len, cat, title: '', status, created: 0 });

test('zlicza kwanty wykonane i zaplanowane osobno', () => {
  const s = tokenStats([blk('a', 32, 2, 'work', 'confirmed'), blk('b', 40, 4, 'rest', 'planned')],
    '2026-09-24', cats, 24, 88);
  expect(s.done).toEqual(['yellow', 'yellow']);
  expect(s.plan).toEqual(['aqua', 'aqua', 'aqua', 'aqua']);
  expect(s.usedQ).toBe(6);
  expect(s.totalQ).toBe(64);
});

test('blok active liczy się jako wykonany', () => {
  expect(tokenStats([blk('a', 32, 2, 'work', 'active')], '2026-09-24', cats, 24, 88).done).toHaveLength(2);
});

test('bloki discarded i z innego dnia są pomijane', () => {
  const s = tokenStats([blk('a', 32, 2, 'work', 'discarded')], '2026-09-24', cats, 24, 88);
  expect(s.usedQ).toBe(0);
});

test('część bloku poza oknem nie jest liczona', () => {
  const s = tokenStats([blk('a', 22, 4, 'work', 'confirmed')], '2026-09-24', cats, 24, 88);
  expect(s.usedQ).toBe(2);   // widoczne tylko kwanty 24 i 25
});

test('pusty dzień daje zero z poprawną pojemnością', () => {
  const s = tokenStats([], '2026-09-24', cats, 24, 88);
  expect(s.usedQ).toBe(0);
  expect(s.totalQ).toBe(64);
});
```

- [ ] **Step 2: Uruchom testy — muszą paść**, potem napisz `src/lib/stats.ts` i komponenty.

`Header.svelte`: nawigacja dni (`‹` / `›`), przycisk daty wracający na dziś (klasa `is-today`),
`TokenPips.svelte` pośrodku, po prawej przyciski sugestii, motywu, ustawień i pomocy.
Znaczniki i klasy: `gridday.html`, funkcja `renderHeader()`, linie 747–784.

- [ ] **Step 3: Weryfikacja**

1. Nagłówek ma stałą wysokość, siatka pod nim nadal wypełnia resztę okna.
2. Strzałki przesuwają dzień; data w innym dniu niż dziś zmienia kolor.
3. Pasek pipsów pokazuje tyle segmentów, ile kwantów ma widoczne okno.
4. Dodanie bloku natychmiast zmienia licznik i kolor odpowiedniego pipsa.

- [ ] **Step 4: Commit**

```bash
git add src/lib/stats.ts src/components/Header.svelte src/components/TokenPips.svelte test/stats.test.ts src/App.svelte
git commit -m "feat: port the header and the token bar

tokenStats counts only the quanta inside the visible window, so narrowing the
day narrows the denominator too and the ratio stays honest.

Active blocks count as done rather than planned: time being spent right now
has already been committed, and showing it as a plan would make the bar jump
backwards the moment a block completes."
```

---

## Zadanie 10: Menu radialne i tworzenie bloków

**Files:**
- Create: `src/components/RadialMenu.svelte`, `src/lib/actions.ts`, `test/actions.test.ts`
- Modify: `src/components/HourRow.svelte` (obsługa kliknięcia komórki), `src/App.svelte`

**Interfaces:**
- Produces: `actions.ts` — czyste funkcje operujące na `State`: `createAt(state, day, q, catId, now): State | null`, `advance(state, id, now): State`, `removeBlock(state, id): State`, `suggestFromLastWeek(state, day): { state: State; added: number }`.

- [ ] **Step 1: Napisz testy akcji**

Pokryj: status nadawany wg relacji do teraz (`past → confirmed`, `now → active`, `future → planned`),
że `createAt` nie tworzy bloku na zajętym kwancie, że uruchomienie nowego bloku `active` domyka
poprzedni, że `removeBlock` zamienia `suggested` na `discarded` zamiast kasować, że
`suggestFromLastWeek` pomija sloty zajęte i wcześniej odrzucone.

- [ ] **Step 2: Napisz `src/lib/actions.ts`** — funkcje czyste, przyjmują i zwracają stan.

- [ ] **Step 3: Napisz `RadialMenu.svelte`**

Ikony kategorii na okręgu wokół punktu kliknięcia; promień `max(finePointer ? 66 : 60, n * 52 / (2π))`,
pozycja przycięta do okna. Drugi poziom dla podkategorii. Wzorzec: `gridday.html`, linie 804–849.

- [ ] **Step 4: Weryfikacja**

1. Klik w pustą komórkę w przeszłości → menu → wybór kategorii → blok `confirmed`.
2. Klik w komórkę obejmującą teraz → blok `active` z odliczaniem w tytule karty.
3. Klik w przyszłości → blok `planned`.
4. Menu przy krawędzi ekranu nie wychodzi poza widok.
5. Kategoria z podkategoriami otwiera drugi poziom.
6. Klik poza menu zamyka je bez tworzenia bloku.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions.ts src/components/RadialMenu.svelte test/actions.test.ts src/components/HourRow.svelte src/App.svelte
git commit -m "feat: port the radial menu and block creation

A click's meaning comes from when it lands: past creates a confirmed block,
now starts a running one, future plans it. That is the whole interaction
model, so it lives in pure functions in lib/actions.ts with tests, not in the
component that happens to receive the click.

Deleting a suggestion marks it discarded instead of removing it, so a
re-import or a fresh round of suggestions does not resurrect something the
user already rejected."
```

---

## Zadanie 11: Arkusz edycji, toast i klawiatura

**Files:**
- Create: `src/components/EditSheet.svelte`, `src/components/Toast.svelte`, `src/components/Help.svelte`, `src/lib/keys.ts`, `test/keys.test.ts`
- Modify: `src/App.svelte`

- [ ] **Step 1: `EditSheet.svelte`** — nazwa bloku, wybór kategorii i podkategorii, przyciski
zmiany statusu zależne od relacji do teraz, usunięcie. Wzorzec: `gridday.html`, linie 850–917.

- [ ] **Step 2: `Toast.svelte`** — komunikat z opcjonalną akcją „Cofnij", znika po czasie;
czyta `app.toast`.

- [ ] **Step 3: `src/lib/keys.ts` + `test/keys.test.ts`** — mapa klawiszy na akcje, funkcja
czysta `keyAction(key, ctx): Action | null`. Ruch `hjkl` i strzałkami (`±1` w poziomie, `±4`
w pionie), cyfry 1–9 przypisują kategorię, `u` cofa, `?` otwiera pomoc, `Escape` zamyka.

Napisz testy **przed** implementacją. Pokryj: każdy kierunek ruchu, przycięcie kursora do
zakresu `[Q0, Q1)` na krawędziach, cyfrę bez odpowiadającej kategorii (musi dać `null`, nie
wyjątek), oraz to, że przy otwartym menu lub arkuszu ruch kursora jest wyłączony, a `Escape`
zamyka wierzchnią warstwę.

- [ ] **Step 4: `Help.svelte`** — ekran pomocy pokazywany przy pierwszym uruchomieniu
(`prefs.seenHelp`), treść z `gridday.html`, linie 1146–1175.

- [ ] **Step 5: Weryfikacja**

1. Podwójny klik w blok otwiera arkusz; zmiana nazwy i kategorii zapisuje się.
2. Usunięcie bloku pokazuje toast z „Cofnij"; cofnięcie przywraca blok.
3. `hjkl` przesuwa kursor, cyfra przypisuje kategorię w miejscu kursora.
4. `Escape` zamyka menu, arkusz i pomoc.
5. Pierwsze uruchomienie w czystej przeglądarce pokazuje pomoc; drugie już nie.

- [ ] **Step 6: Commit**

```bash
git add src/components/EditSheet.svelte src/components/Toast.svelte src/components/Help.svelte src/lib/keys.ts src/App.svelte
git commit -m "feat: port the edit sheet, toasts, help and keyboard control

Key handling is a pure function from key plus context to an action, so the
bindings are testable and the component only dispatches what it is told.

The toast doubles as the undo affordance: destructive actions report what
they did and offer to reverse it, which is cheaper than a confirmation
dialog for anything that can actually be undone."
```

---

## Zadanie 12: Ustawienia — kategorie i dzień

**Files:**
- Create: `src/components/settings/Settings.svelte`, `src/components/settings/CategoriesTab.svelte`, `src/components/settings/DayTab.svelte`
- Modify: `src/App.svelte`

- [ ] **Step 1: `Settings.svelte`** — powłoka z zakładkami, stan roboczy (`draft`) kopiowany
przy otwarciu i zapisywany dopiero przyciskiem. Wzorzec: `gridday.html`, linie 918–947.

Edycja pracuje na kopii, nie na stanie na żywo. Bez tego zmiana koloru kategorii przemalowuje
siatkę pod arkuszem przy każdym kliknięciu, a „Anuluj" nie ma czego cofać.

- [ ] **Step 2: `CategoriesTab.svelte`** — lista kategorii głównych i podkategorii, zmiana
nazwy, ikony i koloru, kolejność (`moveUp` przesuwa kategorię razem z dziećmi), dodawanie
i usuwanie z limitami `MAX_TOP` i `MAX_KIDS`. Wzorzec: `gridday.html`, linie 948–1009 i 1040–1049.

- [ ] **Step 3: `DayTab.svelte`** — godzina początku i końca doby, pory dnia z kolorami,
podgląd układu, przywrócenie domyślnych. Wzorzec: `gridday.html`, linie 1010–1039.

- [ ] **Step 4: Weryfikacja**

1. Zmiana nazwy kategorii i „Zapisz" — siatka i menu radialne pokazują nową nazwę.
2. Zmiana koloru i „Anuluj" — nic się nie zmienia.
3. Usunięcie kategorii głównej usuwa też jej podkategorie.
4. Zwężenie doby do 08:00–16:00 chowa wcześniejsze bloki; rozszerzenie z powrotem je przywraca.
5. Dodanie pory dnia zmienia pasek koloru przy etykietach godzin.
6. Limit 9 kategorii głównych blokuje przycisk dodawania.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings src/App.svelte
git commit -m "feat: port the categories and day settings

Both tabs edit a draft copied on open and applied on save. Editing live state
would repaint the grid under the panel on every keystroke and leave Cancel
with nothing to restore.

Narrowing the day hides blocks outside the new window without deleting them,
so widening it again brings them back."
```

---

## Zadanie 13: Kopia zapasowa

**Files:**
- Create: `src/lib/backup.ts`, `src/components/settings/DataTab.svelte`, `test/backup.test.ts`
- Modify: `src/components/settings/Settings.svelte` (trzecia zakładka)

**Interfaces:**
- Produces: `bundleExport(state: State, prefs: Prefs, nowMs: number): string`, `bundleParse(text: string): { state: State; prefs: Prefs }` (rzuca `Error` z komunikatem po polsku).

- [ ] **Step 1: Napisz testy**

```ts
// test/backup.test.ts
import { test, expect } from 'vitest';
import { bundleExport, bundleParse } from '../src/lib/backup';
import { normalize } from '../src/lib/model';

const sample = () => normalize({
  v: 2,
  cats: [{ id: 'work', name: 'Praca', icon: 'laptop-code', color: 'yellow', parent: null }],
  blocks: [{ id: 'a1', day: '2026-09-24', q: 32, len: 2, cat: 'work', title: 'Spotkanie', status: 'confirmed', created: 1758700000000 }],
  day: { start: 6, end: 22, bands: [{ id: 'b1', name: 'Praca', from: 8, color: 'yellow' }] },
});

test('pełny obieg zachowuje bloki, kategorie, dzień i preferencje', () => {
  const back = bundleParse(bundleExport(sample(), { theme: 'dark', seenHelp: true }, 0));
  expect(back.state.blocks).toEqual(sample().blocks);
  expect(back.state.day.start).toBe(6);
  expect(back.prefs.theme).toBe('dark');
});

test('eksport zapisuje datę z podanego zegara', () => {
  const o = JSON.parse(bundleExport(sample(), { theme: 'auto', seenHelp: true }, Date.UTC(2026, 8, 24, 10)));
  expect(o.exported).toBe('2026-09-24T10:00:00.000Z');
});

test('import przepuszcza starszą wersję schematu przez normalize', () => {
  const old = JSON.stringify({ magic: 'gridday.backup', state: {
    v: 1, cats: [{ id: 'x', name: 'X', icon: 'circle', color: 'red', parent: null }],
    blocks: [{ id: 'a', day: '2026-09-24', q: 0, len: 2, cat: 'x', title: '', status: 'confirmed', created: 0 }] } });
  const back = bundleParse(old);
  expect(back.state.v).toBe(2);
  expect(back.state.blocks[0]!.q).toBe(24);
});

test('nie-JSON daje czytelny błąd', () => {
  expect(() => bundleParse('<html>Zaloguj się</html>')).toThrow(/poprawnym JSON/);
});

test('obcy JSON jest odrzucany po znaczniku', () => {
  expect(() => bundleParse('{"foo":1}')).toThrow(/kopia zapasowa GridDay/);
});

test('kopia bez tablicy bloków jest odrzucana', () => {
  expect(() => bundleParse('{"magic":"gridday.backup","state":{"v":2}}')).toThrow(/nie zawiera bloków/);
});

test('brak preferencji w pliku daje domyślne', () => {
  const back = bundleParse('{"magic":"gridday.backup","state":{"v":2,"cats":[],"blocks":[]}}');
  expect(back.prefs.theme).toBe('auto');
});
```

- [ ] **Step 2: Uruchom testy — muszą paść**, potem napisz `src/lib/backup.ts`:

```ts
import { normalize } from './model';
import type { Prefs, State } from './types';

const MAGIC = 'gridday.backup';
const PREFS_DEFAULT: Prefs = { theme: 'auto', seenHelp: true };

// Zegar jest parametrem, nie Date.now() w środku, żeby wynik dał się porównać w teście.
export function bundleExport(state: State, prefs: Prefs, nowMs: number): string {
  return JSON.stringify({ magic: MAGIC, exported: new Date(nowMs).toISOString(), state, prefs }, null, 2);
}

export function bundleParse(text: string): { state: State; prefs: Prefs } {
  let o: unknown;
  try { o = JSON.parse(text); } catch { throw new Error('Plik nie jest poprawnym JSON-em'); }
  const b = o as { magic?: string; state?: { blocks?: unknown }; prefs?: Partial<Prefs> };
  if (!b || typeof b !== 'object' || b.magic !== MAGIC) throw new Error('To nie jest kopia zapasowa GridDay');
  if (!b.state || !Array.isArray(b.state.blocks)) throw new Error('Kopia nie zawiera bloków');
  return { state: normalize(b.state), prefs: { ...PREFS_DEFAULT, ...(b.prefs ?? {}) } };
}
```

`seenHelp` domyślnie `true`: przywrócenie kopii to nie pierwsze uruchomienie, więc ekran
powitalny byłby zgrzytem.

- [ ] **Step 3: Napisz `DataTab.svelte`**

Liczba bloków i dni w pamięci, zdanie o tym, że dane żyją wyłącznie w tej przeglądarce,
przycisk pobrania (Blob + `<a download>`) i wczytania (`<input type="file">` czyszczony po
wyborze, żeby ten sam plik dało się wybrać ponownie). Wczytanie pyta o potwierdzenie —
zastępuje cały stan i kasuje historię undo, więc toast z cofnięciem byłby kłamstwem.

- [ ] **Step 4: Weryfikacja**

1. Dodaj bloki → pobierz kopię → plik `gridday-RRRR-MM-DD.json` otwiera się jako JSON.
2. Usuń wszystko → wczytaj kopię → bloki wracają.
3. Wybierz ten sam plik drugi raz → dialog pojawia się ponownie.
4. Wczytaj obcy `.json` → komunikat „To nie jest kopia zapasowa GridDay", stan nietknięty.
5. Anuluj potwierdzenie → stan nietknięty.
6. Motyw ciemny → eksport → motyw jasny → import → motyw wraca na ciemny.

- [ ] **Step 5: Commit**

```bash
git add src/lib/backup.ts src/components/settings/DataTab.svelte test/backup.test.ts src/components/settings/Settings.svelte
git commit -m "feat: add JSON backup and restore

The only safeguard a localStorage-only application can offer: clearing site
data destroys everything, and there is no server copy. The Data tab says so
plainly rather than leaving the user to find out.

Validation separates three failure modes -- not JSON, not a GridDay backup,
and a backup missing its blocks -- because a single generic message leaves
the user guessing which file they picked.

Restore asks for confirmation since it cannot be undone: replacing the state
also discards the undo history.

The exported bundle is the input format for the future database importer."
```

---

## Zadanie 14: Wdrożenie na GitHub Pages i usunięcie prototypu

**Files:**
- Create: `.github/workflows/pages.yml`, `README.md`
- Delete: `gridday.html`

- [ ] **Step 1: Workflow**

```yaml
name: Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm run test
      - run: npm run build
        env:
          BASE_PATH: /gridday/
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Sprawdzenie typów i testy stoją **przed** budową i wdrożeniem. Statyczny hosting nie daje
mechanizmu wycofania innego niż kolejne wdrożenie, więc jedyny moment, w którym można coś
zatrzymać, jest tutaj.

- [ ] **Step 2: Włącz Pages w repozytorium**

Settings → Pages → Source: **GitHub Actions**. Bez tego workflow zbuduje artefakt i padnie
przy wdrożeniu.

- [ ] **Step 3: Napisz `README.md`**

Krótko: czym jest GridDay, jak wejść w środowisko (`nix develop` lub `nix-shell`), tabela celów
Make, adres wdrożonej witryny, zdanie o tym, że dane żyją w `localStorage` i kopia zapasowa to
jedyne zabezpieczenie, oraz wskazanie `PLAN.md` jako specyfikacji.

- [ ] **Step 4: Sprawdź parzystość i usuń prototyp**

Otwórz obok siebie `gridday.html` (przez `python3 -m http.server`) i `make serve`. Przejdź listę:

1. Siatka bez przewijania, wskaźnik TERAZ, odliczanie aktywnego bloku.
2. Menu radialne: dwa poziomy, pozycjonowanie przy krawędziach.
3. Tworzenie bloków w przeszłości, teraz i przyszłości.
4. Arkusz edycji: nazwa, kategoria, zmiana statusu, usunięcie.
5. Undo przez toast i klawiszem.
6. Klawiatura: `hjkl`, cyfry, `Escape`.
7. Ustawienia: kategorie (ikona, kolor, kolejność, podkategorie), dzień (godziny, pory).
8. Sugestie z zeszłego tygodnia.
9. Motyw jasny, ciemny i automatyczny.
10. Ekran pomocy przy pierwszym uruchomieniu.
11. Zachowanie na wąskim ekranie.

Dopiero gdy wszystkie punkty się zgadzają:

```bash
git rm gridday.html
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/pages.yml README.md
git commit -m "ci: deploy to GitHub Pages and retire the prototype

The workflow type-checks and tests before building, because static hosting
has no rollback other than the next deployment -- this is the only point
where a bad build can still be stopped.

BASE_PATH is /gridday/ for the deployed project site and / for local work,
which the Makefile sets.

Removes gridday.html. It was kept through the port as the reference for
behaviour and styling, and its history stays in git; the checklist in the
plan confirmed parity before this deletion."
```

---

## Stan po wykonaniu planu

- Projekt Svelte 5 + TypeScript z odtwarzalnym środowiskiem Nix i Makefile'em jako jedynym interfejsem.
- Testy jednostkowe całej warstwy `src/lib/`, uruchamiane przez `make test`.
- Aplikacja na parzystości funkcjonalnej z prototypem, wdrażana automatycznie na GitHub Pages.
- Zero zewnętrznych żądań sieciowych, działanie offline po wczytaniu.
- Kopia zapasowa JSON jako zabezpieczenie danych i format wejściowy przyszłego importera.

**Następne tematy**, każdy z własnym projektem i planem: integracja iCalendar (`PLAN.md` §9 —
zaczyna się od decyzji, skąd wziąć `.ics` na statycznym hostingu), raporty tygodniowe
i miesięczne, PWA z service workerem.
