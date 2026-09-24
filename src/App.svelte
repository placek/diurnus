<script lang="ts">
  import { app, startClock, startCrossTabSync } from './state.svelte';
  import { activeBlock } from './lib/occupancy';
  import { catOf } from './lib/categories';
  import { pad, qTime } from './lib/time';
  import Grid from './components/Grid.svelte';

  $effect(() => startClock());
  $effect(() => startCrossTabSync());

  // Tytuł karty pokazuje odliczanie aktywnego bloku — timer widoczny bez
  // przełączania się na zakładkę.
  $effect(() => {
    const b = activeBlock(app.S.blocks);
    if (!b) {
      document.title = 'GridDay';
      return;
    }
    const left = Math.max(0, qTime(b.day, b.q + b.len) - app.now);
    const t = `${Math.floor(left / 60000)}:${pad(Math.floor(left / 1000) % 60)}`;
    document.title = `${t}  ${b.title || catOf(app.S.cats, b.cat).name}`;
  });
</script>

<Grid />
