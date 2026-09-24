# SemiGrid — plan implementacji

**SemiGrid** to aplikacja do kwantowania doby na 15-minutowe tokeny: cała aktywna część dnia
mieści się w jednym oknie przeglądarki (`100dvh`, zero scrollowania), a każdy blok czasu jest
jednym kliknięciem oznaczany jako zaplanowany, trwający lub wykonany.

> **Faza obecna: aplikacja bezserwerowa.**
> Całość to **jeden plik `semigrid.html`** — bez backendu, bez build-stepu, bez `node_modules`,
> bez zależności runtime. Stan żyje w `localStorage` przeglądarki. Kalendarze wchodzą do
> aplikacji jako pliki **iCalendar (`.ics`)** pobierane po URL-u.
>
> To rozwiązanie jest **tymczasowe i świadomie prymitywne**. Docelowo (patrz §8) aplikacja
> dostanie backend, bazę danych i logowanie Google OAuth. Wszystkie decyzje w fazie obecnej
> mają jeden twardy wymóg: **nie zabetonować drogi do tamtej fazy** — stąd wersjonowany
> kształt stanu i eksport JSON jako kontrakt migracji.

---

## 1. Architektura i ograniczenia

### Stos

| Warstwa | Wybór | Uzasadnienie |
|---|---|---|
| Format dystrybucji | pojedynczy `semigrid.html` | kopiujesz jeden plik i działa; brak pipeline'u |
| JS | vanilla ES2022, IIFE, `'use strict'` | zero zależności, zero transpilacji |
| CSS | custom properties + CSS Grid | paleta Gruvbox light/dark przez `prefers-color-scheme` + `[data-theme]` |
| Typografia | IBM Plex Mono / Sans Condensed (Google Fonts) | jedyny zasób zewnętrzny obok ikon |
| Ikony | FontAwesome 6 (CDN, `data-auto-replace-svg="nest"`) | renderowane przez `icon()` z cache'em w `iconCache` |
| Trwałość | `localStorage` (`semigrid.v1`, `semigrid.prefs`) | synchroniczna, prosta, wystarczająca |
| Kalendarze | `fetch()` pliku `.ics` + własny parser | brak biblioteki, brak backendu |
| Offline | Service Worker (`sw.js`) + `manifest.json` | opcjonalnie, tylko przy self-hostingu na HTTPS |

### Ograniczenia wynikające z braku backendu

Te punkty nie są usterkami do naprawienia w tej fazie — są **ceną** za brak serwera i muszą
być jawnie widoczne w UI:

1. **CORS.** Przeglądarka pobierze `.ics` tylko z origin-u, który na to pozwala. Google
   Calendar, iCloud i większość publicznych feedów **nie wysyłają** `Access-Control-Allow-Origin`,
   więc `fetch()` z innej domeny zakończy się błędem sieciowym — i żaden kod po stronie klienta
   tego nie obejdzie. Działające scenariusze opisuje §5.1.
2. **Brak synchronizacji między urządzeniami.** `localStorage` jest per-przeglądarka,
   per-origin. Otwarte karty tej samej przeglądarki synchronizują się przez zdarzenie `storage`.
3. **Dane są ulotne.** Wyczyszczenie danych witryny kasuje wszystko. Stąd obowiązkowy
   eksport/import JSON (§6, E1) — jedyna kopia zapasowa, jaką aplikacja może zaoferować.
4. **Limit ~5 MB** na origin. Wymusza okno przechowywania zdarzeń kalendarzowych (§5.5).
5. **Brak zegara serwera.** Wszystkie statusy liczone są względem zegara lokalnego.

---

## 2. Stan faktyczny prototypu

`semigrid.html` (~1380 linii) **realizuje już całość silnika siatki i interakcji**. Poniższa
lista to inwentaryzacja, nie plan — te rzeczy są zrobione:

- [x] Kontener `100dvh` bez scrolla, `HOURS` rzędów CSS Grid, `flex:1;min-height:0`.
- [x] Podział rzędu na `var(--hourw)` + 4 kwanty, bloki 30-minutowe z przełamaniem `:45 → :15`
      (funkcja `segHTML()` tnie blok na segmenty per godzina, zaokrąglając rogi tylko skrajnie).
- [x] Wskaźnik „TERAZ" + odliczanie aktywnego bloku (`tick()` co 1 s, pełny `render()` co minutę,
      `live()` co sekundę aktualizuje tylko `--p` i tekst odliczania; tytuł karty pokazuje timer).
