# Diurnus — specyfikacja projektu

**Diurnus** to aplikacja do kwantowania doby na 15-minutowe tokeny: cała aktywna część dnia
mieści się w jednym oknie przeglądarki (`100dvh`, zero scrollowania), a każdy blok czasu jest
jednym kliknięciem oznaczany jako zaplanowany, trwający lub wykonany.

> **Faza obecna: statyczna aplikacja kliencka.**
> Svelte 5 + TypeScript + Vite, budowana do statycznych plików i serwowana z GitHub Pages.
> Brak backendu — stan żyje w `localStorage` przeglądarki.
>
> To rozwiązanie jest **tymczasowe**. Docelowo (§10) aplikacja dostanie backend, bazę danych
> i logowanie Google OAuth. Wszystkie decyzje w fazie obecnej mają jeden twardy wymóg:
> **nie zabetonować drogi do tamtej fazy** — stąd wersjonowany schemat stanu i eksport JSON
> jako kontrakt migracji.

## Historia projektu

Punktem wyjścia był prototyp `diurnus.html` — jeden samowystarczalny plik vanilla JS
(~1380 linii), który zrealizował cały silnik siatki i warstwę interakcji. Prototyp jest
**dowodem, że mechanika działa**; ten dokument opisuje przeniesienie jej do projektu, który
da się rozwijać, testować i wdrażać. Prototyp pozostaje w historii gita jako odniesienie przy
porcie — jego CSS i matematyka siatki są dopracowane i przenoszone, a nie projektowane od nowa.

---

## 1. Stos technologiczny

| Warstwa | Wybór | Uzasadnienie |
|---|---|---|
| Framework | **Svelte 5** (runy) | kompiluje się do zwykłych operacji na DOM — do bundla nie trafia żaden runtime frameworka; najmniejszy wynik z rozważanych opcji |
| Język | **TypeScript** | koszt wyłącznie build-time; model stanu i przyszły parser iCal są tego warte |
| Bundler | **Vite 6** | natywny dla Svelte, `base` konfigurowalny pod ścieżkę GitHub Pages |
| Style | **czysty CSS** + custom properties | paleta i matematyka siatki z prototypu są dopracowane; Tailwind nic tu nie wnosi |
| Ikony | **tree-shaken SVG** | ~38 ikon faktycznie używanych, importowanych pojedynczo |
| Czcionki | **`@fontsource` (self-hosted)** | IBM Plex Mono / Sans Condensed serwowane z własnego originu |
| Testy | **Vitest** | zwykłe `import` z `src/lib/`, bez żadnych sztuczek |
| Środowisko | **Nix** (flake + `shell.nix`) | odtwarzalna wersja Node bez globalnych instalacji |
| Zadania | **Makefile** | jedyny interfejs, jaki trzeba pamiętać |
| Hosting | **GitHub Pages** | statyczny, darmowy, bez serwera |

### Zero zewnętrznych żądań sieciowych

Prototyp ładował FontAwesome i IBM Plex z CDN-ów. W zbudowanej aplikacji **obie zależności są
wciągane do bundla**. To nie jest kosmetyka: strona na Pages z zewnętrznymi CDN-ami wykonuje
żądania do stron trzecich przy każdym wejściu i traci ikony oraz typografię w trybie offline.
Po porcie aplikacja nie odpytuje żadnego obcego hosta.

---

## 2. Struktura projektu

