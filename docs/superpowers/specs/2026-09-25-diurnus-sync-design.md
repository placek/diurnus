# Diurnus — synchronizacja dziennika: projekt

**Status:** decyzje zaakceptowane w rozmowie, projekt do akceptacji przed wdrożeniem ·
**Data:** 2026-09-27 (pierwsza wersja 2026-09-25: własny serwer) ·
**Format dokumentów:** [pliki markdown](2026-09-25-diurnus-markdown-files-design.md) ·
**Maszyna stanów:** [projekt](2026-09-25-diurnus-state-machine-design.md)

## 1. Cel

Opcjonalna synchronizacja dziennika z magazynem poza przeglądarką. Dziennik jest zapisywany
jako te same dokumenty, które aplikacja już umie zapisać i odczytać: `RRRR-MM-DD.md`,
`BACKLOG.md` i `.diurnus.toml`. Dzięki temu ten sam dziennik jest na kilku urządzeniach,
a dane nie giną razem z pamięcią przeglądarki.

Zasady:

- **Całe dokumenty.** Magazyn nie zna pozycji ani stanu — przyjmuje i oddaje całe pliki.
  Generuje je i czyta wyłącznie aplikacja (`renderFiles` / `parseFiles`).
- **Mały ruch.** Przesyła się tylko dokumenty, które się zmieniły; sprawdzenie „czy coś się
  zmieniło" kosztuje kilkaset bajtów.
- **Wymienny magazyn.** Logika synchronizacji jest jedna; pod nią stoi mały adapter
  konkretnego magazynu. **Pierwszy: repozytorium GitHub.** Drugi: Dropbox. Własny serwer to
  jedna z opcji na później, a nie warunek.
- **Najprostsze logowanie**, jakie daje dany magazyn — dla GitHuba jeden token.
- **Synchronizacja jest opcjonalna.** Domyślnie wszystko działa jak dziś, w `localStorage`.
  Magazyn włącza się w ustawieniach i można go w każdej chwili odłączyć.
- **Niczego nie hostujemy.** Aplikacja zostaje statyczną stroną na GitHub Pages i rozmawia
  z magazynem wprost z przeglądarki.

## 2. Decyzje

| Pytanie | Decyzja |
|---|---|
| Gdzie trzymać dziennik | W magazynie wybranym przez użytkownika, przez adapter; na start **prywatne repozytorium GitHub**, potem Dropbox, na końcu opcjonalnie własny serwer |
| Kto i jak się loguje (GitHub) | Token *fine-grained* ograniczony do jednego repozytorium, z jednym uprawnieniem: *Contents: read and write* |
| Źródło prawdy | **Lokalnie najpierw**: `localStorage` jest kopią roboczą, magazyn celem synchronizacji |
| Konflikty | Wersja dokumentu przy każdym zapisie; przy konflikcie **wygrywa magazyn**, a aplikacja proponuje „Nadpisz moją wersją" |
| Usuwanie | Dokument, którego stan już nie daje, jest usuwany z magazynu (z tym samym warunkiem wersji) |
| Pierwsze połączenie | Dane tylko po jednej stronie — kopiują się same; po obu — jedno pytanie: „Pobierz z magazynu" albo „Wyślij moje" |
| Wysyłanie | 2 s po ostatniej zmianie, tylko zmienione dokumenty |
| Pobieranie | Przy starcie, przy powrocie do karty i co 5 minut, gdy karta jest widoczna |

## 3. Adapter magazynu

Każdy magazyn to cztery operacje. Wersja dokumentu jest dla synchronizacji nieprzezroczystym
napisem — adapter sam wie, czym jest (skrót bloba w gicie, `rev` w Dropboksie, `ETag`
własnego serwera).