- [x] Automatyczne domykanie: blok `active`, którego czas minął, staje się `confirmed`.
- [x] Paleta Gruvbox light/dark + przełącznik motywu (`auto` / `light` / `dark`).
- [x] Menu radialne wyboru kategorii (promień skalowany liczbą pozycji, dwa poziomy: kategoria → podkategoria).
- [x] Hierarchia kategorii (rodzic → dzieci, dziedziczenie koloru, max 9 + 9 dla skrótów cyfrowych).
- [x] Pory dnia (`day_bands`) konfigurowalne w UI, z podglądem.
- [x] Maszyna stanów `suggested → planned → active → confirmed` + `discarded`.
- [x] Klawiatura: `hjkl`/strzałki, cyfry 1–9 = przypisanie kategorii, undo.
- [x] Undo (`hist[]` + toast z akcją cofnięcia).
- [x] Sugestie „z zeszłego tygodnia" (`suggestFromLastWeek()`) — respektują zajętość i odrzucenia.
- [x] Pasek tokenów w nagłówku (pipsy per kwant, podział na wykonane/planowane, kolory kategorii).
- [x] Trwałość w `localStorage` + migracja schematu `v1 → v2` w `normalize()`.
- [x] Synchronizacja otwartych kart przez zdarzenie `storage`.
- [x] Responsywność, `env(safe-area-inset-*)`, `touch-action`, warianty dla `pointer: coarse`.
- [x] Ekran pomocy przy pierwszym uruchomieniu.

**Do zrobienia zostaje: integracja iCal (§5), raporty (§6 R1), utwardzenie PWA (§6 P1), eksport JSON (§6 E1).**

---

## 3. Model danych (localStorage)

Źródłem prawdy jest jeden obiekt JSON pod kluczem `semigrid.v1`. Kluczowa decyzja: **`q` to
indeks kwantu 15-minutowego liczony od północy** (0–95, `QDAY = 96`), a nie od początku
widocznego okna. Dzięki temu zmiana godzin pracy dnia nie przesuwa istniejących danych.

Uwaga na dwie różne „wersje": **`semigrid.v1` to nazwa klucza** w `localStorage` (stała `KEY`
w kodzie, nigdy się nie zmienia), a **`S.v` to wersja schematu** danych pod tym kluczem —
obecnie `2`, integracja iCal podnosi ją do `3`.

```js
// localStorage['semigrid.v1']   ← nazwa klucza; wersję schematu trzyma pole S.v
S = {
  v: 3,                          // wersja schematu; migracje w normalize()
  cats: [                        // kategorie, płasko, hierarchia przez `parent`
    { id:'work', name:'Praca', icon:'laptop-code', color:'yellow', parent:null, archived?:false },
    { id:'work-a', name:'Projekt A', icon:null, parent:'work' },   // kolor dziedziczony z rodzica
  ],
  day: {                         // widoczne okno doby + pory dnia
    start: 6, end: 22,
    bands: [ { id:'b-rano', name:'Rano', from:6, color:'aqua' } ]   // pora trwa do `from` następnej
  },
  blocks: [
    {
      id: 'a1b2c3…',             // uid()
      day: '2026-09-24',         // klucz dnia, czas lokalny
      q: 32,                     // start: kwant od północy (32 = 08:00)
      len: 2,                    // długość w kwantach (2 = 30 min)
      cat: 'work',
      title: '',
      status: 'planned',         // suggested | planned | active | confirmed | discarded
      created: 1758700000000,
      // ↓ NOWE w v3, tylko dla bloków z kalendarza:
      src: 'ical',               // undefined = ręczny
      cal: 'cal-1',              // id kalendarza źródłowego
      uid: 'abc@google.com',     // UID z VEVENT — klucz idempotencji przy re-syncu
      rid: '20260924T080000Z'    // RECURRENCE-ID dla instancji serii (opcjonalnie)
    }
  ],
  cals: [                        // NOWE w v3
    {
      id: 'cal-1',
      name: 'Praca',
      url: '/cal/work.ics',      // najlepiej ścieżka względna — patrz §5.1
      cat: 'work',               // domyślna kategoria dla zdarzeń z tego kalendarza
      enabled: true,
      lastSync: 1758700000000,
      lastError: null,           // komunikat ostatniego błędu (CORS / 404 / parse)
      events: []                 // sparsowany cache — patrz §5.5
    }
  ]
}

// localStorage['semigrid.prefs']
prefs = { theme:'auto', seenHelp:true, syncOnOpen:true }
```

