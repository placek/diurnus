# GridDay — serwer plików dziennika (faza 1 z 3): projekt

**Status:** do przeglądu · **Data:** 2026-09-24 · **Specyfikacja nadrzędna:** [`PLAN.md`](../../../PLAN.md)

## 1. Kontekst: po co ta faza istnieje

Projekt zmienia cel. GridDay przestaje być samowystarczalną aplikacją trzymającą stan
w `localStorage`, a staje się **interfejsem do katalogu plików markdown** w `/srv/data/diary`:
jeden plik na dzień plus `BACKLOG.md`. Pliki są źródłem prawdy, bo czytają i piszą je także
agenci. Integracja z Google Calendar zostaje porzucona na dobre.

Przeglądarka nie potrafi otworzyć ścieżki na dysku, a aplikacja ma działać również na telefonie
— co wyklucza jedyne API, które by to umiało (`File System Access` istnieje wyłącznie
w Chromium na desktopie). Potrzebny jest zatem serwer. To moment, w którym „faza docelowa"
z `PLAN.md` §10 nadchodzi naprawdę, choć bez bazy danych: rolę magazynu pełnią pliki.

### Miejsce w całości

Całość podzielona jest na trzy fazy, każda z własną specyfikacją:

1. **Ta faza:** serwer i jego API plików. Aplikacja nadal działa na `localStorage`.
2. Parser i serializator formatu markdown, budowane i testowane w izolacji.
3. Podmiana warstwy trwałości i usunięcie `localStorage`.

Taki podział stawia parser — miejsce, w którym będą błędy — w fazie, w której nic innego się
nie rusza.

### Co uznajemy za sukces

`make serve` podnosi serwer, który oddaje zbudowaną aplikację i pozwala przez HTTP odczytać
oraz zapisać dowolny wpis dziennika. Zapis oparty na nieaktualnym stanie jest odrzucany.
Żądanie o dzień, którego plik nie istnieje, nie jest błędem. Nic spoza maszyny nie dosięga
dziennika, dopóki nie zostanie to włączone świadomie.

**Ta faza niczego nie zmienia w aplikacji.** Serwer istnieje i jest przetestowany; nikt go
jeszcze nie używa.

## 2. Decyzje podjęte przed projektem

| Pytanie | Decyzja |
|---|---|
| Dostęp do plików | **Mały serwer lokalny** — przeglądarka nie sięgnie dysku, a telefon musi działać |
| Język serwera | **Node i TypeScript** — parser z fazy 2 będzie wspólny dla serwera i klienta |
| Kształt API | **Surowy markdown**; parsowanie po stronie klienta |
| Zapisy równoległe | **Odrzucenie nieaktualnego zapisu**, przeładowanie przy powrocie do okna |
| Ochrona | **Nasłuch na localhost**, token wymagany przy wystawieniu na sieć |

### Dlaczego Node, skoro `PLAN.md` mówił o FastAPI

Tamten zapis zakładał bazę danych, której ten projekt już nie ma. Rozstrzygająca jest faza 2:
parser formatu może leżeć w `src/lib/` jako TypeScript i być importowany **i przez klienta,
i przez serwer** — jedna implementacja, jeden zestaw testów, zero szans, że obie strony zaczną
się różnić w interpretacji linijki. Python albo Go oznaczałyby napisanie go dwa razy.

## 3. API

Trzy trasy. Dwie operują na wpisie, jedna listuje.

```
GET  /api/entries          → { ids: string[] }
GET  /api/entry/:id        → { text: string, mtime: number | null }
PUT  /api/entry/:id        ← { text: string, mtime: number | null }
                           → { mtime: number }   albo 409
GET  /api/config           → { text: string, mtime: number | null }
PUT  /api/config           ← { text: string, mtime: number | null }
                           → { mtime: number }   albo 409
```