```ts
type Version = string;

interface Store {
  /** Spis: nazwa → wersja. `since` to znacznik poprzedniego spisu; bez zmian → `unchanged`. */
  list(since?: string): Promise<{ unchanged: true } | { docs: Map<string, Version>; mark: string }>;
  /** Dokument albo `null`, gdy go nie ma. */
  read(name: string): Promise<{ body: string; version: Version } | null>;
  /** Zapis na wersji `base` (`null` — tworzenie). Konflikt niesie bieżącą treść magazynu. */
  write(name: string, body: string, base: Version | null): Promise<WriteResult>;
  /** Usunięcie na wersji `base`. */
  remove(name: string, base: Version): Promise<WriteResult>;
}

type WriteResult =
  | { ok: true; version: Version | null } // null po usunięciu
  | { ok: false; conflict: { body: string; version: Version } | null }; // null — dokumentu już nie ma
```

Błędy sieci, logowania i limitów adapter zgłasza jako wyjątki z rodzajem (`offline`, `auth`,
`rate-limit` z czasem ponowienia, `other`) — synchronizacja reaguje na nie jednakowo dla
wszystkich magazynów.

**Dozwolone nazwy:** `RRRR-MM-DD.md` z prawdziwą datą, `BACKLOG.md`, `.diurnus.toml`.
Wszystko inne w magazynie jest pomijane w spisie i nigdy nie jest zapisywane ani usuwane —
repozytorium może więc mieć też własne README czy inne pliki.

## 4. Synchronizacja (wspólna dla magazynów)

Czysta logika w `src/lib/sync/`, testowana na magazynie w pamięci.

### Baza

Klient pamięta, co ostatnio uzgodnił z magazynem: dla każdego dokumentu jego wersję i skrót
treści (`base`), plus znacznik ostatniego spisu. Z tego wynika wszystko inne:

- **Lokalna zmiana** — dokument z `renderFiles(stan)` ma inny skrót niż w `base`.
- **Zmiana w magazynie** — spis podaje inną wersję niż `base`.
- **Dokument do usunięcia** — jest w `base`, a `renderFiles` go już nie daje.

### Wysyłanie

2 s po ostatniej zmianie stanu, żeby seria edycji dała jeden zapis:

1. `renderFiles(stan)` i porównanie z `base`.
2. Zmieniony dokument → `write` na wersji z `base` (nowy → `base = null`); usunięty →
   `remove`.
3. Sukces — nowa wersja trafia do `base`.
4. Konflikt — **wygrywa magazyn**: jego treść wchodzi do stanu tak jak przy pobieraniu,
   a komunikat proponuje „Nadpisz moją wersją" — ponowny zapis własnej treści na świeżej
   wersji.

W typowym dniu zmienia się tylko dzisiejszy plik i `BACKLOG.md`; o północy dochodzi plik
minionego dnia (już tylko do archiwum).

### Pobieranie

Przy starcie, przy powrocie do karty i co 5 minut, gdy karta jest widoczna:

1. `list(znacznik)` — zwykle `unchanged` i koniec.
2. Dokumenty z inną wersją niż w `base` → `read`.
3. Dokument zmieniony tylko w magazynie — wchodzi do stanu. Zmieniony też lokalnie —
   konflikt, jak wyżej.
4. **Wejście do stanu:** lokalne dokumenty z `renderFiles(stan)`, podmienione na te
   z magazynu, przechodzą przez `parseFiles`, a wynik zastępuje stan i dogania kalendarz
   (`advanceTo`). Historia cofania nie sięga przez pobranie — tak jak przy wczytaniu dziennika.
5. **Dokument, którego nie da się odczytać** (np. popsuty ręcznie w repozytorium), nie wchodzi:
   stan zostaje, komunikat pokazuje błędy `plik:linia: powód`, a ten dokument nie jest
   nadpisywany, dopóki ktoś go nie poprawi albo nie wybierze „Nadpisz moją wersją".

### Pierwsze połączenie

| Lokalnie | Magazyn | Co się dzieje |
|---|---|---|
| pusto | pusto | nic; dalej zwykła synchronizacja |
| dane | pusto | wszystkie dokumenty idą do magazynu |
| pusto | dane | dziennik z magazynu zastępuje lokalny |
| dane | dane | jedno pytanie z zakresem dat i liczbą pozycji po obu stronach: „Pobierz z magazynu" albo „Wyślij moje" |

„Wyślij moje" zapisuje własne dokumenty na wersjach z magazynu i usuwa te, których lokalnie
nie ma — magazyn staje się kopią tego urządzenia.

### Bez sieci i błędy

