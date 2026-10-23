import { test, expect, describe } from 'vitest';
import { parseHead, renderItem } from '../src/lib/xit/line';
import type { XLine } from '../src/lib/xit/line';
import { BACKLOG, dayFile, parseXit, renderXit } from '../src/lib/xit/files';
import { CONFIG, parseFiles, renderFiles } from '../src/lib/md/files';
import type { Files } from '../src/lib/md/files';
import { parseConfig, renderConfig } from '../src/lib/md/config';
import { STEP } from '../src/lib/xit/line';
import type { State } from '../src/lib/types';
import { SEEDS, TODAY, project, randomState } from './random-state';

const CATS = new Set(['praca', 'nauka', 'dom']);
const isCat = (slug: string) => CATS.has(slug);

/** Pozycja przez zapis i odczyt: linia ze znacznikiem, opis i kroki. */
function round(l: XLine) {
  const text = renderItem(l, isCat);
  const [head, ...rest] = text.split('\n');
  const back = parseHead(head!, isCat);
  if (!back.ok) throw new Error(`${text}: ${back.error}`);
  const desc: string[] = [];
  const steps: { text: string; done: boolean }[] = [];
  for (const r of rest) {
    const body = r.slice(4);
    const st = l.marker !== 'note' ? STEP.exec(body) : null;
    if (st) steps.push({ text: st[2] ?? '', done: st[1] === 'x' });
    else desc.push(body.replace(/^\\(?=\\*(\[[ x]\]( |$)|$))/, ''));
  }
  return {
    text,
    line: {
      ...back.line,
      ...(desc.length ? { desc } : {}),
      ...(steps.length ? { steps } : {}),
    },
  };
}

/* ───────────── Pozycja ───────────── */