```
diurnus/
├── flake.nix, flake.lock, shell.nix      # środowisko deweloperskie
├── Makefile                              # dev / build / serve / test / check / fmt / clean
├── package.json, vite.config.ts, tsconfig.json, svelte.config.js
├── .github/workflows/pages.yml           # budowa i wdrożenie
├── index.html
├── src/
│   ├── main.ts
│   ├── App.svelte
│   ├── app.css                           # tokeny motywu, reset, warstwa globalna
│   ├── lib/                              # czysta logika — zero importów ze Svelte
│   │   ├── types.ts                      # State, Block, Category, Band, Status
│   │   ├── time.ts                       # dayKey, qTime, fmtQ, nowQ, rel, shiftDay
│   │   ├── model.ts                      # normalize() + migracje schematu
│   │   ├── occupancy.ts                  # occ(), fit(), overlaps()
│   │   ├── categories.ts                 # rootOf, colorOf, iconOf, pathOf, catOrder
│   │   ├── segments.ts                   # blok → segmenty per godzina (przełamanie :45 → :15)
│   │   ├── stats.ts                      # zliczanie tokenów do paska nagłówka
│   │   ├── backup.ts                     # eksport/import JSON
│   │   └── icons.ts                      # mapa nazwa → komponent SVG
│   ├── state.svelte.ts                   # $state, trwałość, historia undo, zegar
│   └── components/
│       ├── Header.svelte, TokenPips.svelte
│       ├── Grid.svelte, HourRow.svelte, Block.svelte, NowIndicator.svelte
│       ├── RadialMenu.svelte, EditSheet.svelte, Toast.svelte, Help.svelte
│       └── settings/{Settings,CategoriesTab,DayTab,DataTab}.svelte
└── test/                                 # Vitest, jeden plik na moduł z lib/
```

**Granica jest jedna i twarda: `src/lib/` nie importuje niczego ze Svelte.** Każdy moduł
przyjmuje dane i zwraca dane. Dzięki temu testuje się go zwykłym `import`, bez DOM i bez
renderera — a gdy wróci temat iCal, parser ma gotowe, naturalne miejsce.

Komponenty odpowiadają wyłącznie za render i podpięcie zdarzeń. Jeśli komponent zaczyna
liczyć, logika należy do `lib/`.

---

## 3. Środowisko deweloperskie

### Nix

`flake.nix` z przypiętym nixpkgs (odtwarzalność przez `flake.lock`) dostarcza Node 22 i nic
poza tym — menedżerem pakietów jest `npm`, który przychodzi razem z Node. `shell.nix` jest
cienką nakładką zgodności, więc `nix-shell` działa bez włączonych funkcji eksperymentalnych.

### Makefile

Jedyny interfejs, jaki trzeba pamiętać. Każdy cel jest opakowaniem skryptu z `package.json`,
z automatyczną instalacją zależności, gdy `node_modules` jest nieaktualne.

| Cel | Działanie |
|---|---|
| `make dev` | serwer deweloperski z HMR na `http://localhost:5173/` |
| `make build` | produkcyjna budowa do `dist/` |
| `make serve` | podgląd zbudowanej aplikacji lokalnie |
| `make test` | Vitest, jednorazowo |
| `make check` | `svelte-check` + `tsc --noEmit` |
| `make fmt` | Prettier z wtyczką do Svelte |
| `make clean` | usuwa `dist/` i `node_modules/` |

---

## 4. Model danych

Źródłem prawdy jest jeden obiekt pod kluczem `localStorage['diurnus.v1']`. Kluczowa decyzja:
**`q` to indeks kwantu 15-minutowego liczony od północy** (0–95, `QDAY = 96`), a nie od
początku widocznego okna — zmiana godzin pracy dnia nie przesuwa istniejących danych.

```ts
// src/lib/types.ts
export const QDAY = 96;

export type Status = 'suggested' | 'planned' | 'active' | 'confirmed' | 'discarded';

export interface Category {
  id: string;
  name: string;
  icon: string | null;        // null = dziedzicz z kategorii nadrzędnej
  color?: string;             // tylko kategorie główne; podkategorie dziedziczą
  parent: string | null;
  archived?: boolean;
}

export interface Band {                 // pora dnia; trwa do `from` następnej
  id: string; name: string; from: number; color: string;
}

export interface Block {
  id: string;
  day: string;                // 'YYYY-MM-DD', czas lokalny
  q: number;                  // 0–95, kwant od północy
  len: number;                // długość w kwantach
  cat: string;
  title: string;
  status: Status;
  created: number;
}

export interface State {
  v: number;                              // wersja schematu; migracje w normalize()
  cats: Category[];
  day: { start: number; end: number; bands: Band[] };
  blocks: Block[];
}

export interface Prefs { theme: 'auto' | 'light' | 'dark'; seenHelp: boolean; }
```

Uwaga na dwie różne „wersje": **`diurnus.v1` to nazwa klucza** w `localStorage` (nigdy się nie
zmienia), a **`State.v` to wersja schematu** danych pod tym kluczem.