- **Brak sieci:** zmiany zostają lokalnie i czekają; ponowienia z rosnącym odstępem (do
  5 minut) i od razu po powrocie sieci (`online`). Aplikacja działa bez przerwy.
- **Logowanie** (`auth`): synchronizacja staje, ustawienia pokazują „Token wygasł albo nie ma
  dostępu" — dane lokalne są nietknięte.
- **Limit** (`rate-limit`): czekanie do czasu podanego przez magazyn.

### Zegar w aplikacji

`src/lib/sync/runner.ts` decyduje, kiedy wołać silnik; `src/sync.svelte.ts` podpina go do stanu
i przeglądarki.

- **Jedna operacja naraz.** Prośby, które przyjdą w trakcie (edycja, powrót do karty), idą
  następną turą. Tura to pobranie (jeśli ktoś o nie prosił), a potem wysłanie tego, co czeka.
- **Zmiana stanu w trakcie operacji.** Dokumenty z magazynu wchodzą na stan bieżący, nie na ten
  sprzed operacji; lokalna edycja tego samego dokumentu przegrywa jak każdy konflikt. Gdy
  dokument z magazynu nie składa się z bieżącym stanem, nic nie wchodzi, a następne pobranie
  ocenia go od nowa.
- **Uzgodnienie czytane świeżo** z `diurnus.sync` przed każdą operacją i zapisywane przed
  zastąpieniem stanu — zastąpienie od razu pyta, co czeka na wysłanie.
- **Powrót do karty** (`focus`, `visibilitychange`) sprawdza magazyn najwyżej raz na 10 s;
  schowanie karty wysyła od razu to, co czeka.
- **Karty jednej przeglądarki.** Synchronizuje jedna karta naraz — ta, która ma zamek Web Locks
  `diurnus.sync`; pozostałe dostają jej zmiany przez zdarzenie `storage` i tą samą drogą
  oddają swoje. Zamknięcie karty zwalnia zamek, a przejmuje go następna. Bez Web Locks
  synchronizuje każda karta; zapis treści, która już jest w magazynie, silnik uznaje za zgodę,
  nie konflikt.
- **Stan do pokazania:** faza (`idle`, `busy`, `standby` — synchronizuje inna karta,
  `offline`, `auth`, `rate-limit`, `other`), czas ostatniej udanej synchronizacji, czy zmiany
  czekają, termin następnej próby, konflikty do „Nadpisz moją wersją" i odrzucone zmiany.

### Ustawienia

Zakładka „Dane" dostaje sekcję **Synchronizacja**: wybór magazynu („Tylko ta przeglądarka",
„GitHub", później „Dropbox"), jego pola, „Połącz" / „Rozłącz" i stan („zsynchronizowano
12:40", „brak połączenia — zmiany czekają", błąd). Konfiguracja i `base` leżą
w `localStorage` (`diurnus.sync`), obok stanu.

## 5. Adapter GitHub (pierwszy)

### Przygotowanie (raz, przez użytkownika)

1. **Prywatne** repozytorium, np. `diurnus-data` (może być puste).
2. Token *fine-grained*: *Repository access* → tylko to repozytorium; *Permissions* →
   *Contents: Read and write* (plus automatyczne *Metadata: Read*). Z datą wygaśnięcia.
3. W aplikacji: repozytorium (`właściciel/nazwa`), gałąź (domyślnie `main`), opcjonalny
   katalog w repozytorium (domyślnie korzeń), token.

„Połącz" sprawdza `GET /repos/{właściciel}/{nazwa}`: czy token ma dostęp i prawo zapisu, i czy
repozytorium jest **prywatne** — publiczne dostaje wyraźne ostrzeżenie, bo dziennik byłby
widoczny dla każdego.

**Repozytorium prywatne** działa jak każde inne, bo każde żądanie niesie token — adapter nigdy
nie czyta niczego anonimowo:

- **`404` nie znaczy tylko „nie ma".** Przed tokenem bez dostępu GitHub ukrywa prywatne
  repozytorium odpowiedzią `404`, a nie `403`. „Połącz" mówi więc „Repozytorium nie istnieje
  albo token nie ma do niego dostępu" i podpowiada, żeby sprawdzić, czy token obejmuje to
  repozytorium.
