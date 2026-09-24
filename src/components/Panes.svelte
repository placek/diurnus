<script lang="ts">
  import { ui } from '../state.svelte';
  import Grid from './Grid.svelte';
  import List from './list/List.svelte';

  // Dwa panele potrzebują mniej więcej tyle miejsca, ile dotąd miał cały
  // ekran, więc próg jest wyżej niż istniejące 560px w arkuszu.
  const WIDE = '(min-width: 900px)';
  let wide = $state(true);

  $effect(() => {
    const mq = matchMedia(WIDE);
    wide = mq.matches;
    ui.narrow = !mq.matches;
    const on = (e: MediaQueryListEvent) => {
      wide = e.matches;
      ui.narrow = !e.matches;
    };
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  });
</script>

<div id="panes" class:narrow={!wide}>
  {#if wide || ui.pane === 'grid'}<Grid />{/if}
  {#if wide || ui.pane === 'list'}<List />{/if}
</div>
