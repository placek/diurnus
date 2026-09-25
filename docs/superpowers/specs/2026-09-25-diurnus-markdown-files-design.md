# Diurnus — stan w plikach markdown: projekt

**Status:** decyzje zaakceptowane, format zaimplementowany i używany przez eksport i import
w ustawieniach · **Data:** 2026-09-25 · **Kod:** [`src/lib/md/`](../../../src/lib/md/) ·
**Zastępuje:** [format markdown dziennika](2026-09-24-gridday-markdown-format-design.md) ·
**Maszyna stanów:** [projekt](2026-09-25-diurnus-state-machine-design.md)

## 1. Cel

Dwukierunkowe przekształcenie stanu aplikacji w pliki i z powrotem:

- `YYYY-MM-DD.md` — dziś (i, po północy, archiwum tamtego dnia);
- `BACKLOG.md` — wszystko poza dziś;
- `.diurnus.toml` — kategorie i ustawienia dnia.

Format zachowuje stan **deterministycznie i jednoznacznie**: każdy stan ma dokładnie jedną
postać kanoniczną, a jej odczyt daje ten sam stan.

### Co uznajemy za sukces

- `parse(render(stan))` daje stan równy wejściowemu z dokładnością do nazw identyfikatorów.
- `render(parse(pliki))` daje dokładnie te same bajty, jeśli pliki były kanoniczne.
- Plik, którego nie da się przedstawić jako stan, jest **odrzucany w całości** z numerem linii
  i powodem. Nic nie wczytuje się częściowo.

## 2. Decyzje

| Pytanie | Decyzja |
|---|---|
| Tożsamość | Identyfikatorów i czasu utworzenia nie ma w plikach; odczyt nadaje nowe, deterministyczne. Wyjątek: wzorzec i jego kopie niosą `^id`, bo od tego powiązania zależy reguła „jedna otwarta kopia" |
| Nieznane linie | **Ścisły odczyt**: linia, która nie jest nagłówkiem, pustą linią ani pozycją, to błąd całego pliku |
| Kolejność | Zapis kanoniczny: dziś — zadania ze slotem według godzin, potem reszta w kolejności; backlog — według daty i godziny, potem bez terminu w kolejności. Ręcznie zmieniona kolejność jest normalizowana |
| Tekst | Jedna linia; tekst wyglądający na człon formatu dostaje odwrotny ukośnik |
| Dni minione | Plik dnia zostaje po północy jako archiwum: tylko wykonane i notatki. Stan żywy to dziś i backlog |
| Kategorie | `#tag`, gdzie tag to slug kategorii; nieznany tag to błąd |
| Ustawienia | `.diurnus.toml`: kategorie i doba. Parser potrzebuje godzin doby, żeby sprawdzić sloty |
| Walidacja | Po odczycie działa kontrola niezmienników maszyny; stanu, którego aplikacja nie umie pokazać, nie da się wczytać |
| Wzorce | Po polsku, tak jak pokazuje je aplikacja |

## 3. Linia pozycji

Jedna pozycja to jedna linia. Człony stoją zawsze w tej kolejności, każdy opcjonalny:

```
* [znacznik] [data] [{wzorzec}] [GG:MM] [#tag] tekst [^id]
```

| Człon | Postać | Znaczenie |
|---|---|---|
| znacznik | `[ ]` / `[x]` / brak | otwarte zadanie / wykonane / notatka |
| data | `RRRR-MM-DD` | tylko backlog: termin, a przy wzorcu — najbliższe wystąpienie |
| wzorzec | `{codziennie}` itd. | tylko backlog; zawsze razem z datą |
| czas | `GG:MM` na pełnym kwadransie | slot 30 minut |
| tag | `#slug` | kategoria |
| tekst | reszta linii | treść; może być pusta |
| id | `^id` na końcu | wzorzec: jego identyfikator; kopia: identyfikator wzorca |

Człony oddziela jedna spacja. Linia kończy się na ostatnim niepustym członie — pusta pozycja
to `*` albo `* [ ]`.

### Wzorce

| Zapis | Wzorzec |
|---|---|
| `{codziennie}` | codziennie |
| `{co poniedziałek}` … `{co niedzielę}` | co tydzień |
| `{3. każdego miesiąca}` | co miesiąc |
| `{co rok 24 wrz}` | co rok |

### Ucieczka tekstu

