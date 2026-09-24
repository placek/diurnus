<script lang="ts">
  import { app, win, startClock, startCrossTabSync } from './state.svelte';
  import { fmtQ } from './lib/time';

  $effect(() => startClock());
  $effect(() => startCrossTabSync());
</script>

<main>
  <h1>GridDay</h1>
  <p>Dzień: {app.viewDay} · okno {fmtQ(app.viewDay, win.q0)}–{fmtQ(app.viewDay, win.q1)}</p>
  <p>Bloków: {app.S.blocks.length} · kategorii: {app.S.cats.length}</p>
</main>