Konfiguracja (`.gridday.json`, faza 2 §5) ma własną parę tras, a nie identyfikator wpisu:
kropka na początku nazwy nie przechodzi przez wzorzec identyfikatora i nie powinna, bo ten
wzorzec ma zostać maksymalnie wąski. Poza nazwą pliku zachowuje się dokładnie tak samo —
te same reguły braku pliku, pustej treści i nieaktualnego zapisu.

`:id` to **`YYYY-MM-DD` albo `BACKLOG`**. Backlog jest po prostu kolejnym wpisem, nie osobnym
bytem — jedna ścieżka kodu zamiast dwóch równoległych.

### Walidacja `:id` jest całą obroną przed wyjściem poza katalog

Identyfikator przechodzi przez `^(\d{4}-\d{2}-\d{2}|BACKLOG)$`, zanim cokolwiek stanie się
ścieżką. Żaden łańcuch od klienta nie jest sklejany ze ścieżką bez przejścia przez ten wzorzec,
więc `../../etc/passwd` nie da się nawet wyrazić. To jedyne miejsce, w którym ta obrona
istnieje, i dlatego jest tu opisane osobno.

Nazwa pliku to `<id>.md` — `2026-09-24.md`, `BACKLOG.md`.

### Trzy zachowania, które muszą być wprost opisane

**Brak pliku nie jest błędem.** `GET` na dzień bez pliku zwraca `{ text: '', mtime: null }`
ze statusem 200. Pusty dzień to normalny stan, nie awaria — a klient i tak musiałby
obsłużyć 404 dokładnie tak samo.

**Pusta treść nie tworzy pliku.** Przejście na przyszły dzień i z powrotem nie może zasypać
dziennika pustymi plikami. Jeśli jednak plik **już istnieje**, zapis pustej treści przechodzi:
to odróżnia „nigdy nic tu nie było" od „wyczyszczone świadomie". Plik nigdy nie jest usuwany —
kasowanie cudzych danych nie należy do serwera.

**Nieaktualny zapis jest odrzucany.** `PUT` niesie `mtime` odczytane przy `GET`. Jeśli plik
w międzyczasie się zmienił, serwer odpowiada 409 i aktualnym `mtime`; klient przeładowuje wpis
zamiast nadpisywać pracę agenta. `mtime === null` w żądaniu znaczy „tworzę nowy plik" i jest
odrzucane, jeśli plik istnieje.

## 4. Konfiguracja i bezpieczeństwo

| Zmienna | Domyślnie | Znaczenie |
|---|---|---|
| `DIARY_DIR` | `/srv/data/diary` | katalog z wpisami |
| `PORT` | `4600` | port nasłuchu |
| `HOST` | `127.0.0.1` | interfejs nasłuchu |
| `GRIDDAY_TOKEN` | brak | wspólny sekret, gdy `HOST` nie jest pętlą zwrotną |

**Serwer odmawia startu**, gdy `HOST` wskazuje na coś innego niż `127.0.0.1` lub `::1`,
a `GRIDDAY_TOKEN` jest pusty. Wystawienie dziennika na sieć ma być decyzją, nie przeoczeniem.
Token przychodzi w nagłówku `Authorization: Bearer <token>` i jest porównywany czasem stałym —
porównanie `===` na sekrecie wycieka jego długość i prefiks.

Aplikacja jest serwowana z tego samego originu co API, więc CORS nie występuje w ogóle.
Brak CORS to nie jest uproszczenie — to brak całej klasy błędów konfiguracji.

Katalog `DIARY_DIR` musi istnieć przy starcie; serwer go nie tworzy. Tworzenie katalogu,
o który nikt nie prosił, w miejscu podanym ze zmiennej środowiskowej, jest gorsze niż odmowa.

## 5. Budowa

```
server/
├── index.ts        start, konfiguracja, odmowa startu przy złej konfiguracji
├── router.ts       trasy API, walidacja identyfikatora, kody odpowiedzi
├── entries.ts      odczyt i zapis pliku, reguły z §3 — przyjmuje gotową nazwę
├── static.ts       serwowanie dist/ z typami MIME
└── auth.ts         sprawdzenie tokenu czasem stałym
```

