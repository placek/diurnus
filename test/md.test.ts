import { test, expect, describe } from 'vitest';
import { descLines, parseLine, renderLine } from '../src/lib/md/line';
import type { Line } from '../src/lib/md/line';
import { parsePattern, patternWord } from '../src/lib/md/pattern';
import { slugify, tagsFor } from '../src/lib/md/slug';
import { parseConfig, renderConfig } from '../src/lib/md/config';
import { BACKLOG, CONFIG, dayFile, parseFiles, renderFiles } from '../src/lib/md/files';
import type { Files } from '../src/lib/md/files';
import { step } from '../src/lib/machine';
import type { Event, Item, Machine } from '../src/lib/machine';
import { normalize } from '../src/lib/model';
import { formatRRule, parseRRule } from '../src/lib/rrule';
import type { RRule } from '../src/lib/rrule';
import { shiftDay } from '../src/lib/time';
import type { State } from '../src/lib/types';
import { backlogOrder, todayList } from '../src/lib/view';

const TODAY = '2026-09-25';

/* ───────────── Linia ───────────── */

describe('linia', () => {
  const round = (l: Line) => {
    const text = renderLine(l);
    const back = parseLine(text);
    if (!back.ok) throw new Error(`${text}: ${back.error}`);
    return { text, line: back.line };
  };

  test.each<[string, Line, string]>([
    ['notatka', { marker: 'note', text: 'Notatka' }, '* Notatka'],
    ['otwarte zadanie', { marker: 'open', text: 'Kupić chleb' }, '* [ ] Kupić chleb'],
    ['wykonane', { marker: 'done', text: 'Zadzwonić' }, '* [x] Zadzwonić'],
    [
      'slot i tag',
      { marker: 'open', slot: 36, tag: 'nauka', text: 'Czytanie' },
      '* [ ] 09:00 #nauka Czytanie',
    ],
    ['data', { marker: 'open', date: '2026-10-03', text: 'Dentysta' }, '* [ ] 2026-10-03 Dentysta'],
    [
      'wzorzec z godziną i id',
      {
        marker: 'open',
        date: '2026-09-26',
        pattern: { freq: 'DAILY', interval: 1 },
        slot: 56,
        tag: 'dom',
        text: 'Podlać',
        id: 'p1',
      },
      '* [ ] 2026-09-26 {FREQ=DAILY} 14:00 #dom Podlać ^p1',
    ],
    [
      'reguła iCal z licznikiem',
      {
        marker: 'open',
        date: '2026-10-30',
        pattern: { freq: 'MONTHLY', interval: 2, byDay: [{ day: 'FR', n: -1 }], count: 3 },
        text: 'Rachunki',
        id: 'p2',
      },
      '* [ ] 2026-10-30 {FREQ=MONTHLY;INTERVAL=2;BYDAY=-1FR;COUNT=3} Rachunki ^p2',
    ],
    ['pusta notatka', { marker: 'note', text: '' }, '*'],
    ['puste zadanie', { marker: 'open', text: '' }, '* [ ]'],
    ['samo id', { marker: 'open', slot: 40, text: '', id: 'p1' }, '* [ ] 10:00 ^p1'],
    ['notatka z tagiem', { marker: 'note', tag: 'praca', text: 'x' }, '* #praca x'],
  ])('%s', (_n, line, expected) => {
    const r = round(line);
    expect(r.text).toBe(expected);
    expect(r.line).toEqual(line);
  });

  test.each([
    ['09:00 spotkanie', '\\09:00 spotkanie'],
    ['#hashtag', '\\#hashtag'],
    ['{nie wzorzec}', '\\{nie wzorzec}'],
    ['[ ] w nawiasie', '\\[ ] w nawiasie'],
    ['\\ukośnik', '\\\\ukośnik'],
    ['3 rzeczy', '\\3 rzeczy'],
    ['koniec ^x', 'koniec \\^x'],
    ['^', '\\^'],
    ['\\^y', '\\\\\\^y'],
    ['a \\^b', 'a \\\\^b'],
    ['5 ^x', '\\5 \\^x'],
    [' spacja na początku', ' spacja na początku'],
    ['dwie  spacje', 'dwie  spacje'],
    ['środek #nie tag', 'środek #nie tag'],
  ])('ucieczka tekstu %j', (text, escaped) => {
    const r = round({ marker: 'open', text });
    expect(r.text).toBe(`* [ ] ${escaped}`);
    expect(r.line.text).toBe(text);
  });

  test('tekst z ^ na końcu i prawdziwe id nie mylą się', () => {
    const r = round({ marker: 'open', text: 'a ^b', id: 'c' });
    expect(r.text).toBe('* [ ] a \\^b ^c');
    expect(r.line).toEqual({ marker: 'open', text: 'a ^b', id: 'c' });
  });

  test.each([
    ['* [ ] 09:07 x', /kwadransem/],
    ['* [ ] 25:00 x', /kwadransem/],
    ['* [ ] 9:00 x', /kwadransem/],
    ['* [ ] 2026-02-30 x', /nieprawidłowa data/],
    ['* [ ] #Praca x', /nieprawidłowy tag/],
    ['* [ ] {co miesiąc} x', /nieznany wzorzec/],
    ['* [ ] 3 rzeczy', /brak „\\"/],
    ['* [ ] #praca 09:00 x', /złej kolejności/],
    ['*x', /zaczynać się od/],
    ['- [ ] x', /zaczynać się od/],
  ])('błąd: %s', (src, msg) => {
    const r = parseLine(src);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });

  test('tekst wielowierszowy nie ma zapisu', () => {
    expect(() => renderLine({ marker: 'open', text: 'a\nb' })).toThrow(/jednej linii/);
  });
});

/* ───────────── Wzorce i slugi ───────────── */

test('wzorzec w pliku to RRULE; każda reguła wraca z napisu', () => {
  const rules = [
    'FREQ=DAILY',
    'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE',
    'FREQ=MONTHLY;BYDAY=-1FR',
    'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1',
    'FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=24;UNTIL=20301231',
    'FREQ=DAILY;COUNT=7',
  ].map((t) => (parseRRule(t) as { rule: RRule }).rule);
  for (const r of rules) {
    expect(patternWord(r)).toBe(formatRRule(r));
    expect(parsePattern(patternWord(r))).toEqual({ ok: true, rule: r });
  }
  expect(parsePattern('RRULE:FREQ=WEEKLY;BYDAY=MO')).toEqual(parsePattern('FREQ=WEEKLY;BYDAY=MO'));
});

test('dawne polskie wzorce nadal się czytają — jako RRULE o tych samych datach', () => {
  const as = (w: string) => {
    const r = parsePattern(w);
    return r.ok ? formatRRule(r.rule) : r.error;
  };
  expect(as('codziennie')).toBe('FREQ=DAILY');
  expect(as('co poniedziałek')).toBe('FREQ=WEEKLY;BYDAY=MO');
  expect(as('3. każdego miesiąca')).toBe('FREQ=MONTHLY;BYMONTHDAY=3');
  expect(as('31. każdego miesiąca')).toBe('FREQ=MONTHLY;BYMONTHDAY=-1');
  expect(as('co rok 24 wrz')).toBe('FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=24');
  expect(as('co miesiąc')).toMatch(/nieznany wzorzec/);
  expect(as('32. każdego miesiąca')).toMatch(/nieznany wzorzec/);
  expect(as('FREQ=HOURLY')).toMatch(/FREQ=HOURLY/);
  expect(as('FREQ=DAILY;BYHOUR=9')).toMatch(/BYHOUR/);
});

test('slug: bez polskich znaków, z łącznikami, unikalny', () => {
  expect(slugify('Ogród')).toBe('ogrod');
  expect(slugify('Projekt A')).toBe('projekt-a');
  expect(slugify('Źdźbło łąki!')).toBe('zdzblo-laki');
  expect(slugify('***')).toBe('kategoria');
  const tags = tagsFor([
    { id: 'a', name: 'Dom', icon: null, parent: null },
    { id: 'b', name: 'dom', icon: null, parent: null },
    { id: 'c', name: 'Cokolwiek', icon: null, parent: null, tag: 'dom' },
  ]);
  // Własny tag wygrywa; slugi z nazw ustępują mu i sobie nawzajem.
  expect([tags.get('c'), tags.get('a'), tags.get('b')]).toEqual(['dom', 'dom-2', 'dom-3']);
});

/* ───────────── Ustawienia ───────────── */

const CONFIG_TEXT = `[day]
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
`;

describe('.diurnus.toml', () => {
  test('odczyt i zapis są swoją odwrotnością', () => {
    const r = parseConfig(CONFIG_TEXT);
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.config.cats).toEqual([
      {
        id: 'praca',
        tag: 'praca',
        name: 'Praca',
        icon: 'laptop-code',
        parent: null,
        color: 'yellow',
      },
      { id: 'projekt-a', tag: 'projekt-a', name: 'Projekt A', icon: null, parent: 'praca' },
    ]);
    expect(r.config.day).toEqual({
      start: 6,
      end: 22,
      bands: [{ id: 'band-6', name: 'Rano', from: 6, color: 'aqua' }],
    });
    expect(renderConfig(r.config)).toBe(CONFIG_TEXT);
  });

  test('zarchiwizowana kategoria i znaki specjalne w nazwie przechodzą obieg', () => {
    const cfg = {
      cats: [
        {
          id: 'x',
          tag: 'x',
          name: 'Cudzy "cytat" \\ ukośnik',
          icon: null,
          parent: null,
          color: 'red',
          archived: true as const,
        },
      ],
      day: { start: 0, end: 24, bands: [] },
    };
    const r = parseConfig(renderConfig(cfg));
    expect(r.ok && r.config).toEqual(cfg);
  });

  test.each([
    ['niepoprawny TOML', 'to nie toml =', /TOML/],
    [
      'nieznany klucz',
      CONFIG_TEXT.replace('start = 6', 'start = 6\nkolor = 1'),
      /nieznany klucz „kolor"/,
    ],
    ['zły zakres dnia', CONFIG_TEXT.replace('end = 22', 'end = 5'), /start < end/],
    ['nieznany kolor', CONFIG_TEXT.replace('color = "yellow"', 'color = "pink"'), /koloru/],
    [
      'podkategoria z kolorem',
      CONFIG_TEXT.replace('parent = "praca"', 'parent = "praca"\ncolor = "red"'),
      /własnego koloru/,
    ],
    [
      'brak rodzica',
      CONFIG_TEXT.replace('parent = "praca"', 'parent = "nie-ma"'),
      /nie ma rodzica/,
    ],
    ['tag nie jest slugiem', CONFIG_TEXT.replace('tag = "praca"', 'tag = "Praca"'), /slugiem/],
    ['powtórzony tag', CONFIG_TEXT.replace('tag = "projekt-a"', 'tag = "praca"'), /się powtarza/],
    ['brak kategorii', '[day]\nstart = 6\nend = 22\n', /brak kategorii/],
  ])('błąd: %s', (_n, text, msg) => {
    const r = parseConfig(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toMatch(msg);
  });
});

/* ───────────── Pliki ───────────── */

const TODAY_FILE = `# 2026-09-25

* [x] 10:30 #praca Raport
* [x] Zadzwonić do mamy
* [ ] 09:00 #nauka Czytanie
* [ ] 14:00 #dom Podlać kwiaty ^p1
* [ ] Kupić chleb
* Notatka z rozmowy
`;

const BACKLOG_FILE = `# Backlog

* [ ] 2026-09-26 {FREQ=DAILY} 14:00 #dom Podlać kwiaty ^p1
* [ ] 2026-10-01 09:00 #praca Spotkanie
* [ ] 2026-10-03 Dentysta
* [ ] Kiedyś, bez daty
* Notatka w backlogu
`;

const SPEC_CONFIG = `[day]
start = 6
end = 22

[[categories]]
tag = "praca"
name = "Praca"
color = "yellow"

[[categories]]
tag = "nauka"
name = "Nauka"
color = "blue"

[[categories]]
tag = "dom"
name = "Dom"
color = "orange"
`;

const specFiles = (): Files => ({
  [CONFIG]: SPEC_CONFIG,
  [dayFile(TODAY)]: TODAY_FILE,
  [BACKLOG]: BACKLOG_FILE,
});

function parsed(files: Files): State {
  const r = parseFiles(files);
  if (!r.ok) throw new Error(r.errors.map((e) => `${e.file}:${e.line} ${e.message}`).join('\n'));
  return r.state;
}

const errorsOf = (files: Files) => {
  const r = parseFiles(files);
  return r.ok ? [] : r.errors;
};

describe('pliki', () => {
  test('przykład ze specyfikacji czyta się do spodziewanych stanów', () => {
    const s = parsed(specFiles());
    expect(s.today).toBe(TODAY);
    const byText = (t: string) => s.items.find((i) => i.text === t)!;
    expect(byText('Czytanie')).toMatchObject({
      cat: 'nauka',
      state: { tag: 'today-task', done: false, slot: 36 },
    });
    expect(byText('Raport').state).toEqual({ tag: 'today-task', done: true, slot: 42 });
    expect(byText('Notatka z rozmowy').state).toEqual({ tag: 'today-note' });
    expect(byText('Notatka w backlogu').state).toEqual({ tag: 'backlog-note' });
    expect(byText('Dentysta').state).toEqual({
      tag: 'backlog-task',
      when: { type: 'date', date: '2026-10-03' },
    });
    expect(byText('Spotkanie').state).toEqual({
      tag: 'backlog-task',
      when: { type: 'dateSlot', date: '2026-10-01', slot: 36 },
    });
    // Wzorzec ma swoje id, kopia w dziś wskazuje na nie.
    const pattern = s.items.find(
      (i) => i.state.tag === 'backlog-task' && i.state.when?.type === 'recurring',
    )!;
    expect(pattern.id).toBe('p1');
    expect(pattern.state).toEqual({
      tag: 'backlog-task',
      when: {
        type: 'recurring',
        rule: { freq: 'DAILY', interval: 1 },
        slot: 56,
        next: '2026-09-26',
      },
    });
    const copy = s.items.find((i) => i.from === 'p1')!;
    expect(copy.state).toEqual({ tag: 'today-task', done: false, slot: 56 });
  });

  test('kanoniczne pliki przechodzą odczyt i zapis bajt w bajt', () => {
    expect(renderFiles(parsed(specFiles()))).toEqual(specFiles());
  });

  test('identyfikatory nadane przy odczycie to plik:linia', () => {
    const s = parsed(specFiles());
    expect(s.items.find((i) => i.text === 'Czytanie')!.id).toBe('2026-09-25.md:5');
    expect(s.items.find((i) => i.text === 'Dentysta')!.id).toBe('BACKLOG.md:5');
  });

  test('ręcznie zmieniona kolejność jest normalizowana', () => {
    const shuffled = `# 2026-09-25

* [ ] Kupić chleb
* [x] Drugie odhaczone
* [ ] 14:00 #dom Podlać kwiaty ^p1

* [x] 11:00 Pierwsze odhaczone
* [ ] 09:00 #nauka Czytanie
`;
    const out = renderFiles(parsed({ ...specFiles(), [dayFile(TODAY)]: shuffled }));
    // Wykonane na górze w kolejności z pliku — to kolejność odhaczenia.
    expect(out[dayFile(TODAY)]).toBe(`# 2026-09-25

* [x] Drugie odhaczone
* [x] 11:00 Pierwsze odhaczone
* [ ] 09:00 #nauka Czytanie
* [ ] 14:00 #dom Podlać kwiaty ^p1
* [ ] Kupić chleb
`);
  });

  test('pusty dzień i pusty backlog to same nagłówki', () => {
    const out = renderFiles(parsed({ [CONFIG]: SPEC_CONFIG, [dayFile(TODAY)]: `# ${TODAY}\n` }));
    expect(out[dayFile(TODAY)]).toBe(`# ${TODAY}\n`);
    expect(out[BACKLOG]).toBe('# Backlog\n');
  });

  test('końce linii CRLF są przyjmowane', () => {
    const s = parsed({ ...specFiles(), [dayFile(TODAY)]: TODAY_FILE.replace(/\n/g, '\r\n') });
    expect(s.items.filter((i) => i.state.tag === 'today-task')).toHaveLength(5);
  });

  test('wzorzec wpisany ręcznie bez daty i bez id dostaje najbliższe wystąpienie i id z pozycji', () => {
    const s = parsed({
      ...specFiles(),
      [BACKLOG]: '# Backlog\n\n* [ ] {co poniedziałek} Pranie\n',
    });
    const p = s.items.find((i) => i.text === 'Pranie')!;
    expect(p.id).toBe('BACKLOG.md:3');
    expect(p.state).toMatchObject({ when: { next: '2026-09-28' } });
  });

  test('data wzorca spoza reguły to początek serii: liczy się pierwsze pasujące od niej', () => {
    const s = parsed({
      ...specFiles(),
      [BACKLOG]: '# Backlog\n\n* [ ] 2026-10-01 {FREQ=WEEKLY;BYDAY=MO;COUNT=2} Pranie ^w\n',
    });
    const p = s.items.find((i) => i.id === 'w')!;
    expect(p.state).toMatchObject({ when: { next: '2026-10-05', rule: { count: 2 } } });
    // Po odczycie plik jest już kanoniczny: data to najbliższe wystąpienie.
    expect(renderFiles(s)[BACKLOG]).toContain(
      '* [ ] 2026-10-05 {FREQ=WEEKLY;BYDAY=MO;COUNT=2} Pranie ^w',
    );
  });

  test('reguła bez wystąpień jest błędem pliku', () => {
    expect(
      errorsOf({
        ...specFiles(),
        [BACKLOG]: '# Backlog\n\n* [ ] {FREQ=DAILY;UNTIL=20200101} Stare ^o\n',
      }).map((e) => e.message),
    ).toEqual(['reguła nie ma już żadnego wystąpienia']);
  });

  test('archiwum: miniony dzień czyta się jako przeszłość, dziś to najpóźniejszy plik', () => {
    const s = parsed({
      ...specFiles(),
      [dayFile('2026-09-24')]: '# 2026-09-24\n\n* [x] 08:00 #praca Wczoraj ^p1\n* Notka\n',
    });
    expect(s.today).toBe(TODAY);
    expect(s.items.find((i) => i.text === 'Wczoraj')).toMatchObject({
      from: 'p1',
      state: { tag: 'past-done', day: '2026-09-24', slot: 32 },
    });
    expect(s.items.find((i) => i.text === 'Notka')!.state).toEqual({
      tag: 'past-note',
      day: '2026-09-24',
    });
  });

  test('brak pliku ustawień daje domyślne kategorie z tagami z nazw', () => {
    const s = parsed({ [dayFile(TODAY)]: `# ${TODAY}\n\n* [ ] 09:00 #ogrod Plewić\n` });
    expect(s.items[0]!.cat).toBe('ogrod');
    expect(s.cats.find((c) => c.id === 'ogrod')!.parent).toBe('dom');
  });

  test.each<[string, Files, RegExp, number | null]>([
    ['nagłówek niezgodny z nazwą', { [dayFile(TODAY)]: '# 2026-09-24\n' }, /nagłówkiem/, 1],
    ['nieznana linia', { [dayFile(TODAY)]: `# ${TODAY}\n\nzwykły akapit\n` }, /zaczynać się od/, 3],
    [
      'data w pliku dnia',
      { [dayFile(TODAY)]: `# ${TODAY}\n\n* [ ] 2026-09-26 x\n` },
      /należą do backlogu/,
      3,
    ],
    [
      'notatka z godziną',
      { [dayFile(TODAY)]: `# ${TODAY}\n\n* 09:00 x\n` },
      /notatka nie ma czasu/,
      3,
    ],
    ['wykonane w backlogu', { [BACKLOG]: '# Backlog\n\n* [x] x\n' }, /nie mieszka w backlogu/, 3],
    [
      'godzina bez daty w backlogu',
      { [BACKLOG]: '# Backlog\n\n* [ ] 09:00 x\n' },
      /wymaga daty/,
      3,
    ],
    [
      'godzina poza dniem w backlogu',
      { [BACKLOG]: '# Backlog\n\n* [ ] 2026-10-01 23:00 x\n' },
      /nie mieści się/,
      3,
    ],
    ['nieznany tag', { [dayFile(TODAY)]: `# ${TODAY}\n\n* [ ] #nie-ma x\n` }, /nieznany tag/, 3],
    [
      'otwarte zadanie w archiwum',
      { [dayFile('2026-09-24')]: '# 2026-09-24\n\n* [ ] x\n' },
      /przechodzi dalej/,
      3,
    ],
    ['nieznany plik', { 'notatki.txt': '' }, /nieznany plik/, null],
  ])('błąd: %s', (_n, extra, msg, line) => {
    const errs = errorsOf({ ...specFiles(), ...extra });
    const hit = errs.find((e) => msg.test(e.message));
    expect(hit, JSON.stringify(errs)).toBeDefined();
    expect(hit!.line).toBe(line);
  });

  test('nakładające się sloty to błąd niezmiennika maszyny', () => {
    const errs = errorsOf({
      ...specFiles(),
      [dayFile(TODAY)]: `# ${TODAY}\n\n* [ ] 09:00 a\n* [ ] 09:15 b\n`,
    });
    expect(errs.map((e) => e.message).join()).toMatch(/nakładające się sloty/);
  });

  test('slot poza dniem dziś to błąd niezmiennika maszyny', () => {
    const errs = errorsOf({ ...specFiles(), [dayFile(TODAY)]: `# ${TODAY}\n\n* [ ] 05:00 a\n` });
    expect(errs.map((e) => e.message).join()).toMatch(/slot poza dniem/);
  });

  test('brak pliku dnia to błąd', () => {
    expect(errorsOf({ [BACKLOG]: '# Backlog\n' }).map((e) => e.message)).toContain(
      'brak pliku dnia RRRR-MM-DD.md',
    );
  });

  test('błąd w jednym pliku nie wczytuje niczego', () => {
    expect(parseFiles({ ...specFiles(), [BACKLOG]: '# Backlog\n\n* [x] x\n' }).ok).toBe(false);
  });
});

/* ───────────── Własność: obieg losowych stanów ───────────── */

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEXTS = [
  '',
  'Czytanie',
  '09:00 spotkanie',
  '#hashtag',
  '{x}',
  '[ ] nie zadanie',
  '\\ukośnik',
  'koniec ^x',
  '^',
  '3 rzeczy',
  ' spacja',
  'dwie  spacje',
  '\\^y',
  'x \\\\^z',
  '2026-09-25 data',
  'środek #tag',
];

const DESCS = [
  'jedna linia',
  'dwie\nlinie',
  'z pustą\n\nw środku',
  '  własne wcięcie',
  '* wygląda jak pozycja',
  '# nagłówek',
  'z końcową pustą\n',
  'tab\tw środku',
  '\tod tabulatora',
  '\\ukośnik ^x',
  '\npusta na początku',
  '* [ ] wygląda jak krok',
  'opis\n* [x] i krok w środku',
  '\\* [ ] krok z ukośnikiem',
  '* [ ]',
];

const STEPS: { text: string; done: boolean }[][] = [
  [{ text: 'spakować się', done: false }],
  [
    { text: 'zatankować', done: true },
    { text: '[ ] w nawiasach', done: false },
    { text: '', done: false },
  ],
  [
    { text: '#nie-tag 09:00 \\ukośnik ^x', done: true },
    { text: '* gwiazdka', done: true },
  ],
];

/** Stan zbudowany wyłącznie przejściami maszyny — takie stany aplikacja naprawdę ma. */
function randomState(seed: number): State {
  const r = rng(seed);
  const base = normalize(null, TODAY);
  // Projekty: kategoria główna (Dom) i podkategoria (Zadania › Programowanie).
  base.cats = base.cats.map((c) =>
    c.name === 'Dom' || c.name === 'Programowanie' ? { ...c, project: true } : c,
  );
  const cats = base.cats.map((c) => c.id);
  const hours = { q0: base.day.start * 4, q1: base.day.end * 4 };
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  let m: Machine = { today: TODAY, items: [] };
  for (let n = 0; n < 300; n++) {
    const ids = m.items.map((i) => i.id);
    const id = ids.length ? pick(ids) : 'x';
    const slot = pick([null, 24, 30, 36, 37, 40, 86]);
    const date = pick(['2026-09-27', '2026-10-01', TODAY]);
    const rule = pick<RRule>([
      { freq: 'DAILY', interval: 1 },
      { freq: 'WEEKLY', interval: 2, byDay: [{ day: 'MO' }, { day: 'TH' }] },
      { freq: 'YEARLY', interval: 1, byMonth: [2], byMonthDay: [-1] },
      { freq: 'MONTHLY', interval: 1, byDay: [{ day: 'FR', n: -1 }], count: 4 },
      { freq: 'DAILY', interval: 3, until: '2026-12-31' },
    ]);
    const create: Event = {
      type: 'create',
      id: `n${n}`,
      text: pick(TEXTS),
      place: pick(['today', 'backlog'] as const),
      ...(r() < 0.7 ? { cat: pick(cats) } : {}),
    };
    const when = pick([
      null,
      { type: 'date' as const, date },
      { type: 'dateSlot' as const, date, slot: slot ?? 40 },
      { type: 'recurring' as const, rule, slot, start: date },
      { type: 'recurring' as const, rule, slot: null, start: date },
    ]);
    // Tworzenie i nadawanie czasu częściej niż usuwanie, żeby stan końcowy był
    // bogaty: wzorce, kopie, archiwum, sloty.
    const e = pick<Event>([
      create,
      create,
      create,
      { type: 'markDone', id, copyId: `c${n}` },
      { type: 'markOpen', id },
      { type: 'toNote', id },
      { type: 'toTask', id },
      { type: 'setSlot', id, slot },
      { type: 'setWhen', id, when },
      { type: 'setWhen', id, when },
      { type: 'move', id, to: pick(['today', 'backlog'] as const) },
      r() < 0.3 ? { type: 'remove', id } : create,
      { type: 'advance', to: shiftDay(m.today, 1) },
    ]);
    const res = step(m, e, hours);
    if (res.ok) m = res.machine;
    // Opis to dana, nie stan — nadawany wprost, jak w aplikacji; kopie dziedziczą go przez maszynę.
    if (r() < 0.15)
      m = { ...m, items: m.items.map((i) => (i.id === id ? { ...i, desc: pick(DESCS) } : i)) };
    // Kroki też — ale tylko zadaniom; maszyna nie zrobi potem z nich notatki.
    const note = (i: Item) => /note$/.test(i.state.tag);
    if (r() < 0.12)
      m = {
        ...m,
        items: m.items.map((i) => (i.id === id && !note(i) ? { ...i, steps: pick(STEPS) } : i)),
      };
  }
  return { ...base, today: m.today, items: [...m.items] };
}

/** Wszystko, co jest stanem: bez identyfikatorów i czasu utworzenia, w kolejności kanonicznej. */
function project(s: State) {
  const tags = tagsFor(s.cats);
  const one = (i: Item) => {
    const isPattern = i.state.tag === 'backlog-task' && i.state.when?.type === 'recurring';
    return {
      state: i.state,
      text: i.text,
      tag: i.cat !== undefined ? tags.get(i.cat) : undefined,
      desc: descLines(i.desc).join('\n') || undefined,
      steps: i.steps?.length ? i.steps : undefined,
      link: isPattern ? `pattern:${i.id}` : i.from !== undefined ? `copy:${i.from}` : undefined,
    };
  };
  const past = s.items.filter((i) => i.state.tag === 'past-done' || i.state.tag === 'past-note');
  const days = [...new Set(past.map((i) => (i.state as { day: string }).day))].sort();
  return {
    today: s.today,
    past: days.flatMap((d) => past.filter((i) => (i.state as { day: string }).day === d)).map(one),
    today_: todayList(s.items).map(one),
    backlog: backlogOrder(s.items, s.cats).map(one),
  };
}

const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 1);

