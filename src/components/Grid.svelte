<script lang="ts">
  import { app, win, currentDay } from '../state.svelte';
  import { consumeSwallowedClick } from '../actions.svelte';
  import HourRow from './HourRow.svelte';

  const blocks = $derived(
    app.S.blocks.filter((b) => b.day === currentDay.value && b.status !== 'discarded'),
  );
  const hours = $derived(Array.from({ length: win.hours }, (_, i) => win.startH + i));
</script>

<!-- Faza przechwytywania: echo przeciągnięcia ma nie dotrzeć ani do bloku,
     ani do komórki pod nim. -->
<main
  id="grid"
  style="--hours:{win.hours}"
  onclickcapture={(e) => {
    if (consumeSwallowedClick()) e.stopPropagation();
  }}
>
  {#each hours as hour, row (hour)}
    <HourRow {hour} {row} {blocks} />
  {/each}
</main>