### Niezmienniki

- **Brak nakładania się bloków.** Egzekwowane w kliencie przez `occ(day)` (tablica 96 slotów →
  blok) i `fit(day, q)` (znajduje największy wolny wycinek ≤ 2 kwanty od `q`). To klienckie
  zastąpienie ograniczenia `EXCLUDE USING gist` z fazy docelowej.
- **Jeden blok `active` naraz.** Pilnuje `stopOtherActive()`.
- **Bloki `discarded` nie znikają** — pamiętają, że użytkownik odrzucił sugestię w tym slocie,
  żeby ponowna synchronizacja jej nie wskrzesiła.
- **`normalize()` jest jedynym wejściem stanu.** Każda zmiana kształtu = bump `v` + migracja
  w `normalize()`. To jest kontrakt, który przeniesie dane do bazy w fazie docelowej.

---

## 4. Matematyka siatki

Wartości `START_H`, `END_H`, `HOURS`, `Q0`, `Q1` są wyliczane z `S.day` w `applyDay()`.

```
HOURS = END_H - START_H              // domyślnie 16
Q0    = START_H * 4                  // pierwszy widoczny kwant (24 dla 06:00)
Q1    = END_H * 4                    // pierwszy kwant poza oknem (88 dla 22:00)
```

- **Kontener:** `flex:1; min-height:0; display:grid; grid-template-rows:repeat(var(--hours),minmax(0,1fr))`.
  Bez `calc(100dvh - …)` — `flex` sam rozdziela resztę wysokości po nagłówku, co poprawnie
  reaguje na pasek adresu na mobile.
- **Rząd:** `grid-template-columns: var(--hourw) repeat(4, minmax(0,1fr))`.
- **Blok:** dla bloku `[q, q+len)` i rzędu godziny `h` liczone jest przecięcie
  `[max(q, h*4), min(q+len, h*4+4))`. Niepuste przecięcie → jeden segment DOM.
  Blok startujący o `:45` daje dwa segmenty w dwóch rzędach; `hover` podświetla oba przez
  wspólne `data-id` (`setHover()`).
- **Wskaźnik TERAZ:** rząd = `floor(nowQ()/4) - START_H`, przesunięcie poziome = `minuta/60`.

---

## 5. Integracja iCalendar

Kalendarz jest **źródłem intencji, nie prawdą o wykonaniu**. Zdarzenia wchodzą wyłącznie jako
`status:'suggested'` i dopiero kliknięcie użytkownika zamienia je w `confirmed`. Integracja
jest **jednokierunkowa, tylko do odczytu** — SemiGrid nigdy nie zapisuje niczego do kalendarza
ani nie eksportuje `.ics`.

### 5.1. Pobieranie: URL jako ścieżka podstawowa

Aplikacja robi zwykły `fetch(cal.url)`. Żeby to zadziałało, `.ics` musi być osiągalny dla
przeglądarki. Trzy scenariusze, od najpewniejszego:

**A. Same-origin (zalecany).** Hostujesz `semigrid.html` u siebie i kładziesz obok plik `.ics`.
Zewnętrzny proces (cron + `curl`) odświeża go niezależnie od aplikacji:

```cron
*/15 * * * * curl -fsS "https://calendar.google.com/calendar/ical/…/basic.ics" \
               -o /var/www/semigrid/cal/work.ics.tmp \
             && mv /var/www/semigrid/cal/work.ics{.tmp,}
```

W aplikacji wpisujesz ścieżkę względną `/cal/work.ics`. Brak CORS, brak wycieku sekretnego
URL-a do przeglądarki, pełna kontrola nad częstotliwością odpytywania. **To jest docelowy
sposób użycia w tej fazie.**

**B. Feed z nagłówkami CORS.** Niektóre instancje Nextcloud/Radicale/Baïkal i feedy publiczne
wysyłają `Access-Control-Allow-Origin: *`. Wtedy bezpośredni URL zadziała.

**C. Import pliku (awaryjnie).** Dla Google Calendar i iCloud, które CORS blokują i których
nie da się obejść z przeglądarki, zostaje ręczne wczytanie pliku: `<input type="file" accept=".ics">`
oraz drag-and-drop na siatkę. Ta sama ścieżka parsowania, `cal.url = null`, `cal.events`
wypełnione jednorazowo. Traktowane jako ścieżka drugorzędna, ale bez niej Google Calendar
w tej fazie jest nieosiągalny.

