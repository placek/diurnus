<script lang="ts">
  import { ui } from '../state.svelte';
  import Grid from './Grid.svelte';
  import List from './list/List.svelte';
  import Backlog from './backlog/Backlog.svelte';

  // Trzy panele potrzebują mniej więcej półtora raza tyle miejsca co dwa.
  const WIDE = '(min-width: 1300px)';
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
  {#if wide || ui.pane === 'backlog'}<Backlog />{/if}
</div>
