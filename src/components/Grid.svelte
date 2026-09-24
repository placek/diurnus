<script lang="ts">
  import { app, win } from '../state.svelte';
  import HourRow from './HourRow.svelte';

  const blocks = $derived(
    app.S.blocks.filter((b) => b.day === app.viewDay && b.status !== 'discarded'),
  );
  const hours = $derived(Array.from({ length: win.hours }, (_, i) => win.startH + i));
</script>

<main id="grid" style="--hours:{win.hours}">
  {#each hours as hour, row (hour)}
    <HourRow {hour} {row} {blocks} />
  {/each}
</main>
