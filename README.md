# Diurnus

Kwantowanie doby na 15-minutowe tokeny. Ekran dzieli się na trzy panele: dzisiejsza siatka,
dzisiejsze notatki i backlog. Aplikacja pokazuje **wyłącznie dziś** — nie ma nawigacji po dniach. Cała aktywna część dnia mieści się w jednym oknie
przeglądarki — bez przewijania — a każdy blok czasu jest jednym kliknięciem oznaczany jako
wykonany. Upływ czasu zmienia tylko kolor bloku, nigdy jego stan.

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

## Gdzie są dane

**Wyłącznie w `localStorage` tej przeglądarki** (`diurnus.v1`, `diurnus.prefs`). Nie ma
serwera ani synchronizacji między urządzeniami. Wyczyszczenie danych witryny kasuje wszystko
bezpowrotnie — **dziennik pobrany z zakładki „Dane" w ustawieniach jest jedynym
zabezpieczeniem**. To archiwum ZIP z plikami markdown: `RRRR-MM-DD.md` na dziś i każdy miniony
dzień, `BACKLOG.md` oraz ustawienia `.diurnus.toml`. Format opisuje
[specyfikacja](docs/superpowers/specs/2026-09-25-diurnus-markdown-files-design.md); wczytać
można to archiwum, te pliki zaznaczone razem albo starszą kopię JSON.

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
