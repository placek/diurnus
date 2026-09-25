// @vitest-environment jsdom
import { test, expect, beforeEach, vi } from 'vitest';
import { today } from '../src/lib/time';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  document.body.innerHTML = '';
  document.head.innerHTML = '<meta name="theme-color" content="#282828">';
  delete document.documentElement.dataset.theme;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({
      matches: q.includes('min-width'),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  // jsdom nie implementuje przechwytywania wskaźnika.
  Element.prototype.setPointerCapture = function () {
    (this as unknown as { _cap: boolean })._cap = true;
  };
  Element.prototype.hasPointerCapture = function () {
    return (this as unknown as { _cap?: boolean })._cap === true;
  };
  Element.prototype.releasePointerCapture = function () {
    (this as unknown as { _cap: boolean })._cap = false;
  };
  // jsdom nie trafia w elementy po współrzędnych. Umawiamy się, że współrzędna
  // X JEST kwantem: punkt (40, y) leży nad komórką q=40. Dzięki temu test
  // mówi o godzinach, a nie o pikselach.
  document.elementsFromPoint = (x: number) => {
    const cell = document.querySelector(`#grid .cell[data-q="${Math.round(x)}"]`);
    return cell ? [cell] : [];
  };
});

type Seed = { id: string; q: number; done?: boolean; title?: string };

/** Dzisiejsze zadania ze slotem — to one są blokami na siatce. */
function seed(blocks: Seed[]) {
  localStorage.setItem('diurnus.prefs', JSON.stringify({ theme: 'auto', seenHelp: true }));
  localStorage.setItem(
    'diurnus.v1',
    JSON.stringify({
      v: 6,
      cats: [{ id: 'work', name: 'Praca', icon: 'laptop-code', color: 'yellow', parent: null }],
      day: { start: 6, end: 22, bands: [] },
      today: today(),
      items: blocks.map((b) => ({
        id: b.id,
        text: b.title ?? '',
        created: 0,
        cat: 'work',
        state: { tag: 'today-task', done: b.done ?? false, slot: b.q },
      })),
    }),
  );
}

type App = Awaited<ReturnType<typeof mountApp>>['app'];
const stateOf = (app: App, id: string) =>
  app.S.items.find((i) => i.id === id)!.state as { slot: number | null; done: boolean };
const slot = (app: App, id: string) => stateOf(app, id).slot;
const isDone = (app: App, id: string) => stateOf(app, id).done;

async function mountApp() {
  const { mount, flushSync } = await import('svelte');
  const App = (await import('../src/App.svelte')).default;
  mount(App, { target: document.body });
  flushSync();
  const { app } = await import('../src/state.svelte');
  return { flush: flushSync, app };
}

const blockEl = (id: string) => document.querySelector<HTMLElement>(`#grid .blk[data-id="${id}"]`)!;

function pointer(el: HTMLElement, type: string, x: number, button = 0) {
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: 10,
      button,
      pointerId: 1,
    }),
  );
}

/** Chwyć blok nad kwantem `fromQ`, przeciągnij nad `toQ` i puść. */
function drag(el: HTMLElement, fromQ: number, toQ: number, flush: () => void) {
  pointer(el, 'pointerdown', fromQ);
  pointer(el, 'pointermove', toQ);
  flush();
  pointer(el, 'pointerup', toQ);
  flush();
}

test('przeciągnięcie bloku na wolne miejsce zmienia jego godzinę', async () => {
  seed([{ id: 'a', q: 32 }]);
  const { flush, app } = await mountApp();

  drag(blockEl('a'), 32, 40, flush);

  expect(slot(app, 'a')).toBe(40);
  expect(document.querySelector('#grid .blk[data-id="a"]')!.getAttribute('style')).toMatch(
    /grid-column:\s*2\/span 2/,
  );
  expect(app.toast?.msg).toMatch(/10:00/);
});

test('blok idzie za kursorem: chwyt za drugi kwant zachowuje przesunięcie', async () => {
  seed([{ id: 'a', q: 32 }]);
  const { flush, app } = await mountApp();

  drag(blockEl('a'), 33, 41, flush);

  expect(slot(app, 'a')).toBe(40);
});

