Oto kompletny, inżynierski plan implementacji projektu **SemiGrid**. Architektura zakłada lekką aplikację webową (PWA) z natychmiastowym renderowaniem siatki w pełnym oknie przeglądarki (`100dvh`), precyzyjną mechaniką kwantowania czasu oraz asynchroniczną synchronizacją z Google Calendar.

---

## 1. Architektura Systemu i Stos Technologiczny

Aplikacja musi działać bez opóźnień (optimistic UI), wspierać skróty klawiszowe i mieścić się w całym oknie bez scrollowania.

* **Frontend:**
* **Framework:** React / Vite lub SvelteKit (ze względu na minimalny narzut i szybkość reakcji).
* **Styling:** Tailwind CSS (zapewniający precyzyjne klasy dla `100dvh`, sub-siatek CSS Grid oraz paletę retro/dark mode np. Gruvbox: `#282828`, `#ebdbb2`, `#fabd2f`, `#b8bb26`, `#fb4934`).
* **Ikony:** FontAwesome SVG (`@fortawesome/react-fontawesome` lub standalone SVG sprites dla optymalizacji bundle'a).
* **Format:** PWA (Progressive Web App) z Service Workerem – pełny ekran na mobile/desktop, praca offline.


* **Backend & Baza:**
* **Baza danych:** SQLite.
* **API / Runtime:** Lekki serwer python fastapi.


* **Integracje:**
* Google Calendar API v3 (OAuth2 z odświeżaniem tokenów w tle).



---

## 2. Model Danych (docelowo SQLite - zaprojektowane w PostgreSQL DDL)

Schemat opiera się na matematycznym wykluczaniu lub precyzyjnym pozycjonowaniu interwałów czasowych.

```sql
create extension if not exists "uuid-ossp";
create extension if not exists "btree_gist";

-- Słownik 5-7 bazowych kategorii
create table categories (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    icon text not null,        -- np. 'fa-laptop-code', 'fa-dumbbell', 'fa-book-open'
    color text not null,       -- hex: np. '#b8bb26'
    is_work boolean default false,
    sort_order smallint default 0
);

-- Definicja ram dnia (np. 08:00-16:00 Praca)
create table day_bands (
    id uuid primary key default gen_random_uuid(),
    name text not null,        -- 'Poranek', 'Praca', 'Dom/Rodzina', 'Wyciszenie'
    start_time time not null,  -- np. '08:00:00'
    end_time time not null,    -- np. '16:00:00'
    tint_color text            -- subtelne zabarwienie tła wierszy
);

-- Główna tabela slotów/kwantów
create table time_blocks (
    id uuid primary key default gen_random_uuid(),
    category_id uuid references categories(id) on delete set null,
    title text,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    status text not null check (status in ('suggested', 'planned', 'active', 'confirmed', 'discarded')),
    external_event_id text,
    external_calendar_id text,
    is_manual boolean default true,
    created_at timestamptz default now(),
    
    -- Wykluczanie fizycznego nakładania się potwierdzonych lub aktywnych bloków
    constraint no_overlap_confirmed_slots exclude using gist (
        tstzrange(starts_at, ends_at) with &&
    ) where (status in ('active', 'confirmed'))
);

create index idx_time_blocks_day on time_blocks (starts_at, ends_at);
create index idx_time_blocks_external on time_blocks (external_event_id);

```

---

## 3. Matematyka Siatki i Logika Renderowania (No-Scroll Viewport)

Cały viewport `100dvh` dzielony jest na stały nagłówek (statystyka tokenów) oraz siatkę 16 rzędów.

### Podział przestrzeni

* **Doba aktywności:** 16 godzin = $16 \times 4 = 64$ kwanty 15-minutowe.
* **Układ siatki:**
* Kontener: `height: calc(100dvh - 48px)`, `display: grid`, `grid-template-rows: repeat(16, minmax(0, 1fr))`.
* Każdy wiersz godziny: `display: grid`, `grid-template-columns: 48px repeat(4, 1fr)`.
* Kolumny: `[Etykieta godziny: 06:00]` | `:00` | `:15` | `:30` | `:45`.



### Pozycjonowanie i kolizje klocków 30-minutowych

1. **Klocek standardowy (wewnątrz godziny):**
* Start o `:00` $\rightarrow$ zajmuje kolumny 1 i 2 (`span 2`).
* Start o `:15` $\rightarrow$ zajmuje kolumny 2 i 3 (`span 2`).
* Start o `:30` $\rightarrow$ zajmuje kolumny 3 i 4 (`span 2`).


2. **Klocek graniczny (start o `:45`):**
* Start o `:45` w godzinie $H$ kończy się o `:15` w godzinie $H+1$.
* **Implementacja wizualna:** Dwa zintegrowane segmenty DOM:
* Segment A w wierszu $H$ na pozycji `:45` (zaokrąglone rogi tylko z lewej strony).
* Segment B w wierszu $H+1$ na pozycji `:00` (zaokrąglone rogi tylko z prawej strony).
* Wizualny łącznik lub wspólny identyfikator podświetlenia przy `hover`.




3. **Wskaźnik „TERAZ”:**
* Pozycja absolutna obliczana co 60 sekund:

$$Row = \text{Bieżąca godzina} - 6$$


$$ColumnOffset = \frac{\text{Aktualna minuta}}{60} \times 100\%$$


* Renderowany jako cienka, neonowa pionowa linia w aktywnym wierszu z punktem pulsującym.



---

## 4. Logika Interakcji (UX & State Machine)

Kliknięcie w dowolną komórkę siatki uruchamia akcję zależną od czasu systemowego:

```
                          [Kliknięcie w komórkę]
                                    |
            +-----------------------+-----------------------+
            |                                               |
    [Czas < TERAZ]                                  [Czas >= TERAZ]
 (Przeszłość / Post-factum)                     (Teraźniejszość / Przyszłość)
            |                                               |
+-----------+-----------+                       +-----------+-----------+
|                       |                       |                       |
[Komórka Pusta]    [Suggested]          [Czas == TERAZ]     [Czas > TERAZ]
      |                 |                       |                       |
Otwórz szybkie     Pojedynczy klik:       Uruchom aktywny     Oznacz jako
Radial Menu        Akceptuj jako          slot 30 min         Planned slot;
(1-klik kategoria) 'Confirmed'            (odliczanie)        wybierz intencję

```

* **Radial / Popover Menu:** 6 ikonek ułożonych w kole wokół kursora. Wybór ikony = natychmiastowy zapis i zamknięcie. Czas interakcji: $< 800\text{ ms}$.
* **Edycja:** Pojedynczy klik w istniejący blok = szybkie potwierdzenie. Podwójny klik / długie przytrzymanie = edycja nazwy i usunięcie.

---

## 5. Synchronizacja z Google Calendar

Zewnętrzne kalendarze są traktowane jako **źródła intencji**, a nie prawda absolutna o wykonaniu zadania.

1. **Pobieranie zdarzeń:**
* Cykliczny fetch (lub webhook push przez `google-api-client`) dla zakresu `06:00 - 22:00` danego dnia.


2. **Kwantowanie (Snapping Algorithm):**
* Każde wydarzenie z kalendarza zaokrąglane jest do najbliższego kroku 15-minutowego:
```typescript
function snapTo15(date: Date): Date {
  const ms = 1000 * 60 * 15;
  return new Date(Math.round(date.getTime() / ms) * ms);
}

```


* Domyślnie wydarzenie mapowane jest na minimalną długość 30 minut.


3. **Status `Suggested`:**
* Blok pojawia się na siatce z kropkowanym obrysem (dashed border) i niższą przezroczystością.
* Użytkownik widzi go jako „sugestię”. Jedno kliknięcie zmienia status na `confirmed`, rejestrując wykonanie habitu.



---

## 6. Harmonogram Realizacji (Fazy Wdrożenia)

### Silnik Siatki i Interfejs (Core UI)

* [ ] Konfiguracja projektu (Vite + React/Svelte + Tailwind).
* [ ] Implementacja kontenera `100dvh` z 16 rzędami CSS Grid bez przewijania.
* [ ] Matematyka podziału na 4 kwanty w rzędzie oraz obsługa klocków 30-minutowych (w tym span `:45` $\rightarrow$ `:15`).
* [ ] Wskaźnik „TERAZ” odświeżany co 1 minutę.
* [ ] Stylowanie bazowe w ciemnej, kontrastowej palecie retro.

### Interakcje i Stan Lokalny (Local Storage / PWA)

* [ ] Logika podziału kliknięcia: Przeszłość (historia), Teraźniejszość (start timera), Przyszłość (plan).
* [ ] Minimalistyczny popover/radial menu wyboru jednej z 5–7 kategorii z ikonami FontAwesome.
* [ ] Pasek podsumowania u góry ekranu: licznik zużytych slotów (np. `14/32 zajęte`, podział na kolory kategorii).
* [ ] Rejestracja Service Workera (PWA) i działanie offline z LocalStorage.

### Backend i API

* [ ] Wdrożenie bazy PostgreSQL z modelem `categories`, `day_bands` i `time_blocks`.
* [ ] Zabezpieczenie przed nakładaniem się potwierdzonych slotów (GIST/tstzrange constraint).
* [ ] Proste endpointy REST/tRPC do pobierania i synchronizacji stanu dnia.

### Integracja Google Calendar i Podsumowania

* [ ] Autoryzacja OAuth2 do kont Google Calendar.
* [ ] Parser zaokrąglający eventy kalendarza do siatki 15/30 min i wstrzykiwanie ich jako `status: suggested`.
* [ ] Widok raportu tygodniowego/miesięcznego: prosta heatmapa/wykres tokenów (ile kwantów w jakiej kategorii każdego dnia).
