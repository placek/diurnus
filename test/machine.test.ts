import { test, expect, describe } from 'vitest';
import { step, violations, gridOf, SLOT_LEN } from '../src/lib/machine';
import type { DayHours, Event, ItemState as State, Machine, WhenInput } from '../src/lib/machine';
import { advance as advanceRule } from '../src/lib/rrule';
import type { RRule } from '../src/lib/rrule';

// Piątek. Dzień 06:00–22:00, czyli kwanty [24, 88).
const TODAY = '2026-09-25';
const DAY: DayHours = { q0: 24, q1: 88 };
const S9 = 36; // 09:00
const S10 = 40; // 10:00
const DAILY: RRule = { freq: 'DAILY', interval: 1 };
const weekly = (day: 'MO' | 'SA'): RRule => ({ freq: 'WEEKLY', interval: 1, byDay: [{ day }] });

const machine = (...items: [string, State][]): Machine => ({
  today: TODAY,
  items: items.map(([id, state]) => ({ id, text: id.toUpperCase(), state })),
});

const tTask = (slot: number | null = null): State => ({ tag: 'today-task', done: false, slot });
const tDone = (slot: number | null = null): State => ({ tag: 'today-task', done: true, slot });
const tNote: State = { tag: 'today-note' };
const bTask = (when: Extract<State, { tag: 'backlog-task' }>['when'] = null): State => ({
  tag: 'backlog-task',
  when,
});
const bNote: State = { tag: 'backlog-note' };
const bDate = (date = '2026-10-01'): State => bTask({ type: 'date', date });
const bDateSlot = (date = '2026-10-01', slot = S9): State =>
  bTask({ type: 'dateSlot', date, slot });
const bRec = (slot: number | null = null, next = '2026-09-26', rule: RRule = DAILY): State =>
  bTask({ type: 'recurring', rule, slot, next });

/** Krok, który MUSI się udać. */
function run(m: Machine, ...events: Event[]): Machine {
  for (const e of events) {
    const r = step(m, e, DAY);
    if (!r.ok) throw new Error(`${e.type} odmówione: ${r.reason}`);
    expect(violations(r.machine, DAY)).toEqual([]);
    m = r.machine;
  }
  return m;
}

const stateOf = (m: Machine, id = 'a') => m.items.find((i) => i.id === id)?.state;
const refusal = (m: Machine, e: Event) => {
  const r = step(m, e, DAY);
  return r.ok ? 'ok' : r.reason;
};

/* ───────────── Strzałki grafu ───────────── */

// Każdy wiersz to jedna strzałka zaakceptowanego grafu: stan wyjściowy,
// zdarzenie i stan docelowy pozycji „a".
const recIn = (slot: number | null = null, rule: RRule = DAILY, start = TODAY): WhenInput => ({
  type: 'recurring',
  rule,
  slot,
  start,
});
const REC_NEXT = advanceRule(DAILY, TODAY, TODAY)!.next;

