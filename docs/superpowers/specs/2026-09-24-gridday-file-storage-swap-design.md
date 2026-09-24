# Diurnus — podmiana trwałości na pliki (faza 3 z 3): projekt

**Status:** do przeglądu · **Data:** 2026-09-24 · **Poprzednie fazy:** [serwer](2026-09-24-diurnus-diary-server-design.md), [format](2026-09-24-diurnus-markdown-format-design.md) · **Specyfikacja nadrzędna:** [`PLAN.md`](../../../PLAN.md)

## 1. Cel

Wpiąć serwer z fazy 1 i parser z fazy 2 na miejsce `localStorage`. Po tej fazie **pliki
w `/srv/data/diary` są jedynym źródłem prawdy**, a aplikacja jest ich widokiem.

### Co uznajemy za sukces

Wpis utworzony w aplikacji pojawia się w pliku markdown w oczekiwanym formacie. Zmiana pliku
przez agenta jest widoczna po powrocie do okna. Wyczyszczenie danych przeglądarki nie usuwa
niczego poza motywem.

## 2. Decyzje podjęte przed projektem

| Pytanie | Decyzja |
|---|---|
| Istniejące dane w `localStorage` | **Porzucone** — dziennik jest prawdą od pierwszego wczytania |
| Co wczytywać | **Dziś, dzień źródłowy przeniesienia, `BACKLOG`** |
| Pliki dni przyszłych | **Nie istnieją** — wszystko przyszłe mieszka w `BACKLOG.md` |
| Nadejście terminu | **Pozycja przenosi się do dziś automatycznie** |
| Kiedy zapisywać | **Z opóźnieniem po zmianie i natychmiast przy utracie fokusu** |

## 3. Co wczytuje się i kiedy

Przy starcie aplikacja pyta `/api/entries` o listę istniejących wpisów, a następnie pobiera
**dokładnie trzy**:

1. **dziś** — panel siatki i notatek,
2. **najpóźniejszy dzień wcześniejszy niż dziś, który ma plik** — wyłącznie po to, żeby
   przenieść niedokończone zadania,
3. **`BACKLOG`** — wszystko przyszłe, z terminem i bez.

Pliki dni przyszłych nie istnieją, więc nie ma czego pobierać: rzecz zaplanowana na 25 września
jest linią w `BACKLOG.md` z datą, nie osobnym plikiem. Dni minione poza źródłem przeniesienia
**nie są pobierane nigdy**.

Dziennik ciągnący się latami kosztuje więc tyle samo co jednodniowy: **trzy żądania,
niezależnie od tego, ile plików leży w katalogu.**

### Dwa automatyczne ruchy przy starcie dnia

**Przeniesienie niedokończonych** działa jak dotąd, tyle że zapisuje dwa pliki: dzień źródłowy
traci pozycje, dzisiejszy je zyskuje.

**Nadejście terminu** jest jego odbiciem. Pozycja backlogu, której data wypadła na dziś albo
wcześniej, przenosi się do dzisiejszego pliku i traci datę — plik dnia już ją niesie. Pozycja
cykliczna, której wzorzec wypada dziś (`occursOn`), zostawia szablon w backlogu i wstawia
do dziś kopię bez wzorca.

Obie zmiany idą tą samą drogą co każda inna edycja.

### Dlaczego cykliczność nie mnoży zadań

Te dwa ruchy same w sobie tworzą pętlę: szablon `{codziennie}` wstawia zadanie do dziś,
niedokończone zadanie przenosi się jutro na jutro, a szablon wstawia jutro kolejne. Po tygodniu
byłoby ich siedem.

**Szablon nie wstawia kopii, jeśli dzisiejszy plik zawiera już niedokończoną linię o tym samym
tekście i tej samej porze.** Reguła jest prymitywna i taka ma być: nie wymaga żadnego pola
wiążącego kopię z szablonem, a więc nie wymaga niczego w formacie pliku. Ceną jest to, że
dwóch świadomie identycznych zadań tego samego dnia nie da się mieć — przypadek na tyle
rzadki, że nie warto za niego płacić dodatkowym polem w każdej linii.

## 4. Kiedy zapisuje się i co

Zapis obejmuje **cały plik wpisu**, bo tak wygląda API. Wyzwalają go:

- **opóźnienie** — około sekundy po ustaniu zmian; napisane zdanie to jeden zapis, nie
  czterdzieści, a historia dziennika w gicie pozostaje czytelna;
- **utrata fokusu pola albo ukrycie okna** — natychmiast, żeby zamknięcie karty niczego nie
  zgubiło.

To ten sam podział, który już rządzi granicą cofania: pisanie wewnątrz jednej pozycji jest
jedną zmianą, a wyjście z niej ją domyka.

Zapisywane są wyłącznie wpisy, które faktycznie się zmieniły — wejście na dzień i wyjście
z niego nie może dotknąć pliku.

## 5. Konflikty i awarie

**Nieaktualny zapis (409).** Serwer odmawia, aplikacja pobiera wpis na nowo, zastępuje nim
swoją wersję i pokazuje komunikat, że wpis zmienił się poza aplikacją. Niezapisana zmiana
lokalna przepada — i jest to wybór świadomy: scalanie dwóch wersji pliku bez interfejsu do
rozstrzygania różnic dałoby wynik, którego nikt nie zatwierdził.

Ryzyko jest małe, bo zapis następuje sekundę po zmianie, a okno konfliktu to ta sekunda.

