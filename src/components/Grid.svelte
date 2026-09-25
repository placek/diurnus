<script lang="ts">
  import { app, win } from '../state.svelte';
  import { timedToday } from '../lib/view';
  import { consumeSwallowedClick } from '../actions.svelte';
  import HourRow from './HourRow.svelte';

  // Siatka nie ma własnych danych: to rzut dzisiejszych zadań ze slotem.
  const items = $derived(timedToday(app.S.items));
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
    <HourRow {hour} {row} {items} />
  {/each}
</main>
