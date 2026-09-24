# GridDay — kopia zapasowa JSON i parser iCalendar (plan wdrożenia)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dać aplikacji działający eksport/import stanu do JSON oraz w pełni przetestowany, czysty parser `.ics`, który zamienia treść kalendarza w listę kwantów siatki — bez dotykania stanu aplikacji.

**Architecture:** `gridday.html` pozostaje jednym samowystarczalnym plikiem. Fragmenty czystej logiki (bez DOM, bez `localStorage`) zostają otoczone znacznikami `/* CORE:BEGIN */` … `/* CORE:END */`. Harness testowy czyta plik HTML, skleja wszystkie takie fragmenty i wykonuje je w `node:vm`, zwracając wybrane funkcje. Dzięki temu testy jednostkowe działają na dokładnie tym kodzie, który trafia do przeglądarki, a artefakt dystrybucyjny nadal jest jednym plikiem.

**Tech Stack:** vanilla ES2022; `node:test` + `node:assert/strict` + `node:vm` (wbudowane w Node ≥ 18 — **zero zależności, zero `npm install`, brak `package.json`**).

**Spec:** [`PLAN.md`](../../../PLAN.md) — sekcje §3 (model danych), §5 (integracja iCalendar), §6 E1 oraz I1–I4.

## Zakres

Ten plan realizuje **E1** oraz **I1–I4** ze spec-a. Kończy się działającą kopią zapasową i parserem `.ics` udowodnionym testami. **Poza zakresem** (osobny plan, po zatwierdzeniu tego): I5 (migracja `v3`), I6–I11 (warstwa synchronizacji, wstrzykiwanie sugestii, UI kalendarzy, import pliku), R1–R3 (raporty), P1–P3 (PWA).

Podział jest celowy: zadania I6+ konsumują kształt danych, który powstaje w zadaniu 9. Projektowanie ich teraz oznaczałoby zgadywanie.

## Global Constraints

- **Zero zależności runtime.** Żadnego `npm install`, `package.json`, `node_modules`. Testy używają wyłącznie modułów wbudowanych Node.
- **Zero build-stepu.** `gridday.html` jest jednocześnie źródłem i artefaktem. Katalog `test/` nie jest częścią dystrybucji.
- **Język.** Komentarze w kodzie, nazwy testów i komunikaty dla użytkownika — po polsku, zgodnie z resztą pliku. Komunikaty commitów — po angielsku, zgodnie z istniejącą historią.
- **Styl.** 2 spacje wcięcia, `const`/`let`, bez średnikowych ASI-sztuczek, nazwy funkcji iCal z prefiksem `ics`.
- **Strefa czasowa testów.** Wszystkie testy uruchamiane z `TZ=Europe/Warsaw`. Kod zależny od czasu lokalnego bez tego pinu daje wyniki zależne od maszyny.
- **Znaczniki `CORE`.** Dokładnie `/* CORE:BEGIN */` i `/* CORE:END */`, każdy w osobnej linii. Fragmenty są sklejane **w kolejności występowania w pliku**, więc funkcja może wołać tylko to, co zdefiniowano wyżej.
- **Czystość fragmentów `CORE`.** Wewnątrz znaczników nie wolno odwoływać się do `document`, `window`, `localStorage`, `$()` ani `icon()`. Harness ich nie dostarczy i test wybuchnie.
- **Pełne 96 kwantów.** Parser zwraca `q` liczone od północy (0–95), nigdy od początku widocznego okna.

## Review Focus

Klasy wejścia, których spec wymaga pośrednio, a które najłatwiej przeoczyć:

1. **Plik nie będący iCalendarem** (serwer zwrócił stronę logowania HTML lub komunikat błędu) — parser musi zwrócić pustą listę, a nie rzucić wyjątkiem, bo `fetch` sukcesem statusu 200 tego nie odsieje. → test w zadaniu 5.
2. **Zakończenia linii LF zamiast CRLF** — RFC wymaga CRLF, ale eksporty z wielu narzędzi i pliki przepuszczone przez `git` mają LF; rozwijanie linii musi działać dla obu. → test w zadaniu 4.
3. **Zdarzenie przechodzące przez północ** — musi pojawić się jako blok w obu dniach, przycięty do każdego z nich. → test w zadaniu 8.
4. **Dzień zmiany czasu** — 29 marca 2026 doba ma 23 godziny; zdarzenie o 08:00 musi wylądować w kwancie 32, a nie 28. → test w zadaniu 8.
5. **`DTEND` wcześniejsze lub równe `DTSTART`** — zdarzenie o zerowym lub ujemnym czasie trwania musi zostać odrzucone, a nie zamienione w blok o ujemnej długości. → test w zadaniu 9.

---

## Struktura plików

| Plik | Rola |
|---|---|
| `gridday.html` | Aplikacja. Zyskuje znaczniki `CORE` wokół istniejących stałych i `normalize()`, oraz dwie nowe sekcje: kopia zapasowa i iCalendar. |
| `test/harness.mjs` | Wyciąga fragmenty `CORE` z `gridday.html` i wykonuje je w `node:vm`. Jedyny plik, który wie o formacie HTML. |
| `test/normalize.test.mjs` | Testy regresyjne istniejącego `normalize()`. |
| `test/bundle.test.mjs` | Testy serializacji kopii zapasowej. |
| `test/ics-lex.test.mjs` | Rozwijanie linii, parsowanie linii, odkodowanie escape'ów. |
| `test/ics-parse.test.mjs` | Składanie `VEVENT`, pomijanie `VALARM`, odporność na śmieci. |
| `test/ics-time.test.mjs` | UTC / `TZID` / czas pływający / całodniowe / `DURATION`. |
| `test/ics-rrule.test.mjs` | Rozwijanie `RRULE` etapu 1 i `EXDATE`. |
| `test/ics-quant.test.mjs` | Kwantyzacja, przycinanie do okna, północ, zmiana czasu. |
| `test/ics-suggest.test.mjs` | Złożenie całości: `.ics` → lista kwantów. |
| `test/fixtures/*.ics` | Przykładowe kalendarze. |

Podział testów idzie **za odpowiedzialnością, nie za warstwą**: każdy plik testowy odpowiada jednej funkcji publicznej z sekcji `CORE`, więc odrzucone zadanie da się cofnąć bez ruszania sąsiadów.

---

## Zadanie 1: Harness testowy i pokrycie `normalize()`

Pierwsze zadanie nie dodaje funkcji aplikacji. Buduje maszynerię, na której stoi wszystko dalsze, i udowadnia ją na kodzie, który **już istnieje i już działa** — co znaczy, że jeśli test padnie, winny jest harness, a nie kod produkcyjny. Daje też siatkę bezpieczeństwa pod migrację `v2 → v3` z przyszłego planu.

**Files:**
- Create: `test/harness.mjs`
- Create: `test/normalize.test.mjs`
- Modify: `gridday.html:447` (znacznik przed `const QDAY`), `gridday.html:476` (znacznik po `MODE_LABEL`), `gridday.html:530` (znacznik przed `function normalize`), `gridday.html:537` (znacznik po `}` zamykającym `normalize`)

**Interfaces:**
- Produces: `loadCore(names: string[]) -> object` — zwraca obiekt z funkcjami o podanych nazwach, wyciągniętymi z `gridday.html`. Każde kolejne zadanie zaczyna od `const { … } = loadCore([…])`.

- [ ] **Step 1: Otocz istniejące stałe znacznikami `CORE`**

W `gridday.html` linia 447 to `/* ───────────── Stałe ───────────── */`. Wstaw znacznik **pod nią**, a domykający **po** linii z `MODE_LABEL`:

```js
/* ───────────── Stałe ───────────── */
/* CORE:BEGIN */
const QDAY = 96;            // kwanty 15 min w dobie; bloki trzymają q liczone od północy
// … (bez zmian: START_H, KEY, DEFAULT_CATS, COLORS, ICONS, MAX_TOP, DEFAULT_DAY, STATUS_LABEL) …
const MODE_LABEL = { past:'wstecz', now:'start', future:'plan' };
/* CORE:END */
```

- [ ] **Step 2: Otocz `normalize()` znacznikami `CORE`**

```js
/* ───────────── Stan ───────────── */
/* CORE:BEGIN */
function normalize(x){
  if (x && x.v === 1 && Array.isArray(x.blocks)){ x.blocks.forEach(b => { b.q += 24; }); x.v = 2; }  // v1: q od 06:00
  if (!x || x.v !== 2 || !Array.isArray(x.blocks)) x = { v:2, cats:DEFAULT_CATS, blocks:[] };
  if (!Array.isArray(x.cats) || !x.cats.length) x.cats = DEFAULT_CATS;
  if (!x.day || !(x.day.start < x.day.end) || !Array.isArray(x.day.bands)) x.day = JSON.parse(JSON.stringify(DEFAULT_DAY));
  return x;
}
/* CORE:END */
```

Treść funkcji bez zmian — dokładamy wyłącznie dwie linie komentarza.

- [ ] **Step 3: Napisz harness**