### Niezmienniki

- **Brak nakładania się bloków** — egzekwowane przez `occ(blocks, day)` (tablica 96 slotów →
  blok) i `fit(occ, q)` (największy wolny wycinek ≤ 2 kwanty od `q`). To klienckie zastąpienie
  ograniczenia `EXCLUDE USING gist` z fazy docelowej.
- **Jeden blok `active` naraz.**
- **Bloki `discarded` nie znikają** — pamiętają, że użytkownik odrzucił sugestię w tym slocie.
- **`normalize()` jest jedynym wejściem stanu.** Każda zmiana kształtu = bump `v` + migracja.
  To kontrakt, który przeniesie dane do bazy w fazie docelowej.

---

## 5. Matematyka siatki

`START_H`, `END_H`, `HOURS`, `Q0`, `Q1` wyliczane z `state.day`:

```
HOURS = END_H - START_H              // domyślnie 16
Q0    = START_H * 4                  // pierwszy widoczny kwant (24 dla 06:00)
Q1    = END_H * 4                    // pierwszy kwant poza oknem (88 dla 22:00)
```

- **Kontener:** `flex:1; min-height:0; display:grid; grid-template-rows:repeat(var(--hours),minmax(0,1fr))`.
  Bez `calc(100dvh - …)` — flex sam rozdziela resztę wysokości po nagłówku, co poprawnie
  reaguje na chowający się pasek adresu na mobile.
- **Rząd:** `grid-template-columns: var(--hourw) repeat(4, minmax(0,1fr))`.
- **Segmenty bloku:** dla bloku `[q, q+len)` i rzędu godziny `h` liczone jest przecięcie
  `[max(q, h*4), min(q+len, h*4+4))`. Niepuste przecięcie → jeden segment. Blok startujący
  o `:45` daje dwa segmenty w dwóch rzędach; zaokrąglone są tylko rogi skrajne, a `hover`
  podświetla oba przez wspólny identyfikator bloku. Wylicza to `lib/segments.ts`.
- **Wskaźnik TERAZ:** rząd = `floor(nowQ()/4) - START_H`, przesunięcie poziome = `minuta/60`.

---

## 6. Interakcja

Kliknięcie w komórkę zależy od relacji do czasu systemowego:

| Kiedy | Komórka pusta | Blok istniejący |
|---|---|---|
| Przeszłość | menu radialne → `confirmed` | klik akceptuje sugestię |
| Teraz | menu radialne → `active` (odliczanie) | klik uruchamia |
| Przyszłość | menu radialne → `planned` | klik akceptuje |

- **Menu radialne:** ikony kategorii ułożone w okręgu wokół kursora, promień skalowany liczbą
  pozycji; drugi poziom dla podkategorii. Wybór = natychmiastowy zapis i zamknięcie.
- **Edycja:** podwójny klik / długie przytrzymanie otwiera arkusz z nazwą, kategorią i usunięciem.
- **Klawiatura:** `hjkl` i strzałki poruszają kursorem, cyfry 1–9 przypisują kategorię, `u` cofa.
- **Undo:** stos migawek stanu; toast z akcją cofnięcia.
- **Zegar:** blok `active`, którego czas minął, sam staje się `confirmed`. Wskaźnik TERAZ
  przelicza się co minutę, odliczanie aktywnego bloku co sekundę.

---

## 7. Budowa i wdrożenie

### Ścieżka bazowa

Witryna projektowa żyje pod `https://<użytkownik>.github.io/diurnus/`, więc Vite musi budować
z `base: '/diurnus/'`. Pomyłka tutaj daje stronę, która ładuje HTML i zwraca 404 na każdy
zasób — klasyczne „lokalnie działa, na produkcji biała strona".

`base` bierze się ze zmiennej `BASE_PATH`, którą ustawia Makefile: `/` dla `make dev` i
`make serve`, `/diurnus/` dla budowy wdrożeniowej. Domena własna albo repozytorium nazwane
`<użytkownik>.github.io` znosi ten problem — wtedy `BASE_PATH=/`.

### Workflow

