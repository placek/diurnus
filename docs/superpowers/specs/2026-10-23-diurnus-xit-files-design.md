# Diurnus — dziennik w plikach [x]it!: projekt

**Status:** decyzje zaakceptowane, format zaimplementowany; używają go synchronizacja, eksport
i import · **Data:** 2026-10-23 · **Kod:** [`src/lib/xit/`](../../../src/lib/xit/),
[`src/lib/journal.ts`](../../../src/lib/journal.ts) · **Zastępuje:**
[pliki markdown](2026-09-25-diurnus-markdown-files-design.md) (zostają do odczytu) ·
**Format:** [[x]it! 1.1](https://xit.jotaen.net/) ·
**Synchronizacja:** [projekt](2026-09-25-diurnus-sync-design.md)

## 1. Cel

Dziennik w plikach [x]it! zamiast Markdownu. [x]it! to format list zadań w zwykłym tekście
o tej samej budowie co dzień w Diurnusie: pola wyboru `[ ]` `[x]` `[@]` `[~]` `[?]`, terminy
`-> 2026-10-23`, `#tagi`, ciąg dalszy pozycji wcięty czterema spacjami i grupy z tytułem.
Pliki czyta i podświetla każde narzędzie [x]it! (wtyczki do edytorów, `xit` w terminalu),
a dla Diurnusa niosą dokładnie ten sam stan co pliki Markdown.

- `RRRR-MM-DD.xit` — dziś (i, po północy, archiwum tamtego dnia);
- `BACKLOG.xit` — wszystko poza dziś;
- `.diurnus.toml` — ustawienia, ze znacznikiem `format = "xit"`.

Te same zasady co dotąd: **zapis kanoniczny, odczyt ścisły**. `parse(render(stan))` daje ten
sam stan, `render(parse(pliki))` — te same bajty dla plików kanonicznych, a plik, którego nie da
się przedstawić jako stan, jest odrzucany w całości z numerem linii i powodem.

## 2. Decyzje

| Pytanie | Decyzja |
|---|---|
| Notatki | Pozycja `[?]` — poprawny [x]it!, a kolejność i opis zostają na swoim miejscu |
| Czas | Data z godziną ISO 8601 w terminie: `-> 2026-10-23T14:15` |
| Strefa czasowa | Brak: lokalny czas ściany, jak w całym Diurnusie. Przesunięcie strefy zmieniałoby się z czasem letnim i między urządzeniami |
| Sekundy | Zapis bez sekund; odczyt przyjmuje też `:00` |
| Nieudane | `[~]` (w [x]it! „obsolete") |
| Wzorce | `#repeat="RRULE"` — wartość tagu w cudzysłowie, może mieć `;` i `=` |
| Powiązanie wzorzec–kopia | Wzorzec niesie `#id=…`, jego kopie `#from=…`; znaczenie nie zależy już od pliku, jak przy `^id` |
| Kategoria | Tag ze slugiem kategorii, jak dotąd |
| Inne `#tagi` i priorytet | Część tekstu: `!!` i `#cokolwiek` wracają bajt w bajt |
| Przejście | Automatyczne, po aktualizacji, jednym commitem w repozytorium ([§6](#6-przejście-z-markdownu)) |

## 3. Pozycja

```
[stan] tekst -> DATA[TGG:MM] #repeat="RRULE" #kategoria #id=… | #from=…
    linie opisu
    [ ] kroki
```

| Stan w Diurnusie | Pole wyboru |
|---|---|
| otwarte zadanie | `[ ]` |
| wykonane | `[x]` |
| nieudane | `[~]` |
| notatka | `[?]` |

`[@]` („w toku") czyta się jako otwarte zadanie i zapisuje jako `[ ]` — jedyny przypadek, który
nie wraca bajt w bajt.

### Człony na końcu linii

Diurnus zapisuje swoje człony zawsze za tekstem, w kolejności z ramki wyżej. Odczyt zdejmuje je
**od końca linii**, aż do pierwszego słowa, które członem nie jest — reszta to tekst:

| Człon | Postać | Znaczenie |
|---|---|---|
| termin | `-> RRRR-MM-DD` albo `-> RRRR-MM-DDTGG:MM` | data albo data ze slotem 30 minut; godzina na pełnym kwadransie |
| wzorzec | `#repeat="FREQ=…"` | reguła iCal (RRULE), jak w [plikach markdown](2026-09-25-diurnus-markdown-files-design.md#wzorce); termin to najbliższe wystąpienie |
| kategoria | `#slug` | tag, który jest kategorią z ustawień |
| identyfikator | `#id=…` / `#from=…` | wzorzec: jego identyfikator / kopia: identyfikator wzorca |

- Nazwy tagów nie zależą od wielkości liter (`#Praca` to `#praca`), jak w [x]it!.
- Tag, który nie jest kategorią ani członem, zostaje w tekście — tak samo druga kategoria:
  `[ ] A #dom #praca` to „A #dom" w kategorii Praca.
- Termin musi być dniem: okresy [x]it! (`-> 2026-10`, `-> 2026-W42`, `-> 2026-Q4`, `-> 2026`)
  są błędem, podobnie nieistniejąca data i godzina poza kwadransem (`T09:07`, `T10:15:30`).
- `#id` i `#from` naraz to błąd.

### Ucieczka tekstu

Tekst, którego koniec czytałby się jako człon, dostaje `\`:

- przed ostatnim słowem, które jest kategorią albo `#repeat=`/`#id=`/`#from=` z wartością:
  `kupić \#dom`;
- przed `->`, za którym stoi coś jak data: `x \-> 2026-10-01`.

Odczyt zdejmuje dokładnie jeden ukośnik (`\\#dom` to tekst `\#dom`). Inne `#tagi` ucieczki nie
potrzebują i dla narzędzi [x]it! zostają zwykłymi tagami.

### Opis i kroki

- Ciąg dalszy pozycji to linie wcięte **czterema spacjami**. Najpierw opis, potem kroki
  `[ ] …` / `[x] …` — tylko pod zadaniem; notatka kroków nie ma.
- [x]it! nie zna pustej linii w pozycji (pusta linia kończy grupę), więc pusta linia opisu
  to `\`. Linia opisu wyglądająca jak krok albo złożona z samych ukośników dostaje `\` na
  początku; odczyt zdejmuje jeden.
- Głębiej wcięte zostaje w tekście opisu. Inne wcięcie niż cztery spacje to błąd.

## 4. Pliki

### `RRRR-MM-DD.xit`

```
[x] Raport -> 2026-10-23T08:00 #praca
[~] Siłownia -> 2026-10-23T07:00
[ ] Spotkanie zespołu -> 2026-10-23T10:00 #praca
    agenda w kalendarzu
    [x] slajdy
    [ ] notatki
[ ] Podlać kwiaty -> 2026-10-23T14:00 #dom #from=p1
[?] Rozmowa poszła dobrze
[ ] Zakupy
```

- Bez nagłówka: datę niesie nazwa pliku. Pusty dzień to pusty plik.
- Termin w pliku dnia to data tego dnia — z godziną: slot; bez godziny: zadanie bez slotu.
  Inna data i wzorzec to błąd; tytuły grup też.
- Kolejność kanoniczna jak dotąd: zamknięte w kolejności zamknięcia, potem otwarte ze slotem
  według godzin, potem reszta.
- Pliki minionych dni to archiwum: tylko `[x]`, `[~]` i `[?]`.

### `BACKLOG.xit`

```
[ ] Podlać kwiaty -> 2026-10-24T14:00 #repeat="FREQ=DAILY" #dom #id=p1
[ ] Dentysta -> 2026-10-30
[?] Notatka w backlogu

Remont
[ ] Kafelki

Diurnus
[ ] Wydanie -> 2026-11-10
[ ] Dropbox #diurnus-sync
    opis
```

- Najpierw pozycje spoza projektów, potem **grupa na każdy projekt**: pusta linia, nazwa
  projektu jako tytuł grupy, jego pozycje. Pozycja w grupie nie powtarza tagu projektu; tag
  stoi tylko przy podkategorii projektu.
- Pusta linia kończy grupę — pozycje za nią bez tytułu wracają poza projekty.
- Tytuł to nazwa projektu z ustawień (bez względu na wielkość liter); nieznana nazwa, ten sam
  projekt dwa razy albo tytuł w środku grupy to błąd. Nazwa zaczynająca się od `[` albo `\`
  dostaje `\` na początku.
- `[x]` i `[~]` są błędem — zamknięte nie mieszka w backlogu. Termin z godziną musi mieścić
  się w dniu z ustawień.

### `.diurnus.toml`

Jak dotąd, z jednym kluczem więcej na początku:

```toml
format = "xit"

[day]
start = 6
end = 22
…
```

Brak klucza — pliki dziennika są w Markdownie. Starsze wersje aplikacji nie znają tego klucza
i **odrzucają** takie ustawienia, więc karta sprzed aktualizacji nie nadpisze repozytorium po
przejściu.

## 5. Odczyt: który format

`parseJournal` patrzy na nazwy plików: `.xit` — [x]it!, same `.md` — Markdown (dawny czytnik,
bez zmian), oba naraz — błąd „pomieszane formaty". Eksport w ustawieniach daje zawsze [x]it!;
import przyjmuje archiwum ZIP, pliki `.xit`, `.md`, `.toml` i kopię JSON.

## 6. Przejście z Markdownu

Repozytorium połączone przed aktualizacją przechodzi samo, przy pierwszej turze synchronizacji
([projekt synchronizacji](2026-09-25-diurnus-sync-design.md#przejście-na-xit)):

1. Synchronizacja kończy się jeszcze w Markdownie: zmiany z repozytorium wchodzą, niewysłane
   zmiany stąd idą.
2. Jednym commitem `diurnus: przejście na [x]it!` znikają pliki `.md` dziennika i pojawiają się
   `.xit` oraz ustawienia ze znacznikiem formatu. Gdy repozytorium zmieniło się w międzyczasie,
   commit nie wchodzi wcale, a całość powtarza się od kroku 1.
3. Urządzenie, które zastaje repozytorium już przeniesione, przejmuje je dokument po dokumencie:
   co zmieniło się tylko tutaj — idzie, co tylko tam — przychodzi, co po obu stronach —
   konflikt, jak zawsze.

Pliki `.md` w repozytorium po przejściu (np. z karty starszej wersji) są dla synchronizacji obce,
jak README.

## 7. Testy

`test/xit.test.ts`: każda pozycja i ucieczka, błędy z numerami linii, grupy projektów, a na
losowych stanach maszyny — obieg `parse(render(s)) ≅ s` ze stałym zapisem oraz **ten sam stan
z plików [x]it! i z plików Markdown** (przejście niczego nie gubi). `test/sync-migrate.test.ts`
i `test/sync.mount.test.ts`: przejście repozytorium z edycjami po obu stronach, przesunięta
gałąź, drugie urządzenie, stare pliki `.md` i pierwsze połączenie.