test('upuszczenie na zajęte miejsce nic nie zmienia i mówi dlaczego', async () => {
  seed([
    { id: 'a', q: 32 },
    { id: 'b', q: 40 },
  ]);
  const { flush, app } = await mountApp();

  drag(blockEl('a'), 32, 40, flush);

  expect(slot(app, 'a')).toBe(32);
  expect(slot(app, 'b')).toBe(40);
  expect(app.toast?.msg).toMatch(/zajęte/);
});

test('częściowe nałożenie na sąsiada też jest zajęte', async () => {
  seed([
    { id: 'a', q: 32 },
    { id: 'b', q: 40 },
  ]);
  const { flush, app } = await mountApp();

  drag(blockEl('a'), 32, 39, flush); // [39, 41) zahacza o b
  expect(slot(app, 'a')).toBe(32);

  drag(blockEl('a'), 32, 38, flush); // [38, 40) przylega do b
  expect(slot(app, 'a')).toBe(38);
});

test('blok musi zmieścić się w oknie dnia w całości', async () => {
  seed([{ id: 'a', q: 32 }]);
  const { flush, app } = await mountApp();

  drag(blockEl('a'), 32, 87, flush); // 21:45–22:15 wystaje poza 22:00
  expect(slot(app, 'a')).toBe(32);
  expect(app.toast?.msg).toMatch(/Poza zakresem dnia 06:00–22:00/);

  drag(blockEl('a'), 32, 86, flush); // 21:30–22:00 mieści się
  expect(slot(app, 'a')).toBe(86);
});

test('w trakcie przeciągania widać ducha celu; nad zajętym jest oznaczony jako zły', async () => {
  seed([
    { id: 'a', q: 32 },
    { id: 'b', q: 40 },
  ]);
  const { flush } = await mountApp();
  const el = blockEl('a');

  pointer(el, 'pointerdown', 32);
  pointer(el, 'pointermove', 50);
  flush();
  expect(document.querySelector('#grid .blk.ghost.drop:not(.bad)')).not.toBeNull();
  expect(document.querySelector('#grid .blk.ghost.drop.bad')).toBeNull();
  expect(el.classList.contains('is-dragging')).toBe(true);

  pointer(el, 'pointermove', 40);
  flush();
  expect(document.querySelector('#grid .blk.ghost.drop.bad')).not.toBeNull();

  pointer(el, 'pointerup', 40);
  flush();
  expect(document.querySelector('#grid .blk.ghost.drop')).toBeNull();
  expect(el.classList.contains('is-dragging')).toBe(false);
});

test('duch znika, gdy kursor wyjdzie poza siatkę, a upuszczenie tam nic nie zmienia', async () => {
  seed([{ id: 'a', q: 32 }]);
  const { flush, app } = await mountApp();
  const el = blockEl('a');

  pointer(el, 'pointerdown', 32);
  pointer(el, 'pointermove', 50);
  flush();
  expect(document.querySelector('#grid .blk.ghost.drop')).not.toBeNull();

  pointer(el, 'pointermove', 500); // brak takiej komórki
  flush();
  expect(document.querySelector('#grid .blk.ghost.drop')).toBeNull();

  pointer(el, 'pointerup', 500);
  flush();
  expect(slot(app, 'a')).toBe(32);
});

test('przerwanie przez system porzuca przeciąganie bez przenoszenia', async () => {
  seed([{ id: 'a', q: 32 }]);
  const { flush, app } = await mountApp();
  const el = blockEl('a');

  pointer(el, 'pointerdown', 32);
  pointer(el, 'pointermove', 50);
  flush();
  expect(document.querySelector('#grid .blk.ghost.drop')).not.toBeNull();

  pointer(el, 'pointercancel', 50);
  flush();

  expect(document.querySelector('#grid .blk.ghost.drop')).toBeNull();
  expect(el.classList.contains('is-dragging')).toBe(false);
  expect(slot(app, 'a')).toBe(32);
});

test('ruch poniżej progu nie przeciąga, a klik oznacza wykonanie', async () => {
  seed([{ id: 'a', q: 32 }]);
  const { flush, app } = await mountApp();
  const el = blockEl('a');

  pointer(el, 'pointerdown', 32);
  pointer(el, 'pointermove', 33); // 1 px — poniżej progu 4 px
  flush();
  pointer(el, 'pointerup', 33);
  el.click();
  flush();

  expect(slot(app, 'a')).toBe(32);
  expect(isDone(app, 'a')).toBe(true); // klik zadziałał
});

