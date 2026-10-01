// @vitest-environment jsdom
import { test, expect, beforeEach } from 'vitest';
import { mountApp, resetDom, seed, task } from './helpers';

/*
 * Pasek ma po prawej tylko ustawienia i pomoc (i chmurę synchronizacji).
 * Motyw wybiera się w Ustawienia → Dzień, link do kodu jest w pomocy, a pomoc
 * zamyka też krzyżyk w rogu.
 */

beforeEach(() => resetDom());

const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
  );

test('pomoc: link do kodu w nowej karcie i krzyżyk, który ją zamyka', async () => {
  seed([task('a')]);
  const { ui, flush } = await mountApp();
  button(document.querySelector('#top')!, 'Pomoc')!.click();
  flush();
  const box = document.querySelector('#helpbox')!;
  const link = box.querySelector<HTMLAnchorElement>('a[href="https://github.com/placek/diurnus"]')!;
  expect(link.target).toBe('_blank');
  expect(link.rel).toBe('noopener noreferrer');
  expect(link.querySelector('.ic')).not.toBeNull(); // ikona GitHuba, nie litera zastępcza

  button(box, 'Zamknij')!.click();
  flush();
  expect(ui.help).toBe(false);
  expect(document.querySelector('#helpbox')).toBeNull();
});

test('motyw: Ustawienia → Dzień, działa od razu i zostaje w pamięci przeglądarki', async () => {
  seed([task('a')]);
  const { app, ui, flush } = await mountApp();
  ui.settings = 'day';
  flush();
  const group = document.querySelector('.dy-theme')!;
  const radio = (v: string) => group.querySelector<HTMLInputElement>(`input[value="${v}"]`)!;
  expect(radio('auto').checked).toBe(true);
  expect([...group.querySelectorAll('label')].map((l) => l.textContent?.trim())).toEqual([
    'Systemowy',
    'Jasny',
    'Ciemny',
  ]);

  radio('dark').click();
  flush();
  expect(app.prefs.theme).toBe('dark');
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(JSON.parse(localStorage.getItem('diurnus.prefs')!).theme).toBe('dark');

  radio('auto').click();
  flush();
  expect(document.documentElement.dataset.theme).toBeUndefined();
});
