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

type Seed = { id: string; q: number; len?: number; status?: string; title?: string };

function seed(blocks: Seed[]) {
  localStorage.setItem('diurnus.prefs', JSON.stringify({ theme: 'auto', seenHelp: true }));
  localStorage.setItem(
    'diurnus.v1',
    JSON.stringify({
      v: 5,
      cats: [{ id: 'work', name: 'Praca', icon: 'laptop-code', color: 'yellow', parent: null }],
      day: { start: 6, end: 22, bands: [] },
      blocks: blocks.map((b) => ({
        id: b.id,
        day: today(),
        q: b.q,
        len: b.len ?? 2,
        cat: 'work',
        title: b.title ?? '',
        status: b.status ?? 'planned',
        created: 0,
      })),
      items: [],
    }),
  );
}

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

  const a = app.S.blocks.find((b) => b.id === 'a')!;
  expect(a.q).toBe(40);
  expect(a.len).toBe(2);
  expect(document.querySelector('#grid .blk[data-id="a"]')!.getAttribute('style')).toMatch(
    /grid-column:\s*2\/span 2/,
  );
  expect(app.toast?.msg).toMatch(/10:00/);
});

test('blok idzie za kursorem: chwyt za drugi kwant zachowuje przesunięcie', async () => {
  seed([{ id: 'a', q: 32 }]);
  const { flush, app } = await mountApp();

  drag(blockEl('a'), 33, 41, flush);

  expect(app.S.blocks.find((b) => b.id === 'a')!.q).toBe(40);
});

test('upuszczenie na zajęte miejsce nic nie zmienia i mówi dlaczego', async () => {
  seed([
    { id: 'a', q: 32 },
    { id: 'b', q: 40 },
  ]);
  const { flush, app } = await mountApp();

  drag(blockEl('a'), 32, 40, flush);

  expect(app.S.blocks.find((b) => b.id === 'a')!.q).toBe(32);
  expect(app.S.blocks.find((b) => b.id === 'b')!.q).toBe(40);
  expect(app.toast?.msg).toMatch(/zajęte/);
});

test('częściowe nałożenie na sąsiada też jest zajęte', async () => {
  seed([
    { id: 'a', q: 32 },
    { id: 'b', q: 40 },
  ]);
  const { flush, app } = await mountApp();

  drag(blockEl('a'), 32, 39, flush); // [39, 41) zahacza o b
  expect(app.S.blocks.find((b) => b.id === 'a')!.q).toBe(32);

  drag(blockEl('a'), 32, 38, flush); // [38, 40) przylega do b
  expect(app.S.blocks.find((b) => b.id === 'a')!.q).toBe(38);
});

test('blok musi zmieścić się w oknie dnia w całości', async () => {
  seed([{ id: 'a', q: 32 }]);
  const { flush, app } = await mountApp();

  drag(blockEl('a'), 32, 87, flush); // 21:45–22:15 wystaje poza 22:00
  expect(app.S.blocks.find((b) => b.id === 'a')!.q).toBe(32);
  expect(app.toast?.msg).toMatch(/Poza zakresem dnia 06:00–22:00/);

  drag(blockEl('a'), 32, 86, flush); // 21:30–22:00 mieści się
  expect(app.S.blocks.find((b) => b.id === 'a')!.q).toBe(86);
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
  expect(app.S.blocks.find((b) => b.id === 'a')!.q).toBe(32);
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
  expect(app.S.blocks.find((b) => b.id === 'a')!.q).toBe(32);
});

test('ruch poniżej progu nie przeciąga, a klik awansuje blok', async () => {
  seed([{ id: 'a', q: 32, status: 'suggested' }]);
  const { flush, app } = await mountApp();
  const el = blockEl('a');

  pointer(el, 'pointerdown', 32);
  pointer(el, 'pointermove', 33); // 1 px — poniżej progu 4 px
  flush();
  pointer(el, 'pointerup', 33);
  el.click();
  flush();

  const a = app.S.blocks.find((b) => b.id === 'a')!;
  expect(a.q).toBe(32);
  expect(a.status).not.toBe('suggested'); // klik zadziałał
});