describe('pozycja', () => {
  test.each<[string, XLine, string]>([
    ['notatka', { marker: 'note', text: 'Notatka' }, '[?] Notatka'],
    ['otwarte', { marker: 'open', text: 'Kupić chleb' }, '[ ] Kupić chleb'],
    ['wykonane', { marker: 'done', text: 'Zadzwonić' }, '[x] Zadzwonić'],
    ['nieudane', { marker: 'failed', text: 'Siłownia' }, '[~] Siłownia'],
    [
      'data',
      { marker: 'open', date: '2026-10-03', text: 'Dentysta' },
      '[ ] Dentysta -> 2026-10-03',
    ],
    [
      'godzina i kategoria',
      { marker: 'open', date: TODAY, slot: 36, tag: 'nauka', text: 'Czytanie' },
      `[ ] Czytanie -> ${TODAY}T09:00 #nauka`,
    ],
    [
      'wzorzec z godziną i id',
      {
        marker: 'open',
        date: '2026-09-26',
        slot: 56,
        pattern: { freq: 'DAILY', interval: 1 },
        tag: 'dom',
        text: 'Podlać',
        id: 'p1',
      },
      '[ ] Podlać -> 2026-09-26T14:00 #repeat="FREQ=DAILY" #dom #id=p1',
    ],
    [
      'kopia wzorca',
      { marker: 'done', date: TODAY, slot: 56, text: 'Podlać', from: 'p1' },
      `[x] Podlać -> ${TODAY}T14:00 #from=p1`,
    ],
    [
      'identyfikator w cudzysłowie',
      { marker: 'note', text: 'x', from: 'B.md:3' },
      '[?] x #from="B.md:3"',
    ],
    ['puste zadanie', { marker: 'open', text: '' }, '[ ]'],
    ['pusta notatka z kategorią', { marker: 'note', text: '', tag: 'praca' }, '[?] #praca'],
    ['priorytet zostaje w tekście', { marker: 'open', text: '!! Pilne' }, '[ ] !! Pilne'],
    [
      'opis i kroki',
      {
        marker: 'open',
        text: 'Spotkanie',
        desc: ['agenda', '', '  wcięta', '[ ] udaje krok', '\\'],
        steps: [
          { text: 'slajdy', done: true },
          { text: '', done: false },
        ],
      },
      '[ ] Spotkanie\n    agenda\n    \\\n      wcięta\n    \\[ ] udaje krok\n    \\\\\n    [x] slajdy\n    [ ]',
    ],
  ])('%s', (_n, line, expected) => {
    const r = round(line);
    expect(r.text).toBe(expected);
    expect(r.line).toEqual(line);
  });

  test.each([
    ['kupić #dom', '[ ] kupić \\#dom'],
    ['kupić #Praca', '[ ] kupić \\#Praca'],
    ['ukośnik \\#dom', '[ ] ukośnik \\\\#dom'],
    ['obcy #tag zostaje tagiem', '[ ] obcy #tag zostaje tagiem'],
    ['na końcu #tag', '[ ] na końcu #tag'],
    ['x -> 2026-10-01', '[ ] x \\-> 2026-10-01'],
    ['x \\-> 2026-10-01', '[ ] x \\\\-> 2026-10-01'],
    ['strzałka -> nie data', '[ ] strzałka -> nie data'],
    ['-> 2026', '[ ] \\-> 2026'],
    ['#id=p1', '[ ] \\#id=p1'],
    ['#id', '[ ] #id'],
    ['[x] w tekście', '[ ] [x] w tekście'],
  ])('ucieczka tekstu „%s"', (text, expected) => {
    const r = round({ marker: 'open', text });
    expect(r.text).toBe(expected);
    expect(r.line).toEqual({ marker: 'open', text });
  });

  test('ucieczka działa też, gdy za tekstem stoją człony', () => {
    const l: XLine = { marker: 'open', text: 'kupić #dom', date: '2026-10-01', tag: 'praca' };
    expect(round(l)).toEqual({ text: '[ ] kupić \\#dom -> 2026-10-01 #praca', line: l });
  });

  test.each<[string, Partial<XLine>]>([
    ['[@] Trwa', { marker: 'open', text: 'Trwa' }],
    ['[ ] Spotkanie -> 2026-10-01T10:15:00', { date: '2026-10-01', slot: 41 }],
    ['[ ] A #DOM', { tag: 'dom', text: 'A' }],
    ['[ ] A #praca -> 2026/10/01', { tag: 'praca', date: '2026-10-01', text: 'A' }],
    ['[ ] A #dom #praca', { tag: 'praca', text: 'A #dom' }],
    [
      "[ ] A #repeat='FREQ=WEEKLY;BYDAY=MO'",
      { pattern: { freq: 'WEEKLY', interval: 1, byDay: [{ day: 'MO' }] } },
    ],
    ['[ ] A #from', { text: 'A #from' }],
  ])('odczyt „%s"', (src, expected) => {
    const r = parseHead(src, isCat);
    expect(r.ok && r.line).toMatchObject(expected);
  });

  test.each([
    ['[y] x', /znacznika/],
    ['[ ] x -> 2026-10', /nie okresu/],
    ['[ ] x -> 2026-W42', /nie okresu/],
    ['[ ] x -> 2026-02-30', /nieprawidłowa data/],
    ['[ ] x -> 2026-10-01T10:10', /kwadransem/],
    ['[ ] x -> 2026-10-01T10:15:30', /kwadransem/],
    ['[ ] x -> 2026-10-01T24:00', /kwadransem/],
    ['[ ] x #repeat="FREQ=SOMETIMES"', /reguła/],
    ['[ ] x #id=a #from=b', /#id i #from/],
  ])('błąd „%s"', (src, re) => {
    const r = parseHead(src, isCat);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(re);
  });
});

/* ───────────── Pliki ───────────── */

const SPEC_CONFIG = `format = "xit"

[day]
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

const TODAY_FILE = `[x] Raport -> ${TODAY}T08:00 #praca
[~] Siłownia -> ${TODAY}T07:00
[ ] Spotkanie zespołu -> ${TODAY}T10:00 #praca
    agenda w kalendarzu
    [x] slajdy
    [ ] notatki
[ ] Podlać kwiaty -> ${TODAY}T14:00 #dom #from=p1
[?] Rozmowa poszła dobrze
[ ] Zakupy
`;

const BACKLOG_FILE = `[ ] Podlać kwiaty -> 2026-09-26T14:00 #repeat="FREQ=DAILY" #dom #id=p1
[ ] Dentysta -> 2026-10-03
[?] Notatka w backlogu

Remont
[ ] Kafelki

Diurnus
[ ] Wydanie -> 2026-10-10
[ ] Dropbox #diurnus-sync
    opis
`;

const PAST = '2026-09-24';
const PAST_FILE = `[x] Wczoraj -> ${PAST}T09:00\n[~] Nie wyszło\n[?] Notatka\n`;

const specFiles = (): Files => ({
  [CONFIG]: SPEC_CONFIG,
  [dayFile(PAST)]: PAST_FILE,
  [dayFile(TODAY)]: TODAY_FILE,
  [BACKLOG]: BACKLOG_FILE,
});

function parsed(files: Files): State {
  const r = parseXit(files);
  if (!r.ok) throw new Error(r.errors.map((e) => `${e.file}:${e.line} ${e.message}`).join('\n'));
  return r.state;
}

const errorsOf = (files: Files) => {
  const r = parseXit(files);
  return r.ok ? [] : r.errors.map((e) => [e.file, e.line, e.message]);
};

describe('pliki', () => {
  test('przykład ze specyfikacji wraca bajt w bajt', () => {
    const s = parsed(specFiles());
    expect(renderXit(s)).toEqual(specFiles());
  });

  test('stan z przykładu', () => {
    const s = parsed(specFiles());
    const by = (t: string) => s.items.find((i) => i.text === t)!;
    expect(by('Raport').state).toEqual({ tag: 'today-task', done: true, slot: 32 });
    expect(by('Siłownia').state).toEqual({
      tag: 'today-task',
      done: false,
      slot: 28,
      failed: true,
    });
    expect(by('Rozmowa poszła dobrze').state).toEqual({ tag: 'today-note' });
    expect(by('Spotkanie zespołu')).toMatchObject({
      cat: 'praca',
      desc: 'agenda w kalendarzu',
      steps: [
        { text: 'slajdy', done: true },
        { text: 'notatki', done: false },
      ],
    });
    expect(by('Zakupy').state).toEqual({ tag: 'today-task', done: false, slot: null });
    const pattern = s.items.find((i) => i.id === 'p1')!;
    expect(pattern.state).toMatchObject({
      tag: 'backlog-task',
      when: { type: 'recurring', slot: 56, next: '2026-09-26' },
    });
    expect(s.items.find((i) => i.from === 'p1')!.state.tag).toBe('today-task');
    expect(by('Kafelki').cat).toBe('remont');
    expect(by('Wydanie')).toMatchObject({
      cat: 'diurnus',
      state: { tag: 'backlog-task', when: { type: 'date', date: '2026-10-10' } },
    });
    expect(by('Dropbox')).toMatchObject({ cat: 'diurnus-sync', desc: 'opis' });
    expect(by('Wczoraj').state).toEqual({ tag: 'past-done', day: PAST, slot: 36 });
    expect(by('Nie wyszło').state).toEqual({
      tag: 'past-done',
      day: PAST,
      slot: null,
      failed: true,
    });
    expect(s.items.filter((i) => i.state.tag === 'past-note')).toHaveLength(1);
  });

  test('pusty dzień to pusty plik, pusty backlog też', () => {
    const s = parsed({ [CONFIG]: SPEC_CONFIG, [dayFile(TODAY)]: '' });
    const out = renderXit(s);
    expect(out[dayFile(TODAY)]).toBe('');
    expect(out[BACKLOG]).toBe('');
  });

  test('ustawienia niosą znacznik formatu', () => {
    const s = parsed(specFiles());
    expect(renderXit(s)[CONFIG]).toMatch(/^format = "xit"\n/);
    const cfg = parseConfig(SPEC_CONFIG);
    expect(cfg.ok && cfg.config.format).toBe('xit');
    expect(cfg.ok && renderConfig(cfg.config)).toBe(SPEC_CONFIG);
    const bad = parseConfig(SPEC_CONFIG.replace('"xit"', '"md"'));
    expect(!bad.ok && bad.errors).toEqual(['format: jedyna wartość to „xit"']);
  });

  test('pozycja z kategorią projektu poza grupą trafia do grupy przy zapisie', () => {
    const s = parsed({
      [CONFIG]: SPEC_CONFIG,
      [dayFile(TODAY)]: '',
      [BACKLOG]: '[ ] Zgubione #diurnus\n',
    });
    expect(s.items[0]!.cat).toBe('diurnus');
    expect(renderXit(s)[BACKLOG]).toBe('Diurnus\n[ ] Zgubione\n');
  });

  test('pusta linia kończy grupę projektu — dalej znów pozycje spoza projektów', () => {
    const s = parsed({
      [CONFIG]: SPEC_CONFIG,
      [dayFile(TODAY)]: '',
      [BACKLOG]: 'Diurnus\n[ ] W projekcie\n\n[ ] Poza\n',
    });
    expect(s.items.map((i) => [i.text, i.cat])).toEqual([
      ['W projekcie', 'diurnus'],
      ['Poza', undefined],
    ]);
  });

  test('tytuł zaczynający się od nawiasu dostaje ukośnik', () => {
    const cfg = SPEC_CONFIG.replace('name = "Diurnus"', 'name = "[D] Diurnus"');
    const files = { [CONFIG]: cfg, [dayFile(TODAY)]: '', [BACKLOG]: '\\[D] Diurnus\n[ ] A\n' };
    expect(renderXit(parsed(files))[BACKLOG]).toBe(files[BACKLOG]);
  });

  test('godzina dzisiejszego zadania bez godziny w dacie dnia to zadanie bez slotu', () => {
    const s = parsed({ [CONFIG]: SPEC_CONFIG, [dayFile(TODAY)]: `[ ] A -> ${TODAY}\n` });
    expect(s.items[0]!.state).toEqual({ tag: 'today-task', done: false, slot: null });
  });

  test.each<[string, Files, [string | null, number | null, string][]]>([
    [
      'inna data w pliku dnia',
      { [dayFile(TODAY)]: '[ ] A -> 2026-10-01\n' },
      [
        [
          dayFile(TODAY),
          1,
          `inna data niż dzień pliku (${TODAY}) — pozycje z datą należą do backlogu`,
        ],
      ],
    ],
    [
      'wzorzec w pliku dnia',
      { [dayFile(TODAY)]: `[ ] A -> ${TODAY} #repeat="FREQ=DAILY" #id=p\n` },
      [[dayFile(TODAY), 1, 'wzorzec należy do backlogu, nie do pliku dnia']],
    ],
    [
      'otwarte w minionym dniu',
      { [dayFile(PAST)]: '[ ] A\n', [dayFile(TODAY)]: '' },
      [
        [
          dayFile(PAST),
          1,
          'otwarte zadanie nie zostaje w minionym dniu — o północy przechodzi dalej',
        ],
      ],
    ],
    [
      'wykonane w backlogu',
      { [dayFile(TODAY)]: '', [BACKLOG]: '[x] A\n' },
      [[BACKLOG, 1, 'wykonane nie mieszka w backlogu — odhaczone trafia do dziś']],
    ],
    [
      'nieudane w backlogu',
      { [dayFile(TODAY)]: '', [BACKLOG]: '[~] A\n' },
      [[BACKLOG, 1, 'nieudane nie mieszka w backlogu — zamknięte trafia do dziś']],
    ],
    [
      '#id bez wzorca',
      { [dayFile(TODAY)]: '', [BACKLOG]: '[ ] A #id=x\n' },
      [[BACKLOG, 1, '#id ma tylko wzorzec (#repeat)']],
    ],
    [
      'notatka z terminem',
      { [dayFile(TODAY)]: '', [BACKLOG]: '[?] A -> 2026-10-01\n' },
      [[BACKLOG, 1, 'notatka nie ma terminu ani wzorca']],
    ],
    [
      'tytuł w pliku dnia',
      { [dayFile(TODAY)]: 'Diurnus\n' },
      [[dayFile(TODAY), 1, 'tytuły grup są tylko w BACKLOG.xit']],
    ],
    [
      'tytuł w środku grupy',
      { [dayFile(TODAY)]: '', [BACKLOG]: '[ ] A\nDiurnus\n' },
      [[BACKLOG, 2, 'tytuł grupy musi być jej pierwszą linią — brak pustej linii?']],
    ],
    [
      'nieznany projekt',
      { [dayFile(TODAY)]: '', [BACKLOG]: 'Nieznany\n[ ] A\n' },
      [[BACKLOG, 1, 'nieznany projekt „Nieznany" — nie ma go w .diurnus.toml']],
    ],
    [
      'projekt dwa razy',
      { [dayFile(TODAY)]: '', [BACKLOG]: 'Diurnus\n\ndiurnus\n' },
      [[BACKLOG, 3, 'projekt „diurnus" ma już swoją grupę']],
    ],
    [
      'kategoria spoza projektu',
      { [dayFile(TODAY)]: '', [BACKLOG]: 'Diurnus\n[ ] A #dom\n' },
      [[BACKLOG, 2, '„#dom" nie należy do projektu „Diurnus"']],
    ],
    [
      'złe wcięcie',
      { [dayFile(TODAY)]: '[ ] A\n  opis\n' },
      [[dayFile(TODAY), 2, 'ciąg dalszy pozycji wcina się czterema spacjami']],
    ],
    [
      'wcięcie bez pozycji',
      { [dayFile(TODAY)]: '    opis\n' },
      [[dayFile(TODAY), 1, 'wcięta linia bez pozycji nad nią']],
    ],
    [
      'nieznany plik i brak dnia',
      { 'notatki.md': '' },
      [
        ['notatki.md', null, 'nieznany plik'],
        [null, null, 'brak pliku dnia RRRR-MM-DD.xit'],
      ],
    ],
  ])('błąd: %s', (_n, files, expected) => {
    expect(errorsOf({ [CONFIG]: SPEC_CONFIG, ...files })).toEqual(expected);
  });

  test('ciąg dalszy pozycji, której nie przyjęto, nie daje drugiego błędu', () => {
    expect(errorsOf({ [CONFIG]: SPEC_CONFIG, [dayFile(TODAY)]: '[y] A\n    opis\n' })).toHaveLength(
      1,
    );
  });

  test('niezmienniki maszyny: nakładające się sloty', () => {
    const day = `[ ] A -> ${TODAY}T09:00\n[ ] B -> ${TODAY}T09:15\n`;
    const errs = errorsOf({ [CONFIG]: SPEC_CONFIG, [dayFile(TODAY)]: day });
    expect(errs.map((e) => e[2]).join()).toMatch(/nakładające się sloty/);
  });
});