- **Repozytorium organizacji** wymaga, żeby organizacja dopuszczała tokeny *fine-grained*;
  może też wymagać zatwierdzenia tokenu przez administratora. Do czasu zatwierdzenia żądania
  kończą się `403` albo `404` — „Połącz" wspomina o tym, gdy właściciel nie jest kontem
  użytkownika. Repozytorium na własnym koncie tego kroku nie ma.
- **Surowe linki** (`raw.githubusercontent.com`) do plików prywatnych wymagają osobnego
  uwierzytelnienia — adapter ich nie używa; treść bierze z API, które działa z tokenem.

### Operacje

Wszystkie żądania idą do `https://api.github.com` z `Authorization: Bearer <token>`
i `X-GitHub-Api-Version`. API GitHuba pozwala na wywołania z przeglądarki (CORS).

| Operacja | Wywołanie | Wersja |
|---|---|---|
| `list` | `GET /repos/{o}/{r}/git/trees/{gałąź}?recursive=1` z `If-None-Match` | `sha` bloba z drzewa |
| `read` | `GET /repos/{o}/{r}/contents/{ścieżka}?ref={gałąź}` → treść w base64 i `sha` | `sha` |
| `write` | `PUT /repos/{o}/{r}/contents/{ścieżka}` z `content` (base64), `sha: base` (przy zmianie), `branch`, `message` | `content.sha` z odpowiedzi |
| `remove` | `DELETE /repos/{o}/{r}/contents/{ścieżka}` z `sha: base`, `branch`, `message` | — |

- **Spis przez drzewo, nie przez katalog.** Lista katalogu w API treści zwraca najwyżej
  1000 plików — dziennik prowadzony codziennie przekroczyłby to przed upływem trzech lat.
  Drzewo gałęzi daje wszystkie pliki jednym żądaniem, a z `If-None-Match` odpowiada
  `304 Not Modified`, które nie liczy się do limitu żądań. Znacznikiem spisu jest `ETag`
  odpowiedzi.
- **Konflikt.** Zapis ze starym `sha` kończy się `409`, a utworzenie istniejącego pliku bez
  `sha` — `422`. W obu przypadkach adapter czyta bieżący dokument i zwraca go jako konflikt.
  `404` przy zapisie albo usuwaniu ze `sha` znaczy, że dokumentu już nie ma.
- **Tekst.** Treść koduje się i dekoduje jako UTF-8 (`TextEncoder` / `TextDecoder` + base64),
  żeby polskie znaki przeszły bez zmian.
- **Commit na plik.** API treści zapisuje jeden plik w jednym commicie, z wiadomością
  `diurnus: 2026-09-25.md`. W typowym wysłaniu to jeden lub dwa commity. Zapis kilku plików
  jednym commitem (Git Data API: bloby, drzewo, commit, przesunięcie gałęzi) jest możliwy, ale
  to kilka żądań na raz i konflikt na poziomie całej gałęzi zamiast dokumentu — nie tu.
- **Historia za darmo.** Każda wersja każdego dnia zostaje w historii repozytorium.

### Limity i bezpieczeństwo

- 5000 żądań na godzinę na token; `304` się nie liczy. Zapisy mają dodatkowy limit
  (rzędu kilkudziesięciu na minutę) — opóźnienie 2 s trzyma się daleko od niego. `403`/`429`
  z `Retry-After` albo `X-RateLimit-Reset` to błąd `rate-limit`.
- Token leży w `localStorage` tej przeglądarki. Jest ograniczony do jednego repozytorium
  i jednego uprawnienia, więc w najgorszym razie daje dostęp do samego dziennika. „Rozłącz"
  usuwa go z przeglądarki; ustawienia przypominają o dacie wygaśnięcia.
- `401` → błąd `auth` (token wygasł albo został cofnięty).

### Ruch

- Sprawdzenie bez zmian: jedno żądanie drzewa → `304`, kilkaset bajtów.
- Zmiana w ciągu dnia: jeden `PUT` dzisiejszego pliku (1–3 KB treści, w base64 o jedną trzecią
  więcej), czasem `BACKLOG.md`.
