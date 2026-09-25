// @vitest-environment jsdom
import { test, expect, beforeEach } from 'vitest';
import { strToU8 } from 'fflate';
import { collect, filesToZip } from '../src/lib/md/archive';
import { parseFiles } from '../src/lib/md/files';
import { shiftDay } from '../src/lib/time';
import { TODAY, backlog, done, mountApp, note, resetDom, seed, task } from './helpers';

let downloaded: { name: string; blob: Blob } | null = null;

beforeEach(() => {
  resetDom();
  downloaded = null;
  let last: Blob | null = null;
  URL.createObjectURL = (b: Blob) => {
    last = b;
    return 'blob:x';
  };
  URL.revokeObjectURL = () => {};
  HTMLAnchorElement.prototype.click = function () {
    downloaded = { name: this.download, blob: last! };
  };
  window.confirm = () => true;
});

async function openData() {
  const env = await mountApp();
  env.ui.settings = 'data';
  env.flush();
  return env;
}

const button = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('.ce-list button')].find((b) =>
    b.textContent?.includes(label),
  )!;

async function pick(files: File[], flush: () => void) {
  const input = document.querySelector<HTMLInputElement>('.ce-list input[type="file"]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  // Odczyt plików jest asynchroniczny — czekamy, aż wszystkie obietnice się rozstrzygną.
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
  flush();
}

const DAY_FILE = `# ${TODAY}\n\n* [ ] 09:00 #nauka Czytanie\n* [x] Zakupy\n`;
const BACKLOG_FILE = `# Backlog\n\n* [ ] ${shiftDay(TODAY, 3)} Dentysta\n`;
const CONFIG_FILE = `[day]\nstart = 6\nend = 22\n\n[[categories]]\ntag = "nauka"\nname = "Nauka"\ncolor = "blue"\n`;
const zipFile = (files: Record<string, string>, name = 'diurnus.zip') =>
  new File([filesToZip(files) as BlobPart], name, { type: 'application/zip' });

test('pobranie zapisuje archiwum ZIP z plikami dziennika, które wczytują się z powrotem', async () => {
  seed([task('a', 36, { text: 'Czytanie', cat: 'learn' }), done('b'), note('n'), backlog('c')]);
  const { flush, app } = await openData();

  button('Pobierz dziennik').click();
  flush();

  expect(downloaded!.name).toBe(`diurnus-${TODAY}.zip`);
  const bytes = new Uint8Array(await downloaded!.blob.arrayBuffer());
  const got = collect([{ name: downloaded!.name, bytes }]);
  if (!got.ok) throw new Error(got.errors.join());
  expect(Object.keys(got.files).sort()).toEqual(['.diurnus.toml', `${TODAY}.md`, 'BACKLOG.md']);
  expect(got.files[`${TODAY}.md`]).toContain('* [ ] 09:00 #nauka Czytanie');
  expect(parseFiles(got.files).ok).toBe(true);
  expect(app.toast?.msg).toMatch(/3 pliki/);
});

test('wczytanie archiwum zastępuje stan i czyści historię cofania', async () => {
  seed([task('stary')]);
  const { flush, app, state } = await openData();
  state.pushHistory();

  await pick(
    [
      zipFile({
        [`${TODAY}.md`]: DAY_FILE,
        'BACKLOG.md': BACKLOG_FILE,
        '.diurnus.toml': CONFIG_FILE,
      }),
    ],
    flush,
  );

  expect(app.S.items.map((i) => i.text)).toEqual(['Czytanie', 'Zakupy', 'Dentysta']);
  expect(app.S.cats.map((c) => c.id)).toEqual(['nauka']);
  expect(app.toast?.msg).toBe('Dziennik wczytany');
  expect(document.querySelector('#settings, .ce-list')).toBeNull();

  state.undo(); // nie ma czego cofać
  expect(app.S.items.map((i) => i.text)).toEqual(['Czytanie', 'Zakupy', 'Dentysta']);
});

test('pliki zaznaczone luzem też się wczytują, ustawienia mogą być bez kropki', async () => {
  seed([]);
  const { flush, app } = await openData();
  await pick([new File([DAY_FILE], `${TODAY}.md`), new File([CONFIG_FILE], 'diurnus.toml')], flush);
  expect(app.S.items.map((i) => i.text)).toEqual(['Czytanie', 'Zakupy']);
});

test('błędny plik nie wczytuje niczego i pokazuje plik, linię i powód', async () => {
  seed([task('stary')]);
  const { flush, app } = await openData();
  await pick(
    [zipFile({ [`${TODAY}.md`]: `# ${TODAY}\n\n* [ ] 09:07 Źle\n`, '.diurnus.toml': CONFIG_FILE })],
    flush,
  );

  expect(app.S.items.map((i) => i.id)).toEqual(['stary']);
  const box = document.querySelector('.import-errors')!;
  expect(box.textContent).toContain(`${TODAY}.md:3:`);
  expect(box.textContent).toMatch(/kwadransem/);
});

test('odmowa w potwierdzeniu zostawia stan', async () => {
  seed([task('stary')]);
  window.confirm = () => false;
  const { flush, app } = await openData();
  await pick([zipFile({ [`${TODAY}.md`]: DAY_FILE, '.diurnus.toml': CONFIG_FILE })], flush);
  expect(app.S.items.map((i) => i.id)).toEqual(['stary']);
});

test('starsza kopia JSON nadal się wczytuje', async () => {
  seed([]);
  const { flush, app } = await openData();
  const old = JSON.stringify({
    magic: 'diurnus.backup',
    state: {
      v: 6,
      cats: [{ id: 'learn', name: 'Nauka', icon: null, color: 'blue', parent: null }],
      day: { start: 6, end: 22, bands: [] },
      today: TODAY,
      items: [{ id: 'x', text: 'Z kopii', state: { tag: 'today-note' } }],
    },
  });
  await pick([new File([strToU8(old) as BlobPart], 'diurnus-2026-09-01.json')], flush);
  expect(app.S.items.map((i) => i.text)).toEqual(['Z kopii']);
});

test('uszkodzony JSON mówi, co jest nie tak', async () => {
  seed([task('stary')]);
  const { flush, app } = await openData();
  await pick([new File(['<html>'], 'kopia.json')], flush);
  expect(app.S.items.map((i) => i.id)).toEqual(['stary']);
  expect(document.querySelector('.import-errors')!.textContent).toMatch(/JSON/);
});

test('wczytany dziennik z przeszłości dogania dzisiejszy dzień', async () => {
  seed([]);
  const { flush, app } = await openData();
  const y = shiftDay(TODAY, -1);
  await pick(
    [
      zipFile({
        [`${y}.md`]: `# ${y}\n\n* [ ] Wczorajsze\n* [x] Zrobione\n`,
        '.diurnus.toml': CONFIG_FILE,
      }),
    ],
    flush,
  );
  expect(app.S.today).toBe(TODAY);
  expect(app.S.items.find((i) => i.text === 'Wczorajsze')!.state.tag).toBe('today-task');
  expect(app.S.items.find((i) => i.text === 'Zrobione')!.state).toEqual({
    tag: 'past-done',
    day: y,
    slot: null,
  });
});

test('przycisk dawnej kopii JSON zniknął', async () => {
  seed([]);
  await openData();
  const labels = [...document.querySelectorAll('.ce-list button')].map((b) =>
    b.textContent?.trim(),
  );
  expect(labels.some((l) => l?.includes('kopię zapasową'))).toBe(false);
  expect(labels.some((l) => l?.includes('Markdown'))).toBe(true);
});
