<script lang="ts">
  import { app } from '../../state.svelte';
  import { createItemWithText } from '../../actions.svelte';
  import { dayItems } from '../../lib/items';
  import ListItem from './ListItem.svelte';

  const items = $derived(dayItems(app.S.items, app.viewDay));

  // Pole początkowe NIE jest pozycją w stanie. Gdyby nią było, samo obejrzenie
  // dnia zapisywałoby pustą pozycję — a po tygodniu przeglądania kalendarza
  // kopia zapasowa byłaby pełna pustych wierszy.
  let draft = $state('');

  function onDraftInput(e: Event & { currentTarget: HTMLInputElement }) {
    const text = e.currentTarget.value;
    e.currentTarget.value = '';
    draft = '';
    if (text) createItemWithText(text);
  }
</script>

<section id="list">
  {#each items as item (item.id)}
    <ListItem {item} />
  {/each}

  <div class="item t-task is-draft">
    <span class="bullet t-task" aria-hidden="true">·</span>
    <input
      class="item-text"
      value={draft}
      maxlength="200"
      autocomplete="off"
      aria-label="Nowa pozycja"
      placeholder={items.length === 0 ? 'Zacznij pisać…' : ''}
      oninput={onDraftInput}
    />
  </div>
</section>
