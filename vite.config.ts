// defineConfig pochodzi z vitest/config, nie z vite: tylko ten wariant zna
// klucz `test`, więc konfiguracja testów jest sprawdzana typami zamiast
// przechodzić jako nieznane pole.
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  // GitHub Pages serwuje projekt pod /gridday/; Makefile ustawia / dla dev.
  base: process.env.BASE_PATH ?? '/',
  plugins: [svelte()],
  build: { target: 'es2022' },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