**Powrót do okna.** Zdarzenie `visibilitychange` przeładowuje wczytane wpisy. Zmiana agenta
pojawia się wtedy, gdy wracasz do karty.

**Serwer nieosiągalny.** Aplikacja pokazuje stan awarii zamiast pustego dnia — pusty dzień
wygląda jak „nic nie zaplanowałeś", a to kłamstwo. Bez serwera nie ma danych i nie udajemy,
że jest inaczej. Brak trybu offline jest świadomy: kopia w przeglądarce oznaczałaby
rozjechanie się z plikami i konflikt do rozstrzygnięcia przy każdym powrocie.

## 6. Co znika

**`localStorage` jako magazyn stanu.** `lib/persist.ts` i cała ścieżka `diurnus.v1` wychodzą.

**Kopia zapasowa JSON.** `lib/backup.ts` i zakładka „Dane" znikają. Dziennik jest katalogiem
plików tekstowych — kopią zapasową jest `git` albo cokolwiek innego, czym użytkownik już się
posługuje. Eksport do formatu, którego nic poza tą aplikacją nie czyta, przestał mieć sens
w chwili, gdy prawdą stały się pliki.

**Migracja istniejących danych.** Świadomie żadnej: dziennik jest prawdą od pierwszego
wczytania. Dane z `localStorage` zostają porzucone.

**Wdrożenie na GitHub Pages.** Workflow, `BASE_PATH` i wzmianki w dokumentacji odchodzą —
aplikacja potrzebuje serwera, więc statyczny hosting nie ma jej gdzie obsłużyć.

## 7. Co zostaje w przeglądarce

**Wyłącznie preferencje interfejsu** — motyw i to, czy pomoc została już pokazana — pod
kluczem `diurnus.prefs`. To ustawienia urządzenia, nie treść dziennika: telefon może mieć
ciemny motyw, a komputer jasny, i nie jest to niezgodność do uzgodnienia.

**Stan widokowy** (`ui`) pozostaje ulotny, jak dotąd.

## 8. Budowa

| Plik | Zmiana |
|---|---|
| `src/lib/api.ts` | **nowy:** `fetchEntry`, `saveEntry`, `listEntries`, `fetchConfig`, `saveConfig` |
| `src/lib/persist.ts` | **usunięty** |
| `src/lib/backup.ts` | **usunięty** |
| `src/state.svelte.ts` | stan ładowany z API; zapis z opóźnieniem zamiast `save()` |
| `src/lib/model.ts` | `normalize()` traci migracje schematu — nie ma już wersjonowanego stanu |
| `src/components/settings/DataTab.svelte` | **usunięty** |
| `src/components/Status.svelte` | **nowy:** stan awarii, gdy serwer nie odpowiada |
| `.github/workflows/pages.yml` | **usunięty** |
| `vite.config.ts` | bez `BASE_PATH`; proxy `/api` na serwer w trybie deweloperskim |

`src/lib/api.ts` jest jedyną warstwą znającą HTTP. Mutatory wołają zapis, nie `fetch`.

### Wersjonowanie schematu odchodzi

`normalize()` niosło migracje `v1`→`v5`, bo stan mieszkał w przeglądarce i musiał przeżywać
zmiany kształtu. Pliki markdown nie mają wersji — mają format, a format zmienia się przez
zmianę parsera. Migracje wychodzą razem z `localStorage`; zostaje sprawdzanie i uzupełnianie
wartości domyślnych.

## 9. Testy

**`lib/api.ts`** — składanie żądań, nagłówek tokenu, 409 rozpoznane jako konflikt, błąd sieci
zgłoszony jako awaria a nie pusta treść.

**Zapis z opóźnieniem** — seria zmian daje jeden zapis; utrata fokusu wymusza zapis
natychmiast; wpis niezmieniony nie jest zapisywany w ogóle.

**Wczytywanie** — pobierane są dokładnie trzy wpisy: dziś, dzień źródłowy przeniesienia
i `BACKLOG`; katalog z setką plików daje tyle samo żądań co katalog z trzema.

**Nadejście terminu** — pozycja z datą dzisiejszą przenosi się do dziś i traci datę; pozycja
z datą jutrzejszą zostaje; pozycja cykliczna wypadająca dziś zostawia szablon i wstawia kopię;
szablon nie wstawia drugiej kopii, gdy identyczna niedokończona linia już w dziś jest.

**Konflikt** — 409 przeładowuje wpis i melduje; stan po przeładowaniu zgadza się z serwerem.

**Awaria** — serwer nieosiągalny pokazuje stan awarii, a nie pusty dzień.

**Obieg przez wszystkie warstwy** — utworzenie bloku w zamontowanej aplikacji kończy się
żądaniem `PUT` z tekstem, który parser z fazy 2 wczytuje z powrotem na ten sam blok.

## 10. Świadomie poza zakresem

- **Widok historii.** Dni minione nadal nie mają jak się pokazać; teraz są dodatkowo
  niepobierane. To ta sama luka, zapisana w `PLAN.md`.
- **Tryb offline.** Opisany w §5 jako decyzja, nie niedopatrzenie.
- **Scalanie konfliktów.** Wpis pobierany na nowo zastępuje wersję lokalną.
- **Wielu użytkowników.** Narzędzie jednoosobowe; token to ochrona przed siecią, nie kontrola
  dostępu.