```js
// test/harness.mjs — wyciąga czystą logikę z gridday.html i wykonuje ją w izolacji.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const HTML = new URL('../gridday.html', import.meta.url);
const RE = /\/\*\s*CORE:BEGIN\s*\*\/\n([\s\S]*?)\n\s*\/\*\s*CORE:END\s*\*\//g;

export function loadCore(names){
  const src = readFileSync(HTML, 'utf8');
  const parts = [...src.matchAll(RE)].map(m => m[1]);
  if (!parts.length) throw new Error('Brak sekcji CORE:BEGIN/CORE:END w gridday.html');
  // Kontekst celowo ubogi: brak document/window/localStorage. Odwołanie do nich
  // w sekcji CORE ma wybuchnąć tutaj, a nie dopiero w przeglądarce.
  const ctx = vm.createContext({ Intl, Date, Math, JSON, console, String, Number, Array, Object, Set, Map, RegExp, isNaN, parseInt, parseFloat, Error });
  const code = parts.join('\n\n') + `\n;({ ${names.join(', ')} })`;
  return vm.runInContext(code, ctx, { filename: 'gridday-core.js' });
}
```

- [ ] **Step 4: Napisz testy `normalize()`**

```js
// test/normalize.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './harness.mjs';

const { normalize } = loadCore(['normalize']);

test('normalize: brak stanu daje domyślne kategorie, pusty dzień i wersję 2', () => {
  const s = normalize(null);
  assert.equal(s.v, 2);
  assert.deepEqual(s.blocks, []);
  assert.ok(s.cats.length > 0);
  assert.equal(s.day.start, 6);
  assert.equal(s.day.end, 22);
});

test('normalize: migracja v1 → v2 przesuwa q z bazy 06:00 na bazę północy', () => {
  const s = normalize({ v:1, cats:[{ id:'x', name:'X', icon:'circle', color:'red', parent:null }],
    blocks:[{ id:'a', day:'2026-09-24', q:0, len:2, cat:'x', status:'confirmed' }] });
  assert.equal(s.v, 2);
  assert.equal(s.blocks[0].q, 24);   // 06:00 = 24. kwant doby
});

test('normalize: uszkodzony day jest zastępowany domyślnym, bloki zostają', () => {
  const s = normalize({ v:2, cats:[{ id:'x', name:'X', icon:'circle', color:'red', parent:null }],
    blocks:[{ id:'a', day:'2026-09-24', q:32, len:2, cat:'x', status:'planned' }],
    day:{ start:22, end:6, bands:[] } });   // start >= end
  assert.equal(s.day.start, 6);
  assert.equal(s.blocks.length, 1);
});

test('normalize: pusta lista kategorii wraca do domyślnych', () => {
  const s = normalize({ v:2, cats:[], blocks:[], day:{ start:6, end:22, bands:[] } });
  assert.ok(s.cats.length > 0);
});

test('normalize: DEFAULT_DAY nie jest współdzielony między wywołaniami', () => {
  const a = normalize(null), b = normalize(null);
  a.day.bands.push({ id:'zzz', name:'Test', from:12, color:'red' });
  assert.notEqual(a.day.bands.length, b.day.bands.length);
});
```

- [ ] **Step 5: Uruchom testy**

Run: `TZ=Europe/Warsaw node --test test/`
Expected: 5 testów PASS.

Jeśli `loadCore` rzuca `Brak sekcji CORE` — znaczniki z kroków 1–2 mają literówkę albo nie stoją w osobnych liniach.

- [ ] **Step 6: Commit**

```bash
git add test/harness.mjs test/normalize.test.mjs gridday.html
git commit -m "test: add zero-dependency harness extracting pure logic from the HTML

Marks the constants block and normalize() with CORE:BEGIN/CORE:END.
test/harness.mjs reads gridday.html, concatenates every marked region and
evaluates it in node:vm, so unit tests run against exactly the code the
browser receives while the distributed artifact stays a single file.

The vm context deliberately omits document, window and localStorage: a DOM
reference inside a CORE region now fails a test instead of shipping.

Covers normalize() first because it already works, which means a failure
here indicts the harness rather than the application, and because it is the
function the upcoming v3 schema migration will modify."
```

---

## Zadanie 2: Serializacja kopii zapasowej

Czysta część E1: zamiana stanu na tekst i z powrotem, z walidacją. Bez DOM, więc w całości testowalna.

**Files:**
- Modify: `gridday.html` — nowa sekcja `/* ───── Kopia zapasowa ───── */` bezpośrednio po sekcji `Stan` z zadania 1 (po `CORE:END` domykającym `normalize`, przed komentarzem `/* jednorazowe przeniesienie stanu… */`)
- Create: `test/bundle.test.mjs`

**Interfaces:**
- Consumes: `normalize(x)` z zadania 1.
- Produces:
  - `bundleExport(state: object, preferences: object, nowMs: number) -> string` — sformatowany JSON.
  - `bundleParse(text: string) -> { state: object, prefs: object }` — rzuca `Error` z komunikatem po polsku przy każdym niepowodzeniu.

- [ ] **Step 1: Napisz testy**

```js
// test/bundle.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './harness.mjs';

const { normalize, bundleExport, bundleParse } = loadCore(['normalize', 'bundleExport', 'bundleParse']);

const sample = () => normalize({ v:2,
  cats:[{ id:'work', name:'Praca', icon:'laptop-code', color:'yellow', parent:null }],
  blocks:[{ id:'a1', day:'2026-09-24', q:32, len:2, cat:'work', title:'Spotkanie', status:'confirmed', created:1758700000000 }],
  day:{ start:6, end:22, bands:[{ id:'b1', name:'Praca', from:8, color:'yellow' }] } });

test('bundle: pełny obieg zachowuje bloki, kategorie i dzień', () => {
  const back = bundleParse(bundleExport(sample(), { theme:'dark', seenHelp:true }, 1758700000000));
  assert.deepEqual(back.state.blocks, sample().blocks);
  assert.deepEqual(back.state.cats, sample().cats);
  assert.equal(back.state.day.start, 6);
  assert.equal(back.prefs.theme, 'dark');
});

test('bundle: eksport zapisuje datę z podanego zegara, nie z systemowego', () => {
  const o = JSON.parse(bundleExport(sample(), {}, Date.UTC(2026, 8, 24, 10, 0, 0)));
  assert.equal(o.exported, '2026-09-24T10:00:00.000Z');
});

test('bundle: import przepuszcza starą wersję schematu przez normalize', () => {
  const old = JSON.stringify({ magic:'gridday.backup', exported:'x',
    state:{ v:1, cats:[{ id:'x', name:'X', icon:'circle', color:'red', parent:null }],
            blocks:[{ id:'a', day:'2026-09-24', q:0, len:2, cat:'x', status:'confirmed' }] } });
  const back = bundleParse(old);
  assert.equal(back.state.v, 2);
  assert.equal(back.state.blocks[0].q, 24);
});

test('bundle: nie-JSON daje czytelny błąd', () => {
  assert.throws(() => bundleParse('<html>Zaloguj się</html>'), /poprawnym JSON/);
});

test('bundle: obcy JSON jest odrzucany po znaczniku', () => {
  assert.throws(() => bundleParse('{"foo":1}'), /kopia zapasowa GridDay/);
});

test('bundle: kopia bez tablicy bloków jest odrzucana', () => {
  assert.throws(() => bundleParse('{"magic":"gridday.backup","state":{"v":2}}'), /nie zawiera bloków/);
});

test('bundle: brak prefs w pliku daje domyślne', () => {
  const back = bundleParse(JSON.stringify({ magic:'gridday.backup', state:{ v:2, cats:[], blocks:[] } }));
  assert.equal(back.prefs.theme, 'auto');
});
```

- [ ] **Step 2: Uruchom testy — muszą paść**

Run: `TZ=Europe/Warsaw node --test test/bundle.test.mjs`
Expected: FAIL. `loadCore` rzuci `ReferenceError: bundleExport is not defined` przy ewaluacji wyrażenia zwracającego.

- [ ] **Step 3: Napisz implementację**

```js
/* ───────────── Kopia zapasowa ───────────── */
/* CORE:BEGIN */
const BUNDLE_MAGIC = 'gridday.backup';
const PREFS_DEFAULT = { theme:'auto', seenHelp:true };

function bundleExport(state, preferences, nowMs){
  return JSON.stringify({
    magic: BUNDLE_MAGIC,
    exported: new Date(nowMs).toISOString(),
    state,
    prefs: preferences || {},
  }, null, 2);
}

function bundleParse(text){
  let o;
  try { o = JSON.parse(text); }
  catch { throw new Error('Plik nie jest poprawnym JSON-em'); }
  if (!o || typeof o !== 'object' || o.magic !== BUNDLE_MAGIC)
    throw new Error('To nie jest kopia zapasowa GridDay');
  if (!o.state || !Array.isArray(o.state.blocks))
    throw new Error('Kopia nie zawiera bloków');
  return {
    state: normalize(o.state),
    prefs: Object.assign({}, PREFS_DEFAULT, o.prefs || {}),
  };
}
/* CORE:END */
```

`nowMs` jest parametrem, a nie `Date.now()` w środku, wyłącznie po to, by eksport dał się porównać w teście. Wywołanie produkcyjne przekaże `Date.now()`.

`seenHelp` domyślnie `true`, bo import stanu to nie pierwsze uruchomienie — ekran powitalny po przywróceniu kopii byłby zgrzytem.

- [ ] **Step 4: Uruchom testy**

Run: `TZ=Europe/Warsaw node --test test/`
Expected: 12 testów PASS (5 z zadania 1 + 7 nowych).

- [ ] **Step 5: Commit**

```bash
git add gridday.html test/bundle.test.mjs
git commit -m "feat: add backup serialisation for the application state

bundleExport/bundleParse turn the whole localStorage state into a single
JSON document and back. Imports run through normalize(), so a backup taken
before a schema change restores correctly after one.

Validation rejects three distinct failure modes with separate messages: not
JSON at all (a server returning an HTML login page), JSON that is not a
GridDay backup, and a backup missing its blocks. A single generic error
would leave the user guessing which file they picked.

The export clock is a parameter rather than a Date.now() call inside the
function, which keeps the output comparable in a test."
```

