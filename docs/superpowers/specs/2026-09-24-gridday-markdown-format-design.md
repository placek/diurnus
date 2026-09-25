# Diurnus — format markdown dziennika (faza 2 z 3): projekt

**Status:** zastąpiony przez [stan w plikach markdown](2026-09-25-diurnus-markdown-files-design.md) — powstał dla modelu bloków sprzed maszyny stanów · **Data:** 2026-09-24 · **Poprzednia faza:** [serwer plików](2026-09-24-diurnus-diary-server-design.md) · **Specyfikacja nadrzędna:** [`PLAN.md`](../../../PLAN.md)

## 1. Cel

Parser i serializator formatu wpisu dziennika: z tekstu pliku na model aplikacji i z powrotem.
Czyste funkcje w `src/lib/`, testowane na tekstach, bez serwera i bez interfejsu.

**Ta faza nie podłącza niczego.** Aplikacja nadal stoi na `localStorage`, serwer z fazy 1
nadal nikogo nie obsługuje. Parser powstaje i jest sprawdzony w izolacji, bo to w nim będą
błędy, a faza 3 ma go tylko wpiąć.

### Co uznajemy za sukces

Dowolny plik zgodny z formatem wczytuje się do modelu, a zapis tego modelu daje tekst, który
wczytuje się identycznie. Linia, której parser nie rozumie, przeżywa obieg bez zmian.

## 2. Format

```markdown
# 2026-09-24

* Zwykła notatka
* [ ] niedokończone zadanie
* [x] wykonane zadanie
* [ ] 09:00 niedokończony blok
* [x] 09:00 wykonany blok
* [ ] 09:00-10:30 blok z końcem
* [ ] 09:00 #praca blok z kategorią
* [~] 09:00-10:30 #praca blok w toku
* [ ] {co poniedziałek} #praca blok cykliczny
```

Kolejność elementów w linii jest stała: **znacznik, czas albo wzorzec, kategoria, tekst**.
Czas i kategoria są opcjonalne niezależnie od siebie.

| Człon | Postać | Gdzie | Znaczenie |
|---|---|---|---|
| znacznik | brak / `[ ]` / `[x]` / `[~]` | wszędzie | notatka / zadanie / wykonane / w toku |
| data | `YYYY-MM-DD` | tylko backlog | termin |
| wzorzec | `{opis}` | tylko backlog | powtarzalność; wyklucza się z datą |
| czas | `HH:MM` albo `HH:MM-HH:MM` | wszędzie | blok czasu; bez niego pozycja jest zadaniem |
| kategoria | `#tag` | wszędzie | wskazanie na definicję z konfiguracji |
| tekst | reszta linii | wszędzie | treść |

Kolejność jest stała: **znacznik, data albo wzorzec, czas, kategoria, tekst.** Wzorzec
i czas mogą wystąpić razem — `{co poniedziałek} 09:00` to cykliczny blok o stałej porze.

### `BACKLOG.md`

Pliki przyszłych dni **nie istnieją**. Wszystko, co zaplanowane na później — także rzeczy
z godziną — mieszka w `BACKLOG.md`. Dlatego jego linie mają dodatkowy, opcjonalny człon:
datę, przed czasem.

```markdown
* [ ] 2026-09-25 09:00-10:30 #praca Spotkanie
* [ ] 2026-09-25 #praca Zadanie bez pory
* [ ] {co poniedziałek} 09:00 #praca Cykliczne
* [ ] Kiedyś, bez daty
* Notatka w backlogu
```

Data pojawia się **wyłącznie w backlogu**. Linia w pliku dnia nigdy jej nie nosi, bo dzień
mówi już nazwa pliku — powtórzenie go w każdej linii byłoby miejscem, w którym dwa zapisy
mogą się rozejść.

Nagłówek `BACKLOG.md` jest opcjonalny i ignorowany: znaczenie ma lista, nie tytuł.

### Wzorce powtarzalności

