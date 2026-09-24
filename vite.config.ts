// defineConfig pochodzi z vitest/config, nie z vite: tylko ten wariant zna
// klucz `test`, więc konfiguracja testów jest sprawdzana typami zamiast
// przechodzić jako nieznane pole.
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  // GitHub Pages serwuje projekt pod /diurnus/; Makefile ustawia / dla dev.
  base: process.env.BASE_PATH ?? '/',
  plugins: [svelte()],
  build: { target: 'es2022' },
  test: {
    // Dwa zestawy, bo potrzebują przeciwnych wariantów kompilacji Svelte:
    // testy renderu używają builda serwerowego (render() z svelte/server),
    // a testy montowania klienckiego (mount()) wymagają warunku `browser`.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          exclude: ['test/**/*.mount.test.ts'],
        },
      },
      {
        extends: true,
        resolve: { conditions: ['browser'] },
        test: {
          name: 'mount',
          environment: 'jsdom',
          include: ['test/**/*.mount.test.ts'],
        },
      },
    ],
  },
});