test('po przeciągnięciu klik NIE oznacza wykonania', async () => {
  seed([{ id: 'a', q: 32 }]);
  const { flush, app } = await mountApp();
  const el = blockEl('a');

  drag(el, 32, 40, flush);
  // Przeglądarka wysyła click po przeciągnięciu — a przeniesiony blok jest
  // już NOWYM elementem w innym rzędzie, więc klikamy w niego, nie w stary.
  blockEl('a').click();
  flush();

  expect(slot(app, 'a')).toBe(40);
  expect(isDone(app, 'a')).toBe(false);
});

test('echo przeciągnięcia nie otwiera menu ani nie przełącza bloku przez komórkę pod nim', async () => {
  seed([{ id: 'a', q: 32 }]);
  const { flush, app } = await mountApp();

  drag(blockEl('a'), 32, 40, flush);
  document.querySelector<HTMLElement>('#grid .cell[data-q="40"]')!.click();
  flush();

  expect(isDone(app, 'a')).toBe(false);
  expect(document.querySelector('#radial')).toBeNull();
});

test('zwykłe kliknięcie po zakończonym przeciągnięciu znów działa', async () => {
  seed([{ id: 'a', q: 32 }]);
  const { flush, app } = await mountApp();

  drag(blockEl('a'), 32, 40, flush);
  blockEl('a').click(); // echo — połknięte
  flush();
  expect(isDone(app, 'a')).toBe(false);

  blockEl('a').click(); // prawdziwe kliknięcie
  flush();
  expect(isDone(app, 'a')).toBe(true);
});

test('prawy przycisk nie rozpoczyna przeciągania', async () => {
  seed([{ id: 'a', q: 32 }]);
  const { flush, app } = await mountApp();
  const el = blockEl('a');

  pointer(el, 'pointerdown', 32, 2);
  pointer(el, 'pointermove', 40);
  flush();
  expect(document.querySelector('#grid .blk.ghost.drop')).toBeNull();
  pointer(el, 'pointerup', 40, 2);
  flush();

  expect(slot(app, 'a')).toBe(32);
});

test('nowa godzina utrwala się w localStorage', async () => {
  seed([{ id: 'a', q: 32 }]);
  const { flush } = await mountApp();

  drag(blockEl('a'), 32, 40, flush);

  const saved = JSON.parse(localStorage.getItem('diurnus.v1') ?? '{}');
  expect(saved.items.find((i: { id: string }) => i.id === 'a').state.slot).toBe(40);
});

test('cofnięcie przywraca poprzednią godzinę', async () => {
  seed([{ id: 'a', q: 32 }]);
  const { flush, app } = await mountApp();
  const { undo } = await import('../src/state.svelte');

  drag(blockEl('a'), 32, 40, flush);
  expect(slot(app, 'a')).toBe(40);

  undo();
  flush();
  expect(slot(app, 'a')).toBe(32);
});

test('pozycja powiązana na liście pokazuje nową godzinę bloku', async () => {
  seed([{ id: 'a', q: 32, title: 'Nauka' }]);
  const { flush } = await mountApp();
  expect(document.querySelector('#list .item-hour')!.textContent).toBe('08:00');

  drag(blockEl('a'), 32, 40, flush);

  expect(document.querySelector('#list .item-hour')!.textContent).toBe('10:00');
});

test('wykonane zadanie nie zmienia godziny: cel jest czerwony, a upuszczenie odmawia', async () => {
  seed([{ id: 'a', q: 40, done: true }]);
  const { flush, app } = await mountApp();
  const el = blockEl('a');

  pointer(el, 'pointerdown', 40);
  pointer(el, 'pointermove', 60);
  flush();
  expect(document.querySelector('#grid .blk.ghost.drop.bad')).not.toBeNull();
  pointer(el, 'pointerup', 60);
  flush();

  expect(slot(app, 'a')).toBe(40);
  expect(app.toast?.msg).toMatch(/Wykonane/);
});