test('po przeciągnięciu klik NIE awansuje bloku', async () => {
  seed([{ id: 'a', q: 32, status: 'suggested' }]);
  const { flush, app } = await mountApp();
  const el = blockEl('a');

  drag(el, 32, 40, flush);
  // Przeglądarka wysyła click po przeciągnięciu — a przeniesiony blok jest
  // już NOWYM elementem w innym rzędzie, więc klikamy w niego, nie w stary.
  blockEl('a').click();
  flush();

  const a = app.S.blocks.find((b) => b.id === 'a')!;
  expect(a.q).toBe(40);
  expect(a.status).toBe('suggested');
});

test('echo przeciągnięcia nie otwiera menu ani nie awansuje bloku przez komórkę pod nim', async () => {
  seed([{ id: 'a', q: 32, status: 'suggested' }]);
  const { flush, app } = await mountApp();

  drag(blockEl('a'), 32, 40, flush);
  document.querySelector<HTMLElement>('#grid .cell[data-q="40"]')!.click();
  flush();

  expect(app.S.blocks.find((b) => b.id === 'a')!.status).toBe('suggested');
  expect(document.querySelector('#radial')).toBeNull();
});

test('zwykłe kliknięcie po zakończonym przeciągnięciu znów działa', async () => {
  seed([{ id: 'a', q: 32, status: 'suggested' }]);
  const { flush, app } = await mountApp();

  drag(blockEl('a'), 32, 40, flush);
  blockEl('a').click(); // echo — połknięte
  flush();
  expect(app.S.blocks.find((b) => b.id === 'a')!.status).toBe('suggested');

  blockEl('a').click(); // prawdziwe kliknięcie
  flush();
  expect(app.S.blocks.find((b) => b.id === 'a')!.status).not.toBe('suggested');
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

  expect(app.S.blocks.find((b) => b.id === 'a')!.q).toBe(32);
});

test('nowa godzina utrwala się w localStorage', async () => {
  seed([{ id: 'a', q: 32 }]);
  const { flush } = await mountApp();

  drag(blockEl('a'), 32, 40, flush);

  const saved = JSON.parse(localStorage.getItem('diurnus.v1') ?? '{}');
  expect(saved.blocks.find((b: { id: string }) => b.id === 'a').q).toBe(40);
});

test('cofnięcie przywraca poprzednią godzinę', async () => {
  seed([{ id: 'a', q: 32 }]);
  const { flush, app } = await mountApp();
  const { undo } = await import('../src/state.svelte');

  drag(blockEl('a'), 32, 40, flush);
  expect(app.S.blocks.find((b) => b.id === 'a')!.q).toBe(40);

  undo();
  flush();
  expect(app.S.blocks.find((b) => b.id === 'a')!.q).toBe(32);
});

test('pozycja powiązana na liście pokazuje nową godzinę bloku', async () => {
  seed([{ id: 'a', q: 32, title: 'Nauka' }]);
  const { flush } = await mountApp();
  expect(document.querySelector('#list .item-hour')!.textContent).toBe('08:00');

  drag(blockEl('a'), 32, 40, flush);

  expect(document.querySelector('#list .item-hour')!.textContent).toBe('10:00');
});

test('blok w toku przeniesiony w przyszłość przestaje trwać', async () => {
  seed([{ id: 'a', q: 40, status: 'active' }]);
  const { flush, app } = await mountApp();
  const d = new Date();
  app.now = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 7).getTime();
  flush();

  drag(blockEl('a'), 40, 60, flush);

  const a = app.S.blocks.find((b) => b.id === 'a')!;
  expect(a.q).toBe(60);
  expect(a.status).toBe('planned');
});
