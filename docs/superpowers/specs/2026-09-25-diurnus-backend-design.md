# Diurnus — serwer dziennika: projekt

**Status:** decyzje zaakceptowane w rozmowie, projekt do akceptacji przed wdrożeniem ·
**Data:** 2026-09-25 · **Format dokumentów:** [pliki markdown](2026-09-25-diurnus-markdown-files-design.md) ·
**Maszyna stanów:** [projekt](2026-09-25-diurnus-state-machine-design.md)

## 1. Cel

Opcjonalny serwer, który przechowuje dziennik jako te same dokumenty, które aplikacja już
umie zapisać i odczytać: `RRRR-MM-DD.md`, `BACKLOG.md` i `.diurnus.toml`. Dzięki niemu ten
sam dziennik jest na kilku urządzeniach, a dane nie giną razem z pamięcią przeglądarki.

Zasady:

- **Całe dokumenty.** Serwer nie zna pozycji ani stanu — przyjmuje i oddaje całe pliki.
  Generuje je i czyta wyłącznie aplikacja (`renderFiles` / `parseFiles`).
- **Mały ruch.** Przesyła się tylko dokumenty, które się zmieniły; sprawdzenie „czy coś się
  zmieniło" kosztuje kilkaset bajtów.
- **Lekkie API.** Jedna ścieżka dla dokumentów i jedna dla spisu; metody GET i PUT.
- **Najprostsze logowanie.** Jeden token na jeden dziennik.
- **Serwer jest opcjonalny.** Domyślnie wszystko działa jak dziś, w `localStorage`. Serwer
  włącza się w ustawieniach i można go w każdej chwili odłączyć.

## 2. Decyzje

| Pytanie | Decyzja |
|---|---|
| Czym jest serwer | Mały program w Go (tylko biblioteka standardowa), dokumenty jako zwykłe pliki w katalogu; obraz Dockera |
| Kto i jak się loguje | Jeden serwer — jeden dziennik — jeden token; `Authorization: Bearer …` przy każdym żądaniu |
| Źródło prawdy | **Lokalnie najpierw**: `localStorage` jest kopią roboczą, serwer celem synchronizacji |
| Konflikty | Wersja dokumentu (ETag) przy każdym zapisie; przy konflikcie **wygrywa serwer**, a aplikacja proponuje „Nadpisz moją wersją" |
| Kształt API | Jedna ścieżka na dokument: `GET /` (spis), `GET /{nazwa}`, `PUT /{nazwa}` |
| Usuwanie | `PUT` z pustą treścią usuwa dokument; osobnej metody nie ma |
| Pierwsze połączenie | Dane tylko po jednej stronie — kopiują się same; po obu — jedno pytanie: „Pobierz z serwera" albo „Wyślij moje" |
| Gdzie kod | `server/` w tym repozytorium: moduł Go, testy, Dockerfile, zadanie CI |
| Wersja dokumentu | Skrót treści: pierwsze 16 znaków szesnastkowych SHA-256, w cudzysłowie (`"9c0e…"`) |
| Pobieranie zmian | Przy starcie, przy powrocie do karty i co 5 minut, gdy karta jest widoczna |
| Transport | Serwer mówi zwykłym HTTP; HTTPS zapewnia reverse proxy (Caddy, nginx) |

## 3. API

Wszystkie żądania niosą `Authorization: Bearer <token>`. Treść dokumentów to tekst UTF-8
(`text/markdown` albo `application/toml`), bez BOM, z końcami linii `\n` — dokładnie to, co
zapisuje aplikacja.

**Dozwolone nazwy** (wszystko inne to `400`): `RRRR-MM-DD.md` z prawdziwą datą, `BACKLOG.md`,
`.diurnus.toml`. Serwer nie zna innych plików i nie pokazuje ich w spisie.

### `GET /` — spis

```http
GET / HTTP/1.1
Authorization: Bearer …
If-None-Match: "3b1d…"
```

```http
HTTP/1.1 200 OK
Content-Type: application/json
ETag: "5e20…"

{".diurnus.toml":"a41c…","BACKLOG.md":"a1f3…","2026-09-24.md":"0d77…","2026-09-25.md":"9c0e…"}
```

- Mapa nazwa → wersja, posortowana po nazwie.
- Spis ma własną wersję (skrót całej mapy). Z `If-None-Match` równym bieżącej wersji serwer
  odpowiada `304 Not Modified` bez treści — tak wygląda cykliczne sprawdzenie, gdy nic się nie
  zmieniło.

### `GET /{nazwa}` — dokument

```http
HTTP/1.1 200 OK
Content-Type: text/markdown; charset=utf-8
ETag: "9c0e…"

# 2026-09-25
…
```