Zapisywane słowami, dokładnie tak, jak aplikacja je pokazuje — `describeRepeat` już produkuje
te napisy, a parser dopasowuje je z powrotem:

| Zapis | Wzorzec |
|---|---|
| `{codziennie}` | `daily` |
| `{co poniedziałek}` … `{co niedzielę}` | `weekly` |
| `{3. każdego miesiąca}` | `monthly` |
| `{co rok 24 wrz}` | `yearly` |

Agent czyta plik i rozumie harmonogram bez tablicy kodów. Ceną jest ograniczenie do czterech
wzorców, które aplikacja i tak umie — to samo ograniczenie, które ma interfejs.

**Najbliższe wystąpienie nie jest zapisywane.** Model miał dotąd pole `nextOn`; format niesie
sam wzorzec, więc termin wylicza się z niego przy każdym odczycie. Nowa czysta funkcja
`occursOn(repeat, day)` odpowiada na pytanie „czy wypada tego dnia", a `nextOccurrence`
zostaje do sortowania i opisu. Pole, które mogłoby się zestarzeć, przestaje istnieć —
a plik edytowany przez agenta nigdy nie musi go pamiętać.

## 3. Trzy reguły, które są decyzjami, nie szczegółami

### Nieznana linia przeżywa obieg bez zmian

Linia, której parser nie rozpoznaje — akapit prozy, zagnieżdżony punkt, tabela, cokolwiek —
jest zapamiętywana wraz ze swoją pozycją i odtwarzana przy zapisie **bajt w bajt**.

To najważniejsza reguła tej fazy. Pliki pisze także agent, a edytor oparty na plikach, który
kasuje to, czego nie zrozumiał, jest gorszy od braku edytora. Każda nierozpoznana linia to
potencjalnie czyjaś praca.

### `[~]` znaczy „w toku" tylko wtedy, gdy zegar to potwierdza

Znacznik `[~]` czyta się jako stan **aktywny wyłącznie wtedy**, gdy bieżąca chwila mieści się
w przedziale bloku. Poza nim blok jest zaplanowany, a skoro jego czas minął — aplikacja pokaże
go jako przegapiony.

Powód jest prosty: `[~]` zostawione na noc twierdzi, że coś trwa, choć nie trwa. Zaufanie
znacznikowi dałoby fantomowe odliczanie rzeczy porzuconej poprzedniego dnia. Blok, któremu
czas minął, przy najbliższym zapisie tego dnia zostanie zapisany jako `[ ]` — zapominamy, że
był zaczęty, i to jest uczciwsze niż udawanie, że trwa albo że się skończył.

### Czas normalizuje się do kwadransa

Siatka rysuje kwanty 15-minutowe i nie umie pokazać `09:07`. Czas odczytany zaokrągla się
**w dół** do kwadransa, a zapis oddaje już wartość zaokrągloną. Plik po pierwszym zapisie
z aplikacji zawiera `09:00`.

Zaokrąglenie w dół, a nie do najbliższego: przesunięcie zdarzenia wstecz nie sprawia, że
kolidowałoby z czymś wcześniejszym, a przesunięcie w przód mogłoby.

## 4. Pozostałe reguły odwzorowania

- **Blok bez końca trwa 30 minut** — tyle, ile domyślny blok w aplikacji.
- **Blok z końcem** dostaje długość z różnicy, zaokrągloną w górę do kwadransa i co najmniej
  jeden kwant; koniec wcześniejszy niż początek jest traktowany jak brak końca.
- **Kolejność pozycji** wynika z kolejności linii w pliku.
- **Nieznana kategoria** — `#tag` bez definicji w konfiguracji — nie jest błędem: pozycja
  renderuje się neutralnie, a tag zostaje w pliku. Agent wymyślający nową etykietę nie może
  popsuć dnia.
- **Nagłówek `# YYYY-MM-DD`** jest odtwarzany przy zapisie; data bierze się z nazwy pliku,
  nie z nagłówka, bo to nazwa decyduje, który to dzień.