---

## Zadanie 3: Eksport i import w panelu ustawień

Domknięcie E1 — jedyne zadanie w tym planie dotykające DOM, więc bez testów jednostkowych; weryfikacja ręczna wg listy w kroku 5.

**Files:**
- Modify: `gridday.html:936-939` (`cfgHead` — trzecia zakładka), `gridday.html:946` (`renderCats` — rozgałęzienie), `gridday.html:1103-1110` (handler `#cats` — nowe akcje), nowa funkcja `renderData()` obok `renderDay()`

**Interfaces:**
- Consumes: `bundleExport`, `bundleParse` z zadania 2; `setCfgHTML(html, focusSel)`, `cfgHead()`, `toast(msg)`, `closeAll()`, `save()`, `savePrefs()`, `applyDay()`, `render()`, `applyTheme()` — istniejące w pliku.

- [ ] **Step 1: Dodaj zakładkę w `cfgHead`**

Linia 938 kończy się `…role="tab">Dzień</button></div>`. Dopisz trzeci przycisk przed `</div>`:

```js
const cfgHead = () => `<div class="sh-head"><div class="tabs" role="tablist">
    <button class="tab${catEdit.tab === 'cats' ? ' sel' : ''}" data-act="tab" data-tab="cats" role="tab">Kategorie</button>
    <button class="tab${catEdit.tab === 'day' ? ' sel' : ''}" data-act="tab" data-tab="day" role="tab">Dzień</button>
    <button class="tab${catEdit.tab === 'data' ? ' sel' : ''}" data-act="tab" data-tab="data" role="tab">Dane</button></div>
  <button class="ib" data-act="close" aria-label="Zamknij">${icon('xmark', '×')}</button></div>`;
```

- [ ] **Step 2: Rozgałęź `renderCats`**

Linia 946 brzmi `if (catEdit.tab === 'day') return renderDay();`. Zamień na:

```js
  if (catEdit.tab === 'day') return renderDay();
  if (catEdit.tab === 'data') return renderData();
```

- [ ] **Step 3: Dodaj `renderData()` bezpośrednio po `renderDay()`**

```js
function renderData(){
  const n = S.blocks.filter(b => b.status !== 'discarded').length;
  const days = new Set(S.blocks.map(b => b.day)).size;
  setCfgHTML(cfgHead() + `
    <div class="ce-list">
      <p class="hint">W pamięci przeglądarki: <b>${n}</b> ${plural(n, 'blok', 'bloki', 'bloków')}
         z <b>${days}</b> ${plural(days, 'dnia', 'dni', 'dni')}.</p>
      <p class="hint">Dane żyją wyłącznie w tej przeglądarce. Wyczyszczenie danych witryny
         kasuje je bezpowrotnie — kopia zapasowa to jedyne zabezpieczenie.</p>
      <button class="btn ce-add" data-act="export">${icon('download', '↓')}Pobierz kopię zapasową</button>
      <button class="btn ce-add" data-act="importpick">${icon('upload', '↑')}Wczytaj kopię zapasową</button>
      <input type="file" id="bfile" accept="application/json,.json" hidden>
      <p class="hint">Wczytanie kopii <b>zastąpi</b> cały bieżący stan.</p>
    </div>`);
}
```

`ce-add` i `hint` to klasy już obecne w arkuszu (używa ich zakładka `Dzień`) — nie dodajemy CSS.

- [ ] **Step 4: Obsłuż akcje w handlerze `#cats`**

W `switch (act)` (linia ~1107) dopisz trzy przypadki obok `case 'dreset':`:

```js
    case 'export': {
      const name = `gridday-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(new Blob([bundleExport(S, prefs, Date.now())], { type:'application/json' }));
      const a2 = document.createElement('a');
      a2.href = url; a2.download = name; a2.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(`Zapisano ${name}`);
      break;
    }
    case 'importpick': $('#bfile').click(); break;
```

I osobny nasłuch na samym `input`, poza `switch` (obok istniejącego nasłuchu `change` dla `#cats`):

```js
$('#cats').addEventListener('change', e => {
  if (e.target.id !== 'bfile' || !e.target.files.length) return;
  const f = e.target.files[0];
  e.target.value = '';                         // ten sam plik da się wybrać ponownie
  f.text().then(txt => {
    const got = bundleParse(txt);              // rzuca przy złym pliku
    if (!confirm(`Zastąpić bieżący stan kopią z ${got.state.blocks.length} blokami? Tej operacji nie można cofnąć.`)) return;
    S = got.state; prefs = got.prefs;
    save(); savePrefs(); applyDay(); applyTheme(); closeAll(); render();
    toast('Kopia wczytana');
  }).catch(err => toast(err.message || 'Nie udało się wczytać pliku'));
});
```

`confirm()` jest tu świadomie — import kasuje cały stan i **nie da się go cofnąć przez `undo`**, bo `hist[]` też znika. Dyskretny toast byłby nieadekwatny do skutku.

- [ ] **Step 5: Weryfikacja ręczna**

Otwórz `gridday.html` w przeglądarce i przejdź listę:

1. Dodaj kilka bloków w różnych kategoriach.
2. Ustawienia → **Dane** → *Pobierz kopię zapasową*. Plik `gridday-RRRR-MM-DD.json` ląduje w pobranych i daje się otworzyć jako JSON.
3. Usuń wszystkie bloki. → *Wczytaj kopię zapasową*, wybierz plik, potwierdź. Bloki wracają, siatka się przerysowuje.
4. Wybierz **ten sam plik** drugi raz — dialog musi się pojawić ponownie (to sprawdza `e.target.value = ''`).
5. Wczytaj dowolny inny plik `.json`. → toast *„To nie jest kopia zapasowa GridDay"*, stan nietknięty.
6. Zmień motyw na ciemny, wyeksportuj, zmień na jasny, zaimportuj → motyw wraca na ciemny.
7. Anuluj dialog potwierdzenia → stan nietknięty.

- [ ] **Step 6: Commit**

```bash
git add gridday.html
git commit -m "feat: add a Data tab with backup download and restore

Completes the backup feature with a third settings tab. Export builds a Blob
and clicks a synthetic anchor; restore reads the file, validates it through
bundleParse and replaces the whole state.

Restore asks for confirmation because it cannot be undone: replacing S also
discards the undo history, so the usual toast-with-undo affordance would be
a lie. The file input is cleared after each pick so selecting the same file
twice still fires a change event.

The tab also states plainly that the data lives only in this browser, which
is the one thing a user of a localStorage-only application has to know."
```

---

## Zadanie 4: Leksyka iCalendar — rozwijanie i parsowanie linii

Początek I1. Najniższa warstwa: z tekstu na listę `{ name, params, value }`. Pominięcie rozwijania linii psuje każde długie `SUMMARY` i każdą `RRULE`, więc idzie pierwsze i osobno.

**Files:**
- Modify: `gridday.html` — nowa sekcja `/* ───── iCalendar ───── */` po sekcji `Kopia zapasowa`
- Create: `test/ics-lex.test.mjs`

**Interfaces:**
- Produces:
  - `icsUnfold(text: string) -> string[]` — linie logiczne, bez pustych.
  - `icsSplitAt(s: string, ch: string) -> number` — indeks pierwszego `ch` poza cudzysłowem, lub `-1`.
  - `icsSplitUnquoted(s: string, ch: string) -> string[]`
  - `icsUnescape(v: string) -> string`
  - `icsParseLine(line: string) -> { name: string, params: object, value: string } | null`

- [ ] **Step 1: Napisz testy**

```js
// test/ics-lex.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './harness.mjs';

const { icsUnfold, icsUnescape, icsParseLine } = loadCore(['icsUnfold', 'icsUnescape', 'icsParseLine']);

test('icsUnfold: CRLF + spacja skleja linię kontynuacji', () => {
  assert.deepEqual(icsUnfold('SUMMARY:Bardzo dlugi\r\n  tytul'), ['SUMMARY:Bardzo dlugi tytul']);
});

test('icsUnfold: CRLF + tabulator też skleja', () => {
  assert.deepEqual(icsUnfold('SUMMARY:A\r\n\tB'), ['SUMMARY:AB']);
});

test('icsUnfold: plik z samymi LF działa tak samo jak z CRLF', () => {
  assert.deepEqual(icsUnfold('SUMMARY:Dlugi\n  tytul'), ['SUMMARY:Dlugi tytul']);
});

test('icsUnfold: puste linie znikają', () => {
  assert.deepEqual(icsUnfold('A:1\r\n\r\nB:2\r\n'), ['A:1', 'B:2']);
});

test('icsUnescape: sekwencje specjalne wracają do znaków', () => {
  assert.equal(icsUnescape('Zebranie\\, sala 3\\; pietro 2'), 'Zebranie, sala 3; pietro 2');
  assert.equal(icsUnescape('Linia1\\nLinia2'), 'Linia1\nLinia2');
  assert.equal(icsUnescape('Linia1\\NLinia2'), 'Linia1\nLinia2');
  assert.equal(icsUnescape('C:\\\\temp'), 'C:\\temp');
});

test('icsParseLine: nazwa na wielkie litery, wartość dosłowna', () => {
  const p = icsParseLine('summary:Spotkanie z Anna');
  assert.equal(p.name, 'SUMMARY');
  assert.equal(p.value, 'Spotkanie z Anna');
  assert.deepEqual(p.params, {});
});

test('icsParseLine: parametry trafiają do params, nazwy na wielkie litery', () => {
  const p = icsParseLine('DTSTART;TZID=Europe/Warsaw;VALUE=DATE-TIME:20260924T080000');
  assert.equal(p.name, 'DTSTART');
  assert.equal(p.params.TZID, 'Europe/Warsaw');
  assert.equal(p.params.VALUE, 'DATE-TIME');
  assert.equal(p.value, '20260924T080000');
});

test('icsParseLine: dwukropek w parametrze w cudzysłowie nie rozcina linii', () => {
  const p = icsParseLine('DTSTART;TZID="GMT+01:00":20260924T080000');
  assert.equal(p.params.TZID, 'GMT+01:00');
  assert.equal(p.value, '20260924T080000');
});

test('icsParseLine: średnik w cudzysłowie nie rozcina parametrów', () => {
  const p = icsParseLine('X-Y;A="p;q";B=2:v');
  assert.equal(p.params.A, 'p;q');
  assert.equal(p.params.B, '2');
});

test('icsParseLine: linia bez dwukropka daje null', () => {
  assert.equal(icsParseLine('SMIECI'), null);
});
```

