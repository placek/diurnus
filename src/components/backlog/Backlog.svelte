<script lang="ts">
  import { app } from '../../state.svelte';
  import { colorOf, iconOf } from '../../lib/categories';
  import { backlogGroups } from '../../lib/view';
  import { createItemWithText } from '../../actions.svelte';
  import Icon from '../Icon.svelte';
  import BacklogItem from './BacklogItem.svelte';

  // Sekcje: najpierw pozycje spoza projektów, potem po jednej na projekt.
  const groups = $derived(backlogGroups(app.S.items, app.S.cats));

  // Pole początkowe nie jest pozycją w stanie — materializuje się przy
  // pierwszym znaku, tak samo jak w panelu notatek. Nowa pozycja jest BEZ
  // daty: backlog to najpierw „kiedyś", a termin nadaje się osobno. W sekcji
  // projektu dostaje od razu kategorię projektu.
  function onDraftInput(e: Event & { currentTarget: HTMLInputElement }, cat?: string) {
    const text = e.currentTarget.value;
    e.currentTarget.value = '';
    if (text) createItemWithText(text, 'backlog', cat);
  }

  const pl = (n: number) =>
    n === 1 ? 'pozycja' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'pozycje' : 'pozycji';
</script>

<section id="backlog" aria-label="Backlog">
  {#each groups as g (g.project?.id ?? '')}
    {#if g.project}
      {@const p = g.project}
      <div class="bl-project" data-project={p.id} style="--c:var(--{colorOf(app.S.cats, p)})">
        <h3 class="bl-project-h">
          <span class="bl-project-ic"><Icon name={iconOf(app.S.cats, p)} fallback={p.name[0] ?? '?'} /></span>
          <span class="bl-project-name">{p.name}</span>
          <span class="bl-project-n" title="{g.items.length} {pl(g.items.length)}">{g.items.length}</span>
        </h3>
        {#each g.items as item (item.id)}
          <BacklogItem {item} />
        {/each}
        <div class="item backlog-item is-draft">
          <span class="bullet t-task" aria-hidden="true">·</span>
          <input
            class="item-text"
            enterkeyhint="enter"
            value=""
            maxlength="200"
            autocomplete="off"
            aria-label="Nowa pozycja w projekcie {p.name}"
            placeholder="Dodaj do projektu…"
            oninput={(e) => onDraftInput(e, p.id)}
          />
        </div>
      </div>
    {:else}
      {#each g.items as item (item.id)}
        <BacklogItem {item} />
      {/each}

      <div class="item backlog-item is-draft">
        <span class="bullet t-task" aria-hidden="true">·</span>
        <input
          class="item-text"
          enterkeyhint="enter"
          value=""
          maxlength="200"
          autocomplete="off"
          aria-label="Nowa pozycja backlogu"
          placeholder="Zaplanuj coś…"
          oninput={(e) => onDraftInput(e)}
        />
      </div>
    {/if}
  {/each}
</section>