## 5. Konfiguracja dziennika

Kategorie i ustawienia doby przenoszą się z `localStorage` do pliku **`.diurnus.json`**
w katalogu dziennika:

```json
{
  "categories": [
    { "tag": "praca", "name": "Praca", "icon": "laptop-code", "color": "yellow" },
    { "tag": "praca-a", "name": "Projekt A", "icon": null, "parent": "praca" }
  ],
  "day": { "start": 6, "end": 22, "bands": [] }
}
```

Konfiguracja podróżuje z dziennikiem i wersjonuje się razem z nim, więc telefon i komputer
zgadzają się co do tego, jak wygląda `#praca`. Agent może ją przeczytać, żeby dowiedzieć się,
co znaczą tagi.

`tag` jest nowym polem kategorii i to on trafia do pliku. Brak pliku konfiguracji oznacza
zestaw domyślny — ten sam, który dziś daje `normalize()`.

## 6. Budowa

| Plik | Odpowiedzialność |
|---|---|
| `src/lib/md/parse.ts` | tekst wpisu → `{ items, blocks, unknown }` |
| `src/lib/md/serialize.ts` | model → tekst wpisu, z odtworzeniem nieznanych linii |
| `src/lib/md/line.ts` | pojedyncza linia: rozbiór i złożenie |
| `src/lib/md/config.ts` | `.diurnus.json`: odczyt, zapis, wartości domyślne |
| `src/lib/repeat.ts` | dochodzi `occursOn(repeat, day)`; znika potrzeba `nextOn` |

Wszystko czyste: na wejściu tekst i konfiguracja, na wyjściu dane. Żadnego `fetch`, żadnego
Svelte, żadnej wiedzy o tym, skąd wziął się tekst — dzięki temu ten sam moduł może kiedyś
zaimportować serwer.

## 7. Testy

**Obieg** — dla każdego rodzaju linii osobno i dla pliku zawierającego wszystkie naraz:
`parse` a potem `serialize` daje tekst identyczny z wejściem.

**Rozbiór linii** — notatka; zadanie otwarte i wykonane; blok z samą godziną; blok z zakresem;
blok z kategorią; blok z kategorią i zakresem; blok cykliczny; `[~]` wewnątrz i poza swoim
czasem; godzina niebędąca wielokrotnością kwadransa; koniec przed początkiem; tag bez definicji.

**Nieznane linie** — akapit prozy, zagnieżdżony punkt, pusta linia w środku listy, tabela:
wszystkie wracają na swoje miejsce bez zmiany. Plik złożony wyłącznie z nieznanych linii
wraca identyczny.

**Backlog** — linia z datą; linia z datą i porą; linia z datą, porą i zakresem; linia
z wzorcem i porą; linia bez daty; data w pliku dnia jest traktowana jako część tekstu, a nie
jako termin. `occursOn` dla każdego z czterech wzorców, w dniu trafienia i w dniu obok.

**Przypadki brzegowe** — pusty plik; plik z samym nagłówkiem; `BACKLOG.md` bez nagłówka;
linia `* [ ]` bez treści; podwójne spacje między członami; tekst zawierający `#` w środku
zdania, który nie jest kategorią.

**Konfiguracja** — brak pliku daje domyślne; uszkodzony JSON daje domyślne zamiast wyjątku;
kategoria bez `tag` jest pomijana.

## 8. Świadomie poza zakresem

- **Podłączenie do serwera i usunięcie `localStorage`** — faza 3.
- **Wzorce spoza czwórki** — te same cztery, które umie interfejs.
- **Zagnieżdżanie pozycji.** Zagnieżdżony punkt w pliku jest nieznaną linią i przeżywa obieg,
  ale aplikacja go nie pokazuje.
- **Migracja istniejącego `localStorage` do plików.** Faza 3 rozstrzygnie, czy stan z
  przeglądarki ma być gdziekolwiek przeniesiony.