- [ ] **Step 2: Uruchom testy — muszą paść**

Run: `TZ=Europe/Warsaw node --test test/ics-lex.test.mjs`
Expected: FAIL, `ReferenceError: icsUnfold is not defined`.

- [ ] **Step 3: Napisz implementację**

```js
/* ───────────── iCalendar ───────────── */
/* CORE:BEGIN */

// RFC 5545 §3.1: linia dłuższa niż 75 oktetów jest łamana, a kontynuacja
// zaczyna się od spacji lub tabulatora. Normalizujemy też CRLF → LF, bo
// eksporty przepuszczone przez narzędzia tekstowe bywają czysto LF-owe.
function icsUnfold(text){
  const out = [];
  for (const raw of String(text).replace(/\r\n?/g, '\n').split('\n')){
    if (out.length && /^[ \t]/.test(raw)) out[out.length - 1] += raw.slice(1);
    else out.push(raw);
  }
  return out.filter(l => l !== '');
}

// Indeks pierwszego `ch` poza cudzysłowem. Parametr w cudzysłowie może
// zawierać dwukropek (TZID="GMT+01:00"), więc naiwne indexOf(':') gubi wartość.
function icsSplitAt(s, ch){
  let q = false;
  for (let i = 0; i < s.length; i++){
    const c = s[i];
    if (c === '"') q = !q;
    else if (c === ch && !q) return i;
  }
  return -1;
}

function icsSplitUnquoted(s, ch){
  const out = []; let cur = '', q = false;
  for (const c of s){
    if (c === '"'){ q = !q; cur += c; }
    else if (c === ch && !q){ out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function icsUnescape(v){
  // Klasa MUSI zawierać sam backslash, inaczej "\\" nie zostanie odkodowane.
  return String(v).replace(/\\([\\;,nN])/g, (_, c) => (c === 'n' || c === 'N') ? '\n' : c);
}

function icsParseLine(line){
  const i = icsSplitAt(line, ':');
  if (i < 0) return null;
  const segs = icsSplitUnquoted(line.slice(0, i), ';');
  const params = {};
  for (const p of segs.slice(1)){
    const j = p.indexOf('=');
    if (j < 0) continue;
    params[p.slice(0, j).toUpperCase()] = p.slice(j + 1).replace(/^"(.*)"$/, '$1');
  }
  return { name: segs[0].toUpperCase(), params, value: line.slice(i + 1) };
}
/* CORE:END */
```

- [ ] **Step 4: Uruchom testy**

Run: `TZ=Europe/Warsaw node --test test/`
Expected: 22 testy PASS.

- [ ] **Step 5: Commit**

```bash
git add gridday.html test/ics-lex.test.mjs
git commit -m "feat: add the iCalendar line lexer

Implements RFC 5545 line unfolding and content-line parsing: the 75-octet
folding rule, CRLF normalisation, parameter extraction and text unescaping.

Two details earn their code. Unfolding also accepts bare LF, because files
that pass through text tooling lose their CRLFs and would otherwise parse as
truncated garbage. And the name/value split is quote-aware, so a parameter
like TZID=\"GMT+01:00\" does not get cut at the colon inside its own value.

Pure functions with no calendar semantics yet; assembling VEVENTs is next."
```

---

## Zadanie 5: Składanie zdarzeń `VEVENT`

Dokończenie I1: z listy linii na listę zdarzeń, z pominięciem zagnieżdżonych komponentów.

**Files:**
- Modify: `gridday.html` — dopisanie do sekcji `iCalendar` (wewnątrz istniejących znaczników `CORE` z zadania 4)
- Create: `test/ics-parse.test.mjs`, `test/fixtures/basic.ics`

**Interfaces:**
- Consumes: `icsUnfold`, `icsParseLine` z zadania 4.
- Produces: `icsParse(text: string) -> Array<{ props: object, exdate: Array }>` — `props` mapuje nazwę właściwości na obiekt z `icsParseLine`; `exdate` to lista takich obiektów (`EXDATE` może wystąpić wielokrotnie).

- [ ] **Step 1: Utwórz fixture**

```
// test/fixtures/basic.ics  (zapisz z zakończeniami CRLF)
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//GridDay//test//PL
BEGIN:VEVENT
UID:spotkanie-1@example.com
DTSTART;TZID=Europe/Warsaw:20260924T080000
DTEND;TZID=Europe/Warsaw:20260924T090000
SUMMARY:Planowanie tygodnia
END:VEVENT
BEGIN:VEVENT
UID:przypomnienie-2@example.com
DTSTART;TZID=Europe/Warsaw:20260924T140000
DTEND;TZID=Europe/Warsaw:20260924T143000
SUMMARY:Telefon do klienta
BEGIN:VALARM
TRIGGER:-PT15M
ACTION:DISPLAY
SUMMARY:To jest alarm, nie zdarzenie
END:VALARM
END:VEVENT
END:VCALENDAR
```

- [ ] **Step 2: Napisz testy**

```js
// test/ics-parse.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadCore } from './harness.mjs';

const { icsParse } = loadCore(['icsParse']);
const basic = readFileSync(new URL('./fixtures/basic.ics', import.meta.url), 'utf8');

test('icsParse: znajduje oba zdarzenia i pomija otoczkę VCALENDAR', () => {
  const evs = icsParse(basic);
  assert.equal(evs.length, 2);
  assert.equal(evs[0].props.UID.value, 'spotkanie-1@example.com');
  assert.equal(evs[0].props.SUMMARY.value, 'Planowanie tygodnia');
});

test('icsParse: VALARM nie nadpisuje SUMMARY zdarzenia ani go nie kończy', () => {
  const evs = icsParse(basic);
  assert.equal(evs[1].props.SUMMARY.value, 'Telefon do klienta');
  assert.equal(evs[1].props.TRIGGER, undefined);
  assert.equal(evs[1].props.ACTION, undefined);
});

test('icsParse: wielokrotne EXDATE zbierają się w tablicę', () => {
  const evs = icsParse('BEGIN:VEVENT\r\nUID:a\r\nEXDATE:20260101T080000Z\r\nEXDATE:20260108T080000Z\r\nEND:VEVENT');
  assert.equal(evs[0].exdate.length, 2);
});

test('icsParse: strona HTML zamiast kalendarza daje pustą listę, nie wyjątek', () => {
  assert.deepEqual(icsParse('<!doctype html><html><body>Zaloguj sie</body></html>'), []);
});

test('icsParse: pusty tekst daje pustą listę', () => {
  assert.deepEqual(icsParse(''), []);
});

test('icsParse: niedomknięty VEVENT jest odrzucany', () => {
  assert.deepEqual(icsParse('BEGIN:VEVENT\r\nUID:a\r\nSUMMARY:Urwane'), []);
});
```

- [ ] **Step 3: Uruchom testy — muszą paść**

Run: `TZ=Europe/Warsaw node --test test/ics-parse.test.mjs`
Expected: FAIL, `ReferenceError: icsParse is not defined`.

- [ ] **Step 4: Napisz implementację**

Dopisz **przed** `/* CORE:END */` sekcji `iCalendar`:

```js
function icsParse(text){
  const events = [];
  let cur = null, depth = 0;
  for (const line of icsUnfold(text)){
    const p = icsParseLine(line);
    if (!p) continue;
    if (p.name === 'BEGIN'){
      if (p.value === 'VEVENT' && !cur){ cur = { props:{}, exdate:[] }; depth = 0; }
      else if (cur) depth++;                    // VALARM i inne zagnieżdżenia
      continue;
    }
    if (p.name === 'END'){
      if (p.value === 'VEVENT' && cur && depth === 0){ events.push(cur); cur = null; }
      else if (cur && depth > 0) depth--;
      continue;
    }
    if (!cur || depth > 0) continue;            // właściwości spoza VEVENT ignorujemy
    if (p.name === 'EXDATE') cur.exdate.push(p);
    else cur.props[p.name] = p;
  }
  return events;                                 // niedomknięty VEVENT przepada razem z `cur`
}
```

Licznik `depth` to cała różnica między „SUMMARY alarmu nadpisuje SUMMARY spotkania" a poprawnym parserem. `END:VALARM` bez licznika wyglądałoby jak koniec zdarzenia.

- [ ] **Step 5: Uruchom testy**

Run: `TZ=Europe/Warsaw node --test test/`
Expected: 28 testów PASS.

- [ ] **Step 6: Commit**