`.github/workflows/pages.yml` na push do `main`: instalacja zależności, `npm run check`,
`npm run test`, `npm run build` z `BASE_PATH=/diurnus/`, wdrożenie przez `actions/deploy-pages`.
Budowa wchodzi na Pages **tylko gdy testy i sprawdzenie typów przejdą** — statyczny hosting nie
daje żadnego mechanizmu wycofania poza kolejnym wdrożeniem.

---

## 8. Testy

Vitest, jeden plik testowy na moduł z `src/lib/`. Zakres celowo wąski i szczery:

- **Pokryte:** `time`, `model` (migracje), `occupancy`, `categories`, `segments`, `stats`, `backup`.
- **Niepokryte testami automatycznymi:** komponenty Svelte. Warstwa wizualna tej aplikacji to
  matematyka CSS Grid, której test jednostkowy i tak by nie sprawdził; weryfikacja jest ręczna,
  wg listy kontrolnej w planie wdrożenia.

Strefa czasowa testów przypięta do `Europe/Warsaw` — kod operuje na czasie lokalnym, więc bez
przypięcia wyniki zależą od maszyny.

---

## 9. Odłożone świadomie

### Dziennik plikowy — kierunek projektu

Integracja z kalendarzami zewnętrznymi została **porzucona**. Aplikacja ma być samowystarczalna
i skupiona na systemie hPDA: źródłem prawdy stają się pliki markdown w `/srv/data/diary`,
po jednym na dzień plus `BACKLOG.md`, czytane i zapisywane także przez agentów.

Trzy fazy, każda z własną specyfikacją w `docs/superpowers/specs/`:

1. **Serwer plików** — `node:http`, trzy pary tras, bez rozumienia formatu.
2. **Format markdown** — parser i serializator w `src/lib/md/`, odporne na nieznane linie.
3. **Podmiana trwałości** — pliki zastępują `localStorage`, które znika.

Do czasu fazy 3 opis architektury w §1–§7 pozostaje aktualny: stan nadal żyje w przeglądarce.

### Widok historii

Aplikacja pokazuje wyłącznie dziś i backlog. Dni minione są w danych i w kopii zapasowej,
ale nie ma ich jak obejrzeć. Widok historii — tygodniowy albo miesięczny — jest pierwszą
rzeczą, która to odblokuje.

### Raporty

Widok tygodnia (heatmapa), widok miesiąca (tokeny per kategoria per dzień), statystyka
realizacji (ile `planned` skończyło jako `confirmed`).

### PWA

`manifest.json`, service worker, strategia cache-first dla powłoki. Sensowne dopiero po
ustabilizowaniu wdrożenia na Pages.

---

## 10. Faza docelowa (poza zakresem)

Gdy aplikacja dojrzeje do stanu współdzielonego, zmienia się warstwa trwałości — **nie UI
i nie matematyka siatki**:

- **Backend:** lekki serwer (FastAPI) + SQLite.
- **Auth:** logowanie Google OAuth 2.0, tokeny odświeżane po stronie serwera.
- **Kalendarze:** serwer pobiera feedy, co usuwa problem CORS z §9.
- **Synchronizacja wielourządzeniowa.**

Docelowy schemat (PostgreSQL DDL, wykonalny w SQLite po usunięciu GiST):

```sql
create table categories (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    icon text not null,
    color text not null,
    parent_id uuid references categories(id) on delete cascade,
    sort_order smallint default 0
);

create table day_bands (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    start_hour smallint not null,
    color text
);

create table time_blocks (
    id uuid primary key default gen_random_uuid(),
    category_id uuid references categories(id) on delete set null,
    title text,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    status text not null check (status in ('suggested','planned','active','confirmed','discarded')),
    external_uid text,
    external_recurrence_id text,
    created_at timestamptz default now(),

    constraint no_overlap_active_slots exclude using gist (
        tstzrange(starts_at, ends_at) with &&
    ) where (status in ('active','confirmed'))
);

create index idx_time_blocks_day on time_blocks (starts_at, ends_at);
```

**Ścieżka migracji:** eksport JSON jest formatem wejściowym importera. Konwersja
`(day, q, len)` → `(starts_at, ends_at)` jest bezstratna, bo `q` liczone jest od północy
czasu lokalnego.