- Pobranie zmiany z innego urządzenia: drzewo (dziesiątki bajtów na plik, rośnie z liczbą dni)
  plus zmienione dokumenty.
- Nowe urządzenie pobiera wszystko raz; potem tylko różnice.

## 6. Adapter Dropbox (drugi)

Dla użytkowników bez GitHuba: logowanie „Zaloguj przez Dropbox" w przeglądarce (OAuth PKCE,
bez sekretu), pliki w folderze aplikacji (`Aplikacje/Diurnus`). Wymaga jednorazowej
rejestracji aplikacji Diurnus w Dropboksie.

| Operacja | Wywołanie | Wersja |
|---|---|---|
| `list` | `files/list_folder`, potem `list_folder/continue` z kursorem — kursor jest znacznikiem spisu | `rev` |
| `read` | `files/download` | `rev` |
| `write` | `files/upload` z trybem `update` na `rev` bazy (`add` przy tworzeniu) — konflikt to błąd `path/conflict` | nowy `rev` |
| `remove` | `files/delete_v2` z `parent_rev` | — |

Szczegóły — w osobnym przebiegu, gdy adapter GitHub będzie działał.

## 7. Własny serwer (opcjonalnie, później)

Dla tych, którzy chcą własnej infrastruktury: mały serwer w Go (`server/`, sama biblioteka
standardowa, obraz Dockera) trzymający dokumenty jako pliki w katalogu, z jednym tokenem.
Jego API jest odbiciem adaptera:

| Operacja | Wywołanie |
|---|---|
| `list` | `GET /` → mapa nazwa → `ETag`; z `If-None-Match` — `304` |
| `read` | `GET /{nazwa}` → treść i `ETag` |
| `write` | `PUT /{nazwa}` z `If-Match` (albo `If-None-Match: *`); konflikt → `412` z bieżącą treścią |
| `remove` | `PUT /{nazwa}` z pustą treścią i `If-Match` |

`ETag` to skrót treści (16 znaków szesnastkowych SHA-256); zapis atomowy (plik tymczasowy,
`fsync`, `rename`) pod jednym zamkiem; CORS tylko dla skonfigurowanych adresów; HTTPS przez
reverse proxy. Hosting to mały VPS albo darmowa maszyna z trwałym dyskiem — darmowe plany bez
dysku zgubiłyby pliki.

## 8. Poza zakresem

- Konta i wielu użytkowników w jednym magazynie — każdy ma swój magazyn.
- Powiadomienia na żywo — wystarcza sprawdzanie przy powrocie do karty.
- Szyfrowanie po stronie klienta.
- Scalanie zmian w obrębie jednego dokumentu (linia po linii).
- Logowanie do GitHuba przyciskiem (OAuth) — wymaga serwera do wymiany kodu, bo punkty
  logowania GitHuba nie przyjmują wywołań z przeglądarki.

## 9. Plan wdrożenia

1. **Rdzeń synchronizacji** w `src/lib/sync/`: interfejs `Store`, baza, różnice i decyzje
   (wyślij, pobierz, konflikt, usuń, pierwsze połączenie), magazyn w pamięci do testów.
2. **Adapter GitHub** z testami na podstawionym `fetch`: drzewo z `304`, odczyt base64/UTF-8,
   zapis i usunięcie z `sha`, `409`/`422`/`404`, `401`, limity.
3. **Zegar synchronizacji** w `state`: opóźnione wysyłanie, pobieranie przy starcie, powrocie
   do karty i co 5 minut, ponowienia, stan do pokazania.
4. **Ustawienia → Dane → Synchronizacja**: GitHub, sprawdzenie repozytorium, pierwsze
   połączenie, stan, „Nadpisz moją wersją".
5. **Test końcowy**: dwie karty przeglądarki na podstawionym API GitHuba — zmiana w jednej
   pojawia się w drugiej, konflikt kończy się wersją magazynu i działającym „Nadpisz"; potem
   ręczna próba na prawdziwym prywatnym repozytorium.
6. **Adapter Dropbox.**
7. **Własny serwer** — tylko jeśli będzie potrzebny.
