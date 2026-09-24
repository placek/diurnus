# GridDay — powiązanie bloków z pozycjami listy (faza B): projekt

**Status:** do przeglądu · **Data:** 2026-09-24 · **Poprzednia faza:** [lista notatek](2026-09-24-gridday-note-list-design.md) · **Specyfikacja nadrzędna:** [`PLAN.md`](../../../PLAN.md)

## 1. Cel

Blok czasu na siatce i pozycja na liście przestają być dwoma osobnymi zapisami tej samej
rzeczy. Obowiązuje niezmiennik: **każdy blok ma dokładnie jedną pozycję na liście tego dnia**.

Pozycja powiązana pokazuje godzinę i kolor kategorii swojego bloku, a jej tekst jest tytułem
tego bloku. Pozycje niepowiązane — zwykłe notatki — działają jak dotąd.

### Co uznajemy za sukces

Kliknięcie w siatkę tworzy blok i jego pozycję w jednym ruchu; usunięcie jednego usuwa drugie;
zmiana tekstu po którejkolwiek stronie widać po obu. Dzień da się przeczytać z samej listy:
najpierw co i o której było zaplanowane, potem notatki.

## 2. Decyzje podjęte przed projektem

| Pytanie | Decyzja |
|---|---|
| Semantyka powiązania | **Lustro** — pozycja JEST blokiem; usunięcie jednego usuwa drugie |
| Miejsce pozycji powiązanej | **Na górze listy, w kolejności godzin**, nad notatkami |
| Znacznik a status bloku | **Niezależne** — odhaczenie pozycji nie zmienia statusu bloku |
| Pozycja → blok (godzina z listy) | **Odłożone** — w tej fazie tylko blok tworzy pozycję |
| Przeniesienie pozycji powiązanej | **Blok przenosi się** do dnia docelowego |
| Zajęty slot w dniu docelowym | **Odmowa z komunikatem**, nic się nie przesuwa |
| Wygląd pozycji powiązanej | **Godzina + kolor kategorii**; znacznik zostaje użytkownika |

## 3. Model danych

```ts
export interface Item {
  id: string;
  day: string;
  text: string;
  type: ItemType;
  created: number;
  movedTo?: string;
  /** NOWE w v4: identyfikator bloku, którego ta pozycja jest odbiciem */
  block?: string;
}
```

Bloki nie zmieniają kształtu. Schemat rośnie `v3 → v4`.

### Migracja `v3 → v4`

Istniejące bloki nie mają pozycji. Migracja wywołuje `reconcile()` **dla wszystkich dni**
jeden raz — praca jest ograniczona liczbą już zapisanych bloków. Po niej wystarcza uzgadnianie
dnia oglądanego, bo nowe bloki powstają wyłącznie w dniu, na który użytkownik patrzy.

## 4. `reconcile()` — niezmiennik w jednej funkcji

```ts
reconcile(
  items: readonly Item[],
  blocks: readonly Block[],
  day: string | null,      // null = wszystkie dni
  created: number,
  makeId: () => string,
): Item[]
```

Robi dokładnie dwie rzeczy:

1. **Tworzy** pozycję dla każdego bloku, który jej nie ma. Nowa pozycja: `type: 'task'`,
   `text: block.title` (zwykle puste), `block: block.id`, `day: block.day`.
2. **Usuwa** każdą pozycję, której `block` wskazuje na nieistniejący blok.

Bloki `discarded` nie są blokami dnia w sensie siatki i **nie dostają pozycji**; pozycja
powiązana z blokiem, który stał się `discarded`, jest usuwana jak przy skasowaniu.

### Gdzie się wykonuje

**Wewnątrz `commit()`** — jedynego miejsca, przez które przechodzi każda mutacja stanu.
To właśnie czyni niezmiennik strukturalnym, zamiast ośmiu osobnych „trzeba pamiętać, żeby".
Dodatkowo efekt w `App.svelte` uzgadnia dzień po jego zmianie, bo samo przejście na inny dzień
nie jest mutacją.

### Czego `reconcile()` NIE robi

- **Nie synchronizuje tekstu.** Robią to ścieżki edycji: zmiana tekstu pozycji powiązanej
  ustawia `block.title`, a zmiana tytułu w arkuszu bloku ustawia `item.text`. Gdyby tekst
  synchronizował `reconcile`, musiałby zgadywać, która strona zmieniła się jako ostatnia.
- **Nie synchronizuje znaczników.** Znacznik pozycji jest niezależny od statusu bloku.

## 5. Układ listy

Lista dnia rozpada się na dwie grupy:

1. **Pozycje powiązane**, posortowane po `q` swojego bloku — czyli po godzinie.
2. **Pozycje swobodne**, w kolejności nadanej przez użytkownika (tablica + przeciąganie).

Pozycja powiązana pokazuje przed tekstem godzinę (`09:00`) i przyjmuje kolor kategorii swojego
bloku, więc ta sama aktywność czyta się tak samo po obu stronach ekranu bez dokładania ikony.
Pusty tekst wyświetla nazwę kategorii jako podpowiedź — tak jak robi to blok na siatce.

Godzina i kolor są **wyliczane z bloku przy renderowaniu, nie przechowywane w pozycji**.
Dzięki temu zmiana kategorii bloku w arkuszu edycji od razu przebarwia pozycję i nie ma
trzeciego pola, które mogłoby się rozjechać.

**Przeciąganie nie działa na pozycjach powiązanych**: ich miejsce na liście to ich godzina.
Uchwyt pozostaje klikalny (znacznik) i otwiera menu, ale nie rozpoczyna przeciągania.
Przeciąganie pozycji swobodnych działa jak dotąd, w obrębie swojej grupy.

## 6. Skutki poszczególnych operacji

