<script lang="ts">
  import { app } from '../../state.svelte';
  import { backlogList } from '../../lib/view';
  import { createItemWithText } from '../../actions.svelte';
  import BacklogItem from './BacklogItem.svelte';

  const items = $derived(backlogList(app.S.items));

  // Pole początkowe nie jest pozycją w stanie — materializuje się przy
  // pierwszym znaku, tak samo jak w panelu notatek. Nowa pozycja jest BEZ
  // daty: backlog to najpierw „kiedyś", a termin nadaje się osobno.
  let draft = $state('');

  function onDraftInput(e: Event & { currentTarget: HTMLInputElement }) {
    const text = e.currentTarget.value;
    e.currentTarget.value = '';
    draft = '';
    if (text) createItemWithText(text, 'backlog');
  }
</script>

<section id="backlog">
  <h2 class="pane-title">Backlog</h2>
  {#each items as item (item.id)}
    <BacklogItem {item} />
  {/each}

  <div class="item backlog-item is-draft">
    <span class="bullet t-task" aria-hidden="true">·</span>
    <input
      class="item-text"
      value={draft}
      maxlength="200"
      autocomplete="off"
      aria-label="Nowa pozycja backlogu"
      placeholder="Zaplanuj coś…"
      oninput={onDraftInput}
    />
  </div>
</section>