const ARROWS: [string, State, Event, State][] = [
  ['task → done', tTask(), { type: 'markDone', id: 'a', copyId: 'c' }, tDone()],
  ['task@slot → done@slot', tTask(S9), { type: 'markDone', id: 'a', copyId: 'c' }, tDone(S9)],
  ['done → task (undo)', tDone(), { type: 'markOpen', id: 'a' }, tTask()],
  ['done@slot → task@slot (undo)', tDone(S9), { type: 'markOpen', id: 'a' }, tTask(S9)],
  ['backlog task → today done', bTask(), { type: 'markDone', id: 'a', copyId: 'c' }, tDone()],
  ['backlog date → today done', bDate(), { type: 'markDone', id: 'a', copyId: 'c' }, tDone()],
  [
    'backlog date+slot → today done@slot',
    bDateSlot(),
    { type: 'markDone', id: 'a', copyId: 'c' },
    tDone(S9),
  ],

  ['today task → note', tTask(), { type: 'toNote', id: 'a' }, tNote],
  ['today note → task', tNote, { type: 'toTask', id: 'a' }, tTask()],
  ['backlog task → note', bTask(), { type: 'toNote', id: 'a' }, bNote],
  ['backlog note → task', bNote, { type: 'toTask', id: 'a' }, bTask()],

  ['task → task@slot', tTask(), { type: 'setSlot', id: 'a', slot: S9 }, tTask(S9)],
  ['task@slot → task', tTask(S9), { type: 'setSlot', id: 'a', slot: null }, tTask()],
  ['task@slot → other slot', tTask(S9), { type: 'setSlot', id: 'a', slot: S10 }, tTask(S10)],

  [
    'backlog task → date',
    bTask(),
    { type: 'setWhen', id: 'a', when: { type: 'date', date: '2026-10-01' } },
    bDate(),
  ],
  [
    'backlog task → date+slot',
    bTask(),
    { type: 'setWhen', id: 'a', when: { type: 'dateSlot', date: '2026-10-01', slot: S9 } },
    bDateSlot(),
  ],
  [
    'backlog task → pattern',
    bTask(),
    { type: 'setWhen', id: 'a', when: recIn() },
    bRec(null, REC_NEXT),
  ],
  ['date → no time', bDate(), { type: 'setWhen', id: 'a', when: null }, bTask()],
  ['date+slot → no time', bDateSlot(), { type: 'setWhen', id: 'a', when: null }, bTask()],
  ['pattern → no time', bRec(), { type: 'setWhen', id: 'a', when: null }, bTask()],
  [
    'date → date+slot',
    bDate(),
    { type: 'setWhen', id: 'a', when: { type: 'dateSlot', date: '2026-10-01', slot: S9 } },
    bDateSlot(),
  ],
  [
    'date+slot → date',
    bDateSlot(),
    { type: 'setWhen', id: 'a', when: { type: 'date', date: '2026-10-01' } },
    bDate(),
  ],
  ['date → pattern', bDate(), { type: 'setWhen', id: 'a', when: recIn() }, bRec(null, REC_NEXT)],
  [
    'pattern → date',
    bRec(),
    { type: 'setWhen', id: 'a', when: { type: 'date', date: '2026-10-01' } },
    bDate(),
  ],
  [
    'date+slot → pattern',
    bDateSlot(),
    { type: 'setWhen', id: 'a', when: recIn(S9) },
    bRec(S9, REC_NEXT),
  ],
  [
    'pattern → date+slot',
    bRec(),
    { type: 'setWhen', id: 'a', when: { type: 'dateSlot', date: '2026-10-01', slot: S9 } },
    bDateSlot(),
  ],
  [
    'change date',
    bDate(),
    { type: 'setWhen', id: 'a', when: { type: 'date', date: '2026-10-09' } },
    bDate('2026-10-09'),
  ],
  [
    'change date+slot',
    bDateSlot(),
    { type: 'setWhen', id: 'a', when: { type: 'dateSlot', date: '2026-10-09', slot: S10 } },
    bDateSlot('2026-10-09', S10),
  ],
  [
    'change pattern',
    bRec(),
    { type: 'setWhen', id: 'a', when: recIn(null, weekly('MO')) },
    bRec(null, '2026-09-28', weekly('MO')),
  ],

  ['today task → backlog', tTask(), { type: 'move', id: 'a', to: 'backlog' }, bTask()],
  ['backlog task → today', bTask(), { type: 'move', id: 'a', to: 'today' }, tTask()],
  ['today note → backlog', tNote, { type: 'move', id: 'a', to: 'backlog' }, bNote],
  ['backlog note → today', bNote, { type: 'move', id: 'a', to: 'today' }, tNote],
  [
    'task@slot → backlog date(today)+slot',
    tTask(S9),
    { type: 'move', id: 'a', to: 'backlog' },
    bDateSlot(TODAY, S9),
  ],
  [
    'backlog date+slot → task@slot, date dropped',
    bDateSlot('2026-12-24', S9),
    { type: 'move', id: 'a', to: 'today' },
    tTask(S9),
  ],
  ['backlog date → task, date dropped', bDate(), { type: 'move', id: 'a', to: 'today' }, tTask()],
];

describe('strzałki grafu', () => {
  test.each(ARROWS)('%s', (_name, from, event, to) => {
    expect(stateOf(run(machine(['a', from]), event))).toEqual(to);
  });
});

test('utworzenie w dziś daje otwarte zadanie, w backlogu zadanie bez czasu', () => {
  const m = run(
    machine(),
    { type: 'create', id: 'a', text: 'A', place: 'today' },
    { type: 'create', id: 'b', text: 'B', place: 'backlog' },
  );
  expect(stateOf(m, 'a')).toEqual(tTask());
  expect(stateOf(m, 'b')).toEqual(bTask());
});

test('odhaczenie wzorca w backlogu: wykonana kopia w dziś, wzorzec zostaje i idzie dalej', () => {
  const m = run(machine(['a', bRec(S9)]), { type: 'markDone', id: 'a', copyId: 'c' });
  expect(stateOf(m, 'c')).toEqual(tDone(S9));
  expect(m.items.find((i) => i.id === 'c')!.text).toBe('A');
  expect(stateOf(m, 'a')).toEqual(bRec(S9, '2026-09-27'));
});