```bash
git add gridday.html test/ics-parse.test.mjs test/fixtures/basic.ics
git commit -m "feat: assemble VEVENT records from iCalendar lines

icsParse walks the unfolded lines and collects each VEVENT's properties,
keeping repeated EXDATE properties as a list since one event may carry
several.

A depth counter skips nested components. Without it a VALARM's SUMMARY
overwrites the event's own, and its END:VALARM terminates the event early --
a silent corruption rather than a crash.

A server that answers a calendar URL with an HTML login page returns status
200, so the parser has to treat non-calendar input as zero events instead of
throwing. Covered by a test."
```

---

## Zadanie 6: Rozwiązywanie czasu i czasu trwania

I2. Zamiana `DTSTART`/`DTEND`/`DURATION` na znaczniki czasu, z obsługą stref bez żadnej biblioteki.

**Files:**
- Modify: `gridday.html` — sekcja `iCalendar`
- Create: `test/ics-time.test.mjs`

**Interfaces:**
- Produces:
  - `icsZoneOffset(tzid: string, ms: number) -> number | null` — przesunięcie w minutach względem UTC dla danej chwili; `null` dla nieznanej strefy.
  - `icsTime(prop: { value, params }) -> { ms?: number, allDay?: boolean, floating?: boolean, unknownTz?: string } | null`
  - `icsDuration(v: string) -> number` — milisekundy; `0` przy niepoprawnym zapisie.

- [ ] **Step 1: Napisz testy**

```js
// test/ics-time.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './harness.mjs';

const { icsTime, icsZoneOffset, icsDuration } = loadCore(['icsTime', 'icsZoneOffset', 'icsDuration']);
const prop = (value, params = {}) => ({ value, params });

test('icsZoneOffset: Warszawa latem to +120 minut, zimą +60', () => {
  assert.equal(icsZoneOffset('Europe/Warsaw', Date.UTC(2026, 6, 1)), 120);
  assert.equal(icsZoneOffset('Europe/Warsaw', Date.UTC(2026, 0, 15)), 60);
});

test('icsZoneOffset: UTC to zero, nieznana strefa to null', () => {
  assert.equal(icsZoneOffset('UTC', Date.UTC(2026, 6, 1)), 0);
  assert.equal(icsZoneOffset('Mars/Olympus', Date.UTC(2026, 6, 1)), null);
});

test('icsTime: sufiks Z czytany jako UTC', () => {
  assert.equal(icsTime(prop('20260924T080000Z')).ms, Date.UTC(2026, 8, 24, 8, 0, 0));
});

test('icsTime: TZID latem przelicza na właściwą chwilę UTC', () => {
  assert.equal(icsTime(prop('20260924T080000', { TZID:'Europe/Warsaw' })).ms, Date.UTC(2026, 8, 24, 6, 0, 0));
});

test('icsTime: TZID zimą używa innego przesunięcia niż latem', () => {
  assert.equal(icsTime(prop('20260115T080000', { TZID:'Europe/Warsaw' })).ms, Date.UTC(2026, 0, 15, 7, 0, 0));
});

test('icsTime: czas pływający (bez Z i bez TZID) to czas lokalny', () => {
  const t = icsTime(prop('20260924T080000'));
  assert.equal(t.floating, true);
  assert.equal(new Date(t.ms).getHours(), 8);
});

test('icsTime: VALUE=DATE oznacza zdarzenie całodniowe', () => {
  assert.equal(icsTime(prop('20260924', { VALUE:'DATE' })).allDay, true);
  assert.equal(icsTime(prop('20260924')).allDay, true);
});

test('icsTime: nieznane TZID nie wywraca parsowania, tylko flaguje', () => {
  const t = icsTime(prop('20260924T080000', { TZID:'Mars/Olympus' }));
  assert.equal(t.unknownTz, 'Mars/Olympus');
  assert.equal(new Date(t.ms).getHours(), 8);
});

test('icsTime: śmieci dają null', () => {
  assert.equal(icsTime(prop('nie-data')), null);
});

test('icsDuration: godziny, minuty, dni i tygodnie', () => {
  assert.equal(icsDuration('PT30M'), 30 * 60000);
  assert.equal(icsDuration('PT1H30M'), 90 * 60000);
  assert.equal(icsDuration('P1D'), 86400000);
  assert.equal(icsDuration('P1W'), 7 * 86400000);
  assert.equal(icsDuration('PT45S'), 45000);
});

test('icsDuration: niepoprawny zapis daje zero', () => {
  assert.equal(icsDuration('bzdura'), 0);
});
```

- [ ] **Step 2: Uruchom testy — muszą paść**

Run: `TZ=Europe/Warsaw node --test test/ics-time.test.mjs`
Expected: FAIL, `ReferenceError: icsTime is not defined`.

- [ ] **Step 3: Napisz implementację**

```js
// Przesunięcie strefy dla konkretnej chwili. Przeglądarka i Node mają pełną
// bazę IANA w Intl, więc obsługa DST nie wymaga żadnego pakietu z tzdata.
function icsZoneOffset(tzid, ms){
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tzid, timeZoneName:'longOffset' })
      .formatToParts(new Date(ms)).find(p => p.type === 'timeZoneName');
    if (!part) return null;
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(part.value);
    if (!m) return /^GMT$/.test(part.value) ? 0 : null;     // sam "GMT" = UTC
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
  } catch { return null; }                                   // nieznane TZID
}

const ICS_DT = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/;

function icsTime(prop){
  const m = ICS_DT.exec(String(prop.value).trim());
  if (!m) return null;
  const [, Y, M, D, h, mi, s, z] = m;
  if (h === undefined || prop.params.VALUE === 'DATE') return { allDay: true };
  const local = () => new Date(+Y, +M - 1, +D, +h, +mi, +s).getTime();
  const wall = Date.UTC(+Y, +M - 1, +D, +h, +mi, +s);        // ściana czasu jako gdyby UTC
  if (z) return { ms: wall };
  const tzid = prop.params.TZID;
  if (!tzid) return { ms: local(), floating: true };
  const off = icsZoneOffset(tzid, wall);
  if (off === null) return { ms: local(), unknownTz: tzid };
  // Przesunięcie zależy od chwili, a chwila od przesunięcia. Jedna korekta
  // wystarcza: pierwsze przybliżenie myli się najwyżej w wąskim oknie DST.
  let ms = wall - off * 60000;
  const off2 = icsZoneOffset(tzid, ms);
  if (off2 !== null && off2 !== off) ms = wall - off2 * 60000;
  return { ms };
}

const ICS_DUR = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

function icsDuration(v){
  const m = ICS_DUR.exec(String(v).trim());
  if (!m) return 0;
  const n = i => Number(m[i] || 0);
  const ms = ((n(2) * 7 + n(3)) * 86400 + n(4) * 3600 + n(5) * 60 + n(6)) * 1000;
  return m[1] === '-' ? -ms : ms;
}
```

- [ ] **Step 4: Uruchom testy**

Run: `TZ=Europe/Warsaw node --test test/`
Expected: 39 testów PASS.

- [ ] **Step 5: Commit**

```bash
git add gridday.html test/ics-time.test.mjs
git commit -m "feat: resolve iCalendar timestamps, zones and durations

Handles the three DTSTART forms -- UTC with a Z suffix, a named TZID, and a
floating local time -- plus ISO 8601 durations and all-day dates.

Named zones resolve through Intl.DateTimeFormat with timeZoneName longOffset.
The engine already ships the full IANA database, so correct DST handling
costs no dependency and no bundled tzdata.

Resolution runs twice on purpose: the offset depends on the instant and the
instant depends on the offset, so the first guess can land on the wrong side
of a DST transition. The second pass corrects it.

An unrecognised TZID falls back to local time and sets unknownTz rather than
failing, so one malformed event cannot take a whole calendar down."
```

---

## Zadanie 7: Rozwijanie `RRULE` etapu 1

I3. Powtarzalność dzienna i tygodniowa plus `EXDATE`.

**Files:**
- Modify: `gridday.html` — sekcja `iCalendar`
- Create: `test/ics-rrule.test.mjs`

**Interfaces:**
- Consumes: `icsTime` z zadania 6.
- Produces:
  - `icsParseRRule(v: string) -> { freq, interval, count, until, byday }`
  - `icsOccurrences(startMs: number, rule: object|null, fromMs: number, toMs: number, exdates: number[]) -> number[]` — posortowane rosnąco początki wystąpień w `[fromMs, toMs)`.

- [ ] **Step 1: Napisz testy**