Każdy błąd `fetch()` ląduje w `cal.lastError` i jest pokazywany w ustawieniach z czytelnym
tłumaczeniem — `TypeError: Failed to fetch` musi zamienić się w *„Ten kalendarz blokuje dostęp
z przeglądarki (CORS). Użyj kopii same-origin — patrz pomoc."*, inaczej użytkownik utknie.

### 5.2. Parser — minimalny podzbiór RFC 5545

Własny parser, ~200 linii, bez zależności. Zakres:

1. **Rozwijanie linii** — sekwencja `CRLF` + spacja/tab łączy linię z poprzednią. Krok pierwszy,
   przed jakimkolwiek parsowaniem; jego pominięcie psuje długie `SUMMARY` i `RRULE`.
2. **Tylko `VEVENT`** — `VTODO`, `VJOURNAL`, `VALARM`, `VTIMEZONE` pomijane.
3. **Właściwości:** `UID`, `DTSTART`, `DTEND`, `DURATION`, `SUMMARY`, `STATUS`, `TRANSP`,
   `RRULE`, `EXDATE`, `RECURRENCE-ID`. Reszta ignorowana.
4. **Odkodowanie wartości:** `\n` → nowa linia, `\,` `\;` `\\` → znak dosłowny.
5. **Formaty `DTSTART`:**
   - `DTSTART:20260924T080000Z` — UTC.
   - `DTSTART;TZID=Europe/Warsaw:20260924T080000` — czas w strefie nazwanej.
   - `DTSTART;VALUE=DATE:20260924` — całodniowe → **pomijane** (nie kwantyzuje się sensownie).
6. **Strefy czasowe bez biblioteki.** Offset strefy `TZID` dla danej chwili wyliczany przez
   `Intl.DateTimeFormat(undefined, { timeZone: tzid, timeZoneName:'longOffset' })` — silnik
   przeglądarki ma pełną bazę IANA, więc nie potrzeba `tzdata`. Nierozpoznane `TZID` →
   fallback do czasu lokalnego + ostrzeżenie w `lastError`.
7. **Odrzucane:** `STATUS:CANCELLED`, `TRANSP:TRANSPARENT` (czas wolny), zdarzenia całodniowe,
   zdarzenia dłuższe niż 8 h (traktowane jako tło, nie jako blok pracy).

**Powtarzalność (`RRULE`)** dzielona na dwa etapy, żeby nie blokować reszty:
- *Etap 1:* `FREQ=DAILY` i `FREQ=WEEKLY` z `INTERVAL`, `BYDAY`, `UNTIL`, `COUNT` + `EXDATE`.
  Pokrywa realistycznie >90 % powtarzalnych zdarzeń.
- *Etap 2:* `FREQ=MONTHLY`/`YEARLY`, `BYMONTHDAY`, `BYSETPOS`, nadpisania przez `RECURRENCE-ID`.

Rozwijanie serii liczone **tylko dla widocznego dnia**, nie dla całego zakresu reguły.

### 5.3. Kwantyzacja

```js
const Q = 15 * 60 * 1000;
const qOf   = (ms, dayStart) => Math.round((ms - dayStart) / Q);   // kwant od północy
const snapA = ms => Math.floor(ms / Q) * Q;                         // start w dół
const snapB = ms => Math.ceil(ms / Q) * Q;                          // koniec w górę
```

- Start zaokrąglany **w dół**, koniec **w górę** — zdarzenie nigdy nie „chudnie" przy snapowaniu.
- Minimalna długość `len = 2` (30 min), zgodnie z granulacją bloków w siatce.
- Przycięcie do okna `[Q0, Q1)`. Zdarzenie wykraczające poza okno jest przycinane; całkowicie
  poza oknem — pomijane.
- Zdarzenie przekraczające północ dzieli się na dwa bloki w dwóch `day`.

### 5.4. Wstrzykiwanie do siatki

Dla wybranego dnia, po sparsowaniu:

1. Zbierz instancje zdarzeń przecinające ten dzień, posortuj po `DTSTART`.
2. Dla każdej policz klucz idempotencji `k = cal + '|' + uid + '|' + (rid ?? '')`.
3. **Pomiń**, jeśli:
   - istnieje już blok z tym `k` (dowolny status — także `confirmed`, także `discarded`);
   - `fit(day, q)` zwraca `null` lub wycinek krótszy niż wymagany (slot zajęty).
     **Bloki ręczne i potwierdzone mają zawsze pierwszeństwo — sync nigdy ich nie nadpisuje.**