test('odhaczenie stawia pozycję na końcu tablicy: kolejność wykonanych to kolejność odhaczenia', () => {
  let m = machine(['a', tTask()], ['b', tTask(S9)], ['c', tTask()], ['d', bDateSlot(TODAY, S10)]);
  m = run(m, { type: 'markDone', id: 'c', copyId: 'x1' });
  expect(m.items.map((i) => i.id)).toEqual(['a', 'b', 'd', 'c']);
  m = run(m, { type: 'markDone', id: 'b', copyId: 'x2' });
  expect(m.items.map((i) => i.id)).toEqual(['a', 'd', 'c', 'b']);
  // Z backlogu też na koniec — tak samo jak kopia wzorca.
  m = run(m, { type: 'markDone', id: 'd', copyId: 'x3' });
  expect(m.items.map((i) => i.id)).toEqual(['a', 'c', 'b', 'd']);
  expect(stateOf(m, 'd')).toEqual(tDone(S10));
  // Cofnięcie odhaczenia zostawia pozycję tam, gdzie stoi; stan niczego więcej nie niesie.
  m = run(m, { type: 'markOpen', id: 'c' });
  expect(m.items.map((i) => i.id)).toEqual(['a', 'c', 'b', 'd']);
  expect(m.items.find((i) => i.id === 'c')).toEqual({ id: 'c', text: 'C', state: tTask() });
});

test('odhaczenie zaległego wzorca przesuwa go za dziś, nie za zaległy dzień', () => {
  const m = run(machine(['a', bRec(null, '2026-09-20')]), {
    type: 'markDone',
    id: 'a',
    copyId: 'c',
  });
  expect(stateOf(m, 'a')).toEqual(bRec(null, '2026-09-26'));
});

test('usunięcie działa z każdego stanu', () => {
  const states = [tTask(), tTask(S9), tDone(), tNote, bTask(), bDate(), bDateSlot(), bRec(), bNote];
  for (const s of states)
    expect(run(machine(['a', s]), { type: 'remove', id: 'a' }).items).toEqual([]);
});

/* ───────────── Odmowy ───────────── */

describe('odmowy', () => {
  test('wykonane zadanie nie idzie do backlogu', () => {
    expect(refusal(machine(['a', tDone()]), { type: 'move', id: 'a', to: 'backlog' })).toBe(
      'not-allowed',
    );
  });

  test('wzorca nie przenosi się do dziś — przychodzi sam, kopią', () => {
    expect(refusal(machine(['a', bRec()]), { type: 'move', id: 'a', to: 'today' })).toBe(
      'not-allowed',
    );
  });

  test('notatka nie ma czasu', () => {
    expect(refusal(machine(['a', tNote]), { type: 'setSlot', id: 'a', slot: S9 })).toBe(
      'not-allowed',
    );
    expect(
      refusal(machine(['a', bNote]), {
        type: 'setWhen',
        id: 'a',
        when: { type: 'date', date: TODAY },
      }),
    ).toBe('not-allowed');
  });

  test('zadanie z czasem nie staje się notatką, dopóki ma czas', () => {
    expect(refusal(machine(['a', tTask(S9)]), { type: 'toNote', id: 'a' })).toBe('not-allowed');
    expect(refusal(machine(['a', bDate()]), { type: 'toNote', id: 'a' })).toBe('not-allowed');
  });

  test('wykonane zadanie nie zmienia slotu ani nie staje się notatką', () => {
    expect(refusal(machine(['a', tDone(S9)]), { type: 'setSlot', id: 'a', slot: S10 })).toBe(
      'not-allowed',
    );
    expect(refusal(machine(['a', tDone()]), { type: 'toNote', id: 'a' })).toBe('not-allowed');
  });

  test('podwójne odhaczenie i odznaczenie otwartego są odmowami, nie cichymi no-opami', () => {
    expect(refusal(machine(['a', tDone()]), { type: 'markDone', id: 'a', copyId: 'c' })).toBe(
      'not-allowed',
    );
    expect(refusal(machine(['a', tTask()]), { type: 'markOpen', id: 'a' })).toBe('not-allowed');
  });

  test('zajęty slot — także przy częściowym nałożeniu', () => {
    const m = machine(['a', tTask()], ['b', tTask(S9)]);
    expect(refusal(m, { type: 'setSlot', id: 'a', slot: S9 })).toBe('slot-taken');
    expect(refusal(m, { type: 'setSlot', id: 'a', slot: S9 + 1 })).toBe('slot-taken');
    expect(refusal(m, { type: 'setSlot', id: 'a', slot: S9 - 1 })).toBe('slot-taken');
    expect(refusal(m, { type: 'setSlot', id: 'a', slot: S9 + SLOT_LEN })).toBe('ok');
  });

  test('wykonane zadanie też zajmuje slot', () => {
    expect(
      refusal(machine(['a', tTask()], ['b', tDone(S9)]), { type: 'setSlot', id: 'a', slot: S9 }),
    ).toBe('slot-taken');
  });

  test('przyjście do dziś na zajęty slot jest odmową', () => {
    const m = machine(['a', bDateSlot()], ['b', tTask(S9)]);
    expect(refusal(m, { type: 'move', id: 'a', to: 'today' })).toBe('slot-taken');
    expect(refusal(m, { type: 'markDone', id: 'a', copyId: 'c' })).toBe('slot-taken');
  });

  test('slot musi zmieścić się w dniu w całości — 30 minut', () => {
    const m = machine(['a', tTask()]);
    expect(refusal(m, { type: 'setSlot', id: 'a', slot: 23 })).toBe('slot-outside-day');
    expect(refusal(m, { type: 'setSlot', id: 'a', slot: 87 })).toBe('slot-outside-day'); // 21:45–22:15
    expect(refusal(m, { type: 'setSlot', id: 'a', slot: 86 })).toBe('ok'); // 21:30–22:00
    expect(
      refusal(machine(['a', bTask()]), {
        type: 'setWhen',
        id: 'a',
        when: { type: 'dateSlot', date: TODAY, slot: 87 },
      }),
    ).toBe('slot-outside-day');
  });

  test('zły identyfikator i zła data', () => {
    expect(refusal(machine(), { type: 'markOpen', id: 'x' })).toBe('unknown-item');
    expect(
      refusal(machine(['a', tTask()]), { type: 'create', id: 'a', text: '', place: 'today' }),
    ).toBe('duplicate-id');
    expect(
      refusal(machine(['a', bTask()]), {
        type: 'setWhen',
        id: 'a',
        when: { type: 'date', date: 'jutro' },
      }),
    ).toBe('bad-date');
    expect(refusal(machine(), { type: 'advance', to: '2026-09-24' })).toBe('bad-date');
  });

  test('przeszłość jest tylko do odczytu', () => {
    const m = machine(
      ['a', { tag: 'past-done', day: '2026-09-24', slot: null }],
      ['b', { tag: 'past-note', day: '2026-09-24' }],
    );
    const events: Event[] = [
      { type: 'markOpen', id: 'a' },
      { type: 'markDone', id: 'b', copyId: 'c' },
      { type: 'toTask', id: 'b' },
      { type: 'move', id: 'a', to: 'today' },
      { type: 'move', id: 'b', to: 'backlog' },
      { type: 'setSlot', id: 'a', slot: S9 },
    ];
    for (const e of events) expect(refusal(m, e)).toBe('not-allowed');
  });
});