```js
// test/ics-rrule.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './harness.mjs';

const { icsParseRRule, icsOccurrences } = loadCore(['icsParseRRule', 'icsOccurrences']);

const at = (y, m, d, h = 8) => new Date(y, m - 1, d, h, 0, 0).getTime();
const dayWindow = (y, m, d) => [at(y, m, d, 0), at(y, m, d + 1, 0)];
const hours = ms => new Date(ms).getHours();

test('icsParseRRule: czyta częstotliwość, krok, liczbę i dni tygodnia', () => {
  const r = icsParseRRule('FREQ=WEEKLY;INTERVAL=2;COUNT=10;BYDAY=MO,WE,FR');
  assert.equal(r.freq, 'WEEKLY');
  assert.equal(r.interval, 2);
  assert.equal(r.count, 10);
  assert.deepEqual(r.byday, ['MO', 'WE', 'FR']);
});

test('icsParseRRule: BYDAY z przedrostkiem porządkowym gubi przedrostek', () => {
  assert.deepEqual(icsParseRRule('FREQ=MONTHLY;BYDAY=2TU').byday, ['TU']);
});

test('icsParseRRule: brak INTERVAL oznacza 1', () => {
  assert.equal(icsParseRRule('FREQ=DAILY').interval, 1);
});

test('icsOccurrences: brak reguły daje jedno wystąpienie, gdy mieści się w oknie', () => {
  const s = at(2026, 9, 24);
  assert.deepEqual(icsOccurrences(s, null, ...dayWindow(2026, 9, 24)), [s]);
  assert.deepEqual(icsOccurrences(s, null, ...dayWindow(2026, 9, 25)), []);
});

test('icsOccurrences: codzienne trafia w każdy kolejny dzień', () => {
  const s = at(2026, 9, 1);
  const r = icsParseRRule('FREQ=DAILY');
  assert.equal(icsOccurrences(s, r, ...dayWindow(2026, 9, 24)).length, 1);
});

test('icsOccurrences: INTERVAL=2 pomija co drugi dzień', () => {
  const s = at(2026, 9, 1);                       // dzień 0
  const r = icsParseRRule('FREQ=DAILY;INTERVAL=2');
  assert.equal(icsOccurrences(s, r, ...dayWindow(2026, 9, 3)).length, 1);   // dzień 2
  assert.equal(icsOccurrences(s, r, ...dayWindow(2026, 9, 4)).length, 0);   // dzień 3
});

test('icsOccurrences: tygodniowe z BYDAY trafia w wymienione dni', () => {
  const s = at(2026, 9, 7);                       // poniedziałek
  const r = icsParseRRule('FREQ=WEEKLY;BYDAY=MO,WE');
  assert.equal(icsOccurrences(s, r, ...dayWindow(2026, 9, 16)).length, 1);  // środa
  assert.equal(icsOccurrences(s, r, ...dayWindow(2026, 9, 17)).length, 0);  // czwartek
});

test('icsOccurrences: tygodniowe bez BYDAY trzyma dzień tygodnia z DTSTART', () => {
  const s = at(2026, 9, 8);                       // wtorek
  const r = icsParseRRule('FREQ=WEEKLY');
  assert.equal(icsOccurrences(s, r, ...dayWindow(2026, 9, 22)).length, 1);  // wtorek
  assert.equal(icsOccurrences(s, r, ...dayWindow(2026, 9, 23)).length, 0);  // środa
});

test('icsOccurrences: UNTIL zamyka serię', () => {
  const s = at(2026, 9, 1);
  const r = icsParseRRule('FREQ=DAILY;UNTIL=20260910T235959Z');
  assert.equal(icsOccurrences(s, r, ...dayWindow(2026, 9, 9)).length, 1);
  assert.equal(icsOccurrences(s, r, ...dayWindow(2026, 9, 15)).length, 0);
});

test('icsOccurrences: COUNT zamyka serię', () => {
  const s = at(2026, 9, 1);
  const r = icsParseRRule('FREQ=DAILY;COUNT=3');
  assert.equal(icsOccurrences(s, r, ...dayWindow(2026, 9, 3)).length, 1);
  assert.equal(icsOccurrences(s, r, ...dayWindow(2026, 9, 4)).length, 0);
});

test('icsOccurrences: EXDATE wycina pojedyncze wystąpienie', () => {
  const s = at(2026, 9, 1);
  const r = icsParseRRule('FREQ=DAILY');
  const ex = [at(2026, 9, 24)];
  assert.equal(icsOccurrences(s, r, ...dayWindow(2026, 9, 24), ex).length, 0);
  assert.equal(icsOccurrences(s, r, ...dayWindow(2026, 9, 25), ex).length, 1);
});

test('icsOccurrences: seria sprzed lat nie gubi dzisiejszego wystąpienia', () => {
  const s = at(2015, 1, 5);
  const r = icsParseRRule('FREQ=WEEKLY;BYDAY=MO');
  assert.equal(icsOccurrences(s, r, ...dayWindow(2026, 9, 21)).length, 1);  // poniedziałek
});

test('icsOccurrences: zmiana czasu nie przesuwa godziny wystąpienia', () => {
  const s = at(2026, 3, 1, 8);                    // przed zmianą (CET)
  const r = icsParseRRule('FREQ=DAILY');
  const got = icsOccurrences(s, r, ...dayWindow(2026, 4, 10));   // po zmianie (CEST)
  assert.equal(got.length, 1);
  assert.equal(hours(got[0]), 8);
});

test('icsOccurrences: nieobsługiwana częstotliwość daje pustą listę', () => {
  const s = at(2026, 9, 1);
  assert.deepEqual(icsOccurrences(s, icsParseRRule('FREQ=MONTHLY'), ...dayWindow(2026, 10, 1)), []);
});
```

- [ ] **Step 2: Uruchom testy — muszą paść**

Run: `TZ=Europe/Warsaw node --test test/ics-rrule.test.mjs`
Expected: FAIL, `ReferenceError: icsParseRRule is not defined`.

- [ ] **Step 3: Napisz implementację**

```js
const ICS_DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function icsParseRRule(v){
  const o = {};
  for (const part of String(v).split(';')){
    const i = part.indexOf('=');
    if (i > 0) o[part.slice(0, i).toUpperCase()] = part.slice(i + 1).toUpperCase();
  }
  return {
    freq: o.FREQ || null,
    interval: Math.max(1, parseInt(o.INTERVAL || '1', 10) || 1),
    count: o.COUNT ? parseInt(o.COUNT, 10) : null,
    until: o.UNTIL || null,
    // BYDAY bywa poprzedzone liczbą porządkową (2TU); etap 1 jej nie używa
    byday: o.BYDAY ? o.BYDAY.split(',').map(s => s.trim().slice(-2)) : null,
  };
}

function icsOccurrences(startMs, rule, fromMs, toMs, exdates = []){
  const ex = new Set(exdates);
  const keep = ms => ms >= fromMs && ms < toMs && !ex.has(ms);
  if (!rule || !rule.freq) return keep(startMs) ? [startMs] : [];
  if (rule.freq !== 'DAILY' && rule.freq !== 'WEEKLY') return [];       // etap 2

  const u = rule.until ? icsTime({ value: rule.until, params:{} }) : null;
  const untilMs = u && u.ms != null ? u.ms : null;
  const byday = rule.byday && rule.byday.length ? new Set(rule.byday) : null;
  const weekly = rule.freq === 'WEEKLY';
  const startDow = new Date(startMs).getDay();
  const weekOffset = (startDow + 6) % 7;                                // 0 = poniedziałek (WKST=MO)

  // Przy COUNT musimy liczyć od początku serii. Bez COUNT wolno przeskoczyć
  // wprost pod okno — inaczej cotygodniowe spotkanie z 2015 roku wymagałoby
  // czterech tysięcy iteracji, żeby dojść do dzisiaj.
  let i0 = 0, limit = 4000;
  if (rule.count == null){
    const approx = Math.floor((fromMs - startMs) / 86400000) - 7;
    if (approx > 0) i0 = approx;
    limit = 400;
  }

  const out = [];
  let emitted = 0;
  for (let i = i0; i < i0 + limit; i++){
    if (rule.count != null && emitted >= rule.count) break;
    // Krok przez setDate, nie przez dodawanie 86400000 ms: doba zmiany czasu
    // ma 23 lub 25 godzin, a wystąpienie ma zostać o tej samej godzinie ściany.
    const d = new Date(startMs);
    d.setDate(d.getDate() + i);
    const ms = d.getTime();
    if (untilMs != null && ms > untilMs) break;
    if (ms >= toMs) break;

    const dow = d.getDay();
    const ok = weekly
      ? Math.floor((i + weekOffset) / 7) % rule.interval === 0 && (byday ? byday.has(ICS_DOW[dow]) : dow === startDow)
      : i % rule.interval === 0 && (!byday || byday.has(ICS_DOW[dow]));
    if (!ok) continue;

    emitted++;                       // RFC 5545: COUNT liczy wystąpienia reguły,
    if (keep(ms)) out.push(ms);      // także te wycięte później przez EXDATE
  }
  return out;
}
```

- [ ] **Step 4: Uruchom testy**

Run: `TZ=Europe/Warsaw node --test test/`
Expected: 53 testy PASS.

- [ ] **Step 5: Commit**

```bash
git add gridday.html test/ics-rrule.test.mjs
git commit -m "feat: expand daily and weekly recurrence rules

Covers FREQ=DAILY and FREQ=WEEKLY with INTERVAL, BYDAY, COUNT, UNTIL and
EXDATE, which between them account for the overwhelming majority of
recurring events. Monthly and yearly rules return no occurrences for now
rather than wrong ones.

Iteration steps with setDate rather than adding 86400000 milliseconds, so an
occurrence keeps its wall-clock hour across a DST boundary instead of
drifting by an hour for half the year.

Without COUNT the loop fast-forwards to just under the requested window. A
weekly standup created in 2015 would otherwise need four thousand iterations
to reach today, once per calendar, per render.

EXDATE filters the output but still counts toward COUNT, as RFC 5545
requires: exclusions do not extend a series."
```

---

## Zadanie 8: Kwantyzacja do siatki

I4. Z przedziału czasu na `{ q, len }`, z przycięciem do doby i do widocznego okna.

**Files:**
- Modify: `gridday.html` — sekcja `iCalendar`
- Create: `test/ics-quant.test.mjs`

**Interfaces:**
- Produces: `icsQuantize(startMs: number, endMs: number, dayKey: string, q0: number, q1: number) -> { q: number, len: number } | null`

- [ ] **Step 1: Napisz testy**

