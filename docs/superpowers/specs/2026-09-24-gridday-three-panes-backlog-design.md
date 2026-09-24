# GridDay — trzy panele, backlog i powtarzalność: projekt

**Status:** do przeglądu · **Data:** 2026-09-24 · **Poprzednie fazy:** [lista notatek](2026-09-24-gridday-note-list-design.md), [powiązanie bloków](2026-09-24-gridday-block-item-link-design.md) · **Specyfikacja nadrzędna:** [`PLAN.md`](../../../PLAN.md)

## 1. Cel

Aplikacja przestaje być przeglądarką dni, a staje się narzędziem o dwóch horyzontach:
**dziś** (siatka i jej notatki) oraz **wszystko poza dziś** (backlog). Rzeczy przechodzą
z backlogu do dziś przez przeciągnięcie; odhaczone w backlogu lądują w dzienniku dziś;
niedokończone z ostatniego dnia wypływają dziś na górę. Pozycje backlogu mogą się powtarzać
według wzorca.

### Co uznajemy za sukces

Otwarcie aplikacji pokazuje dokładnie jeden dzień — dzisiejszy — i listę wszystkiego, co czeka.
Nie da się zabłądzić w kalendarzu, bo nie ma po czym chodzić. Zaplanowanie czegoś na przyszłość
to przeciągnięcie w prawo; wzięcie tego do roboty to przeciągnięcie w lewo.

### Zakres

Trzy podsystemy w jednej specyfikacji, na wyraźne życzenie autora: układ trzech paneli razem
z usunięciem nawigacji po dniach, ruch pozycji między panelami, oraz powtarzalność.
Zgłosiłem, że to materiał na trzy osobne cykle; decyzja o jednym została podtrzymana.

## 2. Decyzje podjęte przed projektem

| Pytanie | Decyzja |
|---|---|
| Podział prac | **Jedna specyfikacja** na całość |
| Dostęp do dni minionych | **Brak** — osobny widok historii kiedyś później |
| Pozycje bez daty | **Tak**, `day` staje się opcjonalne |
| Wąski ekran | **Przełącznik cykliczny** przez trzy panele |
| Model powtarzalności | **Jeden szablon** zostający w backlogu, bez generowania instancji |
| Przeniesienie niedokończonych | **Przedatowanie na dziś** z ostatniego dnia, który cokolwiek miał |
| Wzorce | **dziennie, tygodniowo wg dnia tygodnia, miesięcznie wg dnia miesiąca, rocznie** |
| Pozycja z godziną upuszczona na dziś | **Staje się blokiem**, jeśli slot wolny |

## 3. Model danych

Schemat rośnie `v4 → v5`.

```ts
export type ItemType = 'task' | 'done' | 'note';

export type Repeat =
  | { kind: 'daily' }
  | { kind: 'weekly'; weekday: number }                    // 0 = niedziela … 6 = sobota
  | { kind: 'monthly'; dayOfMonth: number }                // 1–31
  | { kind: 'yearly'; month: number; dayOfMonth: number }; // month 1–12

export interface Item {
  id: string;
  /** `null` = pozycja backlogu bez zadeklarowanej daty */
  day: string | null;
  text: string;
  type: ItemType;
  created: number;
  /** blok na siatce, którego ta pozycja jest odbiciem (tylko dziś) */
  block?: string;
  /** godzina jako kwant 0–95, gdy pozycja ma porę, ale nie ma jeszcze bloku */
  at?: number;
  /** wzorzec powtarzania; wyłącznie pozycje backlogu */
  repeat?: Repeat;
  /** data najbliższego wystąpienia, utrzymywana przez silnik powtarzalności */
  nextOn?: string;
}
```

### Co znika

`ItemType` traci `scheduled` i `migrated`, a `Item` traci `movedTo`. Te znaczniki istniały
wyłącznie po to, by odnotować, że coś zostało przeniesione. Teraz przeniesienie jest dosłowne —
pozycja zmienia dzień — więc znacznik nie ma czego opisywać. Migracja `v4 → v5` zamienia oba
znaczniki na `task` i usuwa `movedTo`.

To zmiana jednokierunkowa: kopia zapasowa sprzed `v5` wczyta się poprawnie, ale informacja
„to było przeniesione 25 września" nie ma gdzie wrócić.

### Bloki istnieją tylko dziś i w przeszłości

Siatka pokazuje wyłącznie dzisiejszy dzień, a bloki powstają wyłącznie przez nią. Zobowiązanie
na przyszłość to pozycja z `day` i ewentualnie `at`; blokiem staje się dopiero w dniu, w którym
trafia na siatkę. Znika przez to pytanie z fazy B o bloki w przyszłych dniach.

### Zaokrąglenie miesiąca

Wzorzec „31. każdego miesiąca" w miesiącach krótszych przypada na **ostatni dzień miesiąca**.
Luty dostaje 28. albo 29. To jedyna reguła, która po cichu robi coś innego, niż napisano,
więc jest napisana wprost.