test('upływ czasu nie oznacza wykonania: slot, który minął, zostaje otwarty', async () => {
  seed([{ id: 'a', q: 32 }]);
  const { flush, app } = await mountApp();
  const d = new Date();
  app.now = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0).getTime();
  flush();

  expect(isDone(app, 'a')).toBe(false);
  expect(blockEl('a').classList.contains('stale')).toBe(true);
});

/* ── Klawiatura ── */

async function cursorAt(q: number) {
  const { ui } = await import('../src/state.svelte');
  ui.cursor.q = q;
  ui.cursor.visible = true;
  return ui;
}

function key(k: string, shift = true) {
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true, cancelable: true }),
  );
}

test('Shift+→ przenosi blok spod kursora o kwant, a kursor jedzie z nim', async () => {
  seed([{ id: 'a', q: 32 }]);
  const { flush, app } = await mountApp();
  const ui = await cursorAt(33);

  key('ArrowRight');
  flush();

  expect(slot(app, 'a')).toBe(33);
  expect(ui.cursor.q).toBe(34);
  expect(app.toast?.msg).toMatch(/08:15/);
});

test('Shift+↓ i Shift+J przenoszą blok o godzinę, Shift+K i Shift+H wracają', async () => {
  seed([{ id: 'a', q: 32 }]);
  const { flush, app } = await mountApp();
  const ui = await cursorAt(32);
  const q = () => slot(app, 'a');

  key('ArrowDown');
  flush();
  expect(q()).toBe(36);
  key('J');
  flush();
  expect(q()).toBe(40);
  key('K');
  flush();
  expect(q()).toBe(36);
  key('H');
  flush();
  expect(q()).toBe(35);
  expect(ui.cursor.q).toBe(35);
});

test('Shift+strzałka na zajęte miejsce nic nie rusza — ani bloku, ani kursora', async () => {
  seed([
    { id: 'a', q: 32 },
    { id: 'b', q: 34 },
  ]);
  const { flush, app } = await mountApp();
  const ui = await cursorAt(32);

  key('ArrowRight');
  flush();

  expect(slot(app, 'a')).toBe(32);
  expect(slot(app, 'b')).toBe(34);
  expect(ui.cursor.q).toBe(32);
  expect(app.toast?.msg).toMatch(/zajęte/);
});

test('Shift+strzałka nie wypycha bloku poza zakres dnia', async () => {
  seed([{ id: 'a', q: 24 }]); // 06:00 — początek okna
  const { flush, app } = await mountApp();
  const ui = await cursorAt(24);

  key('ArrowUp');
  flush();

  expect(slot(app, 'a')).toBe(24);
  expect(ui.cursor.q).toBe(24);
  expect(app.toast?.msg).toMatch(/Poza zakresem dnia/);
});

test('Shift+strzałka na pustym polu mówi, że nie ma czego przenosić', async () => {
  seed([{ id: 'a', q: 32 }]);
  const { flush, app } = await mountApp();
  const ui = await cursorAt(50);

  key('ArrowRight');
  flush();

  expect(slot(app, 'a')).toBe(32);
  expect(ui.cursor.q).toBe(50);
  expect(app.toast?.msg).toMatch(/nie ma bloku/);
});

test('strzałka bez Shifta nadal rusza tylko kursorem', async () => {
  seed([{ id: 'a', q: 32 }]);
  const { flush, app } = await mountApp();
  const ui = await cursorAt(32);

  key('ArrowRight', false);
  flush();

  expect(slot(app, 'a')).toBe(32);
  expect(ui.cursor.q).toBe(33);
});

test('przeniesienie klawiaturą cofa się jednym Ctrl+Z na krok', async () => {
  seed([{ id: 'a', q: 32 }]);
  const { flush, app } = await mountApp();
  await cursorAt(32);

  key('ArrowRight');
  key('ArrowRight');
  flush();
  expect(slot(app, 'a')).toBe(34);

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
  flush();
  expect(slot(app, 'a')).toBe(33);
});

test('pomoc wymienia przenoszenie blokiem myszą i klawiaturą', async () => {
  seed([]);
  const { flush } = await mountApp();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
  flush();

  const text = document.querySelector('#helpbox')!.textContent!;
  expect(text).toContain('Przeciągnięcie bloku');
  expect(text).toContain('Shift');
  expect(text).toContain('HJKL');
});