4. W przeciwnym razie dodaj blok `{ src:'ical', cal, uid, rid, status:'suggested', cat: cal.cat, title: SUMMARY }`.
5. Sprzątanie: blok z `src:'ical'` i statusem `suggested`, którego `k` **zniknął** ze źródła
   (zdarzenie usunięte w kalendarzu), jest kasowany przy następnym syncu. Bloki `confirmed`
   i `discarded` zostają na zawsze — to zapis historii, a nie odbicie kalendarza.

Wizualnie sugestie mają już w prototypie obsłużoną klasę `st-suggested` (przerywany obrys,
niższa nieprzezroczystość). Bloki z kalendarza dostają dodatkowy mały znacznik źródła.

### 5.5. Cache i limit miejsca

- Przechowywany jest **wynik parsowania**, nie surowy `.ics` — plik z roczną historią potrafi
  mieć kilka MB, a `localStorage` daje ~5 MB na origin.
- `cal.events` obejmuje okno **dzień dzisiejszy −7 / +21 dni**, przycinane przy każdym syncu.
- Dzięki temu aplikacja pokazuje kalendarz także offline (PWA) — na danych z ostatniej udanej
  synchronizacji, z widocznym znacznikiem `lastSync`.
- Synchronizacja wyzwalana: przy starcie (jeśli `prefs.syncOnOpen`), przy zmianie dnia poza
  zakres cache'u, przyciskiem odświeżenia w nagłówku. Throttle: nie częściej niż co 5 minut
  na kalendarz, chyba że ręcznie.
- `fetch` z `cache:'no-cache'`; zapis `ETag`/`Last-Modified` i warunkowe żądanie przy kolejnym
  syncu, żeby nie ściągać niezmienionego pliku.

### 5.6. Mapowanie na kategorie

Każdy kalendarz ma jedną domyślną kategorię (`cal.cat`). Zdarzenia dostają ją automatycznie;
użytkownik zmienia kategorię pojedynczego bloku istniejącym arkuszem edycji (`openEdit()`).
**Świadomie brak reguł keyword-matching** — to złożoność, która nie zarabia na siebie przy
kilku kalendarzach, a łatwo ją dodać później.

---

## 6. Co zostało do zrobienia

### I — iCal (rdzeń tej fazy)

- [ ] **I1.** Parser `.ics`: rozwijanie linii, `VEVENT`, właściwości z §5.2, odkodowanie escape'ów.
- [ ] **I2.** Rozwiązywanie czasu: UTC / `TZID` przez `Intl` / odrzucanie całodniowych.
- [ ] **I3.** `RRULE` etap 1 (`DAILY`/`WEEKLY` + `INTERVAL`/`BYDAY`/`UNTIL`/`COUNT`) + `EXDATE`.
- [ ] **I4.** Kwantyzacja i przycinanie do okna doby (§5.3), podział przez północ.
- [ ] **I5.** Migracja `normalize()` `v2 → v3`: dodanie `S.cals`, pól `src`/`cal`/`uid`/`rid`.
- [ ] **I6.** Warstwa synchronizacji: `fetch` + `ETag`, throttle, okno cache'u, `lastSync`/`lastError`.
- [ ] **I7.** Wstrzykiwanie i sprzątanie sugestii wg reguł §5.4 (idempotencja po `uid`).
- [ ] **I8.** UI zarządzania kalendarzami: nowa zakładka w istniejącym panelu ustawień
      (obok „Kategorie" i „Dzień"), lista kalendarzy, pola nazwa/URL/kategoria/włączony,
      przycisk „Synchronizuj teraz", widoczny status i **czytelny komunikat o CORS**.
- [ ] **I9.** Import pliku `.ics` (`<input type="file">` + drop na siatkę) jako ścieżka awaryjna.
- [ ] **I10.** Wskaźnik źródła na bloku z kalendarza + `title` z nazwą kalendarza.
- [ ] **I11.** `RRULE` etap 2 (`MONTHLY`/`YEARLY`, `RECURRENCE-ID`).

### E — Trwałość danych

- [ ] **E1.** Eksport/import całego stanu jako plik JSON (przycisk w ustawieniach).
      **Priorytet wysoki** — bez tego wyczyszczenie danych witryny kasuje całą historię.
      Import waliduje `v` i przepuszcza dane przez `normalize()`.