## 4. Układ ekranu

```
body (flex column)
├── #top                                  nagłówek: data, zegar, narzędzia
└── #panes (flex row)
    ├── #grid     (flex 1)                dzisiejsza siatka
    ├── #list     (flex 1, wyróżniony)    dzisiejsze notatki
    └── #backlog  (flex 1)                wszystko poza dziś
```

Panel środkowy jest **wizualnie wyniesiony**: tło `--raise`, szersze marginesy wewnętrzne
i mocniejsze obramowania boczne. To miejsce, w którym się pisze, i ma tak wyglądać.

Poniżej **1300 px** widać jeden panel naraz, a przełącznik w nagłówku cyklicznie przechodzi
`siatka → notatki → backlog`. Próg jest wyższy niż dotychczasowe 900 px, bo trzy panele
potrzebują mniej więcej półtora raza tyle miejsca co dwa.

### Usunięcie nawigacji po dniach

`viewDay` znika ze stanu. Wszędzie, gdzie występowało, wchodzi „dziś", wyliczane z zegara.
Z nagłówka znikają strzałki dni, a z klawiatury skróty `[`, `]` i `T`.

**Konsekwencja, z którą godzi się ta faza:** dni minione stają się nieosiągalne. Zapisane bloki
nadal są w danych i wchodzą do kopii zapasowej, ale nie ma ich jak obejrzeć, dopóki nie powstanie
widok historii. Autor przyjął to świadomie.

## 5. Backlog

Zawiera pozycje, dla których `day === null` albo `day > dziś`. Kolejność:

1. Pozycje z datą — rosnąco po `(day, at)`; powtarzalne biorą do sortowania swoje `nextOn`.
2. Pozycje bez daty — w kolejności tablicy, przestawialne przeciąganiem.

Każdy wiersz pokazuje, co o nim wiadomo: datę (`wt 29 wrz`), godzinę (`09:00`), albo opis
wzorca (`co poniedziałek`, `3. każdego miesiąca`, `co rok 24 wrz`). Pozycja powtarzalna ma
**kółko zamiast kropki** — znacznik wyliczany z obecności `repeat`, a nie osobny typ.

## 6. Ruch między panelami

| Gest | Skutek |
|---|---|
| Przeciągnięcie **backlog → notatki** | `day` = dziś. Jeśli pozycja ma `at`, a slot jest wolny — powstaje blok (kategoria z menu radialnego) i pozycja wiąże się z nim. Slot zajęty — pozycja ląduje bez bloku, z komunikatem dlaczego. |
| Przeciągnięcie **notatki → backlog** | Pyta o datę i opcjonalną godzinę, podpowiadając jutro. Zastępuje dawne `>` i `<`. |
| **Odhaczenie pozycji backlogu** | Pozycja przenosi się do dzisiejszej listy jako wykonana. Pozycja **powtarzalna** zostaje — rodzi wykonaną kopię w dziś i przesuwa `nextOn`. |
| **Zmiana doby** | Niedokończone zadania z ostatniego dnia, który cokolwiek miał, dostają dzisiejszą datę i trafiają na górę notatek. |

### Okno wyboru daty

Małe okienko przy kursorze: `<input type="date">` z jutrzejszą datą i opcjonalne
`<input type="time">`. Bez zależności, obsługiwane z klawiatury, `Escape` anuluje.
Pusta godzina oznacza pozycję bez pory.

Godzina z pola `time` jest **zaokrąglana w dół do pełnego kwadransa** i zapisywana jako
kwant 0–95 — tą samą jednostką, którą posługuje się siatka. Bez tego pozycja mogłaby nosić
porę, której siatka nie umie pokazać.

### Przeniesienie niedokończonych

Przy pierwszym otwarciu w nowej dobie (i przy starcie aplikacji) silnik szuka **najpóźniejszego
dnia wcześniejszego niż dziś, który ma jakiekolwiek pozycje**, i przenosi z niego na dziś,
na początek grupy swobodnej, **wyłącznie pozycje typu `task` bez powiązanego bloku**.

Pomijane są zatem: pozycje `done` (rzecz zrobiona zostaje w dniu, w którym ją zrobiono),
pozycje `note` (notatka opisuje tamten dzień, nie dzisiejszy) oraz pozycje powiązane z blokiem
(blok jest zapisem czasu, który minął). Skanowanie wstecz zamiast „tylko wczoraj" sprawia,
że weekend poza domem nie gubi piątkowych resztek.

Operacja jest **idempotentna z natury**: po przeniesieniu tamten dzień nie ma już
niedokończonych zadań, więc powtórne wykonanie nic nie robi.

## 7. Powtarzalność

Jeden szablon, który zostaje w backlogu. Nic nie jest generowane z wyprzedzeniem, więc nie ma
okna generowania, sprzątania ani duplikatów do uzgadniania.

