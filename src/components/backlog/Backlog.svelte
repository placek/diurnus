<script lang="ts">
  import { app, currentDay } from '../../state.svelte';
  import { backlogItems, sortBacklog } from '../../lib/backlog';
  import BacklogItem from './BacklogItem.svelte';

  const items = $derived(sortBacklog(backlogItems(app.S.items, currentDay.value)));
</script>

<section id="backlog">
  <h2 class="pane-title">Backlog</h2>
  {#if items.length === 0}
    <p class="list-empty">Nic nie czeka.</p>
  {/if}
  {#each items as item (item.id)}
    <BacklogItem {item} />
  {/each}
</section>
