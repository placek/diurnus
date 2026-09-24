<script lang="ts">
  import { app } from '../../state.svelte';
  import { addItemAfter } from '../../actions.svelte';
  import { dayItems } from '../../lib/items';
  import ListItem from './ListItem.svelte';

  const items = $derived(dayItems(app.S.items, app.viewDay));

  // Pusty dzień dostaje jedną pustą pozycję, żeby było w co pisać —
  // „zacznij pisać" bez pola do pisania byłoby ślepym zaułkiem.
  $effect(() => {
    if (items.length === 0) addItemAfter(null);
  });
</script>

<section id="list">
  {#each items as item (item.id)}
    <ListItem {item} />
  {/each}
</section>