/* ───────────── Zegar ───────────── */

const TOMORROW = '2026-09-26';

describe('północ i początek dnia', () => {
  test('otwarte zadania przechodzą do nowego dnia bez slotu', () => {
    const m = run(machine(['a', tTask()], ['b', tTask(S9)]), { type: 'advance', to: TOMORROW });
    expect(m.today).toBe(TOMORROW);
    expect(stateOf(m, 'a')).toEqual(tTask());
    expect(stateOf(m, 'b')).toEqual(tTask());
  });

  test('wykonane i notatki zostają w swoim dniu', () => {
    const m = run(machine(['a', tDone(S9)], ['b', tNote]), { type: 'advance', to: TOMORROW });
    expect(stateOf(m, 'a')).toEqual({ tag: 'past-done', day: TODAY, slot: S9 });
    expect(stateOf(m, 'b')).toEqual({ tag: 'past-note', day: TODAY });
  });

  test('pozycja z datą przychodzi w swoim dniu jako otwarte zadanie', () => {
    const m0 = machine(['a', bDate(TOMORROW)]);
    expect(stateOf(run(m0, { type: 'advance', to: TODAY }))).toEqual(bDate(TOMORROW)); // jeszcze nie
    expect(stateOf(run(m0, { type: 'advance', to: TOMORROW }))).toEqual(tTask());
  });

  test('pozycja z datą i slotem przychodzi ze slotem', () => {
    const m = run(machine(['a', bDateSlot(TOMORROW, S9)]), { type: 'advance', to: TOMORROW });
    expect(stateOf(m)).toEqual(tTask(S9));
  });

  test('zadanie odłożone dziś ze slotem wraca jutro rano na ten sam slot', () => {
    const m = run(
      machine(['a', tTask(S9)]),
      { type: 'move', id: 'a', to: 'backlog' },
      { type: 'advance', to: TOMORROW },
    );
    expect(stateOf(m)).toEqual(tTask(S9));
  });

  test('zajęty slot: pozycja zostaje w backlogu i próbuje o kolejnym świcie', () => {
    const d2 = '2026-09-27';
    let m = run(machine(['a', bDateSlot(TOMORROW, S9)], ['b', bDateSlot(TOMORROW, S9)]), {
      type: 'advance',
      to: TOMORROW,
    });
    expect(stateOf(m, 'a')).toEqual(tTask(S9)); // pierwsza w kolejności wygrywa
    expect(stateOf(m, 'b')).toEqual(bDateSlot(TOMORROW, S9));

    m = run(m, { type: 'advance', to: d2 }); // „a" straciło slot o północy
    expect(stateOf(m, 'b')).toEqual(tTask(S9));
  });

  test('wzorzec przysyła kopię w swoim dniu i przesuwa się dalej', () => {
    const m = run(machine(['a', bRec(S9, TOMORROW)]), { type: 'advance', to: TOMORROW });
    expect(stateOf(m, `a@${TOMORROW}`)).toEqual(tTask(S9));
    expect(stateOf(m, 'a')).toEqual(bRec(S9, '2026-09-27'));
  });

  test('spór o slot: pozycja z datą wygrywa z kopią wzorca, niezależnie od kolejności', () => {
    const m = run(machine(['a', bRec(S9, TOMORROW)], ['b', bDateSlot(TOMORROW, S9)]), {
      type: 'advance',
      to: TOMORROW,
    });
    expect(stateOf(m, 'b')).toEqual(tTask(S9));
  });

  test('kopia wzorca na zajęty slot: wzorzec czeka, ponawia następnego dnia', () => {
    let m = run(machine(['a', bRec(S9, TOMORROW)], ['b', bDateSlot(TOMORROW, S9)]), {
      type: 'advance',
      to: TOMORROW,
    });
    expect(stateOf(m, 'b')).toEqual(tTask(S9));
    expect(m.items.some((i) => i.id === `a@${TOMORROW}`)).toBe(false);
    expect(stateOf(m, 'a')).toEqual(bRec(S9, TOMORROW)); // zaległe

    m = run(m, { type: 'advance', to: '2026-09-27' });
    expect(stateOf(m, 'a@2026-09-27')).toEqual(tTask(S9));
  });

  test('tydzień nieobecności przechodzi każdą północ po kolei', () => {
    const m = run(
      machine(
        ['a', tDone()],
        ['b', bDate('2026-09-28')],
        ['c', bRec(null, TOMORROW, weekly('SA'))],
      ),
      { type: 'advance', to: '2026-10-02' },
    );
    expect(m.today).toBe('2026-10-02');
    expect(stateOf(m, 'a')).toEqual({ tag: 'past-done', day: TODAY, slot: null });
    expect(stateOf(m, 'b')).toEqual(tTask()); // przyszła w poniedziałek i przeszła dalej jako otwarta
    expect(stateOf(m, `c@${TOMORROW}`)).toEqual(tTask()); // sobotnia kopia
    expect(stateOf(m, 'c')).toEqual(bRec(null, '2026-10-03', weekly('SA')));
  });

  test('kopia wzorca pamięta, z którego wzorca pochodzi', () => {
    const m = run(machine(['a', bRec(null, TOMORROW)]), { type: 'advance', to: TOMORROW });
    expect(m.items.find((i) => i.id === `a@${TOMORROW}`)!.from).toBe('a');
    const d = run(machine(['a', bRec()]), { type: 'markDone', id: 'a', copyId: 'c' });
    expect(d.items.find((i) => i.id === 'c')!.from).toBe('a');
  });

  test('wzorzec nie przysyła kopii, dopóki poprzednia jest otwarta', () => {
    const m = run(machine(['a', bRec(null, TOMORROW)]), { type: 'advance', to: '2026-10-02' });
    expect(m.items.filter((i) => i.from === 'a')).toHaveLength(1);
    // Pominięte wystąpienia przepadają: wzorzec wskazuje jutro, nie zaległy dzień.
    expect(stateOf(m, 'a')).toEqual(bRec(null, '2026-10-03'));
  });

  test('po odhaczeniu kopii następna przychodzi w najbliższym dniu wzorca', () => {
    let m = run(machine(['a', bRec(null, TOMORROW)]), { type: 'advance', to: TOMORROW });
    m = run(
      m,
      { type: 'markDone', id: `a@${TOMORROW}`, copyId: 'x' },
      { type: 'advance', to: '2026-09-27' },
    );
    expect(stateOf(m, 'a@2026-09-27')).toEqual(tTask());
  });

  test('poniedziałkowy wzorzec odhaczony w środę nie wraca w czwartek', () => {
    const MON = weekly('MO');
    let m = run(machine(['a', bRec(null, '2026-09-28', MON)]), {
      type: 'advance',
      to: '2026-09-28',
    });
    expect(stateOf(m, 'a@2026-09-28')).toEqual(tTask());

    m = run(
      m,
      { type: 'advance', to: '2026-09-30' },
      { type: 'markDone', id: 'a@2026-09-28', copyId: 'x' },
    );
    m = run(m, { type: 'advance', to: '2026-10-01' });
    expect(m.items.filter((i) => i.from === 'a' && i.state.tag === 'today-task')).toHaveLength(0);

    m = run(m, { type: 'advance', to: '2026-10-05' });
    expect(stateOf(m, 'a@2026-10-05')).toEqual(tTask());
  });

  test('otwarta kopia wstrzymuje wzorzec także z backlogu', () => {
    let m = run(machine(['a', bRec(null, TOMORROW)]), { type: 'advance', to: TOMORROW });
    m = run(
      m,
      { type: 'move', id: `a@${TOMORROW}`, to: 'backlog' },
      { type: 'advance', to: '2026-09-27' },
    );
    expect(m.items.filter((i) => i.from === 'a')).toHaveLength(1);
  });

  test('usunięta albo zamieniona w notatkę kopia nie wstrzymuje wzorca', () => {
    let m = run(machine(['a', bRec(null, TOMORROW)], ['b', bRec(null, TOMORROW)]), {
      type: 'advance',
      to: TOMORROW,
    });
    m = run(
      m,
      { type: 'remove', id: `a@${TOMORROW}` },
      { type: 'toNote', id: `b@${TOMORROW}` },
      { type: 'advance', to: '2026-09-27' },
    );
    expect(stateOf(m, 'a@2026-09-27')).toEqual(tTask());
    expect(stateOf(m, 'b@2026-09-27')).toEqual(tTask());
  });

  test('wykonana kopia z backlogu nie wstrzymuje wzorca', () => {
    let m = run(machine(['a', bRec(null, TOMORROW)]), { type: 'markDone', id: 'a', copyId: 'x' });
    m = run(m, { type: 'advance', to: '2026-09-27' });
    expect(stateOf(m, 'a@2026-09-27')).toEqual(tTask());
  });

  test('advance na ten sam dzień nic nie zmienia', () => {
    const m0 = machine(['a', tTask(S9)], ['b', bDate(TODAY)]);
    expect(run(m0, { type: 'advance', to: TODAY })).toEqual(m0);
  });
});