`404`, gdy dokumentu nie ma.

### `PUT /{nazwa}` — zapis, utworzenie, usunięcie

Każdy zapis mówi, na jakiej wersji się opiera:

| Nagłówek | Znaczenie |
|---|---|
| `If-Match: "9c0e…"` | zmień dokument, który ma dokładnie tę wersję |
| `If-None-Match: *` | utwórz dokument, którego jeszcze nie ma |

Bez żadnego z nich serwer odpowiada `428 Precondition Required` — zapis „na ślepo" nie istnieje.
**Pusta treść usuwa dokument** (z tym samym warunkiem wersji); poprawny dokument nigdy nie jest
pusty, bo ma co najmniej nagłówek.

| Odpowiedź | Kiedy | Treść |
|---|---|---|
| `204 No Content` + `ETag` | zapisano albo utworzono | — |
| `204 No Content` bez `ETag` | usunięto | — |
| `412 Precondition Failed` + `ETag` | na serwerze jest inna wersja | **bieżąca treść z serwera** — bez drugiego żądania |
| `412 Precondition Failed` bez `ETag` | `If-Match`, a dokumentu już nie ma | — |
| `400` | zła nazwa albo treść nie jest UTF-8 | komunikat |
| `401` | brak tokenu albo zły token | — |
| `413` | dokument większy niż limit (domyślnie 1 MiB) | — |

### CORS

Aplikacja stoi na GitHub Pages, serwer gdzie indziej. Serwer odpowiada na `OPTIONS`
i dodaje nagłówki CORS **tylko** dla adresów z konfiguracji (`--origin`): metody `GET, PUT`,
nagłówki `Authorization, If-Match, If-None-Match, Content-Type`, udostępniony `ETag`.

## 4. Serwer

```
diurnus-server --dir /data --token-file /run/secrets/token --origin https://placek.github.io
```

| Ustawienie | Flaga / zmienna | Domyślnie |
|---|---|---|
| Katalog dokumentów | `--dir` / `DIURNUS_DIR` | `./data` |
| Token | `--token-file` albo `DIURNUS_TOKEN` | wymagany, co najmniej 32 znaki |
| Dozwolone adresy aplikacji | `--origin` / `DIURNUS_ORIGIN` (lista po przecinku) | brak — CORS wyłączony |
| Adres nasłuchu | `--addr` / `DIURNUS_ADDR` | `:8080` |
| Limit dokumentu | `--max-size` | 1 MiB |

- **Pliki na dysku.** Dokument to plik o tej samej nazwie w katalogu — da się go skopiować,
  zarchiwizować albo poprawić ręcznie. Bez bazy danych.
- **Wersja z treści.** ETag liczy się z zawartości, więc ręczna zmiana pliku po prostu daje
  nową wersję.
- **Zapis atomowy.** Plik tymczasowy, `fsync`, `rename`. Sprawdzenie wersji i zapis dzieją się
  pod jednym zamkiem, więc dwa równoczesne zapisy nie przepuszczą obu.
- **Token** porównywany w czasie stałym. Serwer nie ma kont, sesji ani ciasteczek.
- **Uruchomienie** jako obraz Dockera za reverse proxy z HTTPS (przykład Caddyfile
  w `server/README.md`).
- **Kod:** `server/` — `main.go`, `store.go` (pliki, wersje, zamek), `api.go` (HTTP), testy
  `net/http/httptest` dla każdej odpowiedzi z tabeli; `Dockerfile`; zadanie CI budujące
  i testujące serwer oraz publikujące obraz do ghcr.io.

## 5. Klient

### Ustawienia

Zakładka „Dane" dostaje sekcję **Serwer**: adres, token, „Połącz" / „Rozłącz" i stan
(„zsynchronizowano 12:40", „brak połączenia — zmiany czekają", błąd). Bez serwera zakładka
wygląda jak dziś. Adres i token leżą w `localStorage` (`diurnus.sync`), obok stanu.

### Baza synchronizacji

Klient pamięta, co ostatnio uzgodnił z serwerem: dla każdego dokumentu jego wersję i skrót
treści (`base`). Z tego wynika wszystko inne:

- **Lokalna zmiana** — dokument z `renderFiles(stan)` ma inny skrót niż w `base`.
- **Zmiana na serwerze** — spis podaje inną wersję niż `base`.
- **Dokument do usunięcia** — jest w `base`, a `renderFiles` go już nie daje.

### Wysyłanie

Po każdej zmianie stanu, z opóźnieniem 2 s, żeby seria edycji dała jeden zapis:

1. `renderFiles(stan)` i porównanie z `base`.
2. Dla każdego zmienionego dokumentu `PUT` z `If-Match` wersji z `base` (albo
   `If-None-Match: *` dla nowego); dla usuniętego `PUT` z pustą treścią.
