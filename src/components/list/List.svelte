<script lang="ts">
  import { app, ui } from '../../state.svelte';
  import { createItemWithText } from '../../actions.svelte';
  import { freeToday, timedToday } from '../../lib/view';
  import ListItem from './ListItem.svelte';

  // Dwie grupy: najpierw zadania ze slotem według godzin, potem reszta w kolejności własnej.
  const linked = $derived(timedToday(app.S.items));
  const items = $derived(freeToday(app.S.items));

  // Pole początkowe NIE jest pozycją w stanie. Gdyby nią było, samo obejrzenie
  // dnia zapisywałoby pustą pozycję — a po tygodniu przeglądania kalendarza
  // kopia zapasowa byłaby pełna pustych wierszy.
  let draft = $state('');

  // Kreska wstawienia dotyczy tylko przestawiania, a przestawiają się
  // wyłącznie pozycje swobodne.
  const dragFree = $derived(ui.drag ? items.some((i) => i.id === ui.drag!.id) : false);
  const others = $derived(dragFree && ui.drag ? items.filter((i) => i.id !== ui.drag!.id) : []);
  const dropBefore = (id: string) => others.findIndex((i) => i.id === id) === ui.drag!.toIndex;
  const dropAtEnd = () => ui.drag!.toIndex >= others.length;

  function onDraftInput(e: Event & { currentTarget: HTMLInputElement }) {
    const text = e.currentTarget.value;
    e.currentTarget.value = '';
    draft = '';
    if (text) createItemWithText(text);
  }
</script>

<section id="list">
  {#each linked as item (item.id)}
    <ListItem {item} />
  {/each}

  {#each items as item (item.id)}
    <!-- Kreska wstawienia liczy się wśród pozycji BEZ przeciąganej, więc
         rysujemy ją przed wierszem o tym numerze w tak liczonej sekwencji. -->
    {#if dragFree && ui.drag && ui.drag.id !== item.id && dropBefore(item.id)}
      <div class="drop-line"></div>
    {/if}
    <ListItem {item} />
  {/each}
  {#if dragFree && ui.drag && dropAtEnd()}<div class="drop-line"></div>{/if}

  <div class="item t-task is-draft">
    <span class="bullet t-task" aria-hidden="true">·</span>
    <input
      class="item-text"
      value={draft}
      maxlength="200"
      autocomplete="off"
      aria-label="Nowa pozycja"
      placeholder={items.length === 0 && linked.length === 0 ? 'Zacznij pisać…' : ''}
      oninput={onDraftInput}
    />
  </div>
</section>