- [ ] **E2.** Ostrzeżenie przy nieudanym zapisie (`lsSet` zwraca `false`) — już jest toast,
      dodać twardsze wskazanie na eksport.

### R — Raporty

- [ ] **R1.** Widok tygodnia: heatmapa 7 × N kwantów, kolory kategorii, zliczenie tokenów.
- [ ] **R2.** Widok miesiąca: tokeny per kategoria per dzień, prosty wykres słupkowy (CSS, bez biblioteki).
- [ ] **R3.** Statystyka realizacji: ile bloków `planned`/`suggested` skończyło jako `confirmed`.

### P — PWA

- [ ] **P1.** `manifest.json` + `sw.js` obok pliku HTML. **Uwaga na napięcie z zasadą
      „jeden plik":** sam `semigrid.html` działa samodzielnie (także z `file://`), ale
      instalowalne PWA wymaga dwóch dodatkowych plików i HTTPS. Ponieważ scenariusz A z §5.1
      i tak zakłada self-hosting, to nie jest realny koszt — trzeba to tylko jawnie opisać.
- [ ] **P2.** Strategia cache'u: `cache-first` dla powłoki aplikacji, `network-first` dla `.ics`.
      Rejestracja SW już istnieje w prototypie (`location.protocol === 'https:'`).
- [ ] **P3.** Zamrożenie czcionek i ikon w cache'u SW — inaczej offline traci typografię i ikony.

---

## 7. Kolejność prac

```
E1 (eksport JSON)  ──►  I1 ─► I2 ─► I3 ─► I4        [parser, testowalny bez UI]
                                            │
                        I5 (migracja v3) ───┤
                                            ▼
                                   I6 ─► I7 ─► I8 ─► I9 ─► I10
                                                              │
                                              I11, R1 ─► R2 ─► R3, P1 ─► P2 ─► P3
```

**E1 idzie pierwsze** — zanim migracja schematu dotknie czyichkolwiek danych, musi istnieć
sposób na ich wyniesienie. **I1–I4 to czysta logika** bez efektów ubocznych: parser przyjmuje
tekst `.ics` i datę, zwraca tablicę `{uid, rid, q, len, title}`. Da się go sprawdzić w konsoli
na garści przykładowych plików, zanim dotknie stanu aplikacji.

---

## 8. Faza docelowa (poza zakresem tego planu)

Gdy aplikacja dojrzeje do stanu współdzielonego, zmienia się warstwa trwałości — **nie UI i nie
matematyka siatki**. Zapisane tu dla zachowania kierunku:

- **Backend:** lekki serwer (FastAPI) + SQLite.
- **Auth:** logowanie Google OAuth 2.0, tokeny odświeżane po stronie serwera.
- **Kalendarze:** Google Calendar API v3 zamiast surowego `.ics`, **serwer pobiera feedy** —
  co usuwa problem CORS z §5.1 i pozwala trzymać sekretne URL-e poza przeglądarką.
- **Synchronizacja wielourządzeniowa**, historia poza jedną przeglądarką.

Docelowy schemat bazy (zaprojektowany w PostgreSQL DDL, wykonalny w SQLite po usunięciu
rozszerzeń GiST):

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

create table calendars (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    url text,
    default_category_id uuid references categories(id) on delete set null,
    enabled boolean default true,
    last_sync timestamptz
);

create table time_blocks (
    id uuid primary key default gen_random_uuid(),
    category_id uuid references categories(id) on delete set null,
    title text,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    status text not null check (status in ('suggested','planned','active','confirmed','discarded')),
    calendar_id uuid references calendars(id) on delete set null,
    external_uid text,                     -- VEVENT UID
    external_recurrence_id text,           -- RECURRENCE-ID
    created_at timestamptz default now(),

    -- odpowiednik klienckiego occ()/fit()
    constraint no_overlap_active_slots exclude using gist (
        tstzrange(starts_at, ends_at) with &&
    ) where (status in ('active','confirmed'))
);

create unique index uq_external on time_blocks (calendar_id, external_uid, external_recurrence_id);
create index idx_time_blocks_day on time_blocks (starts_at, ends_at);
```

**Ścieżka migracji:** eksport JSON z §6 E1 jest formatem wejściowym importera. Konwersja
`(day, q, len)` → `(starts_at, ends_at)` jest trywialna i bezstratna, bo `q` liczone jest od
północy czasu lokalnego. Pola `src`/`cal`/`uid`/`rid` mapują się 1:1 na kolumny `calendar_id`,
`external_uid`, `external_recurrence_id`.