3. `204` — nowa wersja trafia do `base`.
4. `412` — **wygrywa serwer**: jego treść (z odpowiedzi) wchodzi do stanu tak jak przy
   pobieraniu, a komunikat proponuje „Nadpisz moją wersją" — ponowny `PUT` z własną treścią
   i świeżą wersją.

W typowym dniu zmienia się tylko dzisiejszy plik i `BACKLOG.md`; o północy dochodzi plik
minionego dnia (już tylko do archiwum).

### Pobieranie

Przy starcie, przy powrocie do karty i co 5 minut, gdy karta jest widoczna:

1. `GET /` z `If-None-Match` wersji spisu — zwykle `304` i koniec.
2. Dla dokumentów z inną wersją niż w `base`: `GET /{nazwa}`.
3. Dokument zmieniony tylko na serwerze — wchodzi do stanu. Zmieniony też lokalnie — konflikt,
   jak przy `412`.
4. **Wejście do stanu:** lokalne dokumenty z `renderFiles(stan)`, podmienione na te z serwera,
   przechodzą przez `parseFiles`, a wynik zastępuje stan i dogania kalendarz (`advanceTo`).
   Historia cofania nie sięga przez pobranie — tak jak przy wczytaniu dziennika.
5. **Dokument z serwera, którego nie da się odczytać** (np. popsuty ręcznie), nie wchodzi:
   stan zostaje, komunikat pokazuje błędy `plik:linia: powód`, a ten dokument nie jest
   nadpisywany, dopóki go ktoś nie poprawi albo nie wybierze „Nadpisz moją wersją".

### Pierwsze połączenie

| Lokalnie | Serwer | Co się dzieje |
|---|---|---|
| pusto | pusto | nic; dalej zwykła synchronizacja |
| dane | pusto | wszystkie dokumenty idą na serwer (`If-None-Match: *`) |
| pusto | dane | dziennik z serwera zastępuje lokalny |
| dane | dane | jedno pytanie z zakresem dat i liczbą pozycji po obu stronach: „Pobierz z serwera" albo „Wyślij moje" |

„Wyślij moje" zapisuje własne dokumenty z wersjami z serwera i usuwa te, których lokalnie nie
ma — serwer staje się kopią tego urządzenia.

### Bez sieci

Zmiany zostają lokalnie i czekają; ponowienia z rosnącym odstępem (do 5 minut) i od razu po
powrocie sieci (`online`). Aplikacja działa bez przerwy, bo pracuje na kopii lokalnej.

## 6. Ruch

- Sprawdzenie bez zmian: `GET /` → `304`, kilkaset bajtów z nagłówkami.
- Zmiana w ciągu dnia: jeden `PUT` dzisiejszego pliku (zwykle 1–3 KB), czasem `BACKLOG.md`.
- Pobranie zmiany z innego urządzenia: spis (dziesiątki bajtów na dokument, rośnie z liczbą
  dni) plus tylko zmienione dokumenty.
- Pierwsze połączenie nowego urządzenia pobiera wszystko raz; potem tylko różnice.

## 7. Poza zakresem

- Konta, rejestracja, wielu użytkowników na jednym serwerze (jeden serwer = jeden dziennik;
  kolejny dziennik to kolejna instancja).
- Powiadomienia na żywo (SSE, WebSocket) — wystarcza sprawdzanie przy powrocie do karty.
- Historia wersji dokumentów na serwerze — da się ją mieć, trzymając katalog w git albo robiąc
  kopie katalogu.
- Szyfrowanie po stronie klienta.
- Scalanie zmian w obrębie jednego dokumentu (linia po linii).
- Ograniczanie liczby żądań — zadanie reverse proxy.

## 8. Plan wdrożenia

1. **Serwer** w `server/`: magazyn plików z wersjami i zamkiem, API z tabeli, CORS, testy
   każdej odpowiedzi, Dockerfile, zadanie CI.
2. **Synchronizacja w kliencie** jako czysta logika w `src/lib/sync/`: baza, różnice, decyzje
   (wyślij, pobierz, konflikt, usuń) — testowana bez sieci.
3. **Transport i zegar synchronizacji** w `state`: opóźnione wysyłanie, pobieranie przy starcie,
   powrocie do karty i co 5 minut, ponowienia.
4. **Ustawienia → Dane → Serwer**: połączenie, pierwsza synchronizacja, stan, „Nadpisz moją
   wersją".
5. **Test końcowy**: prawdziwy serwer z Dockera i dwie karty przeglądarki — zmiana w jednej
   pojawia się w drugiej, konflikt kończy się wersją serwera i działającym „Nadpisz".