describe('obieg losowych stanów maszyny', () => {
  test.each(SEEDS)('ziarno %i: parse(render(s)) ≅ s, a render jest stały', (seed) => {
    const s = randomState(seed);
    const files = renderFiles(s);
    const back = parsed(files);
    expect(project(back)).toEqual(project(s));
    expect(renderFiles(back)).toEqual(files);
  });

  test('losowe stany faktycznie ćwiczą trudne przypadki', () => {
    const all = SEEDS.map(randomState);
    const items = all.flatMap((s) => s.items);
    expect(items.some((i) => i.state.tag === 'past-done')).toBe(true);
    expect(items.some((i) => i.from !== undefined)).toBe(true);
    expect(
      items.some((i) => i.state.tag === 'backlog-task' && i.state.when?.type === 'recurring'),
    ).toBe(true);
    expect(items.some((i) => i.text.startsWith('\\'))).toBe(true);
    expect(items.some((i) => i.desc?.includes('\n\n'))).toBe(true);
    expect(items.some((i) => i.desc !== undefined && i.from !== undefined)).toBe(true);
    // Kroki: na kopiach wzorców (wszystkie nieodhaczone), obok opisu udającego krok.
    expect(items.some((i) => i.steps?.length && i.from !== undefined)).toBe(true);
    expect(items.some((i) => i.steps?.length && i.desc?.includes('* [x]'))).toBe(true);
    expect(items.some((i) => i.steps?.length && i.state.tag === 'past-done')).toBe(true);
    // Projekty: pozycje w obu i w podkategorii projektu głównego.
    const files = all.map((s) => renderFiles(s)[BACKLOG]!);
    expect(files.some((f) => f.includes('\n## Dom\n'))).toBe(true);
    expect(files.some((f) => f.includes('\n## Programowanie\n'))).toBe(true);
    expect(
      files.some((f) => /## Dom\n[\s\S]*#(ogrod|samochod|zakupy|dzieci|naprawy) /.test(f)),
    ).toBe(true);
  });
});

describe('projekty w backlogu', () => {
  const CFG = `${SPEC_CONFIG}
[[categories]]
tag = "diurnus"
name = "Diurnus"
color = "aqua"
project = true

[[categories]]
tag = "diurnus-sync"
name = "Sync"
parent = "diurnus"

[[categories]]
tag = "remont"
name = "Remont"
parent = "dom"
project = true
`;
  const files = (backlog: string) => ({
    [CONFIG]: CFG,
    [dayFile(TODAY)]: `# ${TODAY}\n`,
    [BACKLOG]: backlog,
  });

  test('sekcja ## nadaje projekt liniom bez tagu; tag zostaje przy podkategorii projektu', () => {
    const s = parsed(
      files(
        `# Backlog\n\n* [ ] Kiedyś\n\n## Diurnus\n\n* [ ] 2026-10-10 Wydanie\n* [ ] #diurnus-sync Dropbox\n      opis\n* Notatka\n\n## Remont\n\n* [ ] Kafelki\n`,
      ),
    );
    const by = (t: string) => s.items.find((i) => i.text === t)!;
    expect(by('Kiedyś').cat).toBeUndefined();
    expect(by('Wydanie').cat).toBe('diurnus');
    expect(by('Dropbox')).toMatchObject({ cat: 'diurnus-sync', desc: 'opis' });
    expect(by('Notatka').cat).toBe('diurnus');
    expect(by('Kafelki').cat).toBe('remont');
  });

  test('zapis: najpierw pozycje spoza projektów, potem sekcje projektów w kolejności kategorii', () => {
    const src = `# Backlog\n\n* [ ] Kiedyś\n\n## Diurnus\n\n* [ ] 2026-10-10 Wydanie\n* [ ] #diurnus-sync Dropbox\n\n## Remont\n\n* [ ] Kafelki\n`;
    const s = parsed(files(src));
    expect(renderFiles(s)[BACKLOG]).toBe(
      // Remont jest podkategorią Domu (przed Diurnusem w kolejności kategorii).
      `# Backlog\n\n* [ ] Kiedyś\n\n## Remont\n\n* [ ] Kafelki\n\n## Diurnus\n\n* [ ] 2026-10-10 Wydanie\n* [ ] #diurnus-sync Dropbox\n`,
    );
    expect(renderConfig).toBeDefined();
    expect(renderFiles(s)[CONFIG]).toContain('project = true');
  });

  test('pozycja z tagiem projektu poza sekcją trafia do projektu i przy zapisie przenosi się pod nagłówek', () => {
    const s = parsed(files(`# Backlog\n\n* [ ] #diurnus Zgubione\n`));
    expect(s.items[0]!.cat).toBe('diurnus');
    expect(renderFiles(s)[BACKLOG]).toBe('# Backlog\n\n## Diurnus\n\n* [ ] Zgubione\n');
  });

  test('pusty projekt nie ma nagłówka; bez projektów plik jest taki jak dotąd', () => {
    const s = parsed(files(`# Backlog\n\n* [ ] A\n`));
    expect(renderFiles(s)[BACKLOG]).toBe('# Backlog\n\n* [ ] A\n');
    const empty = parsed(files(`# Backlog\n`));
    expect(renderFiles(empty)[BACKLOG]).toBe('# Backlog\n');
  });

  test('błędy: nieznany projekt, sekcja dwa razy, tag spoza projektu, ## w pliku dnia', () => {
    const errs = (backlog: string) => errorsOf(files(backlog)).map((e) => [e.line, e.message]);
    expect(errs(`# Backlog\n\n## Nieznany\n`)).toEqual([
      [3, 'nieznany projekt „Nieznany" — nie ma go w .diurnus.toml'],
    ]);
    expect(errs(`# Backlog\n\n## Diurnus\n\n## diurnus\n`)).toEqual([
      [5, 'projekt „diurnus" ma już swoją sekcję'],
    ]);
    expect(errs(`# Backlog\n\n## Diurnus\n\n* [ ] #dom Obce\n`)).toEqual([
      [5, '„#dom" nie należy do projektu „Diurnus"'],
    ]);
    expect(
      errorsOf({ [CONFIG]: CFG, [dayFile(TODAY)]: `# ${TODAY}\n\n## Diurnus\n` }).map(
        (e) => e.message,
      ),
    ).toEqual(['nagłówki projektów (##) są tylko w BACKLOG.md']);
  });

  test('ustawienia: project = true tylko jako true, nazwy projektów nie mogą się powtarzać', () => {
    const bad = parseConfig(
      `${CFG}\n[[categories]]\ntag = "x"\nname = "diurnus"\ncolor = "red"\nproject = true\n`,
    );
    expect(bad.ok ? [] : bad.errors).toEqual(['projekt „diurnus" występuje dwa razy']);
    const wrong = parseConfig(
      `${CFG}\n[[categories]]\ntag = "y"\nname = "Y"\ncolor = "red"\nproject = false\n`,
    );
    expect(wrong.ok ? [] : wrong.errors).toEqual([
      '[[categories]] nr 7: project może mieć tylko wartość true',
    ]);
  });
});

describe('opis pozycji', () => {
  const day = (body: string) => ({
    [CONFIG]: SPEC_CONFIG,
    [dayFile(TODAY)]: `# ${TODAY}\n\n${body}`,
  });

  test('wcięty pod tekstem za znacznikiem: 6 spacji pod zadaniem, 2 pod notatką', () => {
    expect(
      renderLine({
        marker: 'open',
        slot: 36,
        tag: 'nauka',
        text: 'Czytanie',
        desc: ['rozdział 3', 'streszczenie'],
      }),
    ).toBe('* [ ] 09:00 #nauka Czytanie\n      rozdział 3\n      streszczenie');
    expect(renderLine({ marker: 'note', text: 'Rozmowa', desc: ['szczegóły'] })).toBe(
      '* Rozmowa\n  szczegóły',
    );
    // Pusta linia w środku opisu jest pusta — bez spacji na końcu.
    expect(renderLine({ marker: 'done', text: 'A', desc: ['x', '', 'y'] })).toBe(
      '* [x] A\n      x\n\n      y',
    );
  });

  test('opis w pliku dnia i backlogu wraca do stanu; wcięcie ponad normę zostaje w tekście', () => {
    const s = parsed({
      ...day(
        `* [ ] 09:00 #nauka Czytanie\n      rozdział 3\n\n        cytat\n* Notatka\n  szczegóły\n* [ ] Bez opisu\n`,
      ),
      [BACKLOG]: `# Backlog\n\n* [ ] 2026-10-01 Dentysta\n      zabrać kartę\n`,
    });
    const by = (t: string) => s.items.find((i) => i.text === t)!;
    expect(by('Czytanie').desc).toBe('rozdział 3\n\n  cytat');
    expect(by('Notatka').desc).toBe('szczegóły');
    expect(by('Bez opisu').desc).toBeUndefined();
    expect(by('Dentysta').desc).toBe('zabrać kartę');
  });

  test('wcięcie mniejsze niż norma też jest opisem; pusta linia przed kolejną pozycją nie należy do opisu', () => {
    const s = parsed(day(`* [ ] A\n  krótko wcięte\n\n* [ ] B\n`));
    expect(s.items.find((i) => i.text === 'A')!.desc).toBe('krótko wcięte');
  });

  test('wcięta linia bez pozycji nad nią to błąd z numerem linii', () => {
    expect(errorsOf(day(`      sierota\n* [ ] A\n`))).toEqual([
      { file: dayFile(TODAY), line: 3, message: 'wcięta linia opisu bez pozycji nad nią' },
    ]);
  });

  test('opis popsutej pozycji nie dokłada błędów ani nie przykleja się do poprzedniej', () => {
    const errs = errorsOf(day(`* [ ] A\n* [ ] 09:07 zła\n      opis złej\n`));
    expect(errs).toHaveLength(1);
    expect(errs[0]!.line).toBe(4);
  });

  test('kanoniczny zapis: bez końcowych pustych linii i linii z samych spacji', () => {
    expect(descLines('a\n   \nb  \n\n')).toEqual(['a', '', 'b']);
    expect(descLines('')).toEqual([]);
    expect(descLines(undefined)).toEqual([]);
  });
});

describe('kroki zadania', () => {
  const day = (body: string) => ({
    [CONFIG]: SPEC_CONFIG,
    [dayFile(TODAY)]: `# ${TODAY}\n\n${body}`,
  });

  test('pod opisem, z jego wcięciem; linia opisu udająca krok dostaje „\\"', () => {
    expect(
      renderLine({
        marker: 'open',
        text: 'Wyjazd',
        desc: ['pociąg 7:40', '* [ ] to tylko opis'],
        steps: [
          { text: 'spakować się', done: true },
          { text: 'zatankować', done: false },
          { text: '', done: false },
        ],
      }),
    ).toBe(
      '* [ ] Wyjazd\n      pociąg 7:40\n      \\* [ ] to tylko opis\n' +
        '      * [x] spakować się\n      * [ ] zatankować\n      * [ ]',
    );
    expect(() =>
      renderLine({ marker: 'note', text: 'N', steps: [{ text: 'x', done: false }] }),
    ).toThrow('Notatka nie ma kroków');
  });

  test('odczyt: kroki pod zadaniem, także płycej wcięte; głębiej i pod notatką to opis', () => {
    const s = parsed({
      ...day(
        `* [ ] Wyjazd\n      pociąg\n      \\* [ ] opis\n      * [x] spakować\n  * [ ] zatankować\n` +
          `        * [ ] głęboko\n* [x] Zrobione\n      * [ ] jeszcze nie\n* Notatka\n  * [ ] tylko tekst\n`,
      ),
    });
    const by = (t: string) => s.items.find((i) => i.text === t)!;
    expect(by('Wyjazd').desc).toBe('pociąg\n* [ ] opis\n  * [ ] głęboko');
    expect(by('Wyjazd').steps).toEqual([
      { text: 'spakować', done: true },
      { text: 'zatankować', done: false },
    ]);
    // Wykonane zadanie może mieć nieodhaczone kroki — jedno nie zależy od drugiego.
    expect(by('Zrobione').steps).toEqual([{ text: 'jeszcze nie', done: false }]);
    expect(by('Notatka').desc).toBe('* [ ] tylko tekst');
    expect(by('Notatka').steps).toBeUndefined();
  });

  test('kroki w backlogu i w archiwum wracają przy zapisie bez zmian', () => {
    const files = {
      ...day(`* [ ] A\n`),
      [dayFile('2026-09-20')]: `# 2026-09-20\n\n* [x] Stare\n      * [x] krok\n`,
      [BACKLOG]: `# Backlog\n\n* [ ] {FREQ=DAILY} Rano ^r\n      * [ ] rozciąganie\n      * [ ] dziennik\n`,
    };
    const s = parsed(files);
    expect(s.items.find((i) => i.text === 'Rano')!.steps).toHaveLength(2);
    const out = renderFiles(s);
    expect(out[BACKLOG]).toContain('Rano ^r\n      * [ ] rozciąganie\n      * [ ] dziennik\n');
    expect(out[dayFile('2026-09-20')]).toBe(files[dayFile('2026-09-20')]);
  });
});