/* ───────────── Własność: obieg losowych stanów ───────────── */

describe('obieg losowych stanów maszyny', () => {
  test.each(SEEDS)('ziarno %i: parse(render(s)) ≅ s, a render jest stały', (seed) => {
    const s = randomState(seed);
    const files = renderXit(s);
    const back = parsed(files);
    expect(project(back)).toEqual(project(s));
    expect(renderXit(back)).toEqual(files);
  });

  test.each(SEEDS)('ziarno %i: xit i Markdown niosą ten sam stan', (seed) => {
    const s = randomState(seed);
    const md = parseFiles(renderFiles(s));
    if (!md.ok) throw new Error('Markdown nie wczytał stanu');
    expect(project(parsed(renderXit(s)))).toEqual(project(md.state));
  });

  test('losowe stany ćwiczą pułapki xit', () => {
    const all = SEEDS.map((n) => renderXit(randomState(n)));
    const text = all.flatMap((f) => Object.values(f)).join('\n');
    expect(text).toMatch(/ \\#dom/);
    expect(text).toMatch(/ \\-> 2026-10-01/);
    expect(text).toMatch(/#repeat="/);
    expect(text).toMatch(/#from=/);
    expect(text).toMatch(/^\[~\] /m);
    expect(text).toMatch(/^ {4}\\\[x\] /m);
    expect(all.some((f) => /\n\nDom\n/.test(f[BACKLOG]!) || /^Dom\n/.test(f[BACKLOG]!))).toBe(true);
  });
});
