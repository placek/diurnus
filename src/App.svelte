<script lang="ts">
  import { app, savePrefs, startClock, startCrossTabSync } from './state.svelte';
  import { activeBlock } from './lib/occupancy';
  import { catOf } from './lib/categories';
  import { nextTheme, themeColor } from './lib/theme';
  import { pad, qTime } from './lib/time';
  import Grid from './components/Grid.svelte';
  import Header from './components/Header.svelte';

  $effect(() => startClock());
  $effect(() => startCrossTabSync());

  // Motyw: 'auto' zostawia decyzję medium query, więc atrybut jest usuwany,
  // a nie ustawiany na zgadywaną wartość.
  $effect(() => {
    const t = app.prefs.theme;
    const root = document.documentElement;
    if (t === 'auto') delete root.dataset.theme;
    else root.dataset.theme = t;

    const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', themeColor(t, systemDark));
  });

  // Tytuł karty pokazuje odliczanie aktywnego bloku — timer widoczny bez
  // przełączania się na zakładkę.
  $effect(() => {
    const b = activeBlock(app.S.blocks);
    if (!b) {
      document.title = 'GridDay';
      return;
    }
    const left = Math.max(0, qTime(b.day, b.q + b.len) - app.now);
    document.title =
      `${Math.floor(left / 60000)}:${pad(Math.floor(left / 1000) % 60)}  ` +
      `${b.title || catOf(app.S.cats, b.cat).name}`;
  });

  function cycleTheme() {
    app.prefs.theme = nextTheme(app.prefs.theme);
    savePrefs();
  }
</script>

<Header onTheme={cycleTheme} />
<Grid />
