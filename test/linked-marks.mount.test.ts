// @vitest-environment jsdom
import { test, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem('diurnus.prefs', JSON.stringify({ theme: 'auto', seenHelp: true }));
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
});

async function mountApp() {
  const { mount, flushSync } = await import('svelte');
  const App = (await import('../src/App.svelte')).default;
  mount(App, { target: document.body });
  flushSync();
  return flushSync;
}

const linkedBullet = () => document.querySelector<HTMLElement>('#list .item.is-linked .bullet')!;
const gridBlock = () => document.querySelector<HTMLElement>('#grid .blk:not(.ghost)')!;

/** Blok w przyszłości — powstaje jako `planned`, niezależnie od pory testu. */
async function createFutureBlock(flush: () => void) {
  const { app } = await import('../src/state.svelte');
  const { uid, currentDay } = await import('../src/state.svelte');
  const { commit } = await import('../src/state.svelte');
  commit(() => {
    app.S.blocks.push({
      id: uid(), day: currentDay.value, q: 86, len: 2, cat: 'learn',
      title: '', status: 'planned', created: 0,
    });
  });
  flush();
}

test('potwierdzenie bloku zmienia znacznik pozycji na wykonane', async () => {
  const flush = await mountApp();
  const { app, commit, currentDay } = await import('../src/state.svelte');
  await createFutureBlock(flush);
  expect(linkedBullet().textContent).toBe('·');

  commit(() => (app.S.blocks[0]!.status = 'confirmed'));
  flush();
  expect(linkedBullet().textContent).toBe('×');
});

test('cofnięcie bloku do planu zdejmuje znacznik wykonania', async () => {
  const flush = await mountApp();
  const { app, commit, currentDay } = await import('../src/state.svelte');
  await createFutureBlock(flush);
  commit(() => (app.S.blocks[0]!.status = 'confirmed'));
  flush();

  commit(() => (app.S.blocks[0]!.status = 'planned'));
  flush();
  expect(linkedBullet().textContent).toBe('·');
});

test('klik w znacznik pozycji powiązanej potwierdza blok', async () => {
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  await createFutureBlock(flush);

  linkedBullet().click();
  flush();
  expect(app.S.blocks[0]!.status).toBe('confirmed');
  expect(linkedBullet().textContent).toBe('×');
  expect(gridBlock().classList.contains('st-confirmed')).toBe(true);
});

test('ponowny klik cofa blok do planu', async () => {
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  await createFutureBlock(flush);

  linkedBullet().click();
  flush();
  linkedBullet().click();
  flush();
  expect(app.S.blocks[0]!.status).toBe('planned');
  expect(linkedBullet().textContent).toBe('·');
});

test('Tab na pozycji powiązanej też przełącza status bloku', async () => {
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');
  await createFutureBlock(flush);

  const input = document.querySelector<HTMLInputElement>('#list .item.is-linked .item-text')!;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  flush();
  expect(app.S.blocks[0]!.status).toBe('confirmed');
});

test('Tab na pozycji swobodnej nadal cykluje jej znacznik', async () => {
  const flush = await mountApp();
  const d = document.querySelector<HTMLInputElement>('#list .is-draft .item-text')!;
  d.value = 'Notatka';
  d.dispatchEvent(new Event('input', { bubbles: true }));
  flush();

  const free = document.querySelector<HTMLInputElement>('#list .item:not(.is-linked):not(.is-draft) .item-text')!;
  free.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  flush();
  const bullet = document.querySelector('#list .item:not(.is-linked):not(.is-draft) .bullet')!;
  expect(bullet.textContent).toBe('×');
});

test('menu pozycji powiązanej nie oferuje żadnych znaczników', async () => {
  // Znacznik pozycji powiązanej JEST statusem bloku, a przenoszenie między
  // dniami odbywa się przeciągnięciem do backlogu — menu nie ma co pokazać.
  const flush = await mountApp();
  await createFutureBlock(flush);

  linkedBullet().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  flush();
  expect(document.querySelectorAll('.bullet-menu button')).toHaveLength(0);
});

test('menu pozycji swobodnej oferuje trzy znaczniki', async () => {
  const flush = await mountApp();
  const d = document.querySelector<HTMLInputElement>('#list .is-draft .item-text')!;
  d.value = 'Notatka';
  d.dispatchEvent(new Event('input', { bubbles: true }));
  flush();

  const bullet = document.querySelector<HTMLElement>('#list .item:not(.is-linked):not(.is-draft) .bullet')!;
  bullet.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  flush();
  const labels = [...document.querySelectorAll('.bullet-menu button')].map((b) => b.textContent?.trim());
  expect(labels).toEqual(['·Zadanie', '×Wykonane', '–Notatka', '#Kategoria…']);
});

