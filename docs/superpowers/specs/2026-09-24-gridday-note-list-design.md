# GridDay — lista notatek (faza A): projekt

**Status:** do przeglądu · **Data:** 2026-09-24 · **Specyfikacja nadrzędna:** [`PLAN.md`](../../../PLAN.md)

## 1. Cel

Ekran dnia dzieli się na pół. Po lewej zostaje siatka, taka jak dziś. Po prawej pojawia się
**dzienny log w duchu bullet journal**: płaska lista pozycji pisana z klawiatury, w której
każda pozycja ma znacznik typu (zadanie, wykonane, notatka, zaplanowane, przeniesione).

Ta faza **nie zajmuje się powiązaniem pozycji z blokami czasu**. Powiązanie (godzina przy
pozycji, niezmiennik „każdy blok ma swoją pozycję na liście") jest fazą B i dostanie własny
projekt — po tym, jak lista zacznie działać.

### Co uznajemy za sukces

Da się przez cały dzień prowadzić notatki wyłącznie z klawiatury, nie sięgając po mysz:
pisanie tworzy pozycję, `Enter` następną, `Tab` zmienia znacznik. Lista przeżywa przeładowanie
strony i wraca po przywróceniu kopii zapasowej. Siatka po lewej działa dokładnie tak jak przed
zmianą.

## 2. Decyzje podjęte przed projektem

| Pytanie | Decyzja |
|---|---|
| Zakres listy | **Jedna lista na dzień**, zmienia się razem z widokiem dnia |
| Zagnieżdżanie | **Brak** — lista jest płaska, bez rodziców i dzieci (świadome cięcie zakresu) |
| Podział ekranu | **Stałe 50/50**, bez uchwytu do przeciągania |
| Wąski ekran | **Przełącznik** siatka/lista w nagłówku, jeden panel naraz |
| `Tab` | **Cykl znacznika** `task → done → note` — klawisz jest wolny, bo nie ma wcięć |
| Klik w znacznik | **Tylko `zadanie ↔ wykonane`** |
| Undo przy pisaniu | **Migawka przy opuszczeniu pozycji** lub przy operacji strukturalnej |
| `<` i `>` | **Naprawdę przenoszą** pozycję do innego dnia |

## 3. Model danych

Nowa tablica w `State`, zbudowana tak samo jak `blocks`: płasko, z dniem w rekordzie.
Schemat rośnie `v2 → v3`.

```ts
// src/lib/types.ts
export type ItemType = 'task' | 'done' | 'note' | 'scheduled' | 'migrated';

export interface Item {
  id: string;
  day: string;            // 'YYYY-MM-DD', czas lokalny
  text: string;
  type: ItemType;
  created: number;
  /** dzień docelowy, gdy pozycja została przeniesiona ('<' lub '>'); inaczej brak */
  movedTo?: string;
}

export interface State {
  v: number;
  cats: Category[];
  day: DaySettings;
  blocks: Block[];
  items: Item[];          // NOWE w v3
}
```

### Kolejność bez pola `order`

Lista dnia to `items.filter(i => i.day === day)`. `filter` zachowuje kolejność tablicy, więc
**pozycja w tablicy JEST kolejnością** — nie ma osobnego pola do renumerowania przy każdej
wstawce. Wstawienie pozycji pod bieżącą to `splice` na indeksie bieżącej w pełnej tablicy
`items`, powiększonym o jeden. Działa to poprawnie także wtedy, gdy pozycje różnych dni
przeplatają się w tablicy, bo filtr i tak zachowa ich wzajemną kolejność.

### Migracja `v2 → v3`

W `normalize()`: stan w wersji 2 dostaje `items: []` i `v: 3`. Stan bez tablicy `items`
(uszkodzony plik kopii zapasowej) również dostaje pustą tablicę, zgodnie z tym, jak
`normalize()` traktuje dziś uszkodzone `cats` i `day`.

### Znaczniki

| Typ | Znak | Znaczenie |
|---|---|---|
| `task` | `·` | zadanie otwarte — **typ domyślny nowej pozycji** |
| `done` | `×` | zadanie wykonane |
| `note` | `–` | notatka, nie zadanie |
| `scheduled` | `<` | przeniesione na konkretny dzień |
| `migrated` | `>` | przeniesione na jutro |

## 4. Układ ekranu

Dziś `body` jest kolumną flex z `#top` i `#grid`. Siatka staje się jednym z dwóch paneli:

```
body (flex column)
├── #top                    header, bez zmian
└── #panes (flex row, flex:1, min-height:0)
    ├── #grid  (flex:1, min-width:0)     bez zmian wewnętrznie
    └── #list  (flex:1, min-width:0)     nowy panel
```

Siatka nie wymaga żadnej zmiany wewnętrznej: już dziś wypełnia swój kontener i sama dzieli
wysokość. Zmniejsza się tylko jej szerokość, a kolumny kwantów są ułamkowe (`minmax(0,1fr)`),
więc skalują się same.

`#panes` powtarza dyscyplinę `min-height:0`, bez której zagnieżdżony flex rozpycha stronę
i psuje niezmiennik „brak przewijania".

**Panel listy przewija się w pionie.** To jedyne miejsce w aplikacji, które przewijać wolno:
dzień ma skończoną liczbę kwantów, ale nie ma skończonej liczby notatek. Przewijanie jest
zamknięte w `#list`, strona jako całość nadal się nie przewija.

`#grid` ma dziś `user-select:none`. Reguła jest przypisana do `#grid`, nie do `body`, więc
panel listy nie dziedziczy jej i tekst w nim normalnie się zaznacza.

### Wąski ekran

Poniżej progu `#panes` pokazuje jeden panel naraz; w nagłówku pojawia się przełącznik
siatka/lista.

Próg to **`max-width: 900px`**, czyli osobna wartość, wyżej niż istniejące `560px` w arkuszu.
Dotychczasowe `560px` mówi „ten jeden panel robi się ciasny"; tutaj pytanie brzmi „czy dwa
panele mieszczą się obok siebie", a każdy z nich potrzebuje mniej więcej tyle miejsca, ile
dotąd miał cały ekran. Przy 900 px na panel wypada 450 px — tyle, ile wystarcza siatce
z czytelnymi etykietami godzin.

Wybór panelu to stan widokowy (`ui`), nie ustawienie — po przeładowaniu wraca siatka.

## 5. Klawiatura

Obsługa siedzi **na polu tekstowym pozycji**, nie w globalnym `keyAction`. Globalny handler
przy `inInput` przepuszcza dziś tylko `Escape` i `Enter`; lista potrzebuje własnych reguł dla
`Tab`, `Backspace` i strzałek, więc obsługuje je lokalnie i zatrzymuje propagację.

| Klawisz | Działanie |
|---|---|
| pisanie w pustym panelu | tworzy pierwszą pozycję |
| `Enter` | nowa pozycja pod bieżącą, fokus na nią |
| `Backspace` na pozycji 0 **pustej** pozycji | usuwa ją, fokus na koniec poprzedniej |
| `↑` przy karetce na pozycji 0 | poprzednia pozycja, karetka na końcu |
| `↓` przy karetce na końcu | następna pozycja, karetka na początku |
| `Tab` | następny znacznik w cyklu `task → done → note → task` |
| `Shift+Tab` | poprzedni znacznik w tym samym cyklu |
| `Escape` | zdejmuje fokus z pola (wraca do warstwy siatki) |

**`↑` i `↓` działają tylko na krawędziach tekstu** — w środku pozycji poruszają karetką
normalnie. Inaczej nie dałoby się przejść przez długą, zawiniętą pozycję.

**`Backspace` usuwa tylko pustą pozycję.** Scalanie niepustej pozycji z poprzednią to
zachowanie edytora tekstu; świadomie poza zakresem.

`Enter` dziedziczy znacznik bieżącej pozycji, **z wyjątkiem stanów końcowych**: po `done`,
`scheduled` i `migrated` nowa pozycja jest zwykłym `task`. Nikt nie chce pozycji urodzonej
jako wykonana; za to pisząc ciąg notatek chce się zostać przy `note`.

## 6. Zmiana znacznika i przenoszenie między dniami

To rozdzielenie jest najważniejszą decyzją projektową tej fazy.

`Tab` cykluje **wyłącznie trzy znaczniki opisujące stan pozycji tutaj**: `task`, `done`,
`note`. Zmiana znacznika nie ma żadnego efektu ubocznego.

`scheduled` i `migrated` **nie są w cyklu**, bo nie są stanami — są zapisem tego, że pozycja
poszła gdzie indziej, i ich ustawienie zapisuje do listy innego dnia. Gdyby siedziały w cyklu
`Tab`, dwa naciśnięcia w tę i z powrotem zostawiłyby duplikaty w cudzym dniu.

Ustawia się je z **menu znacznika**: prawy przycisk myszy albo długie przytrzymanie na
znaczniku pozycji otwiera listę pięciu typów.

- **Przeniesienie (`>`)** — dopisuje kopię pozycji na koniec listy **jutra** jako `task`,
  a bieżącą oznacza `migrated` i zapisuje `movedTo` = jutro.
- **Zaplanowanie (`<`)** — pyta o dzień, dopisuje kopię na koniec listy tego dnia jako `task`,
  a bieżącą oznacza `scheduled` z `movedTo` = wybrany dzień.
- **Idempotencja:** jeśli `movedTo` jest już ustawione, ponowny wybór tego samego typu nie
  kopiuje niczego drugi raz. Zmiana znacznika na `task`, `done` lub `note` czyści `movedTo`,
  ale **nie usuwa kopii** w dniu docelowym — kopia jest tam osobną pozycją, którą użytkownik
  może skasować sam. Cofnięcie (`Ctrl+Z`) zdejmuje całą operację razem z kopią.

Przy pozycji z `movedTo` panel pokazuje skrótowy dzień docelowy (np. `→ 25 wrz`), żeby zapis
„to poszło dalej" był czytelny bez otwierania tamtego dnia.

Klik w znacznik przełącza **tylko** `task ↔ done`. To ruch wykonywany kilkadziesiąt razy
dziennie i nie może wymagać celowania w menu.

## 7. Trwałość i cofanie

Zapis idzie istniejącą drogą: mutacje przez `commit()`, które robi migawkę stanu, zapisuje do
`localStorage` i w razie niepowodzenia pokazuje toast.

**Migawka powstaje przy opuszczeniu pozycji lub przy operacji strukturalnej** (nowa pozycja,
usunięcie, zmiana znacznika, przeniesienie). Pisanie wewnątrz jednej pozycji to jeden krok
cofania. `Ctrl+Z` z fokusem w polu obsługuje przeglądarka na poziomie znaków — globalny
handler i tak ignoruje klawisze przy `inInput`.

Powód jest praktyczny: historia cofania ma 50 migawek całego stanu. Migawka na znak zapełniłaby
ją w jednym zdaniu i wyrzuciła z niej wszystko, co użytkownik zrobił wcześniej.

Kopia zapasowa JSON obejmuje `items` automatycznie — `bundleExport` serializuje cały `State`,
a `bundleParse` przepuszcza go przez `normalize()`, więc kopia sprzed migracji `v3` wczyta się
z pustą listą zamiast się wywrócić.

## 8. Podział odpowiedzialności

Obowiązuje reguła projektu: **`src/lib/` nie importuje niczego ze Svelte.**

| Plik | Odpowiedzialność |
|---|---|
| `src/lib/types.ts` | `ItemType`, `Item`, `items` w `State` |
| `src/lib/items.ts` | **nowy, czysty:** `dayItems`, `insertAfter`, `removeAt`, `cycleType`, `nextTypeOnEnter`, `migrateTo` |
| `src/lib/model.ts` | migracja `v2 → v3` w `normalize()` |
| `src/lib/backup.ts` | bez zmian — serializuje cały `State` |
| `src/actions.svelte.ts` | mutatory listy wołające `commit()` |
| `src/state.svelte.ts` | `ui.pane` (`'grid'` albo `'list'`) dla wąskiego ekranu, `ui.focusItem` dla przenoszenia fokusu |
| `src/components/Panes.svelte` | **nowy:** kontener dzielący ekran, obsługa progu |
| `src/components/list/List.svelte` | **nowy:** panel, pusta lista, wstawianie pierwszej pozycji |
| `src/components/list/ListItem.svelte` | **nowy:** pole tekstowe, klawiatura, znacznik `movedTo` |
| `src/components/list/Bullet.svelte` | **nowy:** znacznik, klik `task ↔ done`, menu typów |
| `src/components/Header.svelte` | przełącznik paneli na wąskim ekranie |
| `src/app.css` | `#panes`, `#list`, style pozycji |

`items.ts` jest czysty w tym samym sensie co `segments.ts`: dostaje tablicę i indeks, zwraca
nową tablicę albo wartość. Nie wie nic o fokusie ani o DOM.

Fokus jest stanem widokowym: mutator ustawia `ui.focusItem` na identyfikator pozycji, a
`ListItem` reaguje efektem, który wywołuje `.focus()` i ustawia karetkę. Dzięki temu „usuń
pozycję i wróć na koniec poprzedniej" jest operacją na danych plus jedną deklaracją, a nie
imperatywnym grzebaniem w DOM z mutatora.

## 9. Testy

**Jednostkowe (`src/lib/items.ts`)** — wstawianie pod pozycją w tablicy z przeplecionymi dniami;
usuwanie ostatniej pozycji dnia; cykl znacznika w obie strony; typ nowej pozycji po `Enter` dla
każdego z pięciu typów wejściowych; przeniesienie dopisujące do właściwego dnia; idempotencja
przeniesienia przy ustawionym `movedTo`; `dayItems` zachowujące kolejność mimo przeplotu.

**Migracja (`src/lib/model.ts`)** — stan `v2` dostaje pustą listę i `v: 3`; stan `v3` bez
tablicy `items` też; istniejące bloki i kategorie przechodzą nietknięte.

**Montowanie (jsdom)** — pisanie w pustym panelu tworzy pozycję; `Enter` tworzy następną
i przenosi fokus; `Tab` zmienia znacznik bez przenoszenia fokusu; `Backspace` na pustej
pozycji usuwa ją i wraca na koniec poprzedniej; `↑`/`↓` na krawędziach przechodzą między
pozycjami, a w środku tekstu nie; lista utrwala się w `localStorage`; zmiana dnia pokazuje
listę tego dnia.

**Render (SSR)** — oba panele obecne; każdy typ renderuje właściwy znak; pozycja z `movedTo`
pokazuje dzień docelowy.

Warstwa wizualna podziału (proporcje, przewijanie panelu, próg wąskiego ekranu) pozostaje do
weryfikacji ręcznej — tak samo jak reszta CSS-a w tym projekcie.

## 10. Świadomie poza zakresem

- **Faza B: powiązanie z blokami.** Godzina przy pozycji, wybór bloku, niezmiennik „każdy blok
  ma swoją pozycję". Własny projekt, po tej fazie.
- **Zagnieżdżanie.** Wraca jako `v3 → v4` z polem `depth` i obsługą `Tab`/`Shift+Tab`; wtedy
  cykl znacznika przenosi się na inny klawisz. Nie dokładamy teraz pola, które stałoby na zerze.
- **Scalanie pozycji `Backspace`em** na niepustym tekście.
- **Zwijanie** — bez zagnieżdżania nie ma czego zwijać.
- **Zaznaczanie tekstu przez wiele pozycji.** Każda pozycja to osobne pole; cena wybranego
  modelu edytora.
- **Wklejanie wielu linii** dzielone na pozycje. Wklejenie trafia w całości do jednej pozycji.
- **Przeciąganie kolejności** myszą.