```ts
nextOccurrence(repeat: Repeat, after: string): string
describeRepeat(repeat: Repeat): string
```

`nextOccurrence` zwraca pierwszą datę **ściśle późniejszą** niż `after`. `nextOn` jest
utrzymywane przy każdym odhaczeniu i uzupełniane przy wczytaniu stanu, jeśli wypadło w przeszłość.

Wzorce i ich opisy:

| Wzorzec | Opis |
|---|---|
| `{ kind: 'daily' }` | `codziennie` |
| `{ kind: 'weekly', weekday: 1 }` | `co poniedziałek` |
| `{ kind: 'monthly', dayOfMonth: 3 }` | `3. każdego miesiąca` |
| `{ kind: 'yearly', month: 9, dayOfMonth: 24 }` | `co rok 24 wrz` |

Wzorzec ustawia się z menu znacznika pozycji backlogu. Brak interwałów („co 2 tygodnie"),
porządkowych dni tygodnia („druga wtorek") i dat końcowych — świadomie poza zakresem.

## 8. Podział plików

| Plik | Zmiana |
|---|---|
| `src/lib/types.ts` | `ItemType` bez `scheduled`/`migrated`; `day` nullowalne; `at`, `repeat`, `nextOn` |
| `src/lib/repeat.ts` | **nowy, czysty:** `nextOccurrence`, `describeRepeat`, `clampToMonth` |
| `src/lib/backlog.ts` | **nowy, czysty:** `backlogItems`, `todayItems`, `carryOver`, `sortBacklog` |
| `src/lib/items.ts` | `dayItems` przyjmuje `string \| null`; znika obsługa `migrated`/`scheduled` |
| `src/lib/link.ts` | `reconcile` zawsze dla dziś |
| `src/lib/model.ts` | migracja `v4 → v5` |
| `src/lib/keys.ts` | usunięcie skrótów `[`, `]`, `T` |
| `src/state.svelte.ts` | `viewDay` → `today`; `ui.pane` trójstanowe; przeniesienie przy zmianie doby |
| `src/actions.svelte.ts` | ruch między panelami, odhaczenie backlogu, usunięcie `migrateItem` |
| `src/components/Panes.svelte` | trzy panele, próg 1300 px |
| `src/components/Header.svelte` | bez strzałek dni, przełącznik trójstanowy |
| `src/components/backlog/` | **nowy:** `Backlog.svelte`, `BacklogItem.svelte`, `RepeatMenu.svelte`, `DatePrompt.svelte` |
| `src/components/list/Bullet.svelte` | menu bez przeniesień, z wzorcami dla backlogu |
| `src/app.css` | trzy panele, wyróżnienie środkowego, style backlogu |

## 9. Testy

**Jednostkowe (`lib/repeat.ts`)** — następne wystąpienie dla każdego z czterech wzorców;
zawsze ściśle po dacie odniesienia; 31. w lutym zaokrąglony do ostatniego dnia; 29 lutego
w roku nieprzestępnym; przejście przez koniec roku; opisy wszystkich wzorców po polsku.

**Jednostkowe (`lib/backlog.ts`)** — podział na dziś i backlog z uwzględnieniem `day === null`;
sortowanie po dacie i godzinie, z `nextOn` dla powtarzalnych; przeniesienie z najpóźniejszego
dnia z pozycjami, nie tylko z wczoraj; przeniesienie pomija wykonane, notatki i pozycje
powiązane z blokiem; idempotencja przeniesienia.

**Migracja (`lib/model.ts`)** — `scheduled` i `migrated` stają się `task`; `movedTo` znika;
pozycje bez `day` przechodzą; wersja rośnie do 5.

**Montowanie (jsdom)** — trzy panele na szerokim ekranie; przełącznik cyklicznie przechodzi
wszystkie trzy na wąskim; nagłówek bez strzałek dni; przeciągnięcie z backlogu na notatki
zmienia dzień pozycji; przeciągnięcie z godziną na wolny slot tworzy blok; na zajęty — nie
tworzy i komunikuje; przeciągnięcie na backlog otwiera okienko daty z jutrem; odhaczenie
pozycji backlogu przenosi ją do dziś; odhaczenie powtarzalnej zostawia szablon i przesuwa
`nextOn`; niedokończone z poprzedniego dnia pojawiają się na górze.

## 10. Świadomie poza zakresem

- **Widok historii.** Dni minione są nieosiągalne do czasu jego powstania.
- **Interwały, porządkowe dni tygodnia i daty końcowe** we wzorcach.
- **Edycja pojedynczego wystąpienia** powtarzalnej pozycji — istnieje tylko szablon.
- **Przeciąganie wprost na siatkę.** Upuszczenie celuje w listę notatek; blok powstaje
  z godziny, którą pozycja już nosi.
- **Powtarzalność pozycji dzisiejszych.** Wzorzec ma sens tylko w backlogu.
