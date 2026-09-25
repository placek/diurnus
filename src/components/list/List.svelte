<script lang="ts">
  import { app, ui } from '../../state.svelte';
  import { createItemWithText } from '../../actions.svelte';
  import { doneToday, openFree, openTimed } from '../../lib/view';
  import ListItem from './ListItem.svelte';
  import TodayHead from '../TodayHead.svelte';

  // Trzy grupy: najpierw wykonane w kolejności odhaczenia, potem nieodhaczone zadania
  // ze slotem według godzin, potem reszta w kolejności własnej.
  const done = $derived(doneToday(app.S.items));
  const linked = $derived(openTimed(app.S.items));
  const items = $derived(openFree(app.S.items));

  // Pole początkowe NIE jest pozycją w stanie. Gdyby nią było, samo obejrzenie
  // dnia zapisywałoby pustą pozycję — a po tygodniu przeglądania kalendarza
  // kopia zapasowa byłaby pełna pustych wierszy.
  let draft = $state('');

  // Kreska wstawienia dotyczy tylko przestawiania, a przestawiają się
  // wyłącznie nieodhaczone pozycje swobodne.
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

<section id="list" aria-label="Dziś">
  <!-- Na szerokim ekranie sekcja dziś zachodzi na pasek u góry i niesie nagłówek
       dnia; przewija się tylko lista pod nim. -->
  {#if !ui.narrow}
    <header class="today-head"><TodayHead /></header>
  {/if}
  <div class="list-body">
    {#each done as item (item.id)}
      <ListItem {item} />
    {/each}

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
        placeholder={items.length + linked.length + done.length === 0 ? 'Zacznij pisać…' : ''}
        oninput={onDraftInput}
      />
    </div>
  </div>
</section>