test('siatka to dzisiejsze zadania ze slotem, w kolejności godzin', () => {
  const m = machine(
    ['a', tTask(S10)],
    ['b', tTask()],
    ['c', tDone(S9)],
    ['d', bDateSlot(TODAY, 50)],
    ['e', tNote],
  );
  expect(gridOf(m).map((i) => i.id)).toEqual(['c', 'a']);
});

/* ───────────── Własności ───────────── */

/** Mały deterministyczny generator — test ma być powtarzalny co do bitu. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomEvent(r: () => number, m: Machine, n: number): Event {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const ids = m.items.map((i) => i.id);
  const id = ids.length && r() < 0.9 ? pick(ids) : `x${n}`;
  const slot = pick([null, 22, 24, 30, 31, 36, 37, 40, 86, 87]);
  const date = pick(['2026-09-20', TODAY, '2026-09-27', '2026-10-01', 'zła']);
  const rule = pick<RRule>([
    DAILY,
    weekly('MO'),
    { freq: 'MONTHLY', interval: 1, byMonthDay: [-1] },
    { freq: 'DAILY', interval: 2, count: 3 },
    { freq: 'WEEKLY', interval: 1, byDay: [{ day: 'SA' }], until: '2026-10-10' },
  ]);
  const when = pick<WhenInput | null>([
    null,
    { type: 'date', date },
    { type: 'dateSlot', date, slot: slot ?? 36 },
    { type: 'recurring', rule, slot, start: date },
  ]);
  const events: Event[] = [
    { type: 'create', id: `n${n}`, text: `n${n}`, place: pick(['today', 'backlog'] as const) },
    { type: 'markDone', id, copyId: `c${n}` },
    { type: 'markOpen', id },
    { type: 'toNote', id },
    { type: 'toTask', id },
    { type: 'setSlot', id, slot },
    { type: 'setWhen', id, when },
    { type: 'move', id, to: pick(['today', 'backlog'] as const) },
    { type: 'remove', id },
    {
      type: 'advance',
      to: r() < 0.5 ? m.today : pick([advanceRule(DAILY, m.today, m.today)!.next, '2026-09-01']),
    },
  ];
  return pick(events);
}

describe('własności na losowych ciągach zdarzeń', () => {
  const SEEDS = [1, 2, 3, 42, 1234, 99991];

  test.each(SEEDS)('ziarno %i: niezmienniki trzymają się po każdym kroku', (seed) => {
    const r = rng(seed);
    let m = machine();
    for (let n = 0; n < 1500; n++) {
      const e = randomEvent(r, m, n);
      const before = JSON.stringify(m);
      const res = step(m, e, DAY);
      // Odmowa nie może dotknąć stanu wejściowego; zmiana idzie tylko przez wynik.
      expect(JSON.stringify(m)).toBe(before);
      if (res.ok) m = res.machine;
      expect(violations(m, DAY)).toEqual([]);
    }
  });

  test.each(SEEDS)('ziarno %i: ten sam ciąg zdarzeń daje ten sam stan', (seed) => {
    const replay = () => {
      const r = rng(seed);
      let m = machine();
      const trace: Event[] = [];
      for (let n = 0; n < 800; n++) {
        const e = randomEvent(r, m, n);
        trace.push(e);
        const res = step(m, e, DAY);
        if (res.ok) m = res.machine;
      }
      return { m, trace };
    };
    const a = replay();
    const b = replay();
    expect(b.trace).toEqual(a.trace);
    expect(b.m).toEqual(a.m);
  });

  test('odmowa nie zmienia stanu wejściowego', () => {
    const m = machine(['a', tDone()], ['b', tTask(S9)]);
    const snapshot = structuredClone(m);
    step(m, { type: 'move', id: 'a', to: 'backlog' }, DAY);
    step(m, { type: 'setSlot', id: 'b', slot: 999 }, DAY);
    expect(m).toEqual(snapshot);
  });
});

test('żaden stan poza przeszłością nie jest ślepym zaułkiem', () => {
  // Z każdego stanu grafu, poza przeszłością, prowadzi co najmniej jedno
  // przejście inne niż usunięcie.
  const exits = (s: State): number => {
    const m = machine(['a', s]);
    const candidates: Event[] = [
      { type: 'markDone', id: 'a', copyId: 'c' },
      { type: 'markOpen', id: 'a' },
      { type: 'toNote', id: 'a' },
      { type: 'toTask', id: 'a' },
      { type: 'setSlot', id: 'a', slot: S10 },
      { type: 'setSlot', id: 'a', slot: null },
      { type: 'setWhen', id: 'a', when: null },
      { type: 'move', id: 'a', to: 'today' },
      { type: 'move', id: 'a', to: 'backlog' },
    ];
    return candidates.filter((e) => step(m, e, DAY).ok).length;
  };
  const live: State[] = [
    tTask(),
    tTask(S9),
    tDone(),
    tDone(S9),
    tNote,
    bTask(),
    bDate(),
    bDateSlot(),
    bRec(),
    bNote,
  ];
  for (const s of live) expect(exits(s), JSON.stringify(s)).toBeGreaterThan(0);
  expect(exits({ tag: 'past-done', day: '2026-09-24', slot: null })).toBe(0);
  expect(exits({ tag: 'past-note', day: '2026-09-24' })).toBe(0);
});

test('typy nie dopuszczają wykonanego zadania w backlogu ani czasu przy notatce', () => {
  // @ts-expect-error — backlog nie ma pola `done`
  const a: State = { tag: 'backlog-task', when: null, done: true };
  // @ts-expect-error — notatka nie ma slotu
  const b: State = { tag: 'today-note', slot: 36 };
  // @ts-expect-error — notatka w backlogu nie ma wiązania czasowego
  const c: State = { tag: 'backlog-note', when: null };
  expect([a, b, c]).toHaveLength(3);
});

test('kategoria jest daną pozycji: utworzenie ją nadaje, kopie wzorca ją dziedziczą', () => {
  let m = run(machine(), {
    type: 'create',
    id: 'a',
    text: 'A',
    place: 'backlog',
    cat: 'learn',
    created: 7,
  });
  expect(m.items[0]).toMatchObject({ cat: 'learn', created: 7 });
  m = run(
    m,
    { type: 'setWhen', id: 'a', when: recIn() },
    { type: 'markDone', id: 'a', copyId: 'done' },
    { type: 'advance', to: '2026-09-27' },
  );
  expect(m.items.find((i) => i.id === 'done')!.cat).toBe('learn');
  expect(m.items.find((i) => i.id === 'a@2026-09-27')!.cat).toBe('learn');
});

describe('reguły iCal we wzorcach', () => {
  const R = (s: Partial<RRule> & Pick<RRule, 'freq'>): RRule => ({ interval: 1, ...s });
  const pattern = (m: Machine) => m.items.find((i) => i.id === 'a');

  test('początek serii: pierwsze pasujące od podanego dnia, najwcześniej jutro', () => {
    // Czwartek 1.10 z regułą „co poniedziałek" daje poniedziałek 5.10.
    let m = run(machine(['a', bTask()]), {
      type: 'setWhen',
      id: 'a',
      when: recIn(null, weekly('MO'), '2026-10-01'),
    });
    expect(stateOf(m, 'a')).toEqual(bRec(null, '2026-10-05', weekly('MO')));
    // Początek dziś albo w przeszłości nie daje wystąpienia dziś.
    m = run(machine(['a', bTask()]), {
      type: 'setWhen',
      id: 'a',
      when: recIn(null, DAILY, '2026-09-01'),
    });
    expect(stateOf(m, 'a')).toEqual(bRec(null, TOMORROW));
  });

  test('to, co reguła brała z początku serii, zapisuje się wprost', () => {
    const m = run(machine(['a', bTask()]), {
      type: 'setWhen',
      id: 'a',
      when: recIn(null, R({ freq: 'MONTHLY' }), '2026-10-15'),
    });
    expect(stateOf(m, 'a')).toEqual(
      bRec(null, '2026-10-15', R({ freq: 'MONTHLY', byMonthDay: [15] })),
    );
  });

  test('reguła bez sensu albo bez wystąpień od jutra jest odrzucana', () => {
    const set = (rule: RRule, start = '2026-10-01') =>
      refusal(machine(['a', bTask()]), {
        type: 'setWhen',
        id: 'a',
        when: recIn(null, rule, start),
      });
    expect(set(R({ freq: 'YEARLY', byMonth: [2], byMonthDay: [30] }))).toBe('bad-rule');
    expect(set(R({ freq: 'DAILY', count: 2, until: '2026-12-31' }))).toBe('bad-rule');
    expect(set(R({ freq: 'DAILY', until: '2026-09-25' }))).toBe('bad-rule');
    expect(set(DAILY, 'zła')).toBe('bad-date');
  });

  test('COUNT: każde wystąpienie o świcie zużywa jedno; ostatnie zabiera wzorzec', () => {
    let m = run(machine(['a', bRec(null, TOMORROW, R({ freq: 'DAILY', count: 2 }))]), {
      type: 'advance',
      to: TOMORROW,
    });
    expect(stateOf(m, 'a')).toEqual(bRec(null, '2026-09-27', R({ freq: 'DAILY', count: 1 })));
    m = run(
      m,
      { type: 'markDone', id: 'a@2026-09-26', copyId: 'x' },
      { type: 'advance', to: '2026-09-27' },
    );
    expect(pattern(m)).toBeUndefined();
    // Kopie zostają: wczorajsza w archiwum, dzisiejsza w dziś.
    expect(stateOf(m, 'a@2026-09-26')).toEqual({ tag: 'past-done', day: TOMORROW, slot: null });
    expect(stateOf(m, 'a@2026-09-27')).toEqual(tTask());
  });

  test('COUNT liczy daty: wystąpienie pominięte przez otwartą kopię też się liczy', () => {
    const m = run(machine(['a', bRec(null, TOMORROW, R({ freq: 'DAILY', count: 3 }))]), {
      type: 'advance',
      to: '2026-09-28',
    });
    // 26.: kopia; 27. i 28.: kopia 26. wciąż otwarta — daty przepadają, seria się kończy.
    expect(pattern(m)).toBeUndefined();
    expect(m.items.map((i) => i.id)).toEqual(['a@2026-09-26']);
  });

  test('zajęty slot nie zużywa wystąpienia: czeka do następnego świtu', () => {
    let m = run(
      machine(
        ['a', bRec(S9, TOMORROW, R({ freq: 'DAILY', count: 1 }))],
        ['b', bDateSlot(TOMORROW, S9)],
      ),
      { type: 'advance', to: TOMORROW },
    );
    expect(stateOf(m, 'a')).toEqual(bRec(S9, TOMORROW, R({ freq: 'DAILY', count: 1 })));
    m = run(m, { type: 'setSlot', id: 'b', slot: S10 }, { type: 'advance', to: '2026-09-27' });
    expect(pattern(m)).toBeUndefined();
    expect(stateOf(m, 'a@2026-09-27')).toEqual(tTask(S9));
  });

  test('UNTIL: po ostatniej dacie wzorzec znika', () => {
    const m = run(
      machine([
        'a',
        bRec(null, TOMORROW, R({ freq: 'WEEKLY', byDay: [{ day: 'SA' }], until: '2026-10-01' })),
      ]),
      { type: 'advance', to: TOMORROW },
    );
    expect(pattern(m)).toBeUndefined();
    expect(stateOf(m, 'a@2026-09-26')).toEqual(tTask());
  });

  test('odhaczenie ostatniego wystąpienia w backlogu kończy serię', () => {
    const m = run(machine(['a', bRec(null, TOMORROW, R({ freq: 'DAILY', count: 1 }))]), {
      type: 'markDone',
      id: 'a',
      copyId: 'c',
    });
    expect(pattern(m)).toBeUndefined();
    expect(stateOf(m, 'c')).toEqual(tDone());
  });

  test('INTERVAL zachowuje fazę przez kolejne świty', () => {
    const rule = R({ freq: 'WEEKLY', interval: 2, byDay: [{ day: 'MO' }, { day: 'WE' }] });
    let m = run(machine(['a', bTask()]), {
      type: 'setWhen',
      id: 'a',
      when: recIn(null, rule, TOMORROW),
    });
    const arrived: string[] = [];
    for (let d = TOMORROW; d <= '2026-10-22'; d = advanceRule(DAILY, d, d)!.next) {
      m = run(m, { type: 'advance', to: d });
      const copy = m.items.find((i) => i.id === `a@${d}`);
      if (copy) {
        arrived.push(d);
        m = run(m, { type: 'markDone', id: copy.id, copyId: `x${d}` });
      }
    }
    expect(arrived).toEqual(['2026-10-05', '2026-10-07', '2026-10-19', '2026-10-21']);
  });
});