Bez frameworka — `node:http` wprost. Trzy trasy nie uzasadniają zależności, a projekt trzyma
się zasady zerowych zależności runtime. `server/` kompiluje się tym samym `tsc`, co reszta.

`entries.ts` dostaje gotową nazwę pliku, a nie identyfikator: rozstrzyganie, czy chodzi
o `2026-09-24.md` czy o `.gridday.json`, należy do routera. Dzięki temu obie pary tras
dzielą jedną implementację reguł z §3, a walidacja identyfikatora zostaje w jednym miejscu.

`entries.ts` nie wie nic o formacie wpisu. Serwer nigdy nie rozumie, co czyta — to jest cała
jego prostota i powód, dla którego mieści się w około stu liniach.

## 6. Uruchamianie

| Cel | Działanie |
|---|---|
| `make server` | serwer deweloperski z przeładowaniem, `DIARY_DIR` z otoczenia |
| `make serve` | budowa aplikacji, a potem serwer oddający `dist/` |
| `make test` | testy, teraz obejmujące serwer |

`make dev` (Vite) zostaje bez zmian: w fazie 1 aplikacja nadal stoi na `localStorage`
i nie potrzebuje serwera.

## 7. Testy

Vitest wykonujący **prawdziwe żądania HTTP** do serwera podniesionego na losowym porcie,
z `DIARY_DIR` wskazującym katalog tymczasowy. Bez atrap — serwer jest na tyle mały, że
testowanie go przez podstawianie modułów sprawdzałoby wyłącznie atrapy.

- Pełny obieg: `PUT` treści, `GET` oddaje ją identyczną, `mtime` rośnie.
- `GET` nieistniejącego dnia daje 200 i `{ text: '', mtime: null }`.
- `PUT` pustej treści nie tworzy pliku; ten sam `PUT` na istniejący plik go opróżnia.
- `PUT` z nieaktualnym `mtime` daje 409 i nie rusza pliku.
- `PUT` z `mtime: null` na istniejący plik daje 409.
- `BACKLOG` działa tak samo jak dzień.
- Identyfikatory odrzucone: `../secret`, `..%2Fsecret`, `2026-9-4`, `BACKLOG.md`, `a/b`,
  pusty, bardzo długi, z bajtem zerowym.
- `/api/entries` listuje wyłącznie pliki o poprawnych nazwach i pomija resztę katalogu.
- Bez tokenu przy `HOST` publicznym serwer nie startuje.
- Z tokenem: żądanie bez nagłówka daje 401, z błędnym 401, z poprawnym 200.
- `/api/config` przechodzi ten sam zestaw reguł co wpis: brak pliku, pusta treść,
  nieaktualny zapis. Nazwa `.gridday.json` nie jest osiągalna przez `/api/entry/:id`.
- Serwowanie statyczne oddaje `index.html` dla ścieżki nieznanej API (obsługa trasy klienta).

## 8. Świadomie poza zakresem

- **Parsowanie formatu.** Faza 2. Serwer przenosi bajty.
- **Podmiana trwałości w aplikacji.** Faza 3; `localStorage` zostaje nietknięty.
- **Obserwowanie katalogu i kanał na żywo.** Rozważone i odłożone: wymaga watchera, kanału
  zdarzeń i pogodzenia zmiany zdalnej z niezapisaną lokalną. Przeładowanie przy powrocie do
  okna załatwia ten sam problem mniejszym kosztem.
- **Wielu użytkowników i logowanie.** Narzędzie jednoosobowe.
- **Usuwanie wpisów przez API.** Serwer nie kasuje plików.
- **Wdrożenie na GitHub Pages.** Traci sens, gdy aplikacja potrzebuje serwera, ale w tej fazie
  jeszcze go nie potrzebuje — workflow znika w fazie 3.