```js
// test/ics-quant.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './harness.mjs';

const { icsQuantize } = loadCore(['icsQuantize']);
const at = (y, m, d, h, mi = 0) => new Date(y, m - 1, d, h, mi, 0).getTime();
const Q0 = 24, Q1 = 88;   // okno 06:00–22:00

test('icsQuantize: równa godzina daje kwant godziny razy cztery', () => {
  assert.deepEqual(icsQuantize(at(2026, 9, 24, 8), at(2026, 9, 24, 9), '2026-09-24', Q0, Q1), { q:32, len:4 });
});

test('icsQuantize: start zaokrągla w dół, koniec w górę', () => {
  // 08:07 – 08:52 => 08:00 – 09:00
  assert.deepEqual(icsQuantize(at(2026, 9, 24, 8, 7), at(2026, 9, 24, 8, 52), '2026-09-24', Q0, Q1), { q:32, len:4 });
});

test('icsQuantize: krótkie zdarzenie dostaje minimum 30 minut', () => {
  assert.deepEqual(icsQuantize(at(2026, 9, 24, 8), at(2026, 9, 24, 8, 10), '2026-09-24', Q0, Q1), { q:32, len:2 });
});

test('icsQuantize: zdarzenie przed oknem jest przycinane do jego początku', () => {
  assert.deepEqual(icsQuantize(at(2026, 9, 24, 5), at(2026, 9, 24, 7), '2026-09-24', Q0, Q1), { q:24, len:4 });
});

test('icsQuantize: zdarzenie po oknie jest przycinane do jego końca', () => {
  assert.deepEqual(icsQuantize(at(2026, 9, 24, 21), at(2026, 9, 24, 23), '2026-09-24', Q0, Q1), { q:84, len:4 });
});

test('icsQuantize: zdarzenie w całości poza oknem daje null', () => {
  assert.equal(icsQuantize(at(2026, 9, 24, 2), at(2026, 9, 24, 3), '2026-09-24', Q0, Q1), null);
});

test('icsQuantize: zdarzenie z innego dnia daje null', () => {
  assert.equal(icsQuantize(at(2026, 9, 25, 8), at(2026, 9, 25, 9), '2026-09-24', Q0, Q1), null);
});

test('icsQuantize: zdarzenie przez północ przycina się do każdego z dni', () => {
  const a = at(2026, 9, 24, 21), b = at(2026, 9, 25, 7);
  assert.deepEqual(icsQuantize(a, b, '2026-09-24', Q0, Q1), { q:84, len:4 });   // 21:00–22:00
  assert.deepEqual(icsQuantize(a, b, '2026-09-25', Q0, Q1), { q:24, len:4 });   // 06:00–07:00
});

test('icsQuantize: zerowy i ujemny czas trwania dają null', () => {
  assert.equal(icsQuantize(at(2026, 9, 24, 8), at(2026, 9, 24, 8), '2026-09-24', Q0, Q1), null);
  assert.equal(icsQuantize(at(2026, 9, 24, 9), at(2026, 9, 24, 8), '2026-09-24', Q0, Q1), null);
});

test('icsQuantize: w dobie zmiany czasu 08:00 to nadal kwant 32', () => {
  // 29.03.2026 — przejście na czas letni, doba ma 23 godziny
  assert.deepEqual(icsQuantize(at(2026, 3, 29, 8), at(2026, 3, 29, 9), '2026-03-29', Q0, Q1), { q:32, len:4 });
});

test('icsQuantize: całe widoczne okno mieści się bez przekroczenia', () => {
  const r = icsQuantize(at(2026, 9, 24, 6), at(2026, 9, 24, 22), '2026-09-24', Q0, Q1);
  assert.deepEqual(r, { q:24, len:64 });
  assert.ok(r.q + r.len <= Q1);
});
```

- [ ] **Step 2: Uruchom testy — muszą paść**

Run: `TZ=Europe/Warsaw node --test test/ics-quant.test.mjs`
Expected: FAIL, `ReferenceError: icsQuantize is not defined`.

- [ ] **Step 3: Napisz implementację**

```js
// Kwant liczony z godziny ściany, nie z różnicy milisekund od północy.
// W dobie zmiany czasu o 08:00 minęły 23 kwadranse zamiast 32, więc arytmetyka
// na milisekundach wsadziłaby zdarzenie o cztery rzędy za wysoko.
const icsQFloor = ms => { const d = new Date(ms); return d.getHours() * 4 + Math.floor(d.getMinutes() / 15); };
const icsQCeil  = ms => { const d = new Date(ms); return d.getHours() * 4 + Math.ceil(d.getMinutes() / 15); };

function icsQuantize(startMs, endMs, dayKey, q0, q1){
  if (!(endMs > startMs)) return null;
  const [Y, M, D] = String(dayKey).split('-').map(Number);
  const midnight = new Date(Y, M - 1, D).getTime();
  const nextMidnight = new Date(Y, M - 1, D + 1).getTime();

  const a = Math.max(startMs, midnight);
  const b = Math.min(endMs, nextMidnight);
  if (b <= a) return null;                                  // zdarzenie nie dotyka tego dnia

  let q = icsQFloor(a);
  let e = b >= nextMidnight ? QDAY : icsQCeil(b);

  if (q < q0) q = q0;
  if (e > q1) e = q1;
  if (e <= q) return null;                                  // w całości poza oknem

  let len = Math.max(2, e - q);                             // minimum 30 minut
  if (q + len > q1) len = q1 - q;
  return len > 0 ? { q, len } : null;
}
```

- [ ] **Step 4: Uruchom testy**

Run: `TZ=Europe/Warsaw node --test test/`
Expected: 64 testy PASS.

- [ ] **Step 5: Commit**

```bash
git add gridday.html test/ics-quant.test.mjs
git commit -m "feat: quantise calendar intervals onto the grid

Maps a time range onto {q, len} in 15-minute quanta counted from midnight,
clipped to the day and then to the visible window.

The start floors and the end ceilings, so snapping never shortens an event.
A sub-30-minute event widens to the grid's two-quantum minimum, and the
result is re-clipped afterwards so the minimum can never push a block past
the end of the window.

Quanta come from the wall-clock hour rather than from milliseconds since
midnight. On the spring-forward day only 23 hours have elapsed by 08:00, so
millisecond arithmetic would place the event four rows too high -- once a
year, in a way nobody would think to check. Covered by a test.

An event crossing midnight quantises separately against each day, producing
one clipped block on each side."
```

---

## Zadanie 9: Złożenie — z `.ics` na listę sugestii

Domknięcie I4. Jedna funkcja, którą będzie wołać warstwa synchronizacji z następnego planu.

**Files:**
- Modify: `gridday.html` — sekcja `iCalendar`
- Create: `test/ics-suggest.test.mjs`, `test/fixtures/mixed.ics`

**Interfaces:**
- Consumes: wszystko z zadań 4–8.
- Produces: `icsToSuggestions(text: string, dayKey: string, q0: number, q1: number) -> Array<{ uid: string, rid: string, title: string, q: number, len: number }>` — posortowane po `q`.

`rid` jest pusty dla zdarzeń niepowtarzalnych, a dla instancji serii zawiera `RECURRENCE-ID` albo — gdy go brak — znacznik czasu wystąpienia. Razem z `uid` tworzy klucz idempotencji, na którym oprze się wstrzykiwanie sugestii w następnym planie.

- [ ] **Step 1: Utwórz fixture**

```
// test/fixtures/mixed.ics  (CRLF)
BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:stalka@example.com
DTSTART;TZID=Europe/Warsaw:20260907T090000
DTEND;TZID=Europe/Warsaw:20260907T093000
RRULE:FREQ=WEEKLY;BYDAY=MO,TH
SUMMARY:Stand-up zespolu
END:VEVENT
BEGIN:VEVENT
UID:urlop@example.com
DTSTART;VALUE=DATE:20260924
DTEND;VALUE=DATE:20260925
SUMMARY:Dzien wolny
END:VEVENT
BEGIN:VEVENT
UID:odwolane@example.com
DTSTART;TZID=Europe/Warsaw:20260924T110000
DTEND;TZID=Europe/Warsaw:20260924T120000
STATUS:CANCELLED
SUMMARY:Odwolane spotkanie
END:VEVENT
BEGIN:VEVENT
UID:wolne@example.com
DTSTART;TZID=Europe/Warsaw:20260924T130000
DTEND;TZID=Europe/Warsaw:20260924T140000
TRANSP:TRANSPARENT
SUMMARY:Blokada orientacyjna
END:VEVENT
BEGIN:VEVENT
UID:duration@example.com
DTSTART;TZID=Europe/Warsaw:20260924T150000
DURATION:PT45M
SUMMARY:Przeglad\, retrospektywa
END:VEVENT
BEGIN:VEVENT
UID:calodniowka@example.com
DTSTART;TZID=Europe/Warsaw:20260924T070000
DTEND;TZID=Europe/Warsaw:20260924T200000
SUMMARY:Konferencja
END:VEVENT
END:VCALENDAR
```

- [ ] **Step 2: Napisz testy**

