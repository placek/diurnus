import { test, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Logo i favicon: SVG w kolorach gruvbox dla jasnego i ciemnego motywu systemu,
// PNG dla przeglądarek bez ikon SVG i dla ekranu początkowego iOS.
const file = (p: string) => resolve(process.cwd(), p);

test('index.html wskazuje favicon SVG, PNG zastępczy i ikonę iOS', () => {
  const html = readFileSync(file('index.html'), 'utf8');
  expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
  expect(html).toContain(
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />',
  );
  expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
  for (const f of ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png'])
    expect(existsSync(file(`public/${f}`)), f).toBe(true);
});

test('favicon ma barwy gruvbox: jasne tło z zielenią, a w ciemnym motywie ciemne tło z jasną zielenią', () => {
  const svg = readFileSync(file('public/favicon.svg'), 'utf8');
  expect(svg).toMatch(/\.bg \{ fill: #fbf1c7 \}/);
  expect(svg).toMatch(/\.fg \{ color: #79740e \}/);
  const dark =
    /@media \(prefers-color-scheme: dark\) \{([\s\S]*?)\}\s*<\/style>/.exec(svg)?.[1] ?? '';
  expect(dark).toContain('fill: #282828');
  expect(dark).toContain('color: #b8bb26');
});

test('logo w pasku to ten sam rysunek co favicon', () => {
  const svg = readFileSync(file('public/favicon.svg'), 'utf8');
  const logo = readFileSync(file('src/components/Logo.svelte'), 'utf8');
  const d = 'M52 16C80 16 90 36 90 65S80 114 52 114';
  const grid = 'M0 42H120M0 88H120M100 64H116M58 16V42M58 88V114M31 42V114';
  for (const part of [d, grid, 'cx="58" cy="65" r="12"']) {
    expect(svg).toContain(part);
    expect(logo).toContain(part);
  }
});
