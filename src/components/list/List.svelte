<script lang="ts">
  import { app } from '../../state.svelte';
  import { dayItems } from '../../lib/items';

  const items = $derived(dayItems(app.S.items, app.viewDay));
</script>

<section id="list">
  {#if items.length === 0}
    <p class="list-empty">Zacznij pisać, żeby dodać pierwszą pozycję.</p>
  {/if}
</section>