```js
// test/ics-suggest.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadCore } from './harness.mjs';

const { icsToSuggestions } = loadCore(['icsToSuggestions']);
const mixed = readFileSync(new URL('./fixtures/mixed.ics', import.meta.url), 'utf8');
const Q0 = 24, Q1 = 88;
const on = day => icsToSuggestions(mixed, day, Q0, Q1);
const byUid = (list, uid) => list.find(s => s.uid === uid);

test('icsToSuggestions: seria tygodniowa trafia w czwartek 24.09', () => {
  const s = byUid(on('2026-09-24'), 'stalka@example.com');
  assert.ok(s);
  assert.deepEqual({ q:s.q, len:s.len }, { q:36, len:2 });   // 09:00–09:30
  assert.equal(s.title, 'Stand-up zespolu');
});

test('icsToSuggestions: seria tygodniowa nie trafia w środę 23.09', () => {
  assert.equal(byUid(on('2026-09-23'), 'stalka@example.com'), undefined);
});

test('icsToSuggestions: instancja serii dostaje niepusty rid, pojedyncze zdarzenie pusty', () => {
  const list = on('2026-09-24');
  assert.notEqual(byUid(list, 'stalka@example.com').rid, '');
  assert.equal(byUid(list, 'duration@example.com').rid, '');
});

test('icsToSuggestions: zdarzenie całodniowe jest pomijane', () => {
  assert.equal(byUid(on('2026-09-24'), 'urlop@example.com'), undefined);
});

test('icsToSuggestions: STATUS:CANCELLED jest pomijane', () => {
  assert.equal(byUid(on('2026-09-24'), 'odwolane@example.com'), undefined);
});

test('icsToSuggestions: TRANSP:TRANSPARENT jest pomijane', () => {
  assert.equal(byUid(on('2026-09-24'), 'wolne@example.com'), undefined);
});

test('icsToSuggestions: DURATION zastępuje brakujące DTEND, escape w tytule odkodowany', () => {
  const s = byUid(on('2026-09-24'), 'duration@example.com');
  assert.deepEqual({ q:s.q, len:s.len }, { q:60, len:3 });    // 15:00–15:45
  assert.equal(s.title, 'Przeglad, retrospektywa');
});

test('icsToSuggestions: zdarzenie dłuższe niż osiem godzin jest pomijane jako tło', () => {
  assert.equal(byUid(on('2026-09-24'), 'calodniowka@example.com'), undefined);
});

test('icsToSuggestions: wynik jest posortowany po q', () => {
  const qs = on('2026-09-24').map(s => s.q);
  assert.deepEqual(qs, [...qs].sort((a, b) => a - b));
});

test('icsToSuggestions: DTEND równe lub wcześniejsze od DTSTART jest pomijane', () => {
  const bad = 'BEGIN:VEVENT\r\nUID:zle@x\r\nDTSTART;TZID=Europe/Warsaw:20260924T090000\r\n' +
              'DTEND;TZID=Europe/Warsaw:20260924T080000\r\nSUMMARY:Wstecz\r\nEND:VEVENT';
  assert.deepEqual(icsToSuggestions(bad, '2026-09-24', Q0, Q1), []);
});

test('icsToSuggestions: zdarzenie bez DTSTART jest pomijane', () => {
  const bad = 'BEGIN:VEVENT\r\nUID:brak@x\r\nSUMMARY:Bez poczatku\r\nEND:VEVENT';
  assert.deepEqual(icsToSuggestions(bad, '2026-09-24', Q0, Q1), []);
});

test('icsToSuggestions: strona HTML zamiast kalendarza daje pustą listę', () => {
  assert.deepEqual(icsToSuggestions('<!doctype html><p>Zaloguj sie', '2026-09-24', Q0, Q1), []);
});

test('icsToSuggestions: zdarzenie przez północ pojawia się w obu dniach', () => {
  const night = 'BEGIN:VEVENT\r\nUID:noc@x\r\nDTSTART;TZID=Europe/Warsaw:20260924T230000\r\n' +
                'DTEND;TZID=Europe/Warsaw:20260925T020000\r\nSUMMARY:Dyzur\r\nEND:VEVENT';
  // Okno pełnej doby (0–96), nie 06–22: przy oknie 06–22 zdarzenie widoczne po obu
  // stronach północy musiałoby trwać ponad 8 godzin, a tyle icsToSuggestions odcina.
  assert.deepEqual(icsToSuggestions(night, '2026-09-24', 0, 96).map(s => [s.q, s.len]), [[92, 4]]);
  assert.deepEqual(icsToSuggestions(night, '2026-09-25', 0, 96).map(s => [s.q, s.len]), [[0, 8]]);
});
```

- [ ] **Step 3: Uruchom testy — muszą paść**

Run: `TZ=Europe/Warsaw node --test test/ics-suggest.test.mjs`
Expected: FAIL, `ReferenceError: icsToSuggestions is not defined`.

- [ ] **Step 4: Napisz implementację**

```js
const ICS_MAX_MS = 8 * 3600000;            // dłuższe traktujemy jako tło, nie jako blok

function icsToSuggestions(text, dayKey, q0, q1){
  const [Y, M, D] = String(dayKey).split('-').map(Number);
  const dayStart = new Date(Y, M - 1, D).getTime();
  const dayEnd = new Date(Y, M - 1, D + 1).getTime();
  const out = [];

  for (const ev of icsParse(text)){
    const dtstart = ev.props.DTSTART;
    if (!dtstart) continue;
    if (ev.props.STATUS && ev.props.STATUS.value === 'CANCELLED') continue;
    if (ev.props.TRANSP && ev.props.TRANSP.value === 'TRANSPARENT') continue;

    const t0 = icsTime(dtstart);
    if (!t0 || t0.allDay || t0.ms == null) continue;

    let dur;
    if (ev.props.DTEND){
      const t1 = icsTime(ev.props.DTEND);
      if (!t1 || t1.allDay || t1.ms == null) continue;
      dur = t1.ms - t0.ms;
    } else if (ev.props.DURATION){
      dur = icsDuration(ev.props.DURATION.value);
    } else {
      dur = 30 * 60000;                    // RFC: brak obu = zdarzenie punktowe; siatka ma minimum 30 min
    }
    if (!(dur > 0) || dur > ICS_MAX_MS) continue;

    const rule = ev.props.RRULE ? icsParseRRule(ev.props.RRULE.value) : null;
    const ex = ev.exdate.flatMap(p => String(p.value).split(',')
      .map(v => { const t = icsTime({ value:v, params:p.params }); return t && t.ms != null ? t.ms : null; })
      .filter(ms => ms !== null));

    // Okno rozwijania cofnięte o dobę: zdarzenie zaczynające się wczoraj
    // wieczorem może sięgać w dzisiejszy poranek.
    for (const s of icsOccurrences(t0.ms, rule, dayStart - 86400000, dayEnd, ex)){
      const qq = icsQuantize(s, s + dur, dayKey, q0, q1);
      if (!qq) continue;
      out.push({
        uid: ev.props.UID ? ev.props.UID.value : '',
        rid: ev.props['RECURRENCE-ID'] ? ev.props['RECURRENCE-ID'].value : (rule ? String(s) : ''),
        title: icsUnescape(ev.props.SUMMARY ? ev.props.SUMMARY.value : ''),
        q: qq.q,
        len: qq.len,
      });
    }
  }
  return out.sort((a, b) => a.q - b.q || a.len - b.len);
}
/* CORE:END */
```

- [ ] **Step 5: Uruchom pełny zestaw**

Run: `TZ=Europe/Warsaw node --test test/`
Expected: 77 testów PASS.

- [ ] **Step 6: Sprawdź na prawdziwym kalendarzu**

Wyeksportuj własny kalendarz do `.ics` (Google Calendar → Ustawienia → Eksportuj) i uruchom:

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { loadCore } from './test/harness.mjs';
const { icsToSuggestions } = loadCore(['icsToSuggestions']);
const txt = readFileSync(process.argv[1], 'utf8');
console.table(icsToSuggestions(txt, process.argv[2], 24, 88));
" /sciezka/do/kalendarza.ics 2026-09-24
```

Porównaj wynik z tym, co pokazuje kalendarz w tym dniu. Rozbieżność w godzinie to zwykle strefa (zadanie 6); brakujące zdarzenie cykliczne to zwykle `FREQ` spoza etapu 1 (zadanie 7, świadomie odłożone do I11).

- [ ] **Step 7: Commit**

```bash
git add gridday.html test/ics-suggest.test.mjs test/fixtures/mixed.ics
git commit -m "feat: turn an iCalendar document into grid suggestions

icsToSuggestions composes the lexer, event assembler, time resolver,
recurrence expander and quantiser into the single call the sync layer will
make: calendar text plus a day, out come {uid, rid, title, q, len} records.

Filters events the grid should not show: all-day entries, which do not
quantise meaningfully; STATUS:CANCELLED; TRANSP:TRANSPARENT, which marks
time the organiser considers free; and anything over eight hours, which is
background rather than a block.

Expansion starts a day early so an event beginning last night still produces
its morning segment today.

uid plus rid is the idempotency key the injection step will use to avoid
re-adding a suggestion the user already confirmed or discarded. Single
events carry an empty rid; recurring instances fall back to the occurrence
timestamp when the source has no RECURRENCE-ID."
```

---

## Stan po wykonaniu planu

- 77 testów jednostkowych, zero zależności, uruchamiane jednym poleceniem `TZ=Europe/Warsaw node --test test/`.
- Działający eksport i import kopii zapasowej w zakładce **Dane**.
- `icsToSuggestions()` gotowe do podłączenia, udowodnione na fixture'ach i na prawdziwym kalendarzu.
- `gridday.html` nadal jest jednym plikiem, który da się otworzyć bezpośrednio z dysku.

**Następny plan (I5–I11):** migracja schematu `v2 → v3` (`S.cals`, pola `src`/`cal`/`uid`/`rid`), warstwa `fetch` z `ETag` i throttlingiem, wstrzykiwanie i sprzątanie sugestii wg §5.4, zakładka **Kalendarze**, import pliku `.ics`, `RRULE` etapu 2. Testy dla warstwy czystej dopisujemy tak samo; `fetch` wstrzykujemy jako parametr, żeby dał się podmienić w teście.