- Tekst zaczynający się od `\`, `[`, `{`, `#` albo cyfry dostaje na początku `\`. Odczyt zdejmuje
  dokładnie jeden.
- Ostatnie słowo tekstu, które zaczyna się od `^` (także poprzedzone ukośnikami), dostaje
  dodatkowy `\`. Odczyt zdejmuje dokładnie jeden. Bez tego tekst kończący się na `^coś`
  czytałby się jako identyfikator.

Reguła jest szersza, niż ściśle trzeba — `\3 rzeczy` — ale jest prosta i nie ma wyjątków.

### Czas i data

Czas to `GG:MM` z minutą 00, 15, 30 albo 45. Coś, co wygląda na czas albo datę, ale nim nie
jest — `09:07`, `2026-02-30` — jest **błędem**, a nie tekstem: literówka w godzinie nie może
cicho zamienić zadania ze slotem w zadanie bez niego.

## 4. Pliki

### `YYYY-MM-DD.md`

```markdown
# 2026-09-25

* [ ] 09:00 #nauka Czytanie
* [x] 10:30 #praca Raport
* [ ] 14:00 #dom Podlać kwiaty ^p1
* [ ] Kupić chleb
* [x] Zadzwonić do mamy
* Notatka z rozmowy
```

- Nagłówek `# RRRR-MM-DD` musi zgadzać się z nazwą pliku.
- Dozwolone: `[ ]` i `[x]` z czasem albo bez, notatki. Notatka nie ma czasu. Data i wzorzec są
  błędem.
- **Dziś** to plik dnia o najpóźniejszej dacie. Pozostałe pliki dni to archiwum: w nich
  dozwolone są tylko `[x]` i notatki, bo otwarte zadania przeszły o północy dalej.

### `BACKLOG.md`

```markdown
# Backlog

* [ ] 2026-09-26 {codziennie} 14:00 #dom Podlać kwiaty ^p1
* [ ] 2026-10-01 09:00 #praca Spotkanie
* [ ] 2026-10-03 Dentysta
* [ ] Kiedyś, bez daty
* Notatka w backlogu
```

- Nagłówek `# Backlog`.
- Dozwolone: `[ ]` bez terminu, z datą, z datą i czasem, z datą i wzorcem (czas opcjonalny);
  notatki bez terminu. `[x]` jest błędem — wykonane nie mieszka w backlogu.
- Wzorzec zawsze niesie `^id`. Wzorzec wpisany ręcznie bez niego dostaje identyfikator
  z pozycji w pliku; wzorzec bez daty — datę najbliższego wystąpienia po dniu dzisiejszym.
- Czas pozycji backlogu musi mieścić się w dniu z ustawień.

### `.diurnus.toml`

```toml
[day]
start = 6
end = 22

[[day.bands]]
name = "Rano"
from = 6
color = "aqua"

[[categories]]
tag = "praca"
name = "Praca"
icon = "laptop-code"
color = "yellow"

[[categories]]
tag = "projekt-a"
name = "Projekt A"
parent = "praca"
```

- Kategoria główna ma kolor; podkategoria wskazuje rodzica tagiem i koloru nie ma.
- Brak `icon` znaczy „jak kategoria nadrzędna". `archived = true` oznacza kategorię
  zarchiwizowaną.
- Tag to slug: małe litery ASCII, cyfry i łączniki. Kategorie bez tagu dostają go z nazwy —
  bez polskich znaków, z łącznikami, z przyrostkiem `-2`, `-3` przy powtórzeniu.
- Brak pliku daje ustawienia domyślne.

## 5. Zapis i odczyt

- `renderFiles(stan)` daje zawsze plik dziś, `BACKLOG.md` i `.diurnus.toml`, a do tego plik
  każdego minionego dnia, w którym coś zostało.
- `parseFiles(pliki)` zwraca stan albo listę błędów `{ plik, linia, powód }`. Nieznana nazwa
  pliku też jest błędem.
- Identyfikatory nadane przy odczycie mają postać `plik:linia`. Kategoria dostaje identyfikator
  równy tagowi.
- Po odczycie działa `violations()` z maszyny stanów: nakładające się sloty, slot poza dniem,
  archiwum z otwartym zadaniem — wszystko to błędy.

## 6. Eksport i import w aplikacji

Zakładka „Dane" w ustawieniach zastępuje dawną kopię JSON:

- **Pobierz dziennik** zapisuje archiwum `diurnus-RRRR-MM-DD.zip` z wszystkimi plikami z §5.
  Jedno archiwum, bo przeglądarka nie pobierze wygodnie kilku plików naraz, a `.diurnus.toml`
  pobrany osobno straciłby kropkę. Wpisy mają stałą datę, więc ten sam stan daje te same bajty.
- **Wczytaj dziennik** przyjmuje to archiwum albo te same pliki zaznaczone razem. Katalogi
  w archiwum i śmieci systemowe (`__MACOSX`, `._*`, `.DS_Store`) są pomijane, znacznik BOM
  zdejmowany, a `diurnus.toml` bez kropki uznawany za plik ustawień. Ta sama nazwa dwa razy to
  błąd.
- **Błędy** pokazują się w zakładce jako lista `plik:linia: powód`; nic się wtedy nie wczytuje.
- **Wczytanie** pyta o potwierdzenie, zastępuje cały stan i czyści historię cofania. Wczytany
  dzień dogania kalendarz tak samo jak stan zapisany dawniej. Preferencje (motyw, pomoc,
  powiadomienia) nie są częścią dziennika i zostają bez zmian.
- **Starsza kopia JSON** nadal się wczytuje, jeśli wskazać ją samą; nowej się już nie tworzy.

Kod: `src/lib/md/archive.ts` i `src/components/settings/DataTab.svelte`.

## 7. Poza zakresem

- **Dziennik jako miejsce przechowywania.** Aplikacja nadal trzyma stan w `localStorage`;
  pliki służą do eksportu i importu, nie do bieżącej pracy.
- **Pole `tag` w ustawieniach aplikacji.** Do tego czasu tag wylicza się z nazwy.
- **Tekst wielowierszowy.** Aplikacja go nie tworzy; zapis takiego stanu jest błędem.
