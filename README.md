# Diurnus

Planer jednego dnia: doba podzielona na 15-minutowe kwanty, dzienny log w duchu bullet
journal i backlog na wszystko, co nie jest na dziś. Działa w przeglądarce, bez konta
i bez serwera — **[github.com/placek/diurnus](https://github.com/placek/diurnus)**.

Aplikacja pokazuje **wyłącznie dziś**. Cała aktywna część dnia mieści się w jednym oknie bez
przewijania, każdy blok czasu jednym kliknięciem oznacza się jako wykonany, a upływ czasu
zmienia tylko kolor — nigdy stan. Wykonanie oznacza zawsze człowiek.

## Co potrafi

### Siatka dnia

- **Doba w kwantach.** Wiersz to godzina, pole to kwadrans; widać tylko aktywne godziny
  z ustawień, z porami dnia (rano, praca, dom…) na marginesie i linią „teraz".
- **Blok to 30 minut.** Klik w wolne pole otwiera pierścień kategorii — z podkategoriami
  podpisanymi nazwami — i stawia blok. Klik w blok przełącza wykonane ↔ otwarte, dwuklik
  albo prawy przycisk edytuje.
- **Przesuwanie.** Blok przeciąga się myszą albo `Shift` + strzałki / `HJKL`, i to wyłącznie
  na wolne miejsce w obrębie dnia; zajęte miejsce jest odmową z wyjaśnieniem.
- **Kolor mówi o czasie:** plan, trwa (z odliczaniem), minęło, wykonane. Pasek postępu pod
  datą pokazuje, ile doby już rozdysponowano — wykonane i zaplanowane, w kolorach kategorii.
- **Klawiatura.** Strzałki / `hjkl` prowadzą kursor, `Enter` działa jak klik, cyfry nadają
  kategorię, `E` edytuje, `Del` usuwa.
- **Powiadomienia** kwadrans przed blokiem i na jego starcie (opcjonalne, przy otwartej karcie).

### Lista dnia

- **Bullet journal:** zadanie `·`, wykonane `×`, notatka `–`. Pisze się od razu w pustym
  wierszu; `Enter` dodaje kolejny, `Tab` zmienia znacznik, `⌫` na pustym usuwa.
- **Jeden rekord.** Zadanie z godziną na liście to ten sam blok, co na siatce — ten sam tekst,
  kategoria i znacznik.
- **Kolejność:** na górze wykonane, w kolejności odhaczania; pod nimi zadania z godziną
  według godzin; potem reszta w kolejności, którą ustawia się przeciąganiem.
- **Kategorie** widać jako ikonę na końcu wiersza; pozycja z godziną ma tło w kolorze
  kategorii, jak blok.

### Backlog

- **Wszystko poza dziś:** pozycje bez terminu, z datą, z datą i godziną oraz powtarzalne.
- **Bliski termin** w ciągu pięciu dni ma pogrubione „jutro", „za 3 dni"… w barwie od
  czerwieni do żółci.
- **Przyjścia o świcie.** Pozycja z terminem sama przychodzi do dziś w swoim dniu, z godziną;
  jeśli godzina jest zajęta, czeka dzień dłużej. Przeciąganiem można ją też wziąć na dziś
  wcześniej albo odłożyć zadanie z dziś do backlogu.
- **Termin i powtarzanie** nadaje „Wybierz datę…" w menu znacznika: dzień, godzina
  i powtarzanie.

### Powtarzanie

Wzorce to **reguły iCal (RFC 5545 RRULE)** z dokładnością do dnia: co N dni, tygodni,
miesięcy lub lat; wybrane dni tygodnia; 2. wtorek albo ostatni piątek miesiąca; ostatni dzień
lub ostatni dzień powszedni miesiąca; wybrane miesiące; koniec po N razach albo w dniu.

- W okienku są gotowe wzorce liczone od wybranego dnia i „własne…"; podgląd pokazuje opis po
  polsku, najbliższe daty i samą regułę.
- O świcie wzorzec przysyła **kopię** do dziś i zostaje w backlogu. Nowej kopii nie ma, dopóki
  poprzednia jest otwarta — niezrobione nie mnoży się z dnia na dzień.
- Seria z końcem znika z backlogu po ostatnim wystąpieniu; kopie zostają.

### Dni

- **O północy** otwarte zadania przechodzą na nowy dzień (bez godziny), a wykonane i notatki
  zostają w archiwum swojego dnia.
- Stan zapisany dawno dogania kalendarz dzień po dniu, z przyjściami każdego świtu po drodze.
- Wszystkie zmiany idą przez **deterministyczną maszynę stanów** — ten sam stan i to samo
  zdarzenie dają zawsze ten sam wynik, a przejście spoza grafu jest nazwaną odmową.

### Ustawienia i reszta

- **Kategorie** (`C`): nazwa, ikona, kolor, kolejność, podkategorie.
- **Dzień** (`D`): zakres godzin, pory dnia, powiadomienia.
- **Motyw** automatyczny, jasny albo ciemny; układ na trzy panele albo — na wąskim ekranie —
  jeden panel naraz.
- **Cofanie** każdej zmiany: „Cofnij" w komunikacie albo `Ctrl`+`Z`.
- **Pomoc** pod `?` opisuje każdą interakcję; ikona GitHuba obok prowadzi do tego repozytorium.

### Dane

**Wyłącznie w `localStorage` tej przeglądarki** (`diurnus.v1`, `diurnus.prefs`). Nie ma
serwera ani synchronizacji między urządzeniami. Wyczyszczenie danych witryny kasuje wszystko
bezpowrotnie — **dziennik pobrany z zakładki „Dane" w ustawieniach jest jedynym
zabezpieczeniem**.

Dziennik to archiwum ZIP ze zwykłymi plikami markdown, czytelnymi i edytowalnymi w dowolnym
edytorze:

```markdown
# 2026-09-25

* [x] 10:30 #praca Raport
* [ ] 09:00 #nauka Czytanie
* [ ] Kupić chleb
* Notatka z rozmowy
```

`RRRR-MM-DD.md` na dziś i każdy miniony dzień, `BACKLOG.md` (z regułami w klamrach, np.
`{FREQ=WEEKLY;BYDAY=MO}`) oraz ustawienia `.diurnus.toml`. Format opisuje
[specyfikacja](docs/superpowers/specs/2026-09-25-diurnus-markdown-files-design.md). Wczytać
można to archiwum, te pliki zaznaczone razem albo starszą kopię JSON; plik, którego nie da
się przedstawić jako stan, jest odrzucany w całości z numerem linii i powodem.

## Uruchomienie

```bash
nix develop          # albo: nix-shell
make dev             # http://localhost:5173/
```

| Cel | Działanie |
|---|---|
| `make dev` | serwer deweloperski z HMR |
| `make build` | produkcyjna budowa do `dist/` |
| `make serve` | podgląd zbudowanej aplikacji |
| `make test` | testy jednostkowe (Vitest, `TZ=Europe/Warsaw`) |
| `make check` | typy i komponenty (`svelte-check`) |
| `make fmt` | Prettier |
| `make clean` | usuwa `dist/` i `node_modules/` |

`make help` wypisuje tę listę.

## Struktura

- `src/lib/` — czysta logika, **zero importów ze Svelte**. Sercem jest `machine.ts`:
  deterministyczna maszyna stanów pozycji (dziś, backlog, przeszłość), opisana w
  [specyfikacji](docs/superpowers/specs/2026-09-25-diurnus-state-machine-design.md). Obok:
  odczyty dla widoku, arytmetyka doby, migracje schematu, skróty klawiszowe, kopia zapasowa
  i `rrule.ts` — wzorce powtarzania jako reguły iCal (RFC 5545 RRULE, podzbiór z dokładnością
  do dnia). Testowana zwykłym `import`.
- `src/state.svelte.ts`, `src/actions.svelte.ts` — stan oparty na runach. Stan pozycji
  zmienia się wyłącznie zdarzeniami maszyny wysłanymi przez `dispatch()`.
- `src/components/` — render i podpięcie zdarzeń. Nic tu nie liczy.
- `src/components/list/` — dzienny log w duchu bullet journal (panel środkowy).
- `src/components/backlog/` — backlog: wszystko, co nie należy do dziś.

Jeśli komponent zaczyna liczyć, logika należy do `src/lib/`.

## Wdrożenie

Push do `main` uruchamia `.github/workflows/pages.yml`: typy → testy → budowa → GitHub Pages.
W ustawieniach repozytorium **Settings → Pages → Source** musi być ustawione na
**GitHub Actions**.

Witryna projektowa żyje pod `/diurnus/`, więc budowa wdrożeniowa dostaje `BASE_PATH=/diurnus/`.
Lokalnie Makefile ustawia `/`. Przy domenie własnej albo repozytorium `<użytkownik>.github.io`
ustaw `BASE_PATH=/`.

## Dokumentacja

- [`PLAN.md`](PLAN.md) — specyfikacja: model danych, matematyka siatki, świadomie odłożone
  tematy (iCalendar, raporty, PWA) i docelowa faza z backendem.
- `docs/superpowers/plans/` — plan wdrożenia.
