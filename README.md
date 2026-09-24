# GridDay

Kwantowanie doby na 15-minutowe tokeny. Ekran dzieli się na trzy panele: dzisiejsza siatka,
dzisiejsze notatki i backlog. Aplikacja pokazuje **wyłącznie dziś** — nie ma nawigacji po dniach. Cała aktywna część dnia mieści się w jednym oknie
przeglądarki — bez przewijania — a każdy blok czasu jest jednym kliknięciem oznaczany jako
zaplanowany, trwający albo wykonany.

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

**Wyłącznie w `localStorage` tej przeglądarki** (`gridday.v1`, `gridday.prefs`). Nie ma
serwera ani synchronizacji między urządzeniami. Wyczyszczenie danych witryny kasuje wszystko
bezpowrotnie — **kopia zapasowa JSON z zakładki „Dane" w ustawieniach jest jedynym
zabezpieczeniem**. Ten sam plik będzie formatem wejściowym importera, gdy aplikacja dostanie
bazę danych.

## Struktura

- `src/lib/` — czysta logika, **zero importów ze Svelte**: arytmetyka doby, model stanu
  i migracje, zajętość siatki, segmentacja bloków, skróty klawiszowe, kopia zapasowa.
  Testowana zwykłym `import`.
- `src/state.svelte.ts`, `src/actions.svelte.ts` — stan oparty na runach i mutacje.
- `src/components/` — render i podpięcie zdarzeń. Nic tu nie liczy.
- `src/components/list/` — dzienny log w duchu bullet journal (panel środkowy).
- `src/components/backlog/` — backlog: wszystko, co nie należy do dziś.

Jeśli komponent zaczyna liczyć, logika należy do `src/lib/`.

## Wdrożenie

Push do `main` uruchamia `.github/workflows/pages.yml`: typy → testy → budowa → GitHub Pages.
W ustawieniach repozytorium **Settings → Pages → Source** musi być ustawione na
**GitHub Actions**.

Witryna projektowa żyje pod `/gridday/`, więc budowa wdrożeniowa dostaje `BASE_PATH=/gridday/`.
Lokalnie Makefile ustawia `/`. Przy domenie własnej albo repozytorium `<użytkownik>.github.io`
ustaw `BASE_PATH=/`.

## Prototyp

`gridday.html` to pierwotny, jednoplikowy prototyp. Jest zachowany jako odniesienie do
porównania zachowania obok siebie i **czeka na usunięcie po ręcznej weryfikacji parzystości**
(lista kontrolna w planie wdrożenia). Po sprawdzeniu:

```bash
python3 -m http.server 8000   # prototyp: http://localhost:8000/gridday.html
make serve                    # port aplikacji
git rm gridday.html
```

## Dokumentacja

- [`PLAN.md`](PLAN.md) — specyfikacja: model danych, matematyka siatki, świadomie odłożone
  tematy (iCalendar, raporty, PWA) i docelowa faza z backendem.
- `docs/superpowers/plans/` — plan wdrożenia.