| Operacja | Skutek |
|---|---|
| Utworzenie bloku na siatce | `reconcile` tworzy jego pozycję |
| Usunięcie bloku | `reconcile` usuwa jego pozycję |
| Odrzucenie sugestii (`discarded`) | jak usunięcie — pozycja znika |
| Usunięcie pozycji powiązanej | **usuwa też blok** (lustro), jedną operacją, odwracalną |
| Edycja tekstu pozycji powiązanej | ustawia `block.title` |
| Edycja tytułu w arkuszu bloku | ustawia `item.text` |
| Zmiana znacznika pozycji powiązanej | nic po stronie siatki |
| Zmiana statusu bloku | nic po stronie listy |
| Przeciąganie pozycji powiązanej | zablokowane |
| `>` lub `<` na pozycji powiązanej | patrz §7 |

Usunięcie pozycji powiązanej kasuje zapisany blok czasu. To jest lustro, o które chodziło, i
jest odwracalne przez `Ctrl+Z` — ale trzeba mieć świadomość, że `Backspace` na pustej pozycji
powiązanej usuwa zarejestrowany czas.

## 7. Przenoszenie pozycji powiązanej

Przeniesienie (`>` na jutro, `<` na wybrany dzień) pozycji powiązanej **przenosi blok**:

1. Sprawdź, czy w dniu docelowym przedział `[q, q+len)` jest wolny.
   Jeśli nie — **odmowa**: komunikat „W dniu *D* o *HH:MM* jest już zajęte", stan bez zmian.
2. Jeśli wolny: `block.day` zmienia się na dzień docelowy.
3. Pozycja źródłowa traci `block`, dostaje `type: 'migrated'` (albo `'scheduled'`) i `movedTo`.
4. `reconcile` materializuje pozycję powiązaną w dniu docelowym — nie trzeba kopiować niczego
   ręcznie, bo tekst jedzie razem z tytułem bloku. Operacja uzgadnia **oba dni**, źródłowy
   i docelowy: zwykłe uzgadnianie obejmuje tylko dzień oglądany, a tu zmienia się także dzień,
   na który użytkownik w tej chwili nie patrzy.

Dzięki temu przeniesienie pozycji powiązanej nie jest osobnym mechanizmem: to przeniesienie
bloku plus zwykłe oznaczenie źródła, a resztę załatwia niezmiennik.

## 8. Podział plików

| Plik | Zmiana |
|---|---|
| `src/lib/types.ts` | pole `block?` w `Item` |
| `src/lib/link.ts` | **nowy, czysty:** `reconcile`, `linkedItems`, `freeItems`, `blockOfItem`, `slotFree` |
| `src/lib/model.ts` | migracja `v3 → v4` z jednorazowym pełnym `reconcile` |
| `src/lib/items.ts` | `moveItem` ignoruje pozycje powiązane |
| `src/state.svelte.ts` | `reconcile` wewnątrz `commit()` |
| `src/actions.svelte.ts` | lustrzane usuwanie, synchronizacja tekstu, przeniesienie bloku |
| `src/components/list/List.svelte` | dwie grupy, sortowanie powiązanych po godzinie |
| `src/components/list/ListItem.svelte` | godzina, kolor kategorii, zablokowane przeciąganie |
| `src/components/EditSheet.svelte` | zapis tytułu ustawia też tekst pozycji |
| `src/app.css` | styl pozycji powiązanej |

`lib/link.ts` jest czysty w tym samym sensie co `lib/items.ts`: dostaje tablice, zwraca tablicę.

## 9. Testy

**Jednostkowe (`lib/link.ts`)** — `reconcile` tworzy brakującą pozycję i ustawia `block`;
nie tworzy drugiej przy powtórnym wywołaniu (idempotencja); usuwa pozycję osieroconą; pomija
bloki `discarded` i usuwa ich pozycje; nie rusza pozycji swobodnych; z `day = null` obejmuje
wszystkie dni; `linkedItems` sortuje po `q` bloku; `freeItems` zachowuje kolejność tablicy;
`slotFree` wykrywa kolizję z blokiem w dniu docelowym, także częściową.

**Migracja (`lib/model.ts`)** — stan `v3` z blokami bez pozycji dostaje pozycje dla wszystkich
dni i `v: 4`; istniejące pozycje swobodne przechodzą nietknięte.

**Montowanie (jsdom)** — utworzenie bloku na siatce pokazuje pozycję na liście z godziną;
usunięcie bloku usuwa pozycję; `Backspace` na pustej pozycji powiązanej usuwa blok z siatki;
wpisanie tekstu w pozycji powiązanej zmienia tytuł bloku; pozycje powiązane stoją nad
swobodnymi i są posortowane po godzinie; przeciąganie pozycji powiązanej nic nie zmienia;
przeniesienie na zajęty slot pokazuje komunikat i nie zmienia stanu; przeniesienie na wolny
slot przenosi blok i zostawia oznaczenie w dniu źródłowym.

## 10. Świadomie poza zakresem

- **Nadanie godziny pozycji z listy** (pozycja → nowy blok). Wymaga wyboru kategorii i jest
  osobną decyzją projektową.
- **Powiązanie pozycji z istniejącym blokiem.** Niezmiennik mówi, że blok ma już swoją pozycję,
  więc „podepnij tę notatkę pod tamten blok" oznaczałoby dwie pozycje na blok.
- **Synchronizacja znacznika ze statusem bloku.** Świadomie rozłączone.
- **Przeciąganie pozycji między grupami** (uczynienie powiązanej swobodną i odwrotnie).
- **Zmiana godziny bloku przez przeciąganie na siatce.** Siatka tego dziś nie umie i faza B
  tego nie dodaje.