test('zegar domykający blok aktualizuje też znacznik na liście', async () => {
  const flush = await mountApp();
  const { app, commit, currentDay, uid } = await import('../src/state.svelte');

  // Blok w toku, którego czas właśnie minął.
  commit(() => {
    app.S.blocks.push({
      id: uid(), day: currentDay.value, q: 0, len: 2, cat: 'learn',
      title: '', status: 'active', created: 0,
    });
  });
  flush();
  expect(linkedBullet().textContent).toBe('·');

  app.now = Date.now(); // wyzwala autoConfirm w tyknięciu zegara
  const { tickOnce } = await import('../src/state.svelte');
  tickOnce();
  flush();
  expect(app.S.blocks[0]!.status).toBe('confirmed');
  expect(linkedBullet().textContent).toBe('×');
});

test('prawy przycisk na znaczniku pozycji powiązanej nie otwiera pustego menu', async () => {
  // Menu dla pozycji powiązanej nie ma czego pokazać — lepiej go nie otwierać
  // niż pokazać pustą ramkę.
  const flush = await mountApp();
  await createFutureBlock(flush);

  const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  linkedBullet().dispatchEvent(ev);
  flush();

  expect(document.querySelector('.bullet-menu')).toBeNull();
  // Skoro nic nie pokazujemy, nie blokujemy też menu przeglądarki.
  expect(ev.defaultPrevented).toBe(false);
});

test('prawy przycisk na znaczniku pozycji swobodnej nadal otwiera menu', async () => {
  const flush = await mountApp();
  const d = document.querySelector<HTMLInputElement>('#list .is-draft .item-text')!;
  d.value = 'Notatka';
  d.dispatchEvent(new Event('input', { bubbles: true }));
  flush();

  const bullet = document.querySelector<HTMLElement>('#list .item:not(.is-linked):not(.is-draft) .bullet')!;
  const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  bullet.dispatchEvent(ev);
  flush();

  expect(document.querySelector('.bullet-menu')).not.toBeNull();
  expect(ev.defaultPrevented).toBe(true);
});

test('ton pozycji powiązanej idzie za stanem bloku', async () => {
  const flush = await mountApp();
  const { app, commit } = await import('../src/state.svelte');
  await createFutureBlock(flush); // blok o 21:30, więc jeszcze przed nami

  const row = () => document.querySelector('#list .item.is-linked')!;
  expect(row().classList.contains('tone-incoming')).toBe(true);

  commit(() => (app.S.blocks[0]!.status = 'active'));
  flush();
  expect(row().classList.contains('tone-active')).toBe(true);

  commit(() => (app.S.blocks[0]!.status = 'confirmed'));
  flush();
  expect(row().classList.contains('tone-done')).toBe(true);
});

test('zaplanowany blok, któremu minął czas, dostaje ton przegapionego', async () => {
  const flush = await mountApp();
  const { app, commit, uid } = await import('../src/state.svelte');
  const { currentDay } = await import('../src/state.svelte');

  commit(() => {
    app.S.blocks.push({
      id: uid(), day: currentDay.value, q: 0, len: 2, cat: 'learn',
      title: '', status: 'planned', created: 0,
    });
  });
  flush();

  const row = document.querySelector('#list .item.is-linked')!;
  expect(row.classList.contains('tone-missed')).toBe(true);
});

test('zwykła notatka nie dostaje tonu zadania', async () => {
  const flush = await mountApp();
  const d = document.querySelector<HTMLInputElement>('#list .is-draft .item-text')!;
  d.value = 'Notatka';
  d.dispatchEvent(new Event('input', { bubbles: true }));
  flush();

  const free = document.querySelector('#list .item:not(.is-linked):not(.is-draft)')!;
  expect(free.classList.contains('tone-incoming')).toBe(true);

  const bullet = free.querySelector<HTMLElement>('.bullet')!;
  bullet.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  flush();
  [...document.querySelectorAll<HTMLElement>('.bullet-menu button')]
    .find((b) => b.textContent?.includes('Notatka'))!.click();
  flush();
  expect(document.querySelector('#list .item:not(.is-linked):not(.is-draft)')!.classList.contains('tone-note')).toBe(true);
});

test('menu znacznika otwiera się w miejscu kliknięcia, nie w wierszu', async () => {
  // Pozycja z kliknięcia plus `fixed` to jedyny sposób, żeby menu nie było
  // obcinane przez przewijany panel przy górnych pozycjach listy.
  const flush = await mountApp();
  const d = document.querySelector<HTMLInputElement>('#list .is-draft .item-text')!;
  d.value = 'Notatka';
  d.dispatchEvent(new Event('input', { bubbles: true }));
  flush();

  const bullet = document.querySelector<HTMLElement>('#list .item:not(.is-linked):not(.is-draft) .bullet')!;
  bullet.dispatchEvent(
    new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 240, clientY: 380 }),
  );
  flush();

  const menu = document.querySelector<HTMLElement>('.bullet-menu')!;
  expect(menu).not.toBeNull();
  // jsdom nie liczy układu, więc przycięcie nic nie zmienia — sprawdzamy,
  // że menu w ogóle dostaje współrzędne kliknięcia.
  expect(menu.style.left).toBe('240px');
  expect(menu.style.top).toBe('380px');
});
